'use client';

import Script from 'next/script';

interface IntergramWidgetProps {
  chatId?: string;
}

export default function IntergramWidget({ chatId }: IntergramWidgetProps) {
  const chatIdToUse = chatId || '8080305413';
  
  // Configuration script that must run BEFORE the widget script
  const configScript = `
    window.intergramId = "${chatIdToUse}";
    window.intergramCustomizations = {
      titleClosed: 'Chat with Juno',
      titleOpen: 'Juno - Mission Control',
      introMessage: 'Hey MJ! I'm Juno, your AI assistant. How can I help you today? 🪐',
      autoResponse: 'I\'ll get back to you shortly...',
      autoNoResponse: 'I\'m processing your request. One moment please.',
      mainColor: '#ff6b35',
      alwaysUseFloatingButton: true
    };
  `;

  return (
    <>
      {/* Configuration must load FIRST */}
      <Script
        id="intergram-config"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{ __html: configScript }}
      />
      {/* Widget script loads after config */}
      <Script
        src="https://www.intergram.xyz/js/widget.js"
        strategy="afterInteractive"
        id="intergram-widget"
      />
    </>
  );
}