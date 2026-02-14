'use client';

import { useState, useEffect } from 'react';
import { Quote, RefreshCw } from 'lucide-react';

interface MotivationalData {
  quote: string;
  author: string;
  timestamp: string;
  source: 'api' | 'fallback';
}

// Fallback quotes if API fails
const fallbackQuotes = [
  { quote: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
  { quote: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { quote: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { quote: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { quote: "Your time is limited, don't waste it living someone else's life.", author: "Steve Jobs" },
  { quote: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { quote: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { quote: "Everything you've ever wanted is on the other side of fear.", author: "George Addair" }
];

export default function MotivationalBanner({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<MotivationalData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMotivational();
    // No auto-refresh - quote updates once per day from cron job
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getDailyFallback = () => {
    // Use the day of year to pick a consistent quote per day
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    return fallbackQuotes[dayOfYear % fallbackQuotes.length];
  };

  const fetchMotivational = async () => {
    setLoading(true);
    
    try {
      const response = await fetch('/api/cron-results?jobName=Daily%20Motivational%20Message');
      
      if (!response.ok) {
        throw new Error('API error');
      }
      
      const result = await response.json();
      
      if (result.success && result.data) {
        const content = result.data.content;
        
        // Try to extract quote from various formats
        // Format 1: "Quote text" — Author
        // Format 2: "Quote text" - Author  
        // Format 3: Quote: "text" Author: name
        let quote = '';
        let author = '';
        
        // Look for quoted text
        const quoteMatch = content.match(/"([^"]+)"/);
        const singleQuoteMatch = content.match(/'([^']+)'/);
        
        if (quoteMatch) {
          quote = quoteMatch[1];
        } else if (singleQuoteMatch) {
          quote = singleQuoteMatch[1];
        } else {
          // No quotes found, take first substantial line
          const lines = content.split('\n').filter((l: string) => l.trim().length > 10);
          quote = lines[0] || content.substring(0, 100);
        }
        
        // Look for author after em-dash, en-dash, or hyphen
        const authorMatch = content.match(/[—–-]\s*([^\n]+?)(?:\n|$)/);
        if (authorMatch) {
          author = authorMatch[1].trim();
        } else {
          // Try "- Author" format
          const dashMatch = content.match(/-\s*([A-Za-z\s\.]+)(?:\n|$)/);
          if (dashMatch) {
            author = dashMatch[1].trim();
          } else {
            author = 'Unknown';
          }
        }
        
        // Clean up author (remove trailing punctuation)
        author = author.replace(/[.,;:!?]+$/, '').trim();
        
        // Check if the quote is from today
        const quoteDate = new Date(result.data.timestamp);
        const today = new Date();
        const isToday = quoteDate.toDateString() === today.toDateString();
        
        setData({
          quote: quote || 'Stay motivated!',
          author: author || 'Unknown',
          timestamp: result.data.timestamp,
          source: isToday ? 'api' : 'fallback'
        });
      } else {
        throw new Error('No data');
      }
    } catch (error) {
      console.error('Failed to fetch motivational:', error);
      
      // Use daily fallback
      const fallback = getDailyFallback();
      setData({
        quote: fallback.quote,
        author: fallback.author,
        timestamp: new Date().toISOString(),
        source: 'fallback'
      });
    } finally {
      setLoading(false);
    }
  };

  // Compact version for Trading tab sidebar
  if (compact) {
    if (loading) {
      return (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-[#ff6b35] border-t-transparent rounded-full animate-spin" />
            <span className="text-[#8b949e] text-xs">Loading...</span>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
        <div className="flex items-start gap-2">
          <Quote className="w-4 h-4 text-[#ff6b35] flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white line-clamp-3">
              &ldquo;{data?.quote}&rdquo;
            </p>
            <cite className="text-xs text-[#8b949e] not-italic block mt-2">
              — {data?.author}
            </cite>
          </div>
        </div>
      </div>
    );
  }

  // Full-width version for Dashboard
  if (loading) {
    return (
      <div className="bg-gradient-to-r from-[#ff6b35]/10 via-[#ff8c5a]/10 to-[#ff6b35]/10 border-y border-[#ff6b35]/20 py-4 md:py-6">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-center gap-3">
          <div className="w-5 h-5 border-2 border-[#ff6b35] border-t-transparent rounded-full animate-spin" />
          <span className="text-[#8b949e] text-sm">Loading today&apos;s inspiration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-[#ff6b35]/10 via-[#ff8c5a]/10 to-[#ff6b35]/10 border-y border-[#ff6b35]/20 py-4 md:py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-start gap-3 md:gap-4">
          <div className="p-2 md:p-3 bg-[#ff6b35]/20 rounded-full flex-shrink-0">
            <Quote className="w-5 h-5 md:w-6 md:h-6 text-[#ff6b35]" />
          </div>
          
          <div className="flex-1 min-w-0">
            <blockquote className="text-lg md:text-xl lg:text-2xl font-medium text-white leading-relaxed">
              &ldquo;{data?.quote}&rdquo;
            </blockquote>            
            <div className="flex items-center justify-between mt-2">
              <div>
                <cite className="text-sm md:text-base text-[#ff8c5a] not-italic font-medium">
                  — {data?.author}
                </cite>
                <p className="text-[10px] md:text-xs text-[#8b949e] mt-0.5">
                  Daily Motivational
                  {data?.source === 'fallback' && (
                    <span className="text-[#d29922]"> • (Auto-selected)</span>
                  )}
                </p>
              </div>
              
              <button
                onClick={fetchMotivational}
                disabled={loading}
                className="p-2 hover:bg-[#ff6b35]/20 rounded-lg transition-colors"
                title="Refresh quote"
              >
                <RefreshCw className={`w-4 h-4 text-[#8b949e] ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
