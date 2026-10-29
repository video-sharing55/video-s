import React, { useMemo, useState } from 'react';
import {
  Search,
  Send,
  ExternalLink,
  Film,
  X,
  Wrench,
} from 'lucide-react';
import type { AdPlacement, SiteSettings, VideoCategory, VideoEntry } from '../types.ts';
import { resolveMediaUrl } from '../lib/api.ts';
import { AdSlotRenderer } from './AdSlotRenderer.tsx';
import { VideoCard } from './VideoCard.tsx';
import { VideoDetailModal } from './VideoDetailModal.tsx';

interface PublicGalleryProps {
  settings: SiteSettings;
  categories: VideoCategory[];
  videos: VideoEntry[];
  adPlacements: AdPlacement[];
  loading: boolean;
  onTriggerAdminGate: () => void;
}

export const PublicGallery: React.FC<PublicGalleryProps> = ({
  settings,
  videos,
  adPlacements,
  loading,
  onTriggerAdminGate,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState<number>(settings.pageSize || 6);
  const [selectedVideo, setSelectedVideo] = useState<VideoEntry | null>(null);
  const [autoStartWatch, setAutoStartWatch] = useState(false);

  const bgClass = useMemo(() => {
    switch (settings.backgroundTone) {
      case 'charcoal':
        return 'bg-[#0e1014]';
      case 'midnight':
        return 'bg-[#070b14]';
      default:
        return 'bg-[#060709]';
    }
  }, [settings.backgroundTone]);

  const cardRadiusClass = useMemo(() => {
    switch (settings.cardCornerRadius) {
      case 'sharp':
        return 'rounded-lg';
      case 'soft':
        return 'rounded-2xl';
      default:
        return 'rounded-xl';
    }
  }, [settings.cardCornerRadius]);

  const gridColsClass = useMemo(() => {
    switch (settings.gridColumnsDesktop) {
      case 2:
        return 'grid-cols-1 sm:grid-cols-2';
      case 4:
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';
      default:
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
    }
  }, [settings.gridColumnsDesktop]);

  const findPlacement = (slot: AdPlacement['slot']) =>
    adPlacements.find((p) => p.slot === slot && p.enabled);

  const headerAd = findPlacement('header_banner');
  const midSectionAd = findPlacement('between_sections');
  const footerAd = findPlacement('footer_banner');
  const belowCardAd = findPlacement('below_video_card');
  const popunderAd = findPlacement('global_popunder');

  const filteredVideos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return videos;
    return videos.filter((v) => {
      const inTitle = v.title.toLowerCase().includes(q);
      const inDesc = v.description.toLowerCase().includes(q);
      const inTags = v.tags.some((t) => t.toLowerCase().includes(q));
      return inTitle || inDesc || inTags;
    });
  }, [videos, searchQuery]);

  const paginatedVideos = useMemo(
    () => filteredVideos.slice(0, visibleCount),
    [filteredVideos, visibleCount]
  );

  // Maintenance Screen (Footer copyright still works so Admin can sign in to turn it off)
  if (settings.maintenanceMode) {
    return (
      <div className={`min-h-screen ${bgClass} text-zinc-100 flex flex-col justify-between`}>
        <main className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-2xl border border-zinc-800 bg-zinc-900/70 flex items-center justify-center mb-6">
            <Wrench className="w-5 h-5 text-zinc-300" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white mb-3">
            {settings.siteName}
          </h1>
          <p className="text-sm sm:text-base text-zinc-400 leading-relaxed">
            {settings.maintenanceMessage}
          </p>
        </main>
        <footer className="border-t border-zinc-900 py-6 px-6 text-center text-xs text-zinc-500">
          <span
            onClick={onTriggerAdminGate}
            className="select-none cursor-default"
          >
            &copy; {settings.footerCopyrightText}
          </span>
        </footer>
      </div>
    );
  }

  const renderAnnouncement = () => {
    if (!settings.announcementEnabled || !settings.announcementText.trim()) return null;
    return (
      <div
        key="announcement"
        className="border-b border-zinc-800/80 bg-zinc-900/60 px-4 sm:px-6 py-2 text-xs text-zinc-300"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <p className="truncate">{settings.announcementText}</p>
          {settings.announcementLinkText.trim() && settings.announcementLinkUrl.trim() && (
            <a
              href={settings.announcementLinkUrl}
              target={settings.announcementLinkUrl.startsWith('#') ? undefined : '_blank'}
              rel="noopener noreferrer"
              style={{ color: settings.accentColor }}
              className="font-medium hover:underline whitespace-nowrap shrink-0 inline-flex items-center gap-1"
            >
              <span>{settings.announcementLinkText}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    );
  };

  const renderGalleryGrid = () => {
    const frequency = Math.max(1, belowCardAd?.frequency || 1);

    return (
      <section id="gallery" key="gallery" className="max-w-7xl mx-auto px-4 sm:px-6 pt-5 pb-10 space-y-6">
        {midSectionAd && (
          <div className="pb-1">
            <AdSlotRenderer placement={midSectionAd} instanceKey="mid-section" />
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          <div className="flex items-baseline justify-between sm:justify-start gap-3">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
              All Video Releases
            </h2>
            <span className="text-xs text-zinc-500 tabular-nums">
              {filteredVideos.length} {filteredVideos.length === 1 ? 'item' : 'items'}
            </span>
          </div>

          {settings.searchEnabled && (
            <div className="relative w-full sm:w-72 shrink-0">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search videos..."
                aria-label="Search videos"
                className="w-full min-h-[40px] pl-10 pr-9 py-2 rounded-xl bg-zinc-900/80 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className={`grid ${gridColsClass} gap-6 sm:gap-7 items-start`}>
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className={`border border-white/[0.08] bg-zinc-900/40 overflow-hidden animate-pulse ${cardRadiusClass}`}
              >
                <div className="aspect-video w-full bg-zinc-800/60" />
                <div className="p-4 sm:p-5 space-y-4">
                  <div className="h-[44px] sm:h-[48px] bg-zinc-800/60 rounded w-4/5" />
                  <div className="h-[42px] bg-zinc-800/50 rounded-xl w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : paginatedVideos.length === 0 ? (
          <div className="rounded-2xl border border-zinc-900 bg-zinc-900/30 py-16 px-6 text-center space-y-3">
            <Film className="w-8 h-8 text-zinc-600 mx-auto" />
            <h3 className="text-base font-medium text-zinc-200">No matching video releases</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              {searchQuery
                ? 'Try clearing your current search filter.'
                : 'Published thumbnails added from the administrator dashboard will appear here automatically.'}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-2 px-4 py-2 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors cursor-pointer"
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <div className={`grid ${gridColsClass} gap-6 sm:gap-7 items-start`}>
            {paginatedVideos.map((vid, idx) => {
              const showNativeAdBelow =
                Boolean(belowCardAd) && (idx + 1) % frequency === 0;

              const openWatchUnlock = (targetVideo: VideoEntry) => {
                setAutoStartWatch(true);
                setSelectedVideo(targetVideo);
              };

              return (
                <div key={vid.id} className="flex flex-col items-stretch w-full min-w-0">
                  <VideoCard
                    video={vid}
                    accentColor={settings.accentColor}
                    watchButtonLabel={settings.watchButtonLabel}
                    cardRadiusClass={cardRadiusClass}
                    onSelect={openWatchUnlock}
                    onWatchNow={openWatchUnlock}
                  />

                  {/* Independent Native Banner Ad container directly beneath applicable video cards */}
                  {showNativeAdBelow && (
                    <AdSlotRenderer
                      placement={belowCardAd}
                      instanceKey={`card-${vid.id}`}
                      compact
                      className="mt-3.5"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Load More Pagination */}
        {filteredVideos.length > visibleCount && (
          <div className="pt-6 flex justify-center">
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + (settings.pageSize || 6))}
              className="min-h-[44px] px-6 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-sm font-medium text-zinc-100 transition-colors cursor-pointer"
            >
              Load More Releases ({filteredVideos.length - visibleCount} remaining)
            </button>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className={`min-h-screen flex flex-col ${bgClass} text-zinc-100`}>
      {/* Strict 3-Zone Top Navigation Bar (No Admin Login link exposed anywhere) */}
      <header className="sticky top-0 z-30 border-b border-zinc-900/90 bg-zinc-950/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-4 sm:px-6 h-16">
          {/* Zone 1: Brand Title */}
          <a
            href="#"
            className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 font-display flex items-center gap-2.5"
          >
            {settings.logoImageUrl ? (
              <img
                src={resolveMediaUrl(settings.logoImageUrl)}
                alt={settings.siteName}
                referrerPolicy="no-referrer"
                className="h-7 w-auto object-contain rounded"
              />
            ) : null}
            <span>{settings.logoText || settings.siteName}</span>
          </a>

          {/* Zone 2: Concise Single-Line Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-400">
            {(settings.headerNavLinks || []).slice(0, 5).map((item, idx) => (
              <a
                key={`${item.label}-${idx}`}
                href={item.href || '#gallery'}
                className="hover:text-white transition-colors whitespace-nowrap shrink-0"
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center shrink-0">
            {settings.headerCtaLabel.trim() && settings.headerCtaUrl.trim() && (
              <a
                href={settings.headerCtaUrl}
                target={settings.headerCtaUrl.startsWith('#') ? undefined : '_blank'}
                rel="noopener noreferrer"
                style={{ backgroundColor: settings.accentColor }}
                className="min-h-[38px] px-4 py-2 text-xs font-semibold text-zinc-950 rounded-lg hover:opacity-95 transition-opacity inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{settings.headerCtaLabel}</span>
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Optional Header Ad Placement */}
      {headerAd && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-4">
          <AdSlotRenderer placement={headerAd} instanceKey="header-top" />
        </div>
      )}

      {/* Homepage Sections: Announcement -> Main Gallery */}
      <main className="flex-1">
        {renderAnnouncement()}
        {renderGalleryGrid()}
      </main>

      {/* Optional Pre-Footer Ad Placement */}
      {footerAd && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pb-6">
          <AdSlotRenderer placement={footerAd} instanceKey="footer-bottom" />
        </div>
      )}

      {/* Global Popunder / Social Bar script loader (public site only) */}
      {popunderAd && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6">
          <AdSlotRenderer placement={popunderAd} instanceKey="global-popunder" compact />
        </div>
      )}

      {/* Configurable Footer with Discreet Copyright Admin Entry */}
      <footer id="footer" className="border-t border-zinc-900 bg-zinc-950/80 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-md">
              <div className="text-base font-semibold text-white font-display">
                {settings.logoText || settings.siteName}
              </div>
              {settings.footerDescription && (
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {settings.footerDescription}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-6 text-xs text-zinc-400">
              {(settings.footerLinks || []).map((lnk, idx) => (
                <a
                  key={`${lnk.label}-${idx}`}
                  href={lnk.url}
                  target={lnk.url.startsWith('#') ? undefined : '_blank'}
                  rel="noopener noreferrer"
                  className="hover:text-zinc-100 transition-colors whitespace-nowrap"
                >
                  {lnk.label}
                </a>
              ))}
              {settings.footerContactEmail && (
                <a
                  href={`mailto:${settings.footerContactEmail}`}
                  className="hover:text-zinc-100 transition-colors whitespace-nowrap"
                >
                  {settings.footerContactEmail}
                </a>
              )}
            </div>
          </div>

          <div className="pt-6 border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
            {/* Hidden Admin Gateway: Clicking the copyright text/symbol opens the PIN screen without looking like an admin button */}
            <p>
              <span
                onClick={onTriggerAdminGate}
                className="select-none cursor-default"
              >
                &copy; {settings.footerCopyrightText}
              </span>
            </p>
            <p className="text-zinc-600">All streaming &amp; archive links open in external destinations.</p>
          </div>
        </div>
      </footer>

      {/* Floating Telegram Join Button */}
      {settings.floatingTelegramEnabled && settings.floatingTelegramUrl.trim() && (
        <a
          href={settings.floatingTelegramUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={settings.floatingTelegramTooltip || 'Join Telegram Channel'}
          title={settings.floatingTelegramTooltip || 'Join Telegram Channel'}
          className="fixed bottom-5 right-5 z-40 group flex items-center gap-2.5 rounded-full bg-[#229ED9] hover:bg-[#1e8ec4] text-white shadow-lg shadow-black/50 p-3.5 transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-white"
        >
          <Send className="w-5 h-5 -translate-x-0.5 translate-y-0.5" />
          {settings.floatingTelegramTooltip.trim() && (
            <span className="hidden sm:inline-block pr-1.5 text-xs font-semibold whitespace-nowrap">
              {settings.floatingTelegramTooltip}
            </span>
          )}
        </a>
      )}

      {/* Video Detail, Watch Unlock & Download Modal */}
      <VideoDetailModal
        video={selectedVideo}
        settings={settings}
        autoStartWatch={autoStartWatch}
        onClose={() => {
          setSelectedVideo(null);
          setAutoStartWatch(false);
        }}
      />
    </div>
  );
};
