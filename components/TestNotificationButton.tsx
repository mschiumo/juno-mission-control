'use client';

import { useState } from 'react';
import { Bell, Plus } from 'lucide-react';

export default function TestNotificationButton() {
  const [isCreating, setIsCreating] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const createTestNotification = async () => {
    setIsCreating(true);
    setResult(null);
    
    try {
      const response = await fetch('/api/cron/journal-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await response.json();
      
      if (data.success) {
        setResult('✅ Notification created! Check the bell icon.');
        // Reload page after 2 seconds to show notification
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setResult('❌ Error: ' + data.error);
      }
    } catch (error) {
      setResult('❌ Failed to create notification');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={createTestNotification}
        disabled={isCreating}
        className="flex items-center gap-2 px-4 py-2 bg-[#F97316] hover:bg-[#ea580c] text-white rounded-lg transition-colors disabled:opacity-50"
      >
        {isCreating ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Creating...
          </>
        ) : (
          <>
            <Bell className="w-4 h-4" />
            Test Journal Notification
          </>
        )}
      </button>
      
      {result && (
        <span className="text-sm">{result}</span>
      )}
    </div>
  );
}
