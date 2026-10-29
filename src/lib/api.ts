import type {
  AdPlacement,
  AdminDashboardStats,
  PublicBootstrapResponse,
  SiteSettings,
  VideoCategory,
  VideoEntry,
} from '../types.ts';

// Optional API base URL for decoupled frontend/backend deployments (empty = same-origin relative URLs)
const RAW_API_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
const FETCH_CREDENTIALS: RequestCredentials = RAW_API_BASE ? 'include' : 'same-origin';

export function resolveApiUrl(endpoint: string): string {
  if (!RAW_API_BASE) return endpoint;
  return `${RAW_API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
}

export function resolveMediaUrl(url: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (
    RAW_API_BASE &&
    (trimmed.startsWith('/uploads/') || trimmed.startsWith('/src/assets/'))
  ) {
    return `${RAW_API_BASE}${trimmed}`;
  }
  return trimmed;
}

// Keep admin session token strictly in memory (never exposed in URL or permanent plain text)
let adminMemoryToken: string | null = null;

export function setAdminToken(token: string | null) {
  adminMemoryToken = token;
}

export function getAdminToken(): string | null {
  return adminMemoryToken;
}

function apiFetch(endpoint: string, init: RequestInit = {}): Promise<Response> {
  return fetch(resolveApiUrl(endpoint), {
    credentials: FETCH_CREDENTIALS,
    ...init,
  });
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (adminMemoryToken) {
    headers['Authorization'] = `Bearer ${adminMemoryToken}`;
  }
  return headers;
}

export async function fetchPublicBootstrap(): Promise<PublicBootstrapResponse> {
  const res = await apiFetch('/api/public/bootstrap');
  return parseJsonOrThrow<PublicBootstrapResponse>(res);
}

export async function startUnlockFlow(params: {
  videoId: string;
  flowType: 'watch' | 'download';
  optionId?: string;
}): Promise<{
  token: string;
  mode: string;
  adConfigured: boolean;
  adUrl: string;
  unlocked: boolean;
  targetUrl: string;
  directUrl: string;
}> {
  const res = await apiFetch('/api/public/unlock/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return parseJsonOrThrow(res);
}

export async function markUnlockAdOpened(token: string): Promise<{ ok: boolean; openedAt: number }> {
  const res = await apiFetch('/api/public/unlock/mark-opened', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return parseJsonOrThrow(res);
}

export async function confirmUnlockReturn(token: string): Promise<{
  unlocked: boolean;
  mode: string;
  targetUrl: string;
  directUrl: string;
}> {
  const res = await apiFetch('/api/public/unlock/confirm-return', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return parseJsonOrThrow(res);
}

export async function checkUnlockStatus(token: string): Promise<{
  unlocked: boolean;
  mode: string;
  status: string;
  targetUrl: string;
  directUrl: string;
}> {
  const res = await apiFetch(`/api/public/unlock/status/${encodeURIComponent(token)}`);
  return parseJsonOrThrow(res);
}

// Admin API calls
export async function adminLogin(pin: string): Promise<{
  token: string;
  expiresAt: number;
  username: string;
  usingDefaultPin: boolean;
}> {
  const res = await apiFetch('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  const data = await parseJsonOrThrow<{
    token: string;
    expiresAt: number;
    username: string;
    usingDefaultPin: boolean;
  }>(res);
  setAdminToken(data.token);
  return data;
}

export async function adminLogout(): Promise<void> {
  try {
    await apiFetch('/api/admin/auth/logout', {
      method: 'POST',
      headers: adminHeaders(),
    });
  } finally {
    setAdminToken(null);
  }
}

export async function adminLogoutAllSessions(): Promise<void> {
  await apiFetch('/api/admin/auth/logout-all', {
    method: 'POST',
    headers: adminHeaders(),
  });
  setAdminToken(null);
}

export async function adminFetchOverview(): Promise<{
  stats: AdminDashboardStats;
  settings: SiteSettings;
  categories: VideoCategory[];
  videos: VideoEntry[];
  adPlacements: AdPlacement[];
}> {
  const res = await apiFetch('/api/admin/overview', {
    headers: adminHeaders(),
  });
  return parseJsonOrThrow(res);
}

export async function adminFetchSessionInfo(): Promise<{
  authenticated: boolean;
  username: string;
  usingDefaultPin: boolean;
  activeSessions: number;
  postbackSecretConfigured: boolean;
}> {
  const res = await apiFetch('/api/admin/auth/session', {
    headers: adminHeaders(),
  });
  return parseJsonOrThrow(res);
}

export async function adminUpdatePin(params: {
  currentPin: string;
  newPin: string;
  username?: string;
}): Promise<{ ok: boolean; usingDefaultPin: boolean; username: string }> {
  const res = await apiFetch('/api/admin/auth/update-pin', {
    method: 'POST',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(params),
  });
  return parseJsonOrThrow(res);
}

export function adminUploadImageWithProgress(
  file: File,
  onProgress: (percent: number) => void
): Promise<{ url: string; filename: string; size: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', resolveApiUrl('/api/admin/upload'));
    xhr.withCredentials = Boolean(RAW_API_BASE);
    if (adminMemoryToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${adminMemoryToken}`);
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(parsed);
        } else {
          reject(new Error(parsed.error || `Upload failed (${xhr.status})`));
        }
      } catch {
        reject(new Error('Invalid response from upload endpoint.'));
      }
    };

    xhr.onerror = () => reject(new Error('Network error while uploading image.'));

    const formData = new FormData();
    formData.append('image', file);
    xhr.send(formData);
  });
}

