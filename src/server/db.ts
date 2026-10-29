import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  AdPlacement,
  AuditLogEntry,
  DownloadOption,
  SiteSettings,
  VideoCategory,
  VideoEntry,
} from '../types.ts';

export function resolveAppRoot(): string {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'package.json'))) {
    return cwd;
  }
  try {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 5; i++) {
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // Fallback to process.cwd()
  }
  return cwd;
}

export const APP_ROOT = resolveAppRoot();
export const DATA_DIR = path.resolve(APP_ROOT, process.env.DATA_DIR || './data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const DB_PATH = path.join(DATA_DIR, 'gallery.sqlite');

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  fs.accessSync(DATA_DIR, fs.constants.R_OK | fs.constants.W_OK);
  fs.accessSync(UPLOADS_DIR, fs.constants.R_OK | fs.constants.W_OK);
} catch (err: any) {
  console.error(
    `[Storage Error] DATA_DIR ("${DATA_DIR}") or uploads directory is not writable: ${err?.message || err}. ` +
      'Verify directory permissions or update DATA_DIR to a writable persistent volume path.'
  );
  throw err;
}

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('wal_autocheckpoint = 1000');
db.pragma('foreign_keys = ON');

export function hashPin(pin: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(pin, actualSalt, 120000, 64, 'sha512').toString('hex');
  return { hash, salt: actualSalt };
}

