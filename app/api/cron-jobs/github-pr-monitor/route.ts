/**
 * GitHub PR Monitor API Endpoint
 * 
 * GET: Check open PRs, mentions
 * - Simple status check (no deep analysis)
 * - Alert only if actionable items found
 * - POST to /api/cron-results
 */

import { NextResponse } from 'next/server';
import { 
  postToCronResults, 
  sendTelegramIfNeeded, 
  logToActivityLog,
  formatDate 
} from '@/lib/cron-helpers';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME || 'mj';

interface PullRequest {
  number: number;
  title: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  state: string;
  draft: boolean;
  user: {
    login: string;
  };
  repository: string;
}

async function fetchOpenPRs(): Promise<PullRequest[]> {
  if (!GITHUB_TOKEN) {
    console.log('[GitHubPR] GITHUB_TOKEN not configured');
    return [];
  }

  try {
    // Search for open PRs involving the user
    const query = `is:pr is:open involves:${GITHUB_USERNAME}`;
    const response = await fetch(
      `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        },
        next: { revalidate: 0 }
      }
    );

    if (!response.ok) {
      console.warn('[GitHubPR] GitHub API error:', response.status);
      return [];
    }

    const data = await response.json();
    
    return (data.items || []).map((item: {
      number: number;
      title: string;
      html_url: string;
      created_at: string;
      updated_at: string;
      state: string;
      draft?: boolean;
      user: { login: string };
      repository_url?: string;
    }) => ({
      number: item.number,
      title: item.title,
      html_url: item.html_url,
      created_at: item.created_at,
      updated_at: item.updated_at,
      state: item.state,
      draft: item.draft || false,
      user: item.user,
      repository: item.repository_url?.split('/').pop() || 'unknown'
    }));
  } catch (error) {
    console.error('[GitHubPR] Error fetching PRs:', error);
    return [];
  }
}

async function fetchReviewRequests(): Promise<PullRequest[]> {
  if (!GITHUB_TOKEN) {
    return [];
  }

  try {
    // Get PRs where user is requested as reviewer
    const response = await fetch(
      `https://api.github.com/search/issues?q=${encodeURIComponent(`is:pr is:open review-requested:${GITHUB_USERNAME}`)}&sort=updated&order=desc`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        },
        next: { revalidate: 0 }
      }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    
    return (data.items || []).map((item: {
      number: number;
      title: string;
      html_url: string;
      created_at: string;
      updated_at: string;
      state: string;
      draft?: boolean;
      user: { login: string };
      repository_url?: string;
    }) => ({
      number: item.number,
      title: item.title,
      html_url: item.html_url,
      created_at: item.created_at,
      updated_at: item.updated_at,
      state: item.state,
      draft: item.draft || false,
      user: item.user,
      repository: item.repository_url?.split('/').pop() || 'unknown'
    }));
  } catch (error) {
    console.error('[GitHubPR] Error fetching review requests:', error);
    return [];
  }
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const hours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
  
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export async function GET() {
  const startTime = Date.now();
  
  try {
    console.log('[GitHubPR] Checking for open PRs...');
    
    // Fetch open PRs
    const openPRs = await fetchOpenPRs();
    const reviewRequests = await fetchReviewRequests();
    
    // Combine and deduplicate
    const allPRs = [...openPRs, ...reviewRequests];
    const uniquePRs = Array.from(new Map(allPRs.map(pr => [pr.html_url, pr])).values());
    
    // Filter actionable items
    const actionablePRs = uniquePRs.filter(pr => {
      // Skip drafts
      if (pr.draft) return false;
      return true;
    });
    
    // Filter PRs needing review
    const needsReview = actionablePRs.filter(pr => 
      reviewRequests.some(rr => rr.html_url === pr.html_url)
    );
    
    // Filter PRs created by user that are waiting
    const myPRsWaiting = actionablePRs.filter(pr => 
      pr.user.login.toLowerCase() === GITHUB_USERNAME.toLowerCase() &&
      !reviewRequests.some(rr => rr.html_url === pr.html_url)
    );
    
    // Create report
    const reportLines: string[] = [];
    let hasActionableItems = false;
    
    if (actionablePRs.length === 0) {
      reportLines.push(
        `🔍 **GitHub PR Check** — ${formatDate()}`,
        '',
        'No open pull requests requiring attention.'
      );
    } else {
      hasActionableItems = needsReview.length > 0 || myPRsWaiting.some(pr => {
        const hours = (Date.now() - new Date(pr.created_at).getTime()) / (1000 * 60 * 60);
        return hours > 24; // PRs waiting more than 24 hours
      });
      
      reportLines.push(
        `🔍 **GitHub PR Check** — ${formatDate()}`,
        '',
        `**Total Open PRs**: ${actionablePRs.length}`,
        ''
      );
      
      if (needsReview.length > 0) {
        reportLines.push(`**📋 Needs Your Review (${needsReview.length})**`);
        for (const pr of needsReview.slice(0, 5)) {
          reportLines.push(
            `• [#${pr.number}](${pr.html_url}) \`${pr.repository}\``,
            `  ${pr.title.substring(0, 60)}${pr.title.length > 60 ? '...' : ''}`,
            `  Updated: ${formatTimeAgo(pr.updated_at)}`
          );
        }
        reportLines.push('');
      }
      
      if (myPRsWaiting.length > 0) {
        const waitingLong = myPRsWaiting.filter(pr => {
          const hours = (Date.now() - new Date(pr.created_at).getTime()) / (1000 * 60 * 60);
          return hours > 24;
        });
        
        if (waitingLong.length > 0) {
          reportLines.push(`**⏳ Your PRs Waiting (${waitingLong.length})**`);
          for (const pr of waitingLong.slice(0, 3)) {
            reportLines.push(
              `• [#${pr.number}](${pr.html_url}) \`${pr.repository}\``,
              `  ${pr.title.substring(0, 50)}${pr.title.length > 50 ? '...' : ''}`,
              `  Created: ${formatTimeAgo(pr.created_at)}`
            );
          }
          reportLines.push('');
        }
      }
    }
    
    const reportContent = reportLines.join('\n');
    
    // Post to cron results
    await postToCronResults('GitHub PR Monitor', reportContent, 'review');
    
    // Log to activity log
    await logToActivityLog(
      'GitHub PR Check',
      `Found ${actionablePRs.length} actionable PRs`,
      'cron'
    );
    
    // Send Telegram only if there are actionable items
    if (hasActionableItems) {
      await sendTelegramIfNeeded(reportContent);
    }
    
    const duration = Date.now() - startTime;
    console.log(`[GitHubPR] Check completed in ${duration}ms`);
    
    return NextResponse.json({
      success: true,
      data: {
        totalPRs: actionablePRs.length,
        needsReview: needsReview.length,
        myPRsWaiting: myPRsWaiting.length,
        hasActionableItems,
        durationMs: duration
      }
    });
    
  } catch (error) {
    console.error('[GitHubPR] Error:', error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    await logToActivityLog('GitHub PR Check Failed', errorMessage, 'cron');
    
    return NextResponse.json({
      success: false,
      error: 'Failed to check GitHub PRs',
      message: errorMessage
    }, { status: 500 });
  }
}
