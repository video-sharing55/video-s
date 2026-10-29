import React, { useState } from 'react';
import { Film } from 'lucide-react';
import { resolveMediaUrl } from '../lib/api.ts';

interface ResilientImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle?: string;
  lazy?: boolean;
}

export const ResilientImage: React.FC<ResilientImageProps> = ({
  src,
  alt,
  className = '',
  fallbackTitle,
  lazy = true,
}) => {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = resolveMediaUrl(src);

  if (!resolvedSrc || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-950 to-slate-950 text-zinc-500 p-4 text-center select-none ${className}`}
      >
        <Film className="w-7 h-7 mb-2 opacity-60" />
        <span className="text-xs font-medium text-zinc-400 line-clamp-2 max-w-[20ch]">
          {fallbackTitle || alt || 'Media Preview'}
        </span>
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      loading={lazy ? 'lazy' : 'eager'}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
