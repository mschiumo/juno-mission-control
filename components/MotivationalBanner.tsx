'use client';

import { useState, useEffect } from 'react';
import { Quote, RefreshCw } from 'lucide-react';

interface MotivationalData {
  quote: string;
  author: string;
  timestamp: string;
}

export default function MotivationalBanner() {
  const [data, setData] = useState<MotivationalData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMotivational();
    // Refresh every 5 minutes
    const interval = setInterval(fetchMotivational, 300000);
    return () => clearInterval(interval);
  }, []);

  const fetchMotivational = async () => {
    try {
      const response = await fetch('/api/cron-results?jobName=Daily%20Motivational%20Message');
      const result = await response.json();
      
      if (result.success) {
        // Parse the content to extract quote and author
        const content = result.data.content;
        const lines = content.split('\n').filter((line: string) => line.trim());
        
        // Extract quote (usually between quotes) and author (after —)
        const quoteMatch = content.match(/"([^"]*)"/) || content.match(/"([^"]*)"/);
        const authorMatch = content.match(/—\s*([^\n]+)/) || content.match(/-\s*([^\n]+)/);
        
        setData({
          quote: quoteMatch ? quoteMatch[1] : lines[1] || 'Stay motivated!',
          author: authorMatch ? authorMatch[1] : 'Unknown',
          timestamp: result.data.timestamp
        });
      }
    } catch (error) {
      console.error('Failed to fetch motivational:', error);
      // Fallback quote
      setData({
        quote: "The future belongs to those who believe in the beauty of their dreams.",
        author: "Eleanor Roosevelt",
        timestamp: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-[#ff6b35]/10 via-[#ff8c5a]/10 to-[#ff6b35]/10 border-y border-[#ff6b35]/20 py-6">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-center gap-3">
          <RefreshCw className="w-5 h-5 text-[#ff6b35] animate-spin" />
          <span className="text-[#8b949e]">Loading today's inspiration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-[#ff6b35]/10 via-[#ff8c5a]/10 to-[#ff6b35]/10 border-y border-[#ff6b35]/20 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-[#ff6b35]/20 rounded-full flex-shrink-0">
            <Quote className="w-6 h-6 text-[#ff6b35]" />
          </div>
          
          <div className="flex-1 min-w-0">
            <blockquote className="text-xl md:text-2xl font-medium text-white leading-relaxed">
              "{data?.quote}"
            </blockquote>
            <cite className="block mt-2 text-[#ff8c5a] not-italic font-medium">
              — {data?.author}
            </cite>
            <p className="text-xs text-[#8b949e] mt-1">
              Daily Motivational • {new Date(data?.timestamp || '').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric'
              })}
            </p>
          </div>
          
          <button
            onClick={fetchMotivational}
            className="p-2 hover:bg-[#ff6b35]/20 rounded-lg transition-colors flex-shrink-0"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5 text-[#8b949e] hover:text-[#ff6b35]" />
          </button>
        </div>
      </div>
    </div>
  );
}
