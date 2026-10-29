import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import dotenv from 'dotenv';
import {
  db,
  APP_ROOT,
  DATA_DIR,
  UPLOADS_DIR,
  initializeDatabase,
  hashPin,
  verifyPin,
  getSiteSettings,
  saveSiteSettings,
  getCategories,
  getVideos,
  getAdPlacements,
  logAudit,
  getRecentAuditLogs,
} from './src/server/db.ts';
import type { AdPlacement, DownloadOption, PublicationStatus, SiteSettings, VideoEntry } from './src/types.ts';
import {
  inspectAdsterraSnippet,
  normalizeProtocolRelativeUrl,
  resolvePlacementDirectUrl,
} from './src/lib/adsterra.ts';

dotenv.config({ path: path.join(APP_ROOT, '.env') });

const invokedEntry = path.basename(process.argv[1] || '');
const isPassengerLoader =
  invokedEntry === 'lsnode.js' ||
  invokedEntry === 'node-loader.js' ||
  Boolean(process.env.PASSENGER_APP_ENV);
const isProduction =
  process.env.NODE_ENV === 'production' ||
  ((invokedEntry === 'server.js' || invokedEntry === 'app.cjs' || isPassengerLoader) &&
    process.env.NODE_ENV !== 'development');
if (isProduction && !process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

initializeDatabase();

export const app = express();
app.disable('x-powered-by');

const trustProxyEnv = (process.env.TRUST_PROXY ?? '').trim().toLowerCase();
if (trustProxyEnv === 'true') {
  app.set('trust proxy', true);
} else if (trustProxyEnv === 'false' || trustProxyEnv === '0') {
  app.set('trust proxy', false);
} else if (trustProxyEnv && !Number.isNaN(Number(trustProxyEnv))) {
  app.set('trust proxy', Number(trustProxyEnv));
} else if (isProduction) {
  // Trust first reverse-proxy hop by default in production (cPanel/Apache, Nginx, Cloud Run, Render, Railway)
  app.set('trust proxy', 1);
}

const rawCorsList = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

if (rawCorsList.includes('*')) {
  console.warn(
    '[Security Warning] Wildcard "*" in CORS_ORIGIN is ignored to protect credentialed admin routes. Specify explicit https:// origin(s) instead.'
  );
}

const allowedCorsOrigins = rawCorsList.filter((origin) => {
  if (origin === '*') return false;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.origin === origin;
  } catch {
    console.warn(`[Configuration Warning] Ignoring invalid CORS_ORIGIN entry: "${origin}"`);
    return false;
  }
});

if (allowedCorsOrigins.length > 0) {
  app.use((req, res, next) => {
    const origin = (req.headers.origin || '').trim().replace(/\/+$/, '');
    const isAllowed = Boolean(origin && allowedCorsOrigins.includes(origin));
    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') {
      res.status(isAllowed ? 204 : 403).end();
      return;
    }
    next();
  });
}

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '2mb' }));

// Helper to extract client IP safely
function getClientIp(req: Request): string {
  if (req.ip) return req.ip;
  const xff = req.headers['x-forwarded-for'];
  if (!isProduction && typeof xff === 'string') return xff.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

// URL validation helper (allows http://, https://, protocol-relative // for ad scripts, or local uploaded / asset paths)
function isValidHttpUrlOrEmpty(
  val: string,
  allowRelative = false,
  allowProtocolRelative = false
): boolean {
  if (!val || val.trim() === '') return true;
  const trimmed = val.trim();
  if (allowRelative && (trimmed.startsWith('/uploads/') || trimmed.startsWith('/src/assets/'))) {
    return true;
  }
  const candidate = allowProtocolRelative ? normalizeProtocolRelativeUrl(trimmed) : trimmed;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeStatus(status?: string): PublicationStatus {
  if (status === 'published' || status === 'draft' || status === 'archived') {
    return status;
  }
  return 'draft';
}

// Serve uploaded images with safe cache headers and strict content types
app.use(
  '/uploads',
  express.static(UPLOADS_DIR, {
    maxAge: '7d',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  })
);
app.use('/uploads', (_req, res) => {
  res.status(404).json({ error: 'Uploaded media file not found.' });
});

// Serve bundled sample/fallback gallery images in both development and production builds
const BUNDLED_IMAGES_CANDIDATES = [
  path.join(APP_ROOT, 'src/assets/images'),
  path.join(APP_ROOT, 'dist/src/assets/images'),
];
for (const imagesDir of BUNDLED_IMAGES_CANDIDATES) {
  if (fs.existsSync(imagesDir)) {
    app.use(
      '/src/assets/images',
      express.static(imagesDir, {
        maxAge: '30d',
        setHeaders: (res) => {
          res.setHeader('X-Content-Type-Options', 'nosniff');
        },
      })
    );
  }
}
app.use('/src/assets/images', (_req, res) => {
  res.status(404).json({ error: 'Asset image not found.' });
});

// Rate limiter map for login and unlock creation
const rateLimits = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || entry.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) {
    return false;
  }
  entry.count += 1;
  return true;
}

// Periodic cleanup of expired rate-limit counters and expired sessions
const cleanupInterval = setInterval(() => {
  try {
    const now = Date.now();
    for (const [k, v] of rateLimits.entries()) {
      if (v.resetAt <= now) rateLimits.delete(k);
    }
    db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(now);
    db.prepare('DELETE FROM unlock_sessions WHERE expires_at <= ?').run(now);
  } catch {
    // Ignore transient cleanup errors during shutdown
  }
}, 15 * 60 * 1000);
cleanupInterval.unref();

// Session verification & secure cookie helpers
const ADMIN_SESSION_COOKIE = 'nv_admin_session';

function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function isHttpsRequest(req: Request): boolean {
  if (req.secure) return true;
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string') {
    return proto.split(',')[0].trim().toLowerCase() === 'https';
  }
  return false;
}

function readCookieValue(cookieHeader: string | undefined, name: string): string {
  if (!cookieHeader) return '';
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const k = pair.slice(0, eqIdx).trim();
    if (k === name) {
      try {
        return decodeURIComponent(pair.slice(eqIdx + 1).trim());
      } catch {
        return pair.slice(eqIdx + 1).trim();
      }
    }
  }
  return '';
}

