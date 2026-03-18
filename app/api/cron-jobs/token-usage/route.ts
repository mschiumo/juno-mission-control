/**
 * Token Usage API Endpoint
 * 
 * GET: Generate daily token usage report
 * - Queries session data from Redis
 * - Calculates usage statistics
 * - Posts results to /api/cron-results
 * - Sends Telegram notification if significant
 */

import { NextResponse } from 'next/server';
import { 
  postToCronResults, 
  sendTelegramIfNeeded, 
  logToActivityLog,
  formatDate 
} from '@/lib/cron-helpers';
import { createClient } from 'redis';

// Redis client - lazy initialization
let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedisClient() {
  if (redisClient?.isReady) {
    return redisClient;
  }
  
  try {
    const client = createClient({
      url: process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || undefined,
    });
    
    client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });
    
    await client.connect();
    redisClient = client;
    return client;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    return null;
  }
}

interface TokenUsageData {
  sessionId: string;
  timestamp: string;
  tokensUsed: number;
  model: string;
}

async function getTodayTokenUsage(): Promise<{ 
  totalTokens: number; 
  sessions: number;
  byModel: Record<string, number>;
  avgPerSession: number;
}> {
  const redis = await getRedisClient();
  
  if (!redis) {
    return { totalTokens: 0, sessions: 0, byModel: {}, avgPerSession: 0 };
  }

  try {
    // Get all keys matching token usage pattern
    const keys = await redis.keys('token_usage:*');
    const today = new Date().toISOString().split('T')[0];
    
    let totalTokens = 0;
    let sessions = 0;
    const byModel: Record<string, number> = {};
    
    for (const key of keys.slice(0, 100)) { // Limit to prevent overload
      const data = await redis.get(key);
      if (data) {
        const usage: TokenUsageData = JSON.parse(data);
        // Only count today's usage
        if (usage.timestamp?.startsWith(today)) {
          totalTokens += usage.tokensUsed || 0;
          sessions++;
          
          const model = usage.model || 'unknown';
          byModel[model] = (byModel[model] || 0) + (usage.tokensUsed || 0);
        }
      }
    }
    
    return {
      totalTokens,
      sessions,
      byModel,
      avgPerSession: sessions > 0 ? Math.round(totalTokens / sessions) : 0
    };
  } catch (error) {
    console.error('[TokenUsage] Error fetching usage data:', error);
    return { totalTokens: 0, sessions: 0, byModel: {}, avgPerSession: 0 };
  }
}

export async function GET() {
  const startTime = Date.now();
  
  try {
    console.log('[TokenUsage] Generating daily token usage report...');
    
    // Get token usage data
    const usage = await getTodayTokenUsage();
    
    // Format the report
    const reportLines = [
      `📊 **Daily Token Usage Summary** — ${formatDate()}`,
      '',
      `**Total Tokens Used**: ${usage.totalTokens.toLocaleString()}`,
      `**Active Sessions**: ${usage.sessions}`,
      `**Average per Session**: ${usage.avgPerSession.toLocaleString()}`,
      ''
    ];
    
    // Add breakdown by model if there are multiple
    const modelEntries = Object.entries(usage.byModel);
    if (modelEntries.length > 0) {
      reportLines.push('**Usage by Model:**');
      for (const [model, tokens] of modelEntries) {
        const shortModel = model.split('/').pop() || model;
        reportLines.push(`• ${shortModel}: ${tokens.toLocaleString()}`);
      }
      reportLines.push('');
    }
    
    // Cost estimation (approximate rates)
    const estimatedCost = (usage.totalTokens / 1000000) * 2; // Rough estimate: $2 per 1M tokens
    reportLines.push(`**Estimated Cost**: ~$${estimatedCost.toFixed(2)}`);
    
    const reportContent = reportLines.join('\n');
    
    // Post to cron results
    const postResult = await postToCronResults(
      'Daily Token Usage Summary',
      reportContent,
      'review'
    );
    
    // Log to activity log
    await logToActivityLog(
      'Token Usage Report Generated',
      `Total: ${usage.totalTokens.toLocaleString()} tokens across ${usage.sessions} sessions`,
      'cron'
    );
    
    // Send Telegram notification if significant usage (> 100K tokens)
    if (usage.totalTokens > 100000) {
      await sendTelegramIfNeeded(reportContent);
    }
    
    const duration = Date.now() - startTime;
    console.log(`[TokenUsage] Report generated in ${duration}ms`);
    
    return NextResponse.json({
      success: true,
      data: {
        usage,
        report: reportContent,
        durationMs: duration
      }
    });
    
  } catch (error) {
    console.error('[TokenUsage] Error:', error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Log error
    await logToActivityLog(
      'Token Usage Report Failed',
      errorMessage,
      'cron'
    );
    
    return NextResponse.json({
      success: false,
      error: 'Failed to generate token usage report',
      message: errorMessage
    }, { status: 500 });
  }
}
