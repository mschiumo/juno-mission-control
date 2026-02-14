'use client';

import { useState, useEffect } from 'react';
import { Sparkles, Bot } from 'lucide-react';

interface JunoStatus {
  isProcessing: boolean;
  lastActivity: number;
}

interface SubAgentStatus {
  count: number;
  hasSubAgents: boolean;
}

type JunoState = 'ready' | 'thinking' | 'idle';

export default function JunoWidget() {
  const [status, setStatus] = useState<JunoStatus>({
    isProcessing: false,
    lastActivity: Date.now()
  });
  const [currentState, setCurrentState] = useState<JunoState>('ready');
  const [subAgents, setSubAgents] = useState<SubAgentStatus>({
    count: 0,
    hasSubAgents: false
  });

  useEffect(() => {
    // Check state every 5 seconds
    const interval = setInterval(() => {
      const now = Date.now();
      const timeSinceActivity = now - status.lastActivity;
      
      if (status.isProcessing) {
        setCurrentState('thinking');
      } else if (timeSinceActivity > 60000) {
        // Idle after 60 seconds of no activity
        setCurrentState('idle');
      } else {
        setCurrentState('ready');
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [status]);

  // Simulate activity detection (in real use, this would be triggered by actual work)
  useEffect(() => {
    const handleActivity = () => {
      setStatus(prev => ({
        ...prev,
        lastActivity: Date.now()
      }));
    };

    window.addEventListener('click', handleActivity);
    window.addEventListener('keydown', handleActivity);
    
    return () => {
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
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

  const getStatusConfig = () => {
    switch (currentState) {
      case 'thinking':
        return {
          dotColor: 'bg-[#d29922]',
          textColor: 'text-[#d29922]',
          label: 'Juno is thinking...',
          showSpinner: true,
          showPulse: false
        };
      case 'idle':
        return {
          dotColor: 'bg-[#8b949e]',
          textColor: 'text-[#8b949e]',
          label: 'Juno is idle',
          showSpinner: false,
          showPulse: false
        };
      case 'ready':
      default:
        return {
          dotColor: 'bg-[#238636]',
          textColor: 'text-[#238636]',
          label: 'Juno is ready',
          showSpinner: false,
          showPulse: true
        };
    }
  };

  const config = getStatusConfig();

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
          {/* Status dot */}
          <div className={`w-2.5 h-2.5 rounded-full ${config.dotColor} ${currentState === 'thinking' ? 'animate-pulse' : ''}`} />
          
          {/* Pulse ring when ready */}
          {config.showPulse && (
            <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-[#238636] animate-ping opacity-75" />
          )}
          
          {/* Spinner when thinking */}
          {config.showSpinner && (
            <div className="absolute -inset-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#d29922] border-t-transparent animate-spin" />
          )}
        </div>
        
        <span className={`text-xs ${config.textColor} font-medium`}>
          {currentState === 'thinking' ? (
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              {config.label}
            </span>
          ) : (
            config.label
          )}
        </span>
      </div>
    </div>
  );
}