function setAdminSessionCookie(req: Request, res: Response, token: string, maxAgeSeconds: number) {
  const parts = [
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/api/admin',
    'HttpOnly',
    `Max-Age=${maxAgeSeconds}`,
    'SameSite=Lax',
  ];
  if (isHttpsRequest(req)) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearAdminSessionCookie(req: Request, res: Response) {
  const parts = [
    `${ADMIN_SESSION_COOKIE}=`,
    'Path=/api/admin',
    'HttpOnly',
    'Max-Age=0',
    'SameSite=Lax',
  ];
  if (isHttpsRequest(req)) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

interface AdminRequest extends Request {
  adminTokenHash?: string;
}

function requireAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let rawToken = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    rawToken = authHeader.slice(7).trim();
  } else {
    rawToken = readCookieValue(req.headers.cookie, ADMIN_SESSION_COOKIE);
  }

  if (!rawToken) {
    res.status(401).json({ error: 'Unauthorized: Admin session token required.' });
    return;
  }

  const tokenHash = hashSessionToken(rawToken);
  const now = Date.now();
  // Clean expired sessions opportunistically
  db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(now);

  const session = db
    .prepare('SELECT token_hash, expires_at FROM admin_sessions WHERE token_hash = ?')
    .get(tokenHash) as { token_hash: string; expires_at: number } | undefined;

  if (!session || session.expires_at <= now) {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    return;
  }

  req.adminTokenHash = tokenHash;
  next();
}

// Multer setup for drag-and-drop image uploads
const allowedMimeToExt: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = allowedMimeToExt[file.mimetype] || '.jpg';
    const safeName = `thumb_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB max
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeToExt[file.mimetype]) {
      cb(new Error('Unsupported file format. Allowed formats: JPG, PNG, WebP, AVIF, GIF.'));
      return;
    }
    cb(null, true);
  },
});

// ============================================================================
// HEALTH CHECK & PUBLIC API ROUTES
// ============================================================================

app.get('/api/health', (_req, res) => {
  try {
    const dbCheck = db.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
    let uploadsWritable = false;
    try {
      fs.accessSync(UPLOADS_DIR, fs.constants.R_OK | fs.constants.W_OK);
      uploadsWritable = true;
    } catch {
      uploadsWritable = false;
    }

    if (!dbCheck || dbCheck.ok !== 1) {
      res.status(503).json({
        status: 'degraded',
        database: 'unreachable',
        uploadsWritable,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.json({
      status: 'ok',
      database: 'connected',
      uploadsWritable,
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: 'error',
      database: 'error',
      uploadsWritable: false,
      timestamp: new Date().toISOString(),
    });
  }
});

app.get('/api/public/bootstrap', (_req, res) => {
  try {
    const settings = getSiteSettings();
    const categories = getCategories(true);
    const allPublishedVideos = getVideos(false);
    // Strip internal ad destination URLs if not needed directly on card list; expose sanitized public data
    const sanitizedVideos = allPublishedVideos.map((v) => ({
      ...v,
      downloadOptions: v.downloadOptions.map((opt) => ({
        ...opt,
        // Do not expose direct destination URLs prior to unlock step unless direct mode
        destinationUrl: settings.unlockMode === 'direct' ? opt.destinationUrl : '',
        directDownloadUrl: settings.unlockMode === 'direct' ? opt.directDownloadUrl : '',
      })),
      telegramUrl: settings.unlockMode === 'direct' ? v.telegramUrl || settings.defaultTelegramUrl : '',
    }));

    const adPlacements = getAdPlacements(true);

    res.json({
      settings,
      categories,
      videos: sanitizedVideos,
      adPlacements,
    });
  } catch (error) {
    console.error('Public bootstrap error:', error);
    res.status(500).json({ error: 'Failed to load gallery content.' });
  }
});

// Initiate Watch Now or Download Option unlock session
app.post('/api/public/unlock/start', (req, res) => {
  try {
    const ip = getClientIp(req);
    if (!checkRateLimit(`unlock:${ip}`, 40, 60_000)) {
      res.status(429).json({ error: 'Too many unlock requests. Please wait a moment.' });
      return;
    }

    const { videoId, flowType, optionId } = req.body as {
      videoId?: string;
      flowType?: 'watch' | 'download';
      optionId?: string;
    };

    if (!videoId || (flowType !== 'watch' && flowType !== 'download')) {
      res.status(400).json({ error: 'Invalid unlock parameters.' });
      return;
    }

    const videoRow = db
      .prepare("SELECT * FROM videos WHERE id = ? AND status = 'published'")
      .get(videoId) as any;

    if (!videoRow) {
      res.status(404).json({ error: 'Video not found or unavailable.' });
      return;
    }

    const settings = getSiteSettings();
    const placements = getAdPlacements(false);

    let adUrl = '';
    let targetUrl = '';
    let directUrl = '';

    if (flowType === 'watch') {
      const watchPlacement = placements.find((p) => p.slot === 'watch_unlock_flow');
      adUrl =
        (videoRow.watch_ad_url || '').trim() ||
        (watchPlacement?.enabled ? resolvePlacementDirectUrl(watchPlacement) : '') ||
        (settings.defaultWatchAdUrl || '').trim();
      targetUrl = (videoRow.telegram_url || '').trim() || (settings.defaultTelegramUrl || '').trim();

      if (!targetUrl || !isValidHttpUrlOrEmpty(targetUrl)) {
        res.status(400).json({
          error: 'Telegram destination URL is not configured for this video yet.',
        });
        return;
      }
    } else {
      if (!optionId) {
        res.status(400).json({ error: 'Download option ID is required.' });
        return;
      }
      const optRow = db
        .prepare('SELECT * FROM download_options WHERE id = ? AND video_id = ? AND enabled = 1')
        .get(optionId, videoId) as any;

      if (!optRow) {
        res.status(404).json({ error: 'Selected download option is disabled or unavailable.' });
        return;
      }

      const dlPlacement = placements.find((p) => p.slot === 'download_option_flow');
      adUrl =
        (optRow.ad_destination_url || '').trim() ||
        (dlPlacement?.enabled ? resolvePlacementDirectUrl(dlPlacement) : '') ||
        (settings.defaultDownloadAdUrl || '').trim();
      targetUrl = (optRow.destination_url || '').trim();
      directUrl = (optRow.direct_download_url || '').trim();

      if (!targetUrl && !directUrl) {
        res.status(400).json({
          error: 'Download destination URL has not been configured for this resolution.',
        });
        return;
      }
    }

    const token = crypto.randomBytes(24).toString('hex');
    const now = Date.now();
    const expiresAt = now + 30 * 60 * 1000; // 30 minutes

    // For watch flows, never bypass the unlock step unless the administrator explicitly set Direct mode.
    // Keep existing fallback behavior for download options when no download ad URL is set.
    const effectiveMode =
      flowType === 'watch'
        ? settings.unlockMode
        : !adUrl
        ? 'direct'
        : settings.unlockMode;
    const initialStatus = effectiveMode === 'direct' ? 'verified' : 'initiated';

    // Append subid token if postback_verified mode so Adsterra S2S postback can call /api/public/adsterra/postback?subid=<token>
    let outboundAdUrl = adUrl;
    if (adUrl && effectiveMode === 'postback_verified') {
      try {
        const parsedAd = new URL(adUrl);
        if (!parsedAd.searchParams.has('subid')) {
          parsedAd.searchParams.set('subid', token);
        }
        outboundAdUrl = parsedAd.toString();
      } catch {
        outboundAdUrl = adUrl;
      }
    }

    db.prepare(`
      INSERT INTO unlock_sessions (
        token, video_id, flow_type, option_id, mode, status,
        ad_url, target_url, direct_url, created_at, opened_at, verified_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      token,
      videoId,
      flowType,
      optionId || '',
      effectiveMode,
      initialStatus,
      outboundAdUrl,
      targetUrl,
      directUrl,
      now,
      effectiveMode === 'direct' ? now : 0,
      effectiveMode === 'direct' ? now : 0,
      expiresAt
    );

    res.json({
      token,
      mode: effectiveMode,
      adConfigured: Boolean(outboundAdUrl),
      adUrl: outboundAdUrl,
      unlocked: initialStatus === 'verified',
      targetUrl: initialStatus === 'verified' ? targetUrl : '',
      directUrl: initialStatus === 'verified' ? directUrl : '',
    });
  } catch (error) {
    console.error('Unlock start error:', error);
    res.status(500).json({ error: 'Unable to initialize unlock flow.' });
  }
});

