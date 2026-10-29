import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Film,
  Megaphone,
  Palette,
  MousePointerClick,
  Settings,
  ShieldCheck,
  LogOut,
  ExternalLink,
  Menu,
  X,
  Check,
  AlertTriangle,
  Loader2,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import type {
  AdPlacement,
  AdminDashboardStats,
  SiteSettings,
  UnlockMode,
  VideoCategory,
  VideoEntry,
} from '../../types.ts';
import {
  adminFetchOverview,
  adminFetchSessionInfo,
  adminLogout,
  adminLogoutAllSessions,
  adminSaveCategories,
  adminSaveSettings,
  adminUpdatePin,
} from '../../lib/api.ts';
import { VideoManagerTab } from './VideoManagerTab.tsx';
import { AdManagerTab } from './AdManagerTab.tsx';
import { ImageUploader } from './ImageUploader.tsx';

interface AdminDashboardProps {
  onExitToPublic: () => void;
  onPublicDataChanged: () => void;
}

type AdminSection =
  | 'overview'
  | 'videos'
  | 'ads'
  | 'homepage'
  | 'buttons_modals'
  | 'site_settings'
  | 'security';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onExitToPublic,
  onPublicDataChanged,
}) => {
  const [activeTab, setActiveTab] = useState<AdminSection>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [categories, setCategories] = useState<VideoCategory[]>([]);
  const [videos, setVideos] = useState<VideoEntry[]>([]);
  const [adPlacements, setAdPlacements] = useState<AdPlacement[]>([]);

  const [sessionInfo, setSessionInfo] = useState<{
    username: string;
    usingDefaultPin: boolean;
    activeSessions: number;
    postbackSecretConfigured: boolean;
  }>({
    username: 'Administrator',
    usingDefaultPin: false,
    activeSessions: 1,
    postbackSecretConfigured: false,
  });

  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);

  // PIN update form state
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [adminUsername, setAdminUsername] = useState('Administrator');
  const [updatingPin, setUpdatingPin] = useState(false);

  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3500);
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [overview, sess] = await Promise.all([
        adminFetchOverview(),
        adminFetchSessionInfo(),
      ]);
      setStats(overview.stats);
      setSettings(overview.settings);
      setCategories(overview.categories);
      setVideos(overview.videos);
      setAdPlacements(overview.adPlacements);
      setSessionInfo(sess);
      setAdminUsername(sess.username);
      setSettingsDirty(false);
    } catch (err: any) {
      notify(err.message || 'Session expired. Returning to gallery.', 'error');
      onExitToPublic();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // Warn before closing tab if settings have unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (settingsDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [settingsDirty]);

  const patchSettings = (patch: Partial<SiteSettings>) => {
    if (!settings) return;
    setSettings({ ...settings, ...patch });
    setSettingsDirty(true);
  };

  const persistSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const res = await adminSaveSettings(settings);
      setSettings(res.settings);
      setSettingsDirty(false);
      onPublicDataChanged();
      notify('Configuration saved and live on public website.');
    } catch (err: any) {
      notify(err.message || 'Failed to save settings.', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const persistCategories = async (nextCats: VideoCategory[]) => {
    setCategories(nextCats);
    try {
      const res = await adminSaveCategories(nextCats);
      setCategories(res.categories);
      onPublicDataChanged();
      notify('Categories updated.');
    } catch (err: any) {
      notify(err.message || 'Failed to update categories.', 'error');
    }
  };

  const handlePinChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.trim().length < 5) {
      notify('New PIN / passphrase must be at least 5 characters.', 'error');
      return;
    }
    if (newPin.trim() !== confirmPin.trim()) {
      notify('Confirmation PIN does not match.', 'error');
      return;
    }
    setUpdatingPin(true);
    try {
      const res = await adminUpdatePin({
        currentPin,
        newPin,
        username: adminUsername,
      });
      setSessionInfo((prev) => ({
        ...prev,
        usingDefaultPin: res.usingDefaultPin,
        username: res.username,
      }));
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      notify('Admin access credential updated.');
    } catch (err: any) {
      notify(err.message || 'Credential update failed.', 'error');
    } finally {
      setUpdatingPin(false);
    }
  };

  const navItems: { id: AdminSection; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'videos', label: 'Video Management', icon: Film },
    { id: 'ads', label: 'Adsterra & Ads', icon: Megaphone },
    { id: 'homepage', label: 'Homepage Builder', icon: Palette },
    { id: 'buttons_modals', label: 'Buttons & Modals', icon: MousePointerClick },
    { id: 'site_settings', label: 'Site Settings', icon: Settings },
    { id: 'security', label: 'Admin Security', icon: ShieldCheck },
  ];

  if (loading || !settings) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-slate-100 flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
          <span>Loading Admin Console...</span>
        </div>
      </div>
    );
  }

  const moveSectionOrder = (idx: number, dir: -1 | 1) => {
    const order = [...settings.sectionOrder];
    const target = idx + dir;
    if (target < 0 || target >= order.length) return;
    const [moved] = order.splice(idx, 1);
    order.splice(target, 0, moved);
    patchSettings({ sectionOrder: order });
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 flex flex-col lg:flex-row">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl border shadow-xl text-xs font-medium flex items-center gap-2 ${
            toast.type === 'error'
              ? 'bg-red-950/95 border-red-800 text-red-100'
              : 'bg-slate-900/95 border-slate-700 text-emerald-300'
          }`}
        >
          <span>{toast.message}</span>
        </div>
      )}

      {/* Mobile Top Bar */}
      <div className="sticky top-0 z-40 lg:hidden flex items-center justify-between px-4 h-14 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md">
        <span className="font-semibold text-sm text-white">Admin Console · {settings.siteName}</span>
        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="p-2 rounded-lg text-slate-300 hover:bg-slate-800"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Menu Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 top-14 z-30 bg-black/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Distinct SaaS Sidebar Navigation (260px) */}
      <aside
        className={`${
          mobileMenuOpen
            ? 'block fixed inset-x-0 top-14 z-40 max-h-[calc(100vh-3.5rem)] overflow-y-auto shadow-2xl'
            : 'hidden'
        } lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:max-h-screen lg:self-start lg:overflow-y-auto lg:shadow-none lg:flex lg:flex-col w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-950`}
      >
        <div className="hidden lg:flex items-center justify-between px-5 h-16 border-b border-slate-800 shrink-0">
          <div className="min-w-0">
            <div className="text-sm font-bold text-white truncate">{settings.siteName}</div>
            <div className="text-[11px] text-slate-400">Management Console</div>
          </div>
        </div>

        <nav className="p-3 space-y-1 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800 space-y-2 shrink-0">
          <button
            type="button"
            onClick={onExitToPublic}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-medium text-slate-200 cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>View Public Site</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              await adminLogout();
              onExitToPublic();
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-red-300 hover:bg-red-950/40 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Workspace Top Bar */}
        <header className="lg:sticky lg:top-0 z-20 h-16 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md px-6 flex items-center justify-between gap-4 shrink-0">
          <div className="text-xs text-slate-400 truncate">
            <span>Admin Console</span>
            <span className="mx-2 text-slate-600">/</span>
            <span className="text-slate-100 font-medium">
              {navItems.find((i) => i.id === activeTab)?.label}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {settingsDirty &&
              (activeTab === 'homepage' ||
                activeTab === 'buttons_modals' ||
                activeTab === 'site_settings') && (
                <button
                  type="button"
                  onClick={persistSettings}
                  disabled={savingSettings}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {savingSettings ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Save Changes</span>
                </button>
              )}
            <span className="text-xs text-slate-400 hidden sm:inline">
              Signed in as <strong className="text-slate-200">{sessionInfo.username}</strong>
            </span>
          </div>
        </header>

        {/* Security Warning Banner if still using initial PIN 20055 */}
        {sessionInfo.usingDefaultPin && (
          <div className="mx-6 mt-5 rounded-xl border border-amber-800/80 bg-amber-950/30 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-200">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                You are currently using the initial setup credential. Change it to a strong custom passphrase in Admin Security.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('security')}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold whitespace-nowrap cursor-pointer"
            >
              Update Credential
            </button>
          </div>
        )}

        <main className="p-6 max-w-6xl w-full space-y-8">
          {/* A. OVERVIEW TAB */}
          {activeTab === 'overview' && stats && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-semibold text-white">Dashboard Overview</h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Real-time summary of published video cards, Adsterra placements, media uploads, and recent activity.
                </p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                  <p className="text-xs text-slate-400">Published Video Cards</p>
                  <p className="text-2xl font-bold text-white tabular-nums mt-1">
                    {stats.publishedVideos}
                  </p>
                  <p className="text-[11px] text-slate-500 tabular-nums mt-1">
                    {stats.draftVideos} draft · {stats.archivedVideos} archived
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                  <p className="text-xs text-slate-400">Total Catalog Items</p>
                  <p className="text-2xl font-bold text-white tabular-nums mt-1">
                    {stats.totalVideos}
                  </p>
                  <p className="text-[11px] text-slate-500 tabular-nums mt-1">
                    {stats.sampleVideos} marked as sample
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                  <p className="text-xs text-slate-400">Active Ad Placements</p>
                  <p className="text-2xl font-bold text-white tabular-nums mt-1">
                    {stats.activeAdPlacements} / {stats.totalAdPlacements}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Mode: {settings.unlockMode.replace('_', ' ')}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                  <p className="text-xs text-slate-400">Uploaded Thumbnails</p>
                  <p className="text-2xl font-bold text-white tabular-nums mt-1">
                    {stats.uploadedFilesCount}
                  </p>
                  <p className="text-[11px] text-slate-500 tabular-nums mt-1">
                    {(stats.uploadedStorageBytes / 1024).toFixed(1)} KB stored
                  </p>
                </div>
              </div>

              {/* Quick Management Shortcuts */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('videos')}
                  className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900 text-left transition-colors cursor-pointer"
                >
                  <p className="text-sm font-semibold text-white">Add or Reorder Videos</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Upload thumbnails, set Telegram destinations, and configure download sizes.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ads')}
                  className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900 text-left transition-colors cursor-pointer"
                >
                  <p className="text-sm font-semibold text-white">Configure Adsterra</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Paste Direct Links and Native Banner units beneath video cards.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('homepage')}
                  className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900 text-left transition-colors cursor-pointer"
                >
                  <p className="text-sm font-semibold text-white">Customize Homepage</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Edit hero text, accent colors, fonts, grid columns, and floating Telegram button.
                  </p>
                </button>
              </div>

              {/* Recent Audit Logs */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800 text-xs font-semibold text-white">
                  Recent Administrative Activity
                </div>
                <div className="divide-y divide-slate-800/70 max-h-72 overflow-y-auto">
                  {stats.recentLogs.map((log) => (
                    <div
                      key={log.id}
                      className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs"
                    >
                      <div>
                        <span className="font-mono text-blue-400 mr-2">{log.action}</span>
                        <span className="text-slate-300">{log.details}</span>
                      </div>
                      <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* B. VIDEO MANAGEMENT TAB */}
          {activeTab === 'videos' && (
            <VideoManagerTab
              videos={videos}
              categories={categories}
              onVideosUpdated={(next) => {
                setVideos(next);
                onPublicDataChanged();
                adminFetchOverview().then((ov) => setStats(ov.stats)).catch(() => {});
              }}
              onNotify={notify}
            />
          )}

          {/* C. ADSTERRA MANAGEMENT TAB */}
          {activeTab === 'ads' && (
            <AdManagerTab
              placements={adPlacements}
              postbackSecretConfigured={sessionInfo.postbackSecretConfigured}
              onUpdated={(next) => {
                setAdPlacements(next);
                onPublicDataChanged();
                adminFetchOverview().then((ov) => setStats(ov.stats)).catch(() => {});
              }}
              onNotify={notify}
            />
          )}

          {/* D. HOMEPAGE BUILDER TAB */}
          {activeTab === 'homepage' && (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">Homepage Builder &amp; Theme</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Control hero content, announcement bar, theme colors, typography, layout columns, categories, and section ordering.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={persistSettings}
                  disabled={savingSettings}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {savingSettings ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>Save Homepage</span>
                </button>
              </div>

              {/* Theme, Colors & Grid Layout */}
              <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white">Theme, Typography &amp; Card Grid</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Background Tone</label>
                    <select
                      value={settings.backgroundTone}
                      onChange={(e) =>
                        patchSettings({
                          backgroundTone: e.target.value as SiteSettings['backgroundTone'],
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    >
                      <option value="obsidian">Deep Obsidian Black (#060709)</option>
                      <option value="charcoal">Warm Charcoal (#0e1014)</option>
                      <option value="midnight">Dark Midnight Navy (#070b14)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Primary Accent Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={settings.accentColor}
                        onChange={(e) => patchSettings({ accentColor: e.target.value })}
                        className="h-9 w-12 rounded bg-slate-950 border border-slate-800 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={settings.accentColor}
                        onChange={(e) => patchSettings({ accentColor: e.target.value })}
                        className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Heading Font</label>
                    <select
                      value={settings.headingFont}
                      onChange={(e) =>
                        patchSettings({
                          headingFont: e.target.value as SiteSettings['headingFont'],
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    >
                      <option value="Outfit">Outfit (Modern Geometric)</option>
                      <option value="Bricolage Grotesque">Bricolage Grotesque (Editorial)</option>
                      <option value="Playfair Display">Playfair Display (Cinema Monograph)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Desktop Grid Columns</label>
                    <select
                      value={settings.gridColumnsDesktop}
                      onChange={(e) =>
                        patchSettings({
                          gridColumnsDesktop: Number(e.target.value) as 2 | 3 | 4,
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    >
                      <option value={2}>2 Columns (Wide Showcase)</option>
                      <option value={3}>3 Columns (Balanced Standard)</option>
                      <option value={4}>4 Columns (Compact Archive)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Card Corner Radius</label>
                    <select
                      value={settings.cardCornerRadius}
                      onChange={(e) =>
                        patchSettings({
                          cardCornerRadius: e.target.value as SiteSettings['cardCornerRadius'],
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    >
                      <option value="sharp">Subtle (8px)</option>
                      <option value="rounded">Standard Rounded (12px)</option>
                      <option value="soft">Soft Cinema (16px)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Videos Per Load-More Page
                    </label>
                    <input
                      type="number"
                      min={3}
                      max={48}
                      value={settings.pageSize}
                      onChange={(e) =>
                        patchSettings({ pageSize: Math.max(3, Number(e.target.value) || 6) })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white tabular-nums"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-6 pt-2">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.searchEnabled}
                      onChange={(e) => patchSettings({ searchEnabled: e.target.checked })}
                    />
                    <span>Show Search Bar</span>
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.categoriesEnabled}
                      onChange={(e) => patchSettings({ categoriesEnabled: e.target.checked })}
                    />
                    <span>Show Category Filter Tabs</span>
                  </label>
                </div>
              </section>

              {/* Hero Section & Announcement Banner */}
              <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Announcement &amp; Hero Banner</h3>
                  <div className="flex items-center gap-4">
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.announcementEnabled}
                        onChange={(e) => patchSettings({ announcementEnabled: e.target.checked })}
                      />
                      <span>Announcement Active</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.heroEnabled}
                        onChange={(e) => patchSettings({ heroEnabled: e.target.checked })}
                      />
                      <span>Hero Section Active</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-slate-400 mb-1">Announcement Text</label>
                    <input
                      type="text"
                      value={settings.announcementText}
                      onChange={(e) => patchSettings({ announcementText: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Announcement Link URL
                    </label>
                    <input
                      type="text"
                      value={settings.announcementLinkUrl}
                      onChange={(e) => patchSettings({ announcementLinkUrl: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Hero Kicker</label>
                    <input
                      type="text"
                      value={settings.heroKicker}
                      onChange={(e) => patchSettings({ heroKicker: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Primary Hero Button Label
                    </label>
                    <input
                      type="text"
                      value={settings.heroPrimaryButtonText}
                      onChange={(e) => patchSettings({ heroPrimaryButtonText: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-slate-400 mb-1">Hero Main Headline</label>
                    <input
                      type="text"
                      value={settings.heroTitle}
                      onChange={(e) => patchSettings({ heroTitle: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-slate-400 mb-1">Hero Description</label>
                    <textarea
                      rows={2}
                      value={settings.heroDescription}
                      onChange={(e) => patchSettings({ heroDescription: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                </div>

                <ImageUploader
                  value={settings.heroImageUrl}
                  onChange={(url) => patchSettings({ heroImageUrl: url })}
                  label="Hero Visual Image"
                />
              </section>

              {/* Section Ordering */}
              <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
                <h3 className="text-sm font-semibold text-white">Homepage Section Ordering</h3>
                <div className="space-y-2">
                  {settings.sectionOrder.map((sec, idx) => (
                    <div
                      key={sec}
                      className="flex items-center justify-between px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs"
                    >
                      <span className="capitalize font-medium text-slate-200">{sec} Section</span>
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveSectionOrder(idx, -1)}
                          className="p-1 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === settings.sectionOrder.length - 1}
                          onClick={() => moveSectionOrder(idx, 1)}
                          className="p-1 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Categories Editor */}
              <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Filter Categories</h3>
                  <button
                    type="button"
                    onClick={() => {
                      const next = [
                        ...categories,
                        {
                          id: `cat-${Date.now()}`,
                          name: 'New Category',
                          slug: `new-category-${categories.length}`,
                          displayOrder: categories.length,
                          enabled: true,
                        },
                      ];
                      persistCategories(next);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-white inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Category</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {categories.map((cat, idx) => (
                    <div key={cat.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={cat.enabled}
                        onChange={(e) => {
                          const next = [...categories];
                          next[idx] = { ...cat, enabled: e.target.checked };
                          setCategories(next);
                        }}
                      />
                      <input
                        type="text"
                        value={cat.name}
                        onChange={(e) => {
                          const next = [...categories];
                          next[idx] = { ...cat, name: e.target.value };
                          setCategories(next);
                        }}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = categories.filter((_, i) => i !== idx);
                          persistCategories(next);
                        }}
                        className="p-1.5 text-red-400 hover:text-red-300 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => persistCategories(categories)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white cursor-pointer"
                >
                  Save Category List
                </button>
              </section>
            </div>
          )}

          {/* E. BUTTONS & MODAL SETTINGS TAB */}
          {activeTab === 'buttons_modals' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    Watch Unlock, Play &amp; Download Modal Settings
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Configure every button label, visibility toggle, unlock mode, and Bengali/English modal copy.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={persistSettings}
                  disabled={savingSettings}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {savingSettings ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>Save Flow Settings</span>
                </button>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white">Action Buttons &amp; Verification Mode</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Watch Button Label</label>
                    <input
                      type="text"
                      value={settings.watchButtonLabel}
                      onChange={(e) => patchSettings({ watchButtonLabel: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                    <label className="inline-flex items-center gap-2 text-xs text-slate-300 mt-2">
                      <input
                        type="checkbox"
                        checked={settings.watchButtonVisible}
                        onChange={(e) => patchSettings({ watchButtonVisible: e.target.checked })}
                      />
                      <span>Show Watch Now Button</span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Download Button Label
                    </label>
                    <input
                      type="text"
                      value={settings.downloadButtonLabel}
                      onChange={(e) => patchSettings({ downloadButtonLabel: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                    <label className="inline-flex items-center gap-2 text-xs text-slate-300 mt-2">
                      <input
                        type="checkbox"
                        checked={settings.downloadButtonVisible}
                        onChange={(e) => patchSettings({ downloadButtonVisible: e.target.checked })}
                      />
                      <span>Show Download Now Button</span>
                    </label>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs text-slate-400 mb-1">
                      Unlock Condition Mode
                    </label>
                    <select
                      value={settings.unlockMode}
                      onChange={(e) =>
                        patchSettings({ unlockMode: e.target.value as UnlockMode })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    >
                      <option value="return_continue">
                        Outbound Sponsor Visit + Transparent Return &amp; Continue (Recommended for Standard Adsterra Direct Links)
                      </option>
                      <option value="postback_verified">
                        Server-Verified Postback Callback Only (Requires ADSTERRA_POSTBACK_SECRET)
                      </option>
                      <option value="direct">
                        Direct Access (No Sponsor Step Required)
                      </option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white">
                  Watch Unlock Modal ("ভিডিও আনলক করুন")
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Unlock Modal Heading</label>
                    <input
                      type="text"
                      value={settings.unlockModalTitle}
                      onChange={(e) => patchSettings({ unlockModalTitle: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Unlock Button Text</label>
                    <input
                      type="text"
                      value={settings.unlockButtonLabel}
                      onChange={(e) => patchSettings({ unlockButtonLabel: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-slate-400 mb-1">
                      Unlock Modal Instruction Text
                    </label>
                    <textarea
                      rows={2}
                      value={settings.unlockModalDescription}
                      onChange={(e) => patchSettings({ unlockModalDescription: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Return &amp; Continue Button Label
                    </label>
                    <input
                      type="text"
                      value={settings.returnContinueButtonLabel}
                      onChange={(e) => patchSettings({ returnContinueButtonLabel: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Play on Telegram Button Label
                    </label>
                    <input
                      type="text"
                      value={settings.playButtonLabel}
                      onChange={(e) => patchSettings({ playButtonLabel: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white">Download Modal Copy</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Download Modal Title</label>
                    <input
                      type="text"
                      value={settings.downloadModalTitle}
                      onChange={(e) => patchSettings({ downloadModalTitle: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Sponsor Notice Footer</label>
                    <input
                      type="text"
                      value={settings.downloadAdNoticeText}
                      onChange={(e) => patchSettings({ downloadAdNoticeText: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-slate-400 mb-1">
                      Download Modal Description
                    </label>
                    <textarea
                      rows={2}
                      value={settings.downloadModalDescription}
                      onChange={(e) => patchSettings({ downloadModalDescription: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* F. SITE SETTINGS, TELEGRAM & FOOTER TAB */}
          {activeTab === 'site_settings' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    Site Branding, Telegram &amp; Footer Settings
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Configure branding, SEO metadata, default Telegram &amp; Ad destinations, floating Telegram button, footer, and maintenance mode.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={persistSettings}
                  disabled={savingSettings}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {savingSettings ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>Save Site Settings</span>
                </button>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white">Branding &amp; SEO</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Website Name</label>
                    <input
                      type="text"
                      value={settings.siteName}
                      onChange={(e) => patchSettings({ siteName: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Header Wordmark Text</label>
                    <input
                      type="text"
                      value={settings.logoText}
                      onChange={(e) => patchSettings({ logoText: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Header CTA Label</label>
                    <input
                      type="text"
                      value={settings.headerCtaLabel}
                      onChange={(e) => patchSettings({ headerCtaLabel: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Header CTA URL</label>
                    <input
                      type="text"
                      value={settings.headerCtaUrl}
                      onChange={(e) => patchSettings({ headerCtaUrl: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-slate-400 mb-1">SEO Page Title</label>
                    <input
                      type="text"
                      value={settings.seoTitle}
                      onChange={(e) => patchSettings({ seoTitle: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-slate-400 mb-1">SEO Meta Description</label>
                    <textarea
                      rows={2}
                      value={settings.seoDescription}
                      onChange={(e) => patchSettings({ seoDescription: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white">
                  Floating Telegram Button &amp; Default Destinations
                </h3>
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.floatingTelegramEnabled}
                    onChange={(e) => patchSettings({ floatingTelegramEnabled: e.target.checked })}
                  />
                  <span>Enable Floating Telegram Join Button on Public Website</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Floating Button Telegram Channel URL
                    </label>
                    <input
                      type="url"
                      value={settings.floatingTelegramUrl}
                      onChange={(e) => patchSettings({ floatingTelegramUrl: e.target.value })}
                      placeholder="https://t.me/your_channel"
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Floating Button Label / Tooltip
                    </label>
                    <input
                      type="text"
                      value={settings.floatingTelegramTooltip}
                      onChange={(e) => patchSettings({ floatingTelegramTooltip: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Default Video Telegram URL (Fallback)
                    </label>
                    <input
                      type="url"
                      value={settings.defaultTelegramUrl}
                      onChange={(e) => patchSettings({ defaultTelegramUrl: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Default Watch Sponsor Direct-Link URL
                    </label>
                    <input
                      type="url"
                      value={settings.defaultWatchAdUrl}
                      onChange={(e) => patchSettings({ defaultWatchAdUrl: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white">Footer &amp; Maintenance Mode</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Copyright Text (Clicking &copy; opens Admin PIN Gate)
                    </label>
                    <input
                      type="text"
                      value={settings.footerCopyrightText}
                      onChange={(e) => patchSettings({ footerCopyrightText: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Contact Email</label>
                    <input
                      type="email"
                      value={settings.footerContactEmail}
                      onChange={(e) => patchSettings({ footerContactEmail: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-slate-400 mb-1">Footer Description</label>
                    <textarea
                      rows={2}
                      value={settings.footerDescription}
                      onChange={(e) => patchSettings({ footerDescription: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 space-y-3">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-amber-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.maintenanceMode}
                      onChange={(e) => patchSettings({ maintenanceMode: e.target.checked })}
                    />
                    <span>Enable Public Maintenance Screen</span>
                  </label>
                  <input
                    type="text"
                    value={settings.maintenanceMessage}
                    onChange={(e) => patchSettings({ maintenanceMessage: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* G. ADMIN SECURITY TAB */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-white">Admin Security &amp; Sessions</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Update your salted PBKDF2 PIN / passphrase, review brute-force lockout protection, and manage active sessions.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <form
                  onSubmit={handlePinChangeSubmit}
                  className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4"
                >
                  <h3 className="text-sm font-semibold text-white">Update Access Credential</h3>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Admin Display Name</label>
                    <input
                      type="text"
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Current PIN / Passphrase
                    </label>
                    <input
                      type="password"
                      required
                      value={currentPin}
                      onChange={(e) => setCurrentPin(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      New Strong PIN / Passphrase (5–64 chars)
                    </label>
                    <input
                      type="password"
                      required
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Confirm New Credential
                    </label>
                    <input
                      type="password"
                      required
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={updatingPin}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    {updatingPin ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    <span>Update Credential</span>
                  </button>
                </form>

                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-white">Active Session Protection</h3>
                  <ul className="space-y-2 text-xs text-slate-300 leading-relaxed">
                    <li>
                      • Credentials are hashed server-side using PBKDF2-HMAC-SHA512 (120,000 iterations + random 16-byte salt).
                    </li>
                    <li>
                      • Brute-force protection locks login for 5 minutes after 5 failed attempts and rate-limits IP bursts.
                    </li>
                    <li>
                      • Active authenticated sessions:{' '}
                      <strong className="text-white tabular-nums">
                        {sessionInfo.activeSessions}
                      </strong>
                    </li>
                  </ul>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await adminLogoutAllSessions();
                        onExitToPublic();
                      }}
                      className="px-4 py-2 rounded-lg border border-red-800 bg-red-950/40 hover:bg-red-900/50 text-xs font-semibold text-red-200 cursor-pointer"
                    >
                      Revoke All Sessions &amp; Sign Out
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