export async function adminDeleteUploadedImage(filename: string): Promise<void> {
  const res = await apiFetch(`/api/admin/upload/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  await parseJsonOrThrow(res);
}

export async function adminCreateVideo(video: Partial<VideoEntry>): Promise<{ videos: VideoEntry[] }> {
  const res = await apiFetch('/api/admin/videos', {
    method: 'POST',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(video),
  });
  return parseJsonOrThrow(res);
}

export async function adminUpdateVideo(id: string, video: Partial<VideoEntry>): Promise<{ videos: VideoEntry[] }> {
  const res = await apiFetch(`/api/admin/videos/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(video),
  });
  return parseJsonOrThrow(res);
}

export async function adminDuplicateVideo(id: string): Promise<{ videos: VideoEntry[] }> {
  const res = await apiFetch(`/api/admin/videos/${encodeURIComponent(id)}/duplicate`, {
    method: 'POST',
    headers: adminHeaders(),
  });
  return parseJsonOrThrow(res);
}

export async function adminReorderVideos(orderedIds: string[]): Promise<{ videos: VideoEntry[] }> {
  const res = await apiFetch('/api/admin/videos/reorder', {
    method: 'POST',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ orderedIds }),
  });
  return parseJsonOrThrow(res);
}

export async function adminBulkVideos(
  ids: string[],
  action: 'publish' | 'draft' | 'archive' | 'delete'
): Promise<{ videos: VideoEntry[] }> {
  const res = await apiFetch('/api/admin/videos/bulk', {
    method: 'POST',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ ids, action }),
  });
  return parseJsonOrThrow(res);
}

export async function adminClearSamples(): Promise<{ removed: number; videos: VideoEntry[] }> {
  const res = await apiFetch('/api/admin/videos/clear-samples', {
    method: 'POST',
    headers: adminHeaders(),
  });
  return parseJsonOrThrow(res);
}

export async function adminDeleteVideo(id: string): Promise<{ videos: VideoEntry[] }> {
  const res = await apiFetch(`/api/admin/videos/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  return parseJsonOrThrow(res);
}

export async function adminSaveCategories(categories: VideoCategory[]): Promise<{ categories: VideoCategory[] }> {
  const res = await apiFetch('/api/admin/categories', {
    method: 'PUT',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ categories }),
  });
  return parseJsonOrThrow(res);
}

export async function adminSaveAds(placements: AdPlacement[]): Promise<{ adPlacements: AdPlacement[] }> {
  const res = await apiFetch('/api/admin/ads', {
    method: 'PUT',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ placements }),
  });
  return parseJsonOrThrow(res);
}

export async function adminSaveSettings(settings: SiteSettings): Promise<{ settings: SiteSettings }> {
  const res = await apiFetch('/api/admin/settings', {
    method: 'PUT',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(settings),
  });
  return parseJsonOrThrow(res);
}