// Record that the visitor actually clicked and opened the outbound ad tab
app.post('/api/public/unlock/mark-opened', (req, res) => {
  try {
    const { token } = req.body as { token?: string };
    if (!token) {
      res.status(400).json({ error: 'Missing unlock token.' });
      return;
    }
    const row = db.prepare('SELECT * FROM unlock_sessions WHERE token = ?').get(token) as any;
    if (!row || row.expires_at <= Date.now()) {
      res.status(404).json({ error: 'Unlock session expired. Please try again.' });
      return;
    }
    if (!row.ad_url && row.mode !== 'direct') {
      res.status(400).json({
        error:
          'Advertising destination URL is not configured for this video yet. Please configure an Adsterra Direct Link in the Admin Panel.',
      });
      return;
    }
    if (!row.opened_at) {
      db.prepare('UPDATE unlock_sessions SET opened_at = ?, status = ? WHERE token = ?').run(
        Date.now(),
        row.status === 'verified' ? 'verified' : 'ad_opened',
        token
      );
    }
    res.json({ ok: true, openedAt: row.opened_at || Date.now() });
  } catch (error) {
    console.error('Mark opened error:', error);
    res.status(500).json({ error: 'Failed to update unlock session.' });
  }
});

// Honest Return-and-Continue confirmation (only for return_continue mode after outbound ad visit)
app.post('/api/public/unlock/confirm-return', (req, res) => {
  try {
    const { token } = req.body as { token?: string };
    if (!token) {
      res.status(400).json({ error: 'Missing unlock token.' });
      return;
    }
    const row = db.prepare('SELECT * FROM unlock_sessions WHERE token = ?').get(token) as any;
    if (!row || row.expires_at <= Date.now()) {
      res.status(404).json({ error: 'Unlock session expired. Please restart the unlock step.' });
      return;
    }

    if (row.mode === 'postback_verified' && row.status !== 'verified') {
      res.status(403).json({
        error:
          'Waiting for verified server callback from advertising provider. Manual confirmation is disabled in Postback Verification mode.',
      });
      return;
    }

    if (!row.ad_url && row.mode !== 'direct') {
      res.status(400).json({
        error: 'Advertising destination URL is not configured for this video yet.',
      });
      return;
    }

    if (!row.opened_at) {
      res.status(400).json({
        error: 'Please open the advertising destination first before continuing.',
      });
      return;
    }

    db.prepare('UPDATE unlock_sessions SET status = ?, verified_at = ? WHERE token = ?').run(
      'verified',
      Date.now(),
      token
    );

    res.json({
      unlocked: true,
      mode: row.mode,
      targetUrl: row.target_url,
      directUrl: row.direct_url,
    });
  } catch (error) {
    console.error('Confirm return error:', error);
    res.status(500).json({ error: 'Unable to confirm return step.' });
  }
});

// Check status of an unlock token (used when polling for S2S Postback verification)
app.get('/api/public/unlock/status/:token', (req, res) => {
  try {
    const { token } = req.params;
    const row = db.prepare('SELECT * FROM unlock_sessions WHERE token = ?').get(token) as any;
    if (!row || row.expires_at <= Date.now()) {
      res.status(404).json({ error: 'Unlock session expired.' });
      return;
    }
    const unlocked = row.status === 'verified';
    res.json({
      unlocked,
      mode: row.mode,
      status: row.status,
      targetUrl: unlocked ? row.target_url : '',
      directUrl: unlocked ? row.direct_url : '',
    });
  } catch {
    res.status(500).json({ error: 'Failed to check unlock status.' });
  }
});

