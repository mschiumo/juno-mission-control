'use client';

/**
 * The user's avatar: uploaded photo when one exists, initial-letter badge
 * otherwise. `version` lets callers cache-bust after an upload; everyone
 * else just renders with the default.
 */

import { useState } from 'react';

export default function UserAvatar({
  name,
  size = 28,
  version = 0,
  className = '',
}: {
  name?: string | null;
  size?: number;
  version?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  const style: React.CSSProperties = {
    width: size,
    height: size,
    background: 'linear-gradient(135deg, #FF6B00, #cc4e00)',
    boxShadow: '0 1px 6px rgba(255,107,0,0.25)',
  };

  if (failed) {
    return (
      <span
        className={`rounded-lg flex items-center justify-center text-white font-bold ${className}`}
        style={{ ...style, fontSize: size * 0.42 }}
      >
        {(name || 'U').charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/user/avatar?v=${version}`}
      alt={name ? `${name}'s avatar` : 'Your avatar'}
      onError={() => setFailed(true)}
      className={`rounded-lg object-cover ${className}`}
      style={style}
      ref={(el) => {
        // Loads-before-hydration guard: if the request already 404'd, the
        // error event is gone — detect the dead image on mount instead.
        if (el && el.complete && el.naturalWidth === 0) setFailed(true);
      }}
    />
  );
}
