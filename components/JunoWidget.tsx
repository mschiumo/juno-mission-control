'use client';

import { useState, useEffect } from 'react';
import { Sparkles, Bot } from 'lucide-react';

interface JunoStatus {
  isActive: boolean;
  isProcessing: boolean;
  lastActivity: string;
}

interface SubAgentStatus {
  count: number;
  hasSubAgents: boolean;
}

export default function JunoWidget() {
  const [status, setStatus] = useState<JunoStatus>({
    isActive: true,
    isProcessing: false,
    lastActivity: new Date().toISOString()
  });
  const [subAgents, setSubAgents] = useState<SubAgentStatus>({
    count: 0,
    hasSubAgents: false
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

  // Fetch sub-agent status
  useEffect(() => {
    const fetchSubAgents = async () => {
      try {
        const response = await fetch('/api/subagent-status');
        const data = await response.json();
        if (data.success) {
          setSubAgents({
            count: data.count,
            hasSubAgents: data.hasSubAgents
          });
        }
      } catch (error) {
        console.error('Failed to fetch sub-agent status:', error);
      }
    };

    fetchSubAgents();
    // Refresh every 10 seconds
    const interval = setInterval(fetchSubAgents, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2">
      {/* Sub-agents Badge */}
      <div 
        className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${
          subAgents.hasSubAgents 
            ? 'bg-[#238636]/10 text-[#238636] border-[#238636]/30' 
            : 'bg-[#da3633]/10 text-[#da3633] border-[#da3633]/30'
        }`}
        title={subAgents.hasSubAgents ? `${subAgents.count} sub-agent${subAgents.count !== 1 ? 's' : ''} active` : 'No sub-agents deployed'}
      >
        <Bot className="w-3 h-3" />
        <span>{subAgents.count} Sub-agent{subAgents.count !== 1 ? 's' : ''}</span>
      </div>

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
    </div>
  );
}
