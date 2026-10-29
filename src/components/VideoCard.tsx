import React from 'react';
import type { VideoEntry } from '../types.ts';
import { ResilientImage } from './ResilientImage.tsx';

interface VideoCardProps {
  video: VideoEntry;
  accentColor: string;
  watchButtonLabel?: string;
  cardRadiusClass: string;
  onSelect: (video: VideoEntry) => void;
  onWatchNow: (video: VideoEntry) => void;
}

/**
 * Shared, self-contained Video Card component.
 * Uses deterministic internal sizing (16:9 object-cover thumbnail, fixed 2-line title slot,
 * and fixed-height Watch Now button) without flex-grow stretching so external ad placements
 * can never alter card height or alignment.
 */
export const VideoCard: React.FC<VideoCardProps> = ({
  video,
  accentColor,
  watchButtonLabel,
  cardRadiusClass,
  onSelect,
  onWatchNow,
}) => {
  return (
    <article
      onClick={() => onSelect(video)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(video);
        }
      }}
      className={`group flex flex-col w-full shrink-0 cursor-pointer overflow-hidden border border-white/[0.08] hover:border-white/[0.18] bg-gradient-to-b from-zinc-900/80 to-zinc-950 shadow-[0_14px_34px_-12px_rgba(0,0,0,0.75)] transition-[transform,border-color,box-shadow] duration-200 ease-out hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-amber-400 ${cardRadiusClass}`}
    >
      {/* 1. Thumbnail Image (Locked 16:9 aspect ratio with object-fit: cover) */}
      <div className="relative aspect-video w-full overflow-hidden bg-zinc-950 shrink-0">
        <ResilientImage
          key={video.thumbnailUrl}
          src={video.thumbnailUrl}
          alt={video.title}
          fallbackTitle={video.title}
          className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-300 ease-out group-hover:scale-[1.025]"
        />
      </div>

      {/* 2. Video Title + 3. Watch Now Button (Deterministic height & alignment) */}
      <div className="flex flex-col p-4 sm:p-5 gap-4 shrink-0">
        <h3 className="h-[44px] sm:h-[48px] text-[16px] sm:text-[17px] leading-[22px] sm:leading-[24px] font-semibold tracking-tight text-zinc-100 group-hover:text-white line-clamp-2 overflow-hidden transition-colors duration-150">
          {video.title}
        </h3>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onWatchNow(video);
          }}
          style={{ backgroundColor: accentColor }}
          className="w-full h-[42px] px-4 py-2.5 rounded-xl font-semibold text-sm text-zinc-950 hover:opacity-95 active:scale-[0.99] transition-[opacity,transform] duration-150 flex items-center justify-center whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
        >
          {watchButtonLabel || 'Watch Now'}
        </button>
      </div>
    </article>
  );
};
