'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, CheckCircle, AlertTriangle, XCircle, X, ExternalLink } from 'lucide-react';

interface Notification {
  id: string;
  type: 'approval' | 'blocker' | 'info';
  title: string;
  message: string;
  action?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  read: boolean;
  createdAt: string;
}

export default function NotificationsBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const response = await fetch('/api/notifications');
      const result = await response.json();
      if (result.success) {
        setNotifications(result.notifications);
        setUnreadCount(result.count);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  };

  useEffect(() => {
    // Use requestAnimationFrame to avoid setState in render warning
    requestAnimationFrame(() => {
      setMounted(true);
    });
    fetchNotifications();
    // Poll every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (typeof document === 'undefined') return;
    
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/notifications?id=${id}`, { method: 'PATCH' });
      // Update local state
      setNotifications(prev => 
        prev.filter(n => n.id !== id)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const dismissAll = async () => {
    // Mark all as read
    await Promise.all(
      notifications.map(n => markAsRead(n.id))
    );
    setIsOpen(false);
  };

  const getIcon = (type: string, priority: string) => {
    switch (type) {
      case 'approval':
        return <CheckCircle className="w-5 h-5 text-[#d29922]" />;
      case 'blocker':
        return priority === 'urgent' 
          ? <XCircle className="w-5 h-5 text-[#da3633]" />
          : <AlertTriangle className="w-5 h-5 text-[#d29922]" />;
      default:
        return <Bell className="w-5 h-5 text-[#58a6ff]" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'border-l-[#da3633] bg-[#da3633]/10';
      case 'high':
        return 'border-l-[#d29922] bg-[#d29922]/10';
      case 'low':
        return 'border-l-[#8b949e] bg-[#8b949e]/10';
      default:
        return 'border-l-[#58a6ff] bg-[#58a6ff]/10';
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (hours < 1) return 'Just now';
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
  };

  const isValidUrl = (str: string) => {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  };

  // Prevent hydration mismatch - don't render until mounted
  if (!mounted) {
    return (
      <div className="relative">
        <button className="relative p-2 hover:bg-[#30363d] rounded-lg transition-colors">
          <Bell className="w-5 h-5 text-[#8b949e]" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 hover:bg-[#30363d] rounded-lg transition-colors"
        title="Notifications"
      >
        <Bell className="w-5 h-5 text-[#8b949e] hover:text-white" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#da3633] text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl z-50 max-h-[500px] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[#30363d]">
            <div>
              <h3 className="font-semibold text-white">Notifications</h3>
              <p className="text-xs text-[#8b949e]">
                {unreadCount === 0 
                  ? 'No new notifications' 
                  : `${unreadCount} pending`}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={dismissAll}
                className="text-xs text-[#8b949e] hover:text-white transition-colors"
              >
                Dismiss all
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-[#8b949e]">
                <Bell className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p>All caught up!</p>
                <p className="text-xs mt-1">I&#39;ll notify you when I need approval or hit a blocker.</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 border-l-4 ${getPriorityColor(notification.priority)} border-b border-[#30363d] hover:bg-[#0d1117] transition-colors`}
                >
                  <div className="flex items-start gap-3">
                    {getIcon(notification.type, notification.priority)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-medium text-white text-sm truncate">
                          {notification.title}
                        </h4>
                        <button
                          onClick={() => markAsRead(notification.id)}
                          className="p-1 hover:bg-[#30363d] rounded transition-colors"
                          title="Mark as read"
                        >
                          <X className="w-4 h-4 text-[#8b949e] hover:text-white" />
                        </button>
                      </div>
                      
                      <p className="text-xs text-[#8b949e] mb-2">
                        {notification.message}
                      </p>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-[#8b949e]">
                          {formatTime(notification.createdAt)}
                        </span>
                        
                        {notification.action && isValidUrl(notification.action) && (
                          <a
                            href={notification.action}
                            className="flex items-center gap-1 text-xs text-[#58a6ff] hover:underline"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        {notification.action && !isValidUrl(notification.action) && (
                          <a
                            href="https://juno-mission-control.vercel.app"
                            className="flex items-center gap-1 text-xs text-[#58a6ff] hover:underline"
                          >
                            Open Dashboard
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
