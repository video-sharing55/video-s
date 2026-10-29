/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Compass } from 'lucide-react';
import type { AdPlacement, SiteSettings, VideoCategory, VideoEntry } from './types.ts';
import { fetchPublicBootstrap, getAdminToken, resolveMediaUrl } from './lib/api.ts';
import { PublicGallery } from './components/PublicGallery.tsx';
import { AdminPinModal } from './components/AdminPinModal.tsx';
import { AdminDashboard } from './components/admin/AdminDashboard.tsx';

const FALLBACK_SETTINGS: SiteSettings = {
  siteName: 'Nocturne Vault',
  logoText: 'Nocturne Vault',
  logoImageUrl: '',
  faviconUrl: '',
  seoTitle: 'Nocturne Vault – Curated High-Definition Cinema Gallery',
  seoDescription: 'Curated high-definition cinema releases and Telegram screening archives.',
  headerNavLinks: [
    { label: 'Featured', href: '#featured' },
    { label: 'Releases', href: '#gallery' },
    { label: 'Categories', href: '#categories' },
    { label: 'Channel', href: '#footer' },
  ],
  headerCtaLabel: 'Join Telegram',
  headerCtaUrl: 'https://t.me/',
  announcementEnabled: false,
  announcementText: '',
  announcementLinkText: '',
  announcementLinkUrl: '',
  heroEnabled: true,
  heroKicker: 'Curated Digital Screening Room',
  heroTitle: 'Mastered visual stories built for cinema-grade screens.',
  heroDescription: '',
  heroImageUrl: '',
  heroPrimaryButtonText: 'Explore Releases',
  heroSecondaryButtonText: 'Join Telegram Archive',
  heroSecondaryButtonUrl: 'https://t.me/',
  backgroundTone: 'obsidian',
  accentColor: '#E5A93C',
  headingFont: 'Outfit',
  bodyFont: 'Plus Jakarta Sans',
  gridColumnsDesktop: 3,
  cardCornerRadius: 'rounded',
  pageSize: 6,
  searchEnabled: true,
  categoriesEnabled: true,
  sectionOrder: ['announcement', 'hero', 'toolbar', 'featured', 'gallery'],
  watchButtonLabel: 'Watch Now',
  watchButtonVisible: true,
  downloadButtonLabel: 'Download Now',
  downloadButtonVisible: true,
  unlockModalTitle: 'ভিডিও আনলক করুন',
  unlockModalDescription: '',
  unlockButtonLabel: 'Unlock',
  unlockMode: 'return_continue',
  returnContinuePrompt: '',
  returnContinueButtonLabel: 'I Visited Sponsor — Continue',
  playButtonLabel: 'Play on Telegram',
  defaultWatchAdUrl: '',
  defaultTelegramUrl: 'https://t.me/',
  downloadModalTitle: 'Select Download Resolution',
  downloadModalDescription: '',
  downloadAdNoticeText: '',
  defaultDownloadAdUrl: '',
  floatingTelegramEnabled: true,
  floatingTelegramUrl: 'https://t.me/',
  floatingTelegramTooltip: 'Join Official Telegram',
  floatingTelegramHideOnAdmin: true,
  footerDescription: '',
  footerCopyrightText: '2026 Nocturne Vault. All rights reserved.',
  footerContactEmail: '',
  footerLinks: [],
  maintenanceMode: false,
  maintenanceMessage: '',
};

export default function App() {
  const [settings, setSettings] = useState<SiteSettings>(FALLBACK_SETTINGS);
  const [categories, setCategories] = useState<VideoCategory[]>([]);
  const [videos, setVideos] = useState<VideoEntry[]>([]);
  const [adPlacements, setAdPlacements] = useState<AdPlacement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [inAdminConsole, setInAdminConsole] = useState(false);

  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  const isNotFoundRoute = pathname !== '/' && pathname !== '/index.html';

  const refreshPublicData = useCallback(async () => {
    try {
      const data = await fetchPublicBootstrap();
      setSettings(data.settings);
      setCategories(data.categories);
      setVideos(data.videos);
      setAdPlacements(data.adPlacements);
      setLoadError('');
    } catch (err: any) {
      setLoadError(err.message || 'Unable to load gallery right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshPublicData();
  }, [refreshPublicData]);

  // Apply dynamic document title, meta description, and CSS font variables
  useEffect(() => {
    if (settings.seoTitle) {
      document.title = settings.seoTitle;
    }
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && settings.seoDescription) {
      metaDesc.setAttribute('content', settings.seoDescription);
    }
    if (settings.faviconUrl && settings.faviconUrl.trim()) {
      let iconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!iconLink) {
        iconLink = document.createElement('link');
        iconLink.rel = 'icon';
        document.head.appendChild(iconLink);
      }
      iconLink.href = resolveMediaUrl(settings.faviconUrl);
    }
    document.documentElement.style.setProperty(
      '--font-heading',
      `'${settings.headingFont}', system-ui, sans-serif`
    );
    document.documentElement.style.setProperty(
      '--font-body',
      `'${settings.bodyFont}', system-ui, sans-serif`
    );
    document.documentElement.style.setProperty('--gallery-accent', settings.accentColor);
  }, [settings]);

  // Custom 404 Page for unknown paths (also prevents /admin URL guessing)
  if (isNotFoundRoute && !inAdminConsole) {
    return (
      <div className="min-h-screen bg-[#060709] text-zinc-100 flex flex-col items-center justify-center px-6 text-center space-y-5">
        <div className="w-12 h-12 rounded-2xl border border-zinc-800 bg-zinc-900/70 flex items-center justify-center">
          <Compass className="w-6 h-6 text-zinc-400" />
        </div>
        <div className="space-y-2 max-w-md">
          <p className="text-xs font-mono text-zinc-500">404 · Page Not Found</p>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white">
            This screening room path does not exist.
          </h1>
          <p className="text-sm text-zinc-400">
            The link you followed may have moved or been archived. Return to the main gallery to browse published releases.
          </p>
        </div>
        <a
          href="/"
          style={{ backgroundColor: settings.accentColor }}
          className="px-5 py-2.5 rounded-xl font-semibold text-sm text-zinc-950 hover:opacity-95 transition-opacity"
        >
          Back to Gallery
        </a>
      </div>
    );
  }

  // Authenticated Admin Console (Visually distinct from public gallery; zero third-party ad scripts mounted)
  if (inAdminConsole && getAdminToken()) {
    return (
      <AdminDashboard
        onExitToPublic={() => {
          setInAdminConsole(false);
          refreshPublicData();
        }}
        onPublicDataChanged={refreshPublicData}
      />
    );
  }

  return (
    <>
      {loadError && (
        <div className="bg-red-950/90 border-b border-red-900 px-4 py-2.5 text-center text-xs text-red-200 flex items-center justify-center gap-3">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={refreshPublicData}
            className="underline font-semibold hover:text-white cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      <PublicGallery
        settings={settings}
        categories={categories}
        videos={videos}
        adPlacements={adPlacements}
        loading={loading}
        onTriggerAdminGate={() => {
          if (getAdminToken()) {
            setInAdminConsole(true);
          } else {
            setPinModalOpen(true);
          }
        }}
      />

      <AdminPinModal
        isOpen={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onSuccess={() => {
          setPinModalOpen(false);
          setInAdminConsole(true);
        }}
      />
    </>
  );
}