// Official Server-to-Server (S2S) Postback Callback endpoint for Adsterra CPA / Verified Offers
// Example Postback URL configured in Adsterra: https://<your-domain>/api/public/adsterra/postback?subid={SUBID}&secret=<ADSTERRA_POSTBACK_SECRET>
app.all('/api/public/adsterra/postback', (req, res) => {
  try {
    const subid = String(req.query.subid || req.body?.subid || '').trim();
    const providedSecret = String(req.query.secret || req.body?.secret || '').trim();
    const expectedSecret = (process.env.ADSTERRA_POSTBACK_SECRET || '').trim();

    if (!expectedSecret || providedSecret !== expectedSecret) {
      res.status(403).json({ error: 'Invalid or unconfigured postback secret.' });
      return;
    }
    if (!subid) {
      res.status(400).json({ error: 'Missing subid token.' });
      return;
    }

    const row = db.prepare('SELECT token FROM unlock_sessions WHERE token = ?').get(subid);
    if (!row) {
      res.status(404).json({ error: 'Session token not found.' });
      return;
    }

    db.prepare('UPDATE unlock_sessions SET status = ?, verified_at = ? WHERE token = ?').run(
      'verified',
      Date.now(),
      subid
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Postback error:', error);
    res.status(500).json({ error: 'Postback processing error.' });
  }
});

// ============================================================================
// ADMIN AUTHENTICATION & SECURITY ROUTES
// ============================================================================

app.post('/api/admin/auth/login', (req, res) => {
  try {
    const ip = getClientIp(req);
    if (!checkRateLimit(`admin-login:${ip}`, 10, 5 * 60 * 1000)) {
      res.status(429).json({
        error: 'Too many authentication attempts from your IP. Please wait 5 minutes.',
      });
      return;
    }

    const { pin } = req.body as { pin?: string };
    if (!pin || typeof pin !== 'string' || pin.trim().length < 4 || pin.trim().length > 64) {
      res.status(400).json({ error: 'Please enter a valid access credential.' });
      return;
    }

    const adminRow = db.prepare('SELECT * FROM admin_users WHERE id = 1').get() as any;
    if (!adminRow) {
      res.status(500).json({ error: 'Admin account not initialized.' });
      return;
    }

    const now = Date.now();
    if (adminRow.locked_until && adminRow.locked_until > now) {
      const secondsLeft = Math.ceil((adminRow.locked_until - now) / 1000);
      res.status(423).json({
        error: `Admin access temporarily locked after repeated failed attempts. Try again in ${secondsLeft}s.`,
        lockedUntil: adminRow.locked_until,
      });
      return;
    }

    const valid = verifyPin(pin.trim(), adminRow.pin_hash, adminRow.pin_salt);
    if (!valid) {
      const nextAttempts = Number(adminRow.failed_attempts || 0) + 1;
      const lockDurationMs = nextAttempts >= 5 ? 5 * 60 * 1000 : 0; // Lock 5 mins after 5 failed tries
      const lockedUntil = lockDurationMs ? now + lockDurationMs : 0;

      db.prepare('UPDATE admin_users SET failed_attempts = ?, locked_until = ? WHERE id = 1').run(
        nextAttempts >= 5 ? 0 : nextAttempts,
        lockedUntil
      );
      logAudit('ADMIN_LOGIN_FAILED', `Failed PIN attempt (${nextAttempts}/5)`, ip);

      if (lockedUntil) {
        res.status(423).json({
          error: '5 failed attempts reached. Admin login is locked for 5 minutes.',
          lockedUntil,
        });
        return;
      }

      res.status(401).json({
        error: `Invalid access credential. ${5 - nextAttempts} attempt(s) remaining before lockout.`,
      });
      return;
    }

    // Reset failed counter and issue secure session token
    db.prepare('UPDATE admin_users SET failed_attempts = 0, locked_until = 0 WHERE id = 1').run();

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashSessionToken(sessionToken);
    const maxAgeSeconds = 8 * 60 * 60; // 8 hours
    const expiresAt = now + maxAgeSeconds * 1000;

    db.prepare(
      'INSERT INTO admin_sessions (token_hash, ip_address, user_agent, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).run(tokenHash, ip, String(req.headers['user-agent'] || '').slice(0, 200), now, expiresAt);

    setAdminSessionCookie(req, res, sessionToken, maxAgeSeconds);
    logAudit('ADMIN_LOGIN_SUCCESS', 'Administrator signed in successfully', ip);

    res.json({
      token: sessionToken,
      expiresAt,
      username: adminRow.username,
      usingDefaultPin: Boolean(adminRow.is_default_pin),
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Authentication service error.' });
  }
});

app.get('/api/admin/auth/session', requireAdmin, (_req, res) => {
  const adminRow = db.prepare('SELECT username, is_default_pin FROM admin_users WHERE id = 1').get() as any;
  const activeSessions = (
    db.prepare('SELECT COUNT(*) as count FROM admin_sessions WHERE expires_at > ?').get(Date.now()) as {
      count: number;
    }
  ).count;

  res.json({
    authenticated: true,
    username: adminRow?.username || 'Administrator',
    usingDefaultPin: Boolean(adminRow?.is_default_pin),
    activeSessions,
    postbackSecretConfigured: Boolean((process.env.ADSTERRA_POSTBACK_SECRET || '').trim()),
  });
});

app.post('/api/admin/auth/logout', requireAdmin, (req: AdminRequest, res) => {
  const ip = getClientIp(req);
  if (req.adminTokenHash) {
    db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(req.adminTokenHash);
  }
  clearAdminSessionCookie(req, res);
  logAudit('ADMIN_LOGOUT', 'Administrator signed out', ip);
  res.json({ ok: true });
});

app.post('/api/admin/auth/logout-all', requireAdmin, (req: AdminRequest, res) => {
  const ip = getClientIp(req);
  db.prepare('DELETE FROM admin_sessions').run();
  clearAdminSessionCookie(req, res);
  logAudit('ADMIN_REVOKE_SESSIONS', 'Revoked all active admin sessions', ip);
  res.json({ ok: true });
});

app.post('/api/admin/auth/update-pin', requireAdmin, (req: AdminRequest, res) => {
  try {
    const ip = getClientIp(req);
    const { currentPin, newPin, username } = req.body as {
      currentPin?: string;
      newPin?: string;
      username?: string;
    };

    if (!currentPin || !newPin || newPin.trim().length < 5 || newPin.trim().length > 64) {
      res.status(400).json({
        error: 'New PIN / passphrase must be between 5 and 64 characters.',
      });
      return;
    }

    const adminRow = db.prepare('SELECT * FROM admin_users WHERE id = 1').get() as any;
    if (!verifyPin(currentPin.trim(), adminRow.pin_hash, adminRow.pin_salt)) {
      res.status(401).json({ error: 'Current credential is incorrect.' });
      return;
    }

    const { hash, salt } = hashPin(newPin.trim());
    const isStillDefault = newPin.trim() === '20055' ? 1 : 0;
    const cleanUsername = (username || adminRow.username || 'Administrator').trim().slice(0, 60);

    db.prepare(
      'UPDATE admin_users SET username = ?, pin_hash = ?, pin_salt = ?, is_default_pin = ?, updated_at = ? WHERE id = 1'
    ).run(cleanUsername, hash, salt, isStillDefault, new Date().toISOString());

    logAudit('ADMIN_CREDENTIAL_UPDATED', `Updated admin access credential for ${cleanUsername}`, ip);
    res.json({ ok: true, usingDefaultPin: Boolean(isStillDefault), username: cleanUsername });
  } catch (error) {
    console.error('Update PIN error:', error);
    res.status(500).json({ error: 'Failed to update credential.' });
  }
});

// ============================================================================
// PROTECTED ADMIN MANAGEMENT ROUTES
// ============================================================================

app.get('/api/admin/overview', requireAdmin, (_req, res) => {
  try {
    const allVideos = getVideos(true);
    const adPlacements = getAdPlacements(false);
    const adminRow = db.prepare('SELECT is_default_pin FROM admin_users WHERE id = 1').get() as any;

    let uploadedFilesCount = 0;
    let uploadedStorageBytes = 0;
    if (fs.existsSync(UPLOADS_DIR)) {
      const files = fs.readdirSync(UPLOADS_DIR);
      for (const f of files) {
        const stat = fs.statSync(path.join(UPLOADS_DIR, f));
        if (stat.isFile()) {
          uploadedFilesCount += 1;
          uploadedStorageBytes += stat.size;
        }
      }
    }

    res.json({
      stats: {
        totalVideos: allVideos.length,
        publishedVideos: allVideos.filter((v) => v.status === 'published').length,
        draftVideos: allVideos.filter((v) => v.status === 'draft').length,
        archivedVideos: allVideos.filter((v) => v.status === 'archived').length,
        sampleVideos: allVideos.filter((v) => v.isSample).length,
        activeAdPlacements: adPlacements.filter((p) => p.enabled).length,
        totalAdPlacements: adPlacements.length,
        uploadedFilesCount,
        uploadedStorageBytes,
        usingDefaultPin: Boolean(adminRow?.is_default_pin),
        recentLogs: getRecentAuditLogs(25),
      },
      settings: getSiteSettings(),
      categories: getCategories(false),
      videos: allVideos,
      adPlacements,
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    res.status(500).json({ error: 'Failed to load admin dashboard data.' });
  }
});

// Image upload endpoint
app.post('/api/admin/upload', requireAdmin, (req: AdminRequest, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Image upload failed.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No image file received.' });
      return;
    }
    const url = `/uploads/${req.file.filename}`;
    logAudit('MEDIA_UPLOADED', `Uploaded image ${req.file.filename} (${Math.round(req.file.size / 1024)} KB)`, getClientIp(req));
    res.json({
      url,
      filename: req.file.filename,
      size: req.file.size,
      mimeType: req.file.mimetype,
    });
  });
});

// Delete an uploaded image file
app.delete('/api/admin/upload/:filename', requireAdmin, (req: AdminRequest, res) => {
  try {
    const safeBase = path.basename(req.params.filename);
    const fullPath = path.join(UPLOADS_DIR, safeBase);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      logAudit('MEDIA_DELETED', `Deleted uploaded image ${safeBase}`, getClientIp(req));
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete uploaded image.' });
  }
});

// Create or update video entry (transactional with download_options)
const saveVideoTx = db.transaction((video: VideoEntry, isNew: boolean) => {
  const nowIso = new Date().toISOString();
  if (isNew) {
    db.prepare(`
      INSERT INTO videos (
        id, title, thumbnail_url, description, category, tags_json,
        featured, status, display_order, watch_ad_url, telegram_url,
        badge_text, duration_label, is_sample, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      video.id,
      video.title.trim(),
      video.thumbnailUrl.trim(),
      (video.description || '').trim(),
      (video.category || '').trim(),
      JSON.stringify(Array.isArray(video.tags) ? video.tags : []),
      video.featured ? 1 : 0,
      normalizeStatus(video.status),
      Number(video.displayOrder) || 0,
      (video.watchAdUrl || '').trim(),
      (video.telegramUrl || '').trim(),
      (video.badgeText || '').trim(),
      (video.durationLabel || '').trim(),
      video.isSample ? 1 : 0,
      nowIso,
      nowIso
    );
  } else {
    db.prepare(`
      UPDATE videos SET
        title = ?, thumbnail_url = ?, description = ?, category = ?, tags_json = ?,
        featured = ?, status = ?, display_order = ?, watch_ad_url = ?, telegram_url = ?,
        badge_text = ?, duration_label = ?, is_sample = ?, updated_at = ?
      WHERE id = ?
    `).run(
      video.title.trim(),
      video.thumbnailUrl.trim(),
      (video.description || '').trim(),
      (video.category || '').trim(),
      JSON.stringify(Array.isArray(video.tags) ? video.tags : []),
      video.featured ? 1 : 0,
      normalizeStatus(video.status),
      Number(video.displayOrder) || 0,
      (video.watchAdUrl || '').trim(),
      (video.telegramUrl || '').trim(),
      (video.badgeText || '').trim(),
      (video.durationLabel || '').trim(),
      video.isSample ? 1 : 0,
      nowIso,
      video.id
    );
  }

  db.prepare('DELETE FROM download_options WHERE video_id = ?').run(video.id);
  const insertOpt = db.prepare(`
    INSERT INTO download_options (
      id, video_id, display_name, quality_label, file_size, format,
      ad_destination_url, destination_url, direct_download_url, enabled, display_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  (video.downloadOptions || []).forEach((opt: DownloadOption, idx: number) => {
    insertOpt.run(
      opt.id || crypto.randomUUID(),
      video.id,
      (opt.displayName || 'Download').trim(),
      (opt.qualityLabel || 'HD').trim(),
      (opt.fileSize || '').trim(),
      (opt.format || 'MP4').trim(),
      (opt.adDestinationUrl || '').trim(),
      (opt.destinationUrl || '').trim(),
      (opt.directDownloadUrl || '').trim(),
      opt.enabled !== false ? 1 : 0,
      typeof opt.displayOrder === 'number' ? opt.displayOrder : idx
    );
  });
});

app.post('/api/admin/videos', requireAdmin, (req: AdminRequest, res) => {
  try {
    const body = req.body as Partial<VideoEntry>;
    if (!body.title || !body.title.trim()) {
      res.status(400).json({ error: 'Video title is required.' });
      return;
    }
    if (!body.thumbnailUrl || !isValidHttpUrlOrEmpty(body.thumbnailUrl, true)) {
      res.status(400).json({ error: 'A valid thumbnail image URL or uploaded image is required.' });
      return;
    }
    if (!isValidHttpUrlOrEmpty(body.watchAdUrl || '') || !isValidHttpUrlOrEmpty(body.telegramUrl || '')) {
      res.status(400).json({ error: 'Watch Sponsor URL and Telegram URL must be valid http/https URLs.' });
      return;
    }

    const existingCount = (db.prepare('SELECT COUNT(*) as count FROM videos').get() as { count: number }).count;
    const cleanTags = Array.isArray(body.tags)
      ? body.tags.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 12)
      : [];

    const newVideo: VideoEntry = {
      id: crypto.randomUUID(),
      title: body.title.trim(),
      thumbnailUrl: body.thumbnailUrl.trim(),
      description: (body.description || '').trim(),
      category: (body.category || '').trim(),
      tags: cleanTags,
      featured: Boolean(body.featured),
      status: normalizeStatus(body.status),
      displayOrder: typeof body.displayOrder === 'number' ? body.displayOrder : existingCount,
      watchAdUrl: (body.watchAdUrl || '').trim(),
      telegramUrl: (body.telegramUrl || '').trim(),
      badgeText: (body.badgeText || '').trim(),
      durationLabel: (body.durationLabel || '').trim(),
      isSample: false,
      downloadOptions: Array.isArray(body.downloadOptions) ? body.downloadOptions : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveVideoTx(newVideo, true);
    logAudit('VIDEO_CREATED', `Created video "${newVideo.title}" (${newVideo.status})`, getClientIp(req));
    res.json({ videos: getVideos(true) });
  } catch (error) {
    console.error('Create video error:', error);
    res.status(500).json({ error: 'Failed to create video entry.' });
  }
});

app.put('/api/admin/videos/:id', requireAdmin, (req: AdminRequest, res) => {
  try {
    const { id } = req.params;
    const exists = db.prepare('SELECT id FROM videos WHERE id = ?').get(id);
    if (!exists) {
      res.status(404).json({ error: 'Video entry not found.' });
      return;
    }

    const body = req.body as Partial<VideoEntry>;
    if (!body.title || !body.title.trim()) {
      res.status(400).json({ error: 'Video title is required.' });
      return;
    }
    if (!body.thumbnailUrl || !isValidHttpUrlOrEmpty(body.thumbnailUrl, true)) {
      res.status(400).json({ error: 'A valid thumbnail URL or uploaded image is required.' });
      return;
    }
    if (!isValidHttpUrlOrEmpty(body.watchAdUrl || '') || !isValidHttpUrlOrEmpty(body.telegramUrl || '')) {
      res.status(400).json({ error: 'Watch Sponsor URL and Telegram URL must be valid http/https URLs.' });
      return;
    }

    const cleanTags = Array.isArray(body.tags)
      ? body.tags.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 12)
      : [];

    const updated: VideoEntry = {
      id,
      title: body.title.trim(),
      thumbnailUrl: body.thumbnailUrl.trim(),
      description: (body.description || '').trim(),
      category: (body.category || '').trim(),
      tags: cleanTags,
      featured: Boolean(body.featured),
      status: normalizeStatus(body.status),
      displayOrder: Number(body.displayOrder) || 0,
      watchAdUrl: (body.watchAdUrl || '').trim(),
      telegramUrl: (body.telegramUrl || '').trim(),
      badgeText: (body.badgeText || '').trim(),
      durationLabel: (body.durationLabel || '').trim(),
      isSample: Boolean(body.isSample),
      downloadOptions: Array.isArray(body.downloadOptions) ? body.downloadOptions : [],
      createdAt: body.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveVideoTx(updated, false);
    logAudit('VIDEO_UPDATED', `Updated video "${updated.title}" (${updated.status})`, getClientIp(req));
    res.json({ videos: getVideos(true) });
  } catch (error) {
    console.error('Update video error:', error);
    res.status(500).json({ error: 'Failed to update video entry.' });
  }
});

app.post('/api/admin/videos/:id/duplicate', requireAdmin, (req: AdminRequest, res) => {
  try {
    const all = getVideos(true);
    const source = all.find((v) => v.id === req.params.id);
    if (!source) {
      res.status(404).json({ error: 'Source video not found.' });
      return;
    }

    const copyId = crypto.randomUUID();
    const copy: VideoEntry = {
      ...source,
      id: copyId,
      title: `${source.title} (Copy)`,
      status: 'draft',
      isSample: false,
      displayOrder: all.length,
      downloadOptions: source.downloadOptions.map((o, idx) => ({
        ...o,
        id: crypto.randomUUID(),
        videoId: copyId,
        displayOrder: idx,
      })),
    };

    saveVideoTx(copy, true);
    logAudit('VIDEO_DUPLICATED', `Duplicated "${source.title}" as draft`, getClientIp(req));
    res.json({ videos: getVideos(true) });
  } catch {
    res.status(500).json({ error: 'Failed to duplicate video.' });
  }
});

app.post('/api/admin/videos/reorder', requireAdmin, (req: AdminRequest, res) => {
  try {
    const { orderedIds } = req.body as { orderedIds?: string[] };
    if (!Array.isArray(orderedIds)) {
      res.status(400).json({ error: 'orderedIds array is required.' });
      return;
    }
    const tx = db.transaction((ids: string[]) => {
      const stmt = db.prepare('UPDATE videos SET display_order = ?, updated_at = ? WHERE id = ?');
      const nowIso = new Date().toISOString();
      ids.forEach((id, index) => {
        stmt.run(index, nowIso, id);
      });
    });
    tx(orderedIds);
    logAudit('VIDEOS_REORDERED', `Reordered ${orderedIds.length} video cards`, getClientIp(req));
    res.json({ videos: getVideos(true) });
  } catch {
    res.status(500).json({ error: 'Failed to reorder video cards.' });
  }
});

app.post('/api/admin/videos/bulk', requireAdmin, (req: AdminRequest, res) => {
  try {
    const { ids, action } = req.body as {
      ids?: string[];
      action?: 'publish' | 'draft' | 'archive' | 'delete';
    };
    if (!Array.isArray(ids) || ids.length === 0 || !action) {
      res.status(400).json({ error: 'Valid video IDs and bulk action are required.' });
      return;
    }

    const tx = db.transaction(() => {
      const nowIso = new Date().toISOString();
      if (action === 'delete') {
        const delStmt = db.prepare('DELETE FROM videos WHERE id = ?');
        for (const id of ids) delStmt.run(id);
      } else {
        const statusMap = { publish: 'published', draft: 'draft', archive: 'archived' } as const;
        const updStmt = db.prepare('UPDATE videos SET status = ?, updated_at = ? WHERE id = ?');
        for (const id of ids) updStmt.run(statusMap[action], nowIso, id);
      }
    });
    tx();
    logAudit('VIDEOS_BULK_ACTION', `Applied "${action}" to ${ids.length} video(s)`, getClientIp(req));
    res.json({ videos: getVideos(true) });
  } catch {
    res.status(500).json({ error: 'Bulk operation failed.' });
  }
});

app.post('/api/admin/videos/clear-samples', requireAdmin, (req: AdminRequest, res) => {
  try {
    const info = db.prepare('DELETE FROM videos WHERE is_sample = 1').run();
    logAudit('SAMPLES_CLEARED', `Removed ${info.changes} sample video entries`, getClientIp(req));
    res.json({ removed: info.changes, videos: getVideos(true) });
  } catch {
    res.status(500).json({ error: 'Failed to clear sample content.' });
  }
});

app.delete('/api/admin/videos/:id', requireAdmin, (req: AdminRequest, res) => {
  try {
    const row = db.prepare('SELECT title FROM videos WHERE id = ?').get(req.params.id) as
      | { title: string }
      | undefined;
    db.prepare('DELETE FROM videos WHERE id = ?').run(req.params.id);
    if (row) {
      logAudit('VIDEO_DELETED', `Deleted video "${row.title}"`, getClientIp(req));
    }
    res.json({ videos: getVideos(true) });
  } catch {
    res.status(500).json({ error: 'Failed to delete video.' });
  }
});

// Categories CRUD
app.put('/api/admin/categories', requireAdmin, (req: AdminRequest, res) => {
  try {
    const { categories } = req.body as { categories?: any[] };
    if (!Array.isArray(categories)) {
      res.status(400).json({ error: 'Categories array required.' });
      return;
    }

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM video_categories').run();
      const stmt = db.prepare(
        'INSERT INTO video_categories (id, name, slug, display_order, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      );
      const nowIso = new Date().toISOString();
      categories.forEach((c, idx) => {
        const name = String(c.name || '').trim();
        if (!name) return;
        const slug =
          String(c.slug || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || `cat-${idx}`;
        stmt.run(c.id || crypto.randomUUID(), name, `${slug}-${idx}`, idx, c.enabled !== false ? 1 : 0, nowIso);
      });
    });

    tx();
    logAudit('CATEGORIES_UPDATED', `Updated ${categories.length} categories`, getClientIp(req));
    res.json({ categories: getCategories(false) });
  } catch (error) {
    console.error('Categories update error:', error);
    res.status(500).json({ error: 'Failed to save categories.' });
  }
});

// Ad Placements Update
app.put('/api/admin/ads', requireAdmin, (req: AdminRequest, res) => {
  try {
    const { placements } = req.body as { placements?: AdPlacement[] };
    if (!Array.isArray(placements)) {
      res.status(400).json({ error: 'Placements array is required.' });
      return;
    }

    for (const p of placements) {
      if (
        !isValidHttpUrlOrEmpty(p.adDestinationUrl || '', false, true) ||
        !isValidHttpUrlOrEmpty(p.scriptSrc || '', false, true)
      ) {
        res.status(400).json({
          error: `Invalid URL in placement "${p.label}". URLs must start with https://, http://, or //.`,
        });
        return;
      }
      const inspection = inspectAdsterraSnippet(p.rawSnippet || '', p.slot, p.format);
      if (!inspection.valid) {
        res.status(400).json({
          error: `Ad code validation failed for "${p.label}": ${inspection.error}`,
        });
        return;
      }
    }

    const tx = db.transaction(() => {
      const nowIso = new Date().toISOString();
      const stmt = db.prepare(`
        UPDATE ad_placements SET
          label = ?, format = ?, enabled = ?, display_order = ?, frequency = ?,
          ad_destination_url = ?, script_src = ?, container_id = ?, banner_key = ?,
          banner_width = ?, banner_height = ?, raw_snippet = ?, test_mode = ?, notes = ?, updated_at = ?
        WHERE id = ?
      `);

      for (const p of placements) {
        const rawSnippet = p.rawSnippet || '';
        const inspection = inspectAdsterraSnippet(rawSnippet, p.slot, p.format);
        const effectiveFormat = !inspection.empty ? inspection.detectedFormat : p.format;

        // If a Direct Link URL or <a href="..."> was pasted in rawSnippet and adDestinationUrl is blank, sync it
        const effectiveDestUrl =
          (p.adDestinationUrl || '').trim()
            ? normalizeProtocolRelativeUrl(p.adDestinationUrl)
            : inspection.extractedDirectUrl || '';

        const effectiveWidth =
          inspection.extractedBannerWidth > 0
            ? inspection.extractedBannerWidth
            : Math.max(0, Number(p.bannerWidth) || 0);

        const effectiveHeight =
          inspection.extractedBannerHeight > 0
            ? inspection.extractedBannerHeight
            : Math.max(0, Number(p.bannerHeight) || 0);

        stmt.run(
          (p.label || '').trim(),
          effectiveFormat,
          p.enabled ? 1 : 0,
          Number(p.displayOrder) || 0,
          Math.max(1, Number(p.frequency) || 1),
          effectiveDestUrl,
          normalizeProtocolRelativeUrl(p.scriptSrc || ''),
          (p.containerId || '').trim(),
          (p.bannerKey || '').trim(),
          effectiveWidth,
          effectiveHeight,
          rawSnippet,
          p.testMode ? 1 : 0,
          (p.notes || '').trim(),
          nowIso,
          p.id
        );
      }
    });

    tx();
    logAudit('AD_PLACEMENTS_UPDATED', 'Updated Adsterra ad placement configurations', getClientIp(req));
    res.json({ adPlacements: getAdPlacements(false) });
  } catch (error) {
    console.error('Update ads error:', error);
    res.status(500).json({ error: 'Failed to save advertisement configurations.' });
  }
});

// Site Settings Update
app.put('/api/admin/settings', requireAdmin, (req: AdminRequest, res) => {
  try {
    const incoming = req.body as Partial<SiteSettings>;
    const urlFields: (keyof SiteSettings)[] = [
      'headerCtaUrl',
      'announcementLinkUrl',
      'heroSecondaryButtonUrl',
      'defaultWatchAdUrl',
      'defaultTelegramUrl',
      'defaultDownloadAdUrl',
      'floatingTelegramUrl',
    ];

    for (const field of urlFields) {
      const val = incoming[field];
      if (typeof val === 'string' && val.trim() && !val.trim().startsWith('#') && !isValidHttpUrlOrEmpty(val)) {
        res.status(400).json({ error: `Field "${field}" must be a valid http:// or https:// URL.` });
        return;
      }
    }

    const updated = saveSiteSettings(incoming as SiteSettings);
    logAudit('SITE_SETTINGS_UPDATED', `Updated site & homepage configuration (${updated.siteName})`, getClientIp(req));
    res.json({ settings: updated });
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ error: 'Failed to save site settings.' });
  }
});

// Unknown API 404 handler
app.all('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// Global error middleware (prevents stack trace or secret leakage in production)
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err && err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Malformed JSON request payload.' });
    return;
  }
  if (err && err.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request payload exceeds maximum allowed size.' });
    return;
  }
  console.error('[Server Error]', isProduction ? err?.message || 'Unhandled error' : err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  }
});

async function startServer() {
  const rawPortEnv = (process.env.PORT || '').trim();
  const isNamedSocketOrPassenger =
    rawPortEnv === 'passenger' ||
    rawPortEnv.startsWith('/') ||
    rawPortEnv.startsWith('\\\\.\\pipe\\');

  let numericPort = 3000;
  if (rawPortEnv && !isNamedSocketOrPassenger) {
    numericPort = Number(rawPortEnv);
    if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
      console.error(
        `[Startup Error] Invalid PORT value "${process.env.PORT}". Expected an integer between 1 and 65535.`
      );
      process.exit(1);
    }
  }
  const HOST = (process.env.HOST || '0.0.0.0').trim();

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(APP_ROOT, 'dist');
    const indexHtmlPath = path.join(distPath, 'index.html');

    if (!fs.existsSync(indexHtmlPath)) {
      console.error(
        `[Startup Warning] Production frontend bundle not found at "${indexHtmlPath}". ` +
          'Run "npm run build" before starting the production server.'
      );
    }

    // Long-lived immutable cache for fingerprinted Vite assets
    app.use(
      '/assets',
      express.static(path.join(distPath, 'assets'), {
        maxAge: '365d',
        immutable: true,
      })
    );

    // Other static files in dist (excluding index.html so we control no-cache headers)
    app.use(express.static(distPath, { index: false, maxAge: '1h' }));

    // SPA fallback for public & nested routes (survives browser refresh)
    app.get('*', (_req, res) => {
      if (!fs.existsSync(indexHtmlPath)) {
        res
          .status(503)
          .json({ error: 'Frontend build artifacts missing. Run "npm run build" before starting the server.' });
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtmlPath);
    });
  }

  const onListening = () => {
    const bindLabel = isNamedSocketOrPassenger ? rawPortEnv : `http://${HOST}:${numericPort}`;
    console.log(
      `[Server] Running in ${isProduction ? 'production' : 'development'} mode on ${bindLabel}`
    );
    console.log(`[Storage] Persistent data directory: ${DATA_DIR}`);
    if (isProduction && !process.env.DATA_DIR && !isPassengerLoader) {
      console.warn(
        '[Storage Notice] DATA_DIR is not explicitly set (using "./data"). On Hostinger GitHub auto-deploys or container hosts (Docker, Render, Railway, Fly.io), set DATA_DIR to an external persistent path (e.g. "/var/lib/nocturne-vault/data") so SQLite data and uploaded images survive redeployments.'
      );
    }
    const adminRow = db.prepare('SELECT is_default_pin FROM admin_users WHERE id = 1').get() as
      | { is_default_pin: number }
      | undefined;
    if (isProduction && adminRow?.is_default_pin) {
      console.warn(
        '[Security Notice] Administrator account is still using the initial setup PIN. Sign in via the footer copyright gateway and update your credential in Admin Security.'
      );
    }
  };

  const httpServer = isNamedSocketOrPassenger
    ? app.listen(rawPortEnv, onListening)
    : app.listen(numericPort, HOST, onListening);

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Server] Received ${signal}. Closing HTTP server and checkpointing SQLite database...`);
    clearInterval(cleanupInterval);

    const forceTimer = setTimeout(() => {
      try {
        db.close();
      } catch {
        // Ignore if already closed
      }
      process.exit(0);
    }, 8000);
    forceTimer.unref();

    httpServer.close(() => {
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();
      } catch {
        // Ignore if already closed
      }
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer();
