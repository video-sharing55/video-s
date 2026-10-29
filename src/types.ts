export type PublicationStatus = 'draft' | 'published' | 'archived';

export type UnlockMode = 'return_continue' | 'postback_verified' | 'direct';

export type AdFormat = 'native_banner' | 'standard_banner' | 'direct_link' | 'popunder' | 'social_bar';

export type PlacementSlot =
  | 'below_video_card'
  | 'between_sections'
  | 'header_banner'
  | 'footer_banner'
  | 'watch_unlock_flow'
  | 'download_option_flow'
  | 'global_popunder';

export interface DownloadOption {
  id: string;
  videoId?: string;
  displayName: string;
  qualityLabel: string;
  fileSize: string;
  format: string;
  adDestinationUrl: string;
  destinationUrl: string;
  directDownloadUrl: string;
  enabled: boolean;
  displayOrder: number;
}

export interface VideoEntry {
  id: string;
  title: string;
  thumbnailUrl: string;
  description: string;
  category: string;
  tags: string[];
  featured: boolean;
  status: PublicationStatus;
  displayOrder: number;
  watchAdUrl: string;
  telegramUrl: string;
  badgeText: string;
  durationLabel: string;
  isSample: boolean;
  downloadOptions: DownloadOption[];
  createdAt: string;
  updatedAt: string;
}

export interface VideoCategory {
  id: string;
  name: string;
  slug: string;
  displayOrder: number;
  enabled: boolean;
}

export interface AdPlacement {
  id: string;
  slot: PlacementSlot;
  label: string;
  format: AdFormat;
  enabled: boolean;
  displayOrder: number;
  frequency: number; // For below_video_card: 1 = every card, 2 = every 2nd card, etc.
  adDestinationUrl: string; // Direct link URL for unlock/download or fallback banner link
  scriptSrc: string; // Approved Adsterra invoke.js URL
  containerId: string; // Approved Adsterra container div ID (e.g., container-xxxx)
  bannerKey: string; // Standard banner key if atOptions format
  bannerWidth: number;
  bannerHeight: number;
  rawSnippet: string; // Sanitized/validated snippet rendered in isolated sandboxed iframe
  testMode: boolean; // Shows diagnostic preview placeholder on public site when enabled
  notes: string;
  updatedAt: string;
}

export interface SiteSettings {
  // Branding & SEO
  siteName: string;
  logoText: string;
  logoImageUrl: string;
  faviconUrl: string;
  seoTitle: string;
  seoDescription: string;
  headerNavLinks: { label: string; href: string }[];
  headerCtaLabel: string;
  headerCtaUrl: string;

  // Announcement Banner
  announcementEnabled: boolean;
  announcementText: string;
  announcementLinkText: string;
  announcementLinkUrl: string;

  // Hero Section
  heroEnabled: boolean;
  heroKicker: string;
  heroTitle: string;
  heroDescription: string;
  heroImageUrl: string;
  heroPrimaryButtonText: string;
  heroSecondaryButtonText: string;
  heroSecondaryButtonUrl: string;

  // Layout, Theme & Typography
  backgroundTone: 'obsidian' | 'charcoal' | 'midnight';
  accentColor: string;
  headingFont: 'Outfit' | 'Bricolage Grotesque' | 'Playfair Display';
  bodyFont: 'Plus Jakarta Sans' | 'Manrope';
  gridColumnsDesktop: 2 | 3 | 4;
  cardCornerRadius: 'sharp' | 'rounded' | 'soft';
  pageSize: number;
  searchEnabled: boolean;
  categoriesEnabled: boolean;
  sectionOrder: ('announcement' | 'hero' | 'toolbar' | 'featured' | 'gallery')[];

  // Buttons & Watch Unlock Modal Settings
  watchButtonLabel: string;
  watchButtonVisible: boolean;
  downloadButtonLabel: string;
  downloadButtonVisible: boolean;
  unlockModalTitle: string;
  unlockModalDescription: string;
  unlockButtonLabel: string;
  unlockMode: UnlockMode;
  returnContinuePrompt: string;
  returnContinueButtonLabel: string;
  playButtonLabel: string;
  defaultWatchAdUrl: string;
  defaultTelegramUrl: string;

  // Download Modal Settings
  downloadModalTitle: string;
  downloadModalDescription: string;
  downloadAdNoticeText: string;
  defaultDownloadAdUrl: string;

  // Floating Telegram Button
  floatingTelegramEnabled: boolean;
  floatingTelegramUrl: string;
  floatingTelegramTooltip: string;
  floatingTelegramHideOnAdmin: boolean;

  // Footer & Maintenance
  footerDescription: string;
  footerCopyrightText: string;
  footerContactEmail: string;
  footerLinks: { label: string; url: string }[];
  maintenanceMode: boolean;
  maintenanceMessage: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  actor: string;
  details: string;
  ipAddress: string;
  createdAt: string;
}

export interface AdminDashboardStats {
  totalVideos: number;
  publishedVideos: number;
  draftVideos: number;
  archivedVideos: number;
  sampleVideos: number;
  activeAdPlacements: number;
  totalAdPlacements: number;
  uploadedFilesCount: number;
  uploadedStorageBytes: number;
  usingDefaultPin: boolean;
  recentLogs: AuditLogEntry[];
}

export interface PublicBootstrapResponse {
  settings: SiteSettings;
  categories: VideoCategory[];
  videos: VideoEntry[];
  adPlacements: AdPlacement[];
}
