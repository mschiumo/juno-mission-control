'use client';

import { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';

interface JunoStatus {
  isActive: boolean;
  isProcessing: boolean;
  lastActivity: string;
}

export default function JunoWidget() {
  const [status, setStatus] = useState<JunoStatus>({
    isActive: true,
    isProcessing: false,
    lastActivity: new Date().toISOString()
  });

  useEffect(() => {
    const checkActivity = () => {
      setStatus(prev => ({
        ...prev,
        isActive: true,
        lastActivity: new Date().toISOString()
      }));
    };

    const interval = setInterval(checkActivity, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-3">
      {/* Juno Status Indicator */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0d1117] rounded-full border border-[#30363d]">
        <div className="relative">
          {/* Pulsing dot */}
          <div className={`w-2.5 h-2.5 rounded-full ${
            status.isProcessing 
              ? 'bg-[#d29922] animate-pulse' 
              : 'bg-[#238636]'
          }`} />
          
          {/* Outer pulse ring when active */}
          {status.isActive && !status.isProcessing && (
            <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-[#238636] animate-ping opacity-75" />
          )}
          
          {/* Processing spinner */}
          {status.isProcessing && (
            <div className="absolute -inset-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#d29922] border-t-transparent animate-spin" />
          )}
        </div>
        
        <span className="text-xs text-[#8b949e]">
          {status.isProcessing ? (
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[#d29922]" />
              Thinking...
            </span>
          ) : (
            'Juno Active'
          )}
        </span>
      </div>

      {/* Intergram chat opens via the widget in layout.tsx */}
      {/* No button needed - Intergram provides the floating button */}
    </div>
  );
}