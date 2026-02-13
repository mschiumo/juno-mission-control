'use client';

import { useEffect } from 'react';
import Script from 'next/script';

interface IntergramWidgetProps {
  chatId?: string;
}

export default function IntergramWidget({ chatId }: IntergramWidgetProps) {
  useEffect(() => {
    // Configure Intergram when script loads
    if (typeof window !== 'undefined') {
      (window as any).intergramId = chatId || process.env.NEXT_PUBLIC_INTERGRAM_CHAT_ID;
      (window as any).intergramCustomizations = {
        titleClosed: 'Chat with Juno',
        titleOpen: 'Juno - Mission Control',
        introMessage: 'Hey MJ! I\'m Juno, your AI assistant. How can I help you today? 🪐',
        autoResponse: 'I\'ll get back to you shortly...',
        autoNoResponse: 'I\'m processing your request. One moment please.',
        mainColor: '#ff6b35',
        alwaysUseFloatingButton: true
      };
    }
  }, [chatId]);

  return (
    <Script
      src="https://www.intergram.xyz/js/widget.js"
      strategy="lazyOnload"
      id="intergram-widget"
    />
  );
}

// Declare window type for TypeScript
declare global {
  interface Window {
    intergramId?: string;
    intergramCustomizations?: {
      titleClosed: string;
      titleOpen: string;
      introMessage: string;
      autoResponse: string;
      autoNoResponse: string;
      mainColor: string;
      alwaysUseFloatingButton: boolean;
    };
  }
}