export function verifyPin(pin: string, storedHash: string, storedSalt: string): boolean {
  const { hash } = hashPin(pin, storedSalt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  siteName: 'Nocturne Vault',
  logoText: 'Nocturne Vault',
  logoImageUrl: '',
  faviconUrl: '',
  seoTitle: 'Nocturne Vault – Curated High-Definition Cinema Gallery',
  seoDescription:
    'Discover curated cinema releases, high-bitrate archives, multi-resolution downloads, and instant Telegram channel streaming.',
  headerNavLinks: [
    { label: 'Featured', href: '#featured' },
    { label: 'Releases', href: '#gallery' },
    { label: 'Categories', href: '#categories' },
    { label: 'Channel', href: '#footer' },
  ],
  headerCtaLabel: 'Join Telegram',
  headerCtaUrl: 'https://t.me/',

  announcementEnabled: true,
  announcementText: 'New 4K HDR master editions added weekly — join our official Telegram channel for instant release alerts.',
  announcementLinkText: 'Open Channel',
  announcementLinkUrl: 'https://t.me/',

  heroEnabled: true,
  heroKicker: 'Curated Digital Screening Room',
  heroTitle: 'Mastered visual stories built for cinema-grade screens.',
  heroDescription:
    'Browse high-definition releases, unlock instant Telegram screening links, or choose multi-resolution direct downloads tailored to your connection.',
  heroImageUrl: '/src/assets/images/hero_cinema_stage_1793190833234.jpg',
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
  unlockModalDescription:
    'ভিডিওটি প্লে করতে নিচের Unlock বাটনে ক্লিক করে স্পনসর লিংকটি ভিজিট করুন। ফিরে আসার পর Play বাটন সক্রিয় হবে।',
  unlockButtonLabel: 'Unlock',
  unlockMode: 'return_continue',
  returnContinuePrompt:
    'Outbound sponsor tab opened. Once you have visited the sponsor page, return here and confirm below to reveal the Telegram screening link.',
  returnContinueButtonLabel: 'I Visited Sponsor — Continue',
  playButtonLabel: 'Play on Telegram',
  defaultWatchAdUrl: '',
  defaultTelegramUrl: 'https://t.me/',

  downloadModalTitle: 'Select Download Resolution',
  downloadModalDescription:
    'Choose your preferred video resolution below. Sponsor step completion is required before accessing the file destination.',
  downloadAdNoticeText: 'Opens sponsor link first, then unlocks your selected resolution.',
  defaultDownloadAdUrl: '',

  floatingTelegramEnabled: true,
  floatingTelegramUrl: 'https://t.me/',
  floatingTelegramTooltip: 'Join Official Telegram',
  floatingTelegramHideOnAdmin: true,

  footerDescription:
    'Curated high-definition cinema gallery with direct multi-resolution archives and Telegram community screening links.',
  footerCopyrightText: '2026 Nocturne Vault. All rights reserved.',
  footerContactEmail: 'contact@nocturnevault.example',
  footerLinks: [
    { label: 'Latest Releases', url: '#gallery' },
    { label: 'Featured Selection', url: '#featured' },
    { label: 'Telegram Archive', url: 'https://t.me/' },
  ],
  maintenanceMode: false,
  maintenanceMessage: 'We are currently updating our media catalog. Please check back shortly.',
};

interface SchemaMigration {
  version: string;
  description: string;
  up: () => void;
}

const SCHEMA_MIGRATIONS: SchemaMigration[] = [
  {
    version: '001_initial_schema',
    description: 'Create core gallery, download_options, ad_placements, admin auth, unlock_sessions, and audit_logs tables',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS site_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          data_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS video_categories (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          display_order INTEGER NOT NULL DEFAULT 0,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS videos (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          thumbnail_url TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT 'General',
          tags_json TEXT NOT NULL DEFAULT '[]',
          featured INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'published',
          display_order INTEGER NOT NULL DEFAULT 0,
          watch_ad_url TEXT NOT NULL DEFAULT '',
          telegram_url TEXT NOT NULL DEFAULT '',
          badge_text TEXT NOT NULL DEFAULT '',
          duration_label TEXT NOT NULL DEFAULT '',
          is_sample INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_videos_status_order ON videos(status, display_order);

        CREATE TABLE IF NOT EXISTS download_options (
          id TEXT PRIMARY KEY,
          video_id TEXT NOT NULL,
          display_name TEXT NOT NULL,
          quality_label TEXT NOT NULL,
          file_size TEXT NOT NULL DEFAULT '',
          format TEXT NOT NULL DEFAULT 'MP4',
          ad_destination_url TEXT NOT NULL DEFAULT '',
          destination_url TEXT NOT NULL DEFAULT '',
          direct_download_url TEXT NOT NULL DEFAULT '',
          enabled INTEGER NOT NULL DEFAULT 1,
          display_order INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_download_options_video ON download_options(video_id, display_order);

        CREATE TABLE IF NOT EXISTS ad_placements (
          id TEXT PRIMARY KEY,
          slot TEXT NOT NULL UNIQUE,
          label TEXT NOT NULL,
          format TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 0,
          display_order INTEGER NOT NULL DEFAULT 0,
          frequency INTEGER NOT NULL DEFAULT 1,
          ad_destination_url TEXT NOT NULL DEFAULT '',
          script_src TEXT NOT NULL DEFAULT '',
          container_id TEXT NOT NULL DEFAULT '',
          banner_key TEXT NOT NULL DEFAULT '',
          banner_width INTEGER NOT NULL DEFAULT 728,
          banner_height INTEGER NOT NULL DEFAULT 90,
          raw_snippet TEXT NOT NULL DEFAULT '',
          test_mode INTEGER NOT NULL DEFAULT 0,
          notes TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS admin_users (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          username TEXT NOT NULL DEFAULT 'Administrator',
          pin_hash TEXT NOT NULL,
          pin_salt TEXT NOT NULL,
          is_default_pin INTEGER NOT NULL DEFAULT 1,
          failed_attempts INTEGER NOT NULL DEFAULT 0,
          locked_until INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS admin_sessions (
          token_hash TEXT PRIMARY KEY,
          ip_address TEXT NOT NULL DEFAULT '',
          user_agent TEXT NOT NULL DEFAULT '',
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS unlock_sessions (
          token TEXT PRIMARY KEY,
          video_id TEXT NOT NULL,
          flow_type TEXT NOT NULL,
          option_id TEXT NOT NULL DEFAULT '',
          mode TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'initiated',
          ad_url TEXT NOT NULL DEFAULT '',
          target_url TEXT NOT NULL DEFAULT '',
          direct_url TEXT NOT NULL DEFAULT '',
          created_at INTEGER NOT NULL,
          opened_at INTEGER NOT NULL DEFAULT 0,
          verified_at INTEGER NOT NULL DEFAULT 0,
          expires_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          action TEXT NOT NULL,
          actor TEXT NOT NULL DEFAULT 'Admin',
          details TEXT NOT NULL DEFAULT '',
          ip_address TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: '002_session_expiry_indexes',
    description: 'Add expiry indexes for admin_sessions, unlock_sessions, and audit_logs ordering',
    up: () => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);
        CREATE INDEX IF NOT EXISTS idx_unlock_sessions_expires ON unlock_sessions(expires_at);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
      `);
    },
  },
];

export function runDatabaseMigrations(): { applied: string[]; total: number } {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
    .all() as { version: string }[];
  const appliedSet = new Set(appliedRows.map((r) => r.version));
  const newlyApplied: string[] = [];

  const applySingle = db.transaction((migration: SchemaMigration) => {
    migration.up();
    db.prepare(
      'INSERT INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)'
    ).run(migration.version, migration.description, new Date().toISOString());
  });

  for (const migration of SCHEMA_MIGRATIONS) {
    if (!appliedSet.has(migration.version)) {
      applySingle(migration);
      newlyApplied.push(migration.version);
    }
  }

  return { applied: newlyApplied, total: SCHEMA_MIGRATIONS.length };
}

export function initializeDatabase(): void {
  runDatabaseMigrations();

  const nowIso = new Date().toISOString();

  // Seed Site Settings if missing
  const existingSettings = db.prepare('SELECT id FROM site_settings WHERE id = 1').get();
  if (!existingSettings) {
    db.prepare('INSERT INTO site_settings (id, data_json, updated_at) VALUES (1, ?, ?)').run(
      JSON.stringify(DEFAULT_SITE_SETTINGS),
      nowIso
    );
  }

  // Seed Initial Admin User with hashed PIN (defaults to 20055 per user specification)
  const existingAdmin = db.prepare('SELECT id FROM admin_users WHERE id = 1').get();
  if (!existingAdmin) {
    const initialPin = (process.env.INITIAL_ADMIN_PIN || '20055').trim();
    const { hash, salt } = hashPin(initialPin);
    db.prepare(
      `INSERT INTO admin_users (id, username, pin_hash, pin_salt, is_default_pin, failed_attempts, locked_until, updated_at)
       VALUES (1, 'Administrator', ?, ?, 1, 0, 0, ?)`
    ).run(hash, salt, nowIso);
  }

  // Seed Categories if empty
  const categoryCount = (db.prepare('SELECT COUNT(*) as count FROM video_categories').get() as { count: number }).count;
  if (categoryCount === 0) {
    const seedCategories: VideoCategory[] = [
      { id: 'cat-cinema', name: 'Cinema Releases', slug: 'cinema-releases', displayOrder: 0, enabled: true },
      { id: 'cat-doc', name: 'Documentaries', slug: 'documentaries', displayOrder: 1, enabled: true },
      { id: 'cat-arch', name: 'Architecture & Art', slug: 'architecture-art', displayOrder: 2, enabled: true },
      { id: 'cat-nature', name: 'Expeditions', slug: 'expeditions', displayOrder: 3, enabled: true },
    ];
    const insertCat = db.prepare(
      'INSERT INTO video_categories (id, name, slug, display_order, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const c of seedCategories) {
      insertCat.run(c.id, c.name, c.slug, c.displayOrder, c.enabled ? 1 : 0, nowIso);
    }
  }

  // Seed Ad Placements if empty (never fabricate real Adsterra publisher IDs)
  const placementCount = (db.prepare('SELECT COUNT(*) as count FROM ad_placements').get() as { count: number }).count;
  if (placementCount === 0) {
    const defaultPlacements: Omit<AdPlacement, 'updatedAt'>[] = [
      {
        id: 'ad-below-card',
        slot: 'below_video_card',
        label: 'Native Banner Beneath Video Cards',
        format: 'native_banner',
        enabled: false,
        displayOrder: 0,
        frequency: 1,
        adDestinationUrl: '',
        scriptSrc: '',
        containerId: '',
        bannerKey: '',
        bannerWidth: 320,
        bannerHeight: 100,
        rawSnippet: '',
        testMode: false,
        notes: 'Paste your Adsterra Native Banner invoke.js URL and container ID, or paste the approved Adsterra Native Banner snippet.',
      },
      {
        id: 'ad-between-sections',
        slot: 'between_sections',
        label: 'Homepage Mid-Section Banner',
        format: 'standard_banner',
        enabled: false,
        displayOrder: 1,
        frequency: 1,
        adDestinationUrl: '',
        scriptSrc: '',
        containerId: '',
        bannerKey: '',
        bannerWidth: 728,
        bannerHeight: 90,
        rawSnippet: '',
        testMode: false,
        notes: 'Displayed between the featured section and main video grid.',
      },
      {
        id: 'ad-header',
        slot: 'header_banner',
        label: 'Top Header Leaderboard',
        format: 'standard_banner',
        enabled: false,
        displayOrder: 2,
        frequency: 1,
        adDestinationUrl: '',
        scriptSrc: '',
        containerId: '',
        bannerKey: '',
        bannerWidth: 728,
        bannerHeight: 90,
        rawSnippet: '',
        testMode: false,
        notes: 'Optional banner placement beneath the top navigation bar.',
      },
      {
        id: 'ad-footer',
        slot: 'footer_banner',
        label: 'Pre-Footer Banner',
        format: 'standard_banner',
        enabled: false,
        displayOrder: 3,
        frequency: 1,
        adDestinationUrl: '',
        scriptSrc: '',
        containerId: '',
        bannerKey: '',
        bannerWidth: 728,
        bannerHeight: 90,
        rawSnippet: '',
        testMode: false,
        notes: 'Optional banner placement directly above the footer.',
      },
      {
        id: 'ad-watch-unlock',
        slot: 'watch_unlock_flow',
        label: 'Watch Now Direct-Link Sponsor',
        format: 'direct_link',
        enabled: false,
        displayOrder: 4,
        frequency: 1,
        adDestinationUrl: '',
        scriptSrc: '',
        containerId: '',
        bannerKey: '',
        bannerWidth: 0,
        bannerHeight: 0,
        rawSnippet: '',
        testMode: false,
        notes: 'Configure your Adsterra Direct Link URL here to power the "ভিডিও আনলক করুন" Watch Now flow.',
      },
      {
        id: 'ad-download-flow',
        slot: 'download_option_flow',
        label: 'Download Options Direct-Link Sponsor',
        format: 'direct_link',
        enabled: false,
        displayOrder: 5,
        frequency: 1,
        adDestinationUrl: '',
        scriptSrc: '',
        containerId: '',
        bannerKey: '',
        bannerWidth: 0,
        bannerHeight: 0,
        rawSnippet: '',
        testMode: false,
        notes: 'Fallback Adsterra Direct Link URL opened when a user selects a download resolution.',
      },
      {
        id: 'ad-popunder',
        slot: 'global_popunder',
        label: 'Popunder / Social Bar Script',
        format: 'popunder',
        enabled: false,
        displayOrder: 6,
        frequency: 1,
        adDestinationUrl: '',
        scriptSrc: '',
        containerId: '',
        bannerKey: '',
        bannerWidth: 0,
        bannerHeight: 0,
        rawSnippet: '',
        testMode: false,
        notes: 'Loads only on the public gallery (never inside Admin). Subject to browser popup policies.',
      },
    ];

    const insertPlacement = db.prepare(`
      INSERT INTO ad_placements (
        id, slot, label, format, enabled, display_order, frequency,
        ad_destination_url, script_src, container_id, banner_key,
        banner_width, banner_height, raw_snippet, test_mode, notes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const p of defaultPlacements) {
      insertPlacement.run(
        p.id,
        p.slot,
        p.label,
        p.format,
        p.enabled ? 1 : 0,
        p.displayOrder,
        p.frequency,
        p.adDestinationUrl,
        p.scriptSrc,
        p.containerId,
        p.bannerKey,
        p.bannerWidth,
        p.bannerHeight,
        p.rawSnippet,
        p.testMode ? 1 : 0,
        p.notes,
        nowIso
      );
    }
  }

  // Seed clearly marked Sample Videos only if database has never had videos
  const videoCount = (db.prepare('SELECT COUNT(*) as count FROM videos').get() as { count: number }).count;
  const hasSeededFlag = db
    .prepare("SELECT id FROM audit_logs WHERE action = 'INITIAL_SAMPLE_SEED' LIMIT 1")
    .get();

  if (videoCount === 0 && !hasSeededFlag) {
    const sampleVideos = [
      {
        id: 'vid-sample-1',
        title: '[Sample] Rain Over Shinjuku — 35mm Anamorphic Study',
        thumbnailUrl: '/src/assets/images/sample_thumb_nocturne_1793190834338.jpg',
        description:
          'Sample showcase entry demonstrating how uploaded thumbnails appear on the public gallery. Replace or clear sample entries anytime from the Admin Dashboard.',
        category: 'Cinema Releases',
        tags: ['Sample', '4K HDR', '35mm'],
        featured: true,
        status: 'published',
        displayOrder: 0,
        watchAdUrl: '',
        telegramUrl: 'https://t.me/',
        badgeText: 'SAMPLE · 4K',
        durationLabel: '18:42',
        isSample: true,
      },
      {
        id: 'vid-sample-2',
        title: '[Sample] Highland Ridge — Volcanic Aerial Documentary',
        thumbnailUrl: '/src/assets/images/sample_thumb_expedition_1793190835653.jpg',
        description:
          'High-altitude aerial documentary reel across volcanic ridges at dawn. Includes multi-resolution download options configurable per video.',
        category: 'Expeditions',
        tags: ['Sample', 'Aerial', 'IMAX'],
        featured: true,
        status: 'published',
        displayOrder: 1,
        watchAdUrl: '',
        telegramUrl: 'https://t.me/',
        badgeText: 'SAMPLE · HD',
        durationLabel: '24:15',
        isSample: true,
      },
      {
        id: 'vid-sample-3',
        title: '[Sample] Monolith Acoustics — Brutalist Hall Session',
        thumbnailUrl: '/src/assets/images/sample_thumb_architecture_1793190836399.jpg',
        description:
          'Architectural light and acoustic study filmed inside a raw concrete symphony hall. Configure custom Telegram links and sponsor URLs in Admin.',
        category: 'Architecture & Art',
        tags: ['Sample', 'Architecture', 'Sound'],
        featured: false,
        status: 'published',
        displayOrder: 2,
        watchAdUrl: '',
        telegramUrl: 'https://t.me/',
        badgeText: 'SAMPLE',
        durationLabel: '14:08',
        isSample: true,
      },
      {
        id: 'vid-sample-4',
        title: '[Sample] Abyssal Light — Pelagic Deep Water Archive',
        thumbnailUrl: '/src/assets/images/sample_thumb_oceanic_1793190837135.jpg',
        description:
          'Natural-light underwater cinematography exploring deep pelagic columns. Marked as sample content — remove all samples with one click in Admin.',
        category: 'Documentaries',
        tags: ['Sample', 'Ocean', '60fps'],
        featured: false,
        status: 'published',
        displayOrder: 3,
        watchAdUrl: '',
        telegramUrl: 'https://t.me/',
        badgeText: 'SAMPLE · 60FPS',
        durationLabel: '31:50',
        isSample: true,
      },
    ];

    const insertVid = db.prepare(`
      INSERT INTO videos (
        id, title, thumbnail_url, description, category, tags_json,
        featured, status, display_order, watch_ad_url, telegram_url,
        badge_text, duration_label, is_sample, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertOpt = db.prepare(`
      INSERT INTO download_options (
        id, video_id, display_name, quality_label, file_size, format,
        ad_destination_url, destination_url, direct_download_url, enabled, display_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const v of sampleVideos) {
      insertVid.run(
        v.id,
        v.title,
        v.thumbnailUrl,
        v.description,
        v.category,
        JSON.stringify(v.tags),
        v.featured ? 1 : 0,
        v.status,
        v.displayOrder,
        v.watchAdUrl,
        v.telegramUrl,
        v.badgeText,
        v.durationLabel,
        v.isSample ? 1 : 0,
        nowIso,
        nowIso
      );

      const defaultOpts = [
        {
          id: `${v.id}-360p`,
          displayName: '360p — Small Size',
          qualityLabel: '360p SD',
          fileSize: '85 MB',
          format: 'MP4',
          order: 0,
        },
        {
          id: `${v.id}-480p`,
          displayName: '480p — Medium Size',
          qualityLabel: '480p SD',
          fileSize: '160 MB',
          format: 'MP4',
          order: 1,
        },
        {
          id: `${v.id}-720p`,
          displayName: '720p HD — Large Size',
          qualityLabel: '720p HD',
          fileSize: '390 MB',
          format: 'MP4',
          order: 2,
        },
        {
          id: `${v.id}-1080p`,
          displayName: '1080p Full HD — Highest Quality',
          qualityLabel: '1080p FHD',
          fileSize: '820 MB',
          format: 'MKV',
          order: 3,
        },
      ];

      for (const opt of defaultOpts) {
        insertOpt.run(
          opt.id,
          v.id,
          opt.displayName,
          opt.qualityLabel,
          opt.fileSize,
          opt.format,
          '',
          'https://t.me/',
          '',
          1,
          opt.order
        );
      }
    }

    db.prepare(
      'INSERT INTO audit_logs (id, action, actor, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      crypto.randomUUID(),
      'INITIAL_SAMPLE_SEED',
      'System',
      'Seeded 4 clearly labeled sample video entries for initial setup.',
      '127.0.0.1',
      nowIso
    );
  }
}

export function getSiteSettings(): SiteSettings {
  const row = db.prepare('SELECT data_json FROM site_settings WHERE id = 1').get() as
    | { data_json: string }
    | undefined;
  if (!row) return DEFAULT_SITE_SETTINGS;
  try {
    const parsed = JSON.parse(row.data_json);
    return { ...DEFAULT_SITE_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SITE_SETTINGS;
  }
}

export function saveSiteSettings(settings: SiteSettings): SiteSettings {
  const merged: SiteSettings = { ...DEFAULT_SITE_SETTINGS, ...settings };
  const nowIso = new Date().toISOString();
  db.prepare('UPDATE site_settings SET data_json = ?, updated_at = ? WHERE id = 1').run(
    JSON.stringify(merged),
    nowIso
  );
  return merged;
}

export function getCategories(onlyEnabled = false): VideoCategory[] {
  const sql = onlyEnabled
    ? 'SELECT * FROM video_categories WHERE enabled = 1 ORDER BY display_order ASC, name ASC'
    : 'SELECT * FROM video_categories ORDER BY display_order ASC, name ASC';
  const rows = db.prepare(sql).all() as any[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    displayOrder: r.display_order,
    enabled: Boolean(r.enabled),
  }));
}

export function getVideos(includeUnpublished = false): VideoEntry[] {
  const sql = includeUnpublished
    ? 'SELECT * FROM videos ORDER BY display_order ASC, created_at DESC'
    : "SELECT * FROM videos WHERE status = 'published' ORDER BY display_order ASC, created_at DESC";
  const videoRows = db.prepare(sql).all() as any[];

  const optSql = includeUnpublished
    ? 'SELECT * FROM download_options ORDER BY display_order ASC'
    : 'SELECT * FROM download_options WHERE enabled = 1 ORDER BY display_order ASC';
  const optRows = db.prepare(optSql).all() as any[];

  const optionsByVideo = new Map<string, DownloadOption[]>();
  for (const o of optRows) {
    const list = optionsByVideo.get(o.video_id) || [];
    list.push({
      id: o.id,
      videoId: o.video_id,
      displayName: o.display_name,
      qualityLabel: o.quality_label,
      fileSize: o.file_size,
      format: o.format,
      adDestinationUrl: o.ad_destination_url,
      destinationUrl: o.destination_url,
      directDownloadUrl: o.direct_download_url,
      enabled: Boolean(o.enabled),
      displayOrder: o.display_order,
    });
    optionsByVideo.set(o.video_id, list);
  }

  return videoRows.map((v) => {
    let tags: string[] = [];
    try {
      tags = JSON.parse(v.tags_json || '[]');
    } catch {
      tags = [];
    }
    return {
      id: v.id,
      title: v.title,
      thumbnailUrl: v.thumbnail_url,
      description: v.description,
      category: v.category,
      tags: Array.isArray(tags) ? tags : [],
      featured: Boolean(v.featured),
      status: v.status,
      displayOrder: v.display_order,
      watchAdUrl: v.watch_ad_url,
      telegramUrl: v.telegram_url,
      badgeText: v.badge_text,
      durationLabel: v.duration_label,
      isSample: Boolean(v.is_sample),
      downloadOptions: optionsByVideo.get(v.id) || [],
      createdAt: v.created_at,
      updatedAt: v.updated_at,
    };
  });
}

export function getAdPlacements(onlyEnabled = false): AdPlacement[] {
  const sql = onlyEnabled
    ? 'SELECT * FROM ad_placements WHERE enabled = 1 ORDER BY display_order ASC'
    : 'SELECT * FROM ad_placements ORDER BY display_order ASC';
  const rows = db.prepare(sql).all() as any[];
  return rows.map((r) => ({
    id: r.id,
    slot: r.slot,
    label: r.label,
    format: r.format,
    enabled: Boolean(r.enabled),
    displayOrder: r.display_order,
    frequency: r.frequency,
    adDestinationUrl: r.ad_destination_url,
    scriptSrc: r.script_src,
    containerId: r.container_id,
    bannerKey: r.banner_key,
    bannerWidth: r.banner_width,
    bannerHeight: r.banner_height,
    rawSnippet: r.raw_snippet,
    testMode: Boolean(r.test_mode),
    notes: r.notes,
    updatedAt: r.updated_at,
  }));
}

export function logAudit(action: string, details: string, ipAddress = ''): void {
  db.prepare(
    'INSERT INTO audit_logs (id, action, actor, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(crypto.randomUUID(), action, 'Administrator', details.slice(0, 500), ipAddress.slice(0, 100), new Date().toISOString());
}

export function getRecentAuditLogs(limit = 25): AuditLogEntry[] {
  const rows = db
    .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?')
    .all(limit) as any[];
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    actor: r.actor,
    details: r.details,
    ipAddress: r.ip_address,
    createdAt: r.created_at,
  }));
}
