import React, { useState } from 'react';
import {
  Check,
  Loader2,
  ShieldAlert,
  Info,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code2,
} from 'lucide-react';
import type { AdPlacement } from '../../types.ts';
import { adminSaveAds } from '../../lib/api.ts';
import { inspectAdsterraSnippet, resolvePlacementDirectUrl } from '../../lib/adsterra.ts';

interface AdManagerTabProps {
  placements: AdPlacement[];
  postbackSecretConfigured: boolean;
  onUpdated: (next: AdPlacement[]) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

function hydrateInitialDraft(p: AdPlacement): AdPlacement {
  const isDirectSlot = p.slot === 'watch_unlock_flow' || p.slot === 'download_option_flow';
  if (isDirectSlot && !p.rawSnippet.trim() && p.adDestinationUrl.trim()) {
    return { ...p, rawSnippet: p.adDestinationUrl.trim() };
  }
  return { ...p };
}

export const AdManagerTab: React.FC<AdManagerTabProps> = ({
  placements,
  postbackSecretConfigured,
  onUpdated,
  onNotify,
}) => {
  const [drafts, setDrafts] = useState<AdPlacement[]>(() =>
    placements.map(hydrateInitialDraft)
  );
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [dirtyIds, setDirtyIds] = useState<Record<string, boolean>>({});
  const [savedNoticeById, setSavedNoticeById] = useState<Record<string, string>>({});
  const [expandedAdvanced, setExpandedAdvanced] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState<string>('');

  const hasAnyDirty = Object.values(dirtyIds).some(Boolean);

  const patchPlacement = (id: string, patch: Partial<AdPlacement>) => {
    setSaveError('');
    setDrafts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const next = { ...p, ...patch };

        // When Ad Code changes, automatically detect format, dimensions, or direct link URL
        if (typeof patch.rawSnippet === 'string') {
          const inspection = inspectAdsterraSnippet(patch.rawSnippet, next.slot, next.format);
          if (!inspection.empty && inspection.valid) {
            next.format = inspection.detectedFormat;
            if (inspection.extractedBannerWidth > 0) {
              next.bannerWidth = inspection.extractedBannerWidth;
            }
            if (inspection.extractedBannerHeight > 0) {
              next.bannerHeight = inspection.extractedBannerHeight;
            }
            if (inspection.extractedDirectUrl) {
              next.adDestinationUrl = inspection.extractedDirectUrl;
            }
          } else if (
            inspection.empty &&
            (next.slot === 'watch_unlock_flow' || next.slot === 'download_option_flow')
          ) {
            next.adDestinationUrl = '';
          }
        }
        return next;
      })
    );
    setDirtyIds((prev) => ({ ...prev, [id]: true }));
    setSavedNoticeById((prev) => {
      if (!prev[id]) return prev;
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const persistPlacements = async (
    nextDrafts: AdPlacement[],
    targetPlacementId?: string
  ) => {
    setSaveError('');
    for (const p of nextDrafts) {
      const check = inspectAdsterraSnippet(p.rawSnippet || '', p.slot, p.format);
      if (!check.valid) {
        const msg = `${p.label}: ${check.error}`;
        setSaveError(msg);
        onNotify(msg, 'error');
        return;
      }
    }

    setSaving(true);
    if (targetPlacementId) setSavingId(targetPlacementId);
    try {
      const res = await adminSaveAds(nextDrafts);
      setDrafts(res.adPlacements.map(hydrateInitialDraft));
      onUpdated(res.adPlacements);
      setDirtyIds({});

      const timestamp = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

      if (targetPlacementId) {
        setSavedNoticeById((prev) => ({
          ...prev,
          [targetPlacementId]: `Saved at ${timestamp}`,
        }));
      } else {
        const allNotices: Record<string, string> = {};
        res.adPlacements.forEach((item) => {
          allNotices[item.id] = `Saved at ${timestamp}`;
        });
        setSavedNoticeById(allNotices);
      }

      onNotify('Adsterra ad code saved and live on public website.');
    } catch (err: any) {
      const msg = err.message || 'Failed to save ad placements.';
      setSaveError(msg);
      onNotify(msg, 'error');
    } finally {
      setSaving(false);
      setSavingId(null);
    }
  };

  const handleSaveSingle = (placementId: string, forceEnable = false) => {
    const updatedDrafts = drafts.map((p) =>
      p.id === placementId && forceEnable ? { ...p, enabled: true } : p
    );
    if (forceEnable) {
      setDrafts(updatedDrafts);
    }
    persistPlacements(updatedDrafts, placementId);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Universal Adsterra Ad Code Management</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Paste your complete Adsterra ad code snippet (or Direct Link URL) into any placement below, toggle Enabled, and click Save. No separate publisher or zone IDs required.
          </p>
        </div>

        <button
          type="button"
          onClick={() => persistPlacements(drafts)}
          disabled={saving || !hasAnyDirty}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          {saving && !savingId ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          <span>{hasAnyDirty ? 'Save All Ad Changes' : 'All Placements Saved'}</span>
        </button>
      </div>

      {/* Global Save Error Banner */}
      {saveError && (
        <div className="rounded-xl border border-red-800/80 bg-red-950/40 p-3.5 flex items-start gap-2.5 text-xs text-red-200">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Concise Universal Paste Instructions */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2 text-xs text-slate-300">
        <div className="flex items-center gap-2 font-semibold text-white">
          <Info className="w-4 h-4 text-blue-400 shrink-0" />
          <span>Universal Paste &amp; Save Integration</span>
        </div>
        <p className="text-slate-400 leading-relaxed">
          Copy the complete ad snippet from your Adsterra Publisher dashboard—<strong>Native Banner</strong>, <strong>Standard Banner (atOptions)</strong>, <strong>Social Bar</strong>, <strong>Popunder</strong>, or <strong>Direct Link URL</strong>—paste it into the corresponding placement&apos;s <strong>Ad Code</strong> box below, and click <strong>Save</strong>. Formats and dimensions are detected automatically, and scripts execute only on the public website (never inside Admin).{' '}
          {postbackSecretConfigured
            ? 'S2S Postback verification is active on /api/public/adsterra/postback.'
            : ''}
        </p>
      </div>

      <div className="space-y-4">
        {drafts.map((p) => {
          const isDirectFlow =
            p.slot === 'watch_unlock_flow' || p.slot === 'download_option_flow';
          const inspection = inspectAdsterraSnippet(p.rawSnippet || '', p.slot, p.format);
          const resolvedDirect = resolvePlacementDirectUrl(p);

          const hasLegacyStructuredCode = Boolean(
            p.scriptSrc.trim() && (p.containerId.trim() || p.bannerKey.trim() || p.slot === 'global_popunder')
          );

          const isConfigured = isDirectFlow
            ? Boolean(resolvedDirect)
            : Boolean(
                (!inspection.empty && inspection.valid) ||
                  hasLegacyStructuredCode ||
                  resolvedDirect ||
                  p.testMode
              );

          const isRowDirty = Boolean(dirtyIds[p.id]);
          const savedNotice = savedNoticeById[p.id];
          const showAdvanced = Boolean(expandedAdvanced[p.id]);

          const codePlaceholder = isDirectFlow
            ? 'Paste your Adsterra Direct Link URL (https://...) or <a href="..."> snippet here...'
            : p.slot === 'global_popunder'
            ? "Paste your complete Adsterra Popunder or Social Bar <script type='text/javascript' src='//...'></script> code here..."
            : 'Paste your complete Adsterra ad code snippet (<script ...></script> + container div, atOptions banner snippet, or Direct Link URL) here...';

          return (
            <div
              key={p.id}
              className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4"
            >
              {/* Placement Header & Enable Toggle */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-white">{p.label}</h3>
                    <span className="text-[11px] font-mono text-slate-400">({p.slot})</span>
                    {!inspection.empty && inspection.valid && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-blue-950/60 border border-blue-800/60 text-blue-300 font-medium">
                        Auto-detected: {inspection.formatLabel}
                        {inspection.extractedBannerWidth > 0 && inspection.extractedBannerHeight > 0
                          ? ` (${inspection.extractedBannerWidth}×${inspection.extractedBannerHeight})`
                          : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">{p.notes}</p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  {/* Live Status Indicator */}
                  <span
                    className={`text-xs font-medium inline-flex items-center gap-1.5 ${
                      !inspection.valid
                        ? 'text-red-400'
                        : p.enabled && isConfigured
                        ? 'text-emerald-400'
                        : p.enabled && !isConfigured
                        ? 'text-amber-400'
                        : 'text-slate-500'
                    }`}
                  >
                    {!inspection.valid ? (
                      <>
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Invalid Code</span>
                      </>
                    ) : p.enabled ? (
                      isConfigured ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Active on Site</span>
                        </>
                      ) : (
                        <span>Enabled (Paste Ad Code)</span>
                      )
                    ) : isConfigured ? (
                      <span className="text-amber-300/90">Disabled (Code Ready)</span>
                    ) : (
                      <span>Disabled</span>
                    )}
                  </span>

                  {/* Enable / Disable Switch */}
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-white cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onChange={(e) => patchPlacement(p.id, { enabled: e.target.checked })}
                      className="w-4 h-4 accent-blue-500 rounded cursor-pointer"
                    />
                    <span>{p.enabled ? 'Enabled' : 'Enable Placement'}</span>
                  </label>
                </div>
              </div>

              {/* Primary Multiline Ad Code Editor */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor={`ad-code-${p.id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200"
                  >
                    <Code2 className="w-3.5 h-3.5 text-blue-400" />
                    <span>Adsterra Ad Code</span>
                  </label>

                  {p.slot === 'below_video_card' && (
                    <div className="inline-flex items-center gap-2 text-xs text-slate-300">
                      <label htmlFor={`freq-${p.id}`} className="text-slate-400">
                        Show after every
                      </label>
                      <input
                        id={`freq-${p.id}`}
                        type="number"
                        min={1}
                        max={12}
                        value={p.frequency}
                        onChange={(e) =>
                          patchPlacement(p.id, {
                            frequency: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                        className="w-14 px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs text-white text-center tabular-nums"
                      />
                      <span className="text-slate-400">card(s)</span>
                    </div>
                  )}
                </div>

                <textarea
                  id={`ad-code-${p.id}`}
                  rows={isDirectFlow ? 3 : 5}
                  spellCheck={false}
                  value={p.rawSnippet}
                  onChange={(e) => patchPlacement(p.id, { rawSnippet: e.target.value })}
                  placeholder={codePlaceholder}
                  className={`w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border text-xs text-slate-100 font-mono leading-relaxed focus:outline-none ${
                    !inspection.valid
                      ? 'border-red-700 focus:border-red-500'
                      : 'border-slate-800 focus:border-blue-500'
                  }`}
                />

                {/* Diagnostic Error or Warning Feedback */}
                {!inspection.valid && inspection.error && (
                  <div className="flex items-start gap-2 text-xs text-red-300 bg-red-950/30 border border-red-900/60 rounded-lg p-2.5">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span>{inspection.error}</span>
                  </div>
                )}

                {inspection.valid && inspection.warning && (
                  <div className="flex items-start gap-2 text-xs text-amber-200 bg-amber-950/30 border border-amber-900/60 rounded-lg p-2.5">
                    <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>{inspection.warning}</span>
                  </div>
                )}
              </div>

              {/* Browser / Hosting Note for Popunder or Social Bar */}
              {(p.slot === 'global_popunder' ||
                inspection.detectedFormat === 'popunder' ||
                inspection.detectedFormat === 'social_bar') && (
                <div className="flex items-start gap-2 text-[11px] text-amber-300/90 bg-amber-950/20 border border-amber-900/50 rounded-lg p-2.5">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Browser &amp; hosting note: Social Bar and Popunder scripts load once on the public gallery with duplicate-script protection. Modern browsers and strict iframe preview sandboxes may block unsolicited popups unless triggered by direct user interaction.
                  </span>
                </div>
              )}

              {/* Placement Action Bar: Per-Placement Save + Optional Advanced Disclosure */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedAdvanced((prev) => ({ ...prev, [p.id]: !prev[p.id] }))
                  }
                  className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  {showAdvanced ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  <span>Optional Placement Settings</span>
                </button>

                <div className="flex flex-wrap items-center gap-2.5">
                  {savedNotice && !isRowDirty && (
                    <span className="text-xs text-emerald-400 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{savedNotice}</span>
                    </span>
                  )}

                  {!p.enabled && isConfigured && (
                    <button
                      type="button"
                      disabled={saving || !inspection.valid}
                      onClick={() => handleSaveSingle(p.id, true)}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {savingId === p.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>Enable &amp; Save</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={saving || !inspection.valid}
                    onClick={() => handleSaveSingle(p.id, false)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                      isRowDirty
                        ? 'bg-blue-600 hover:bg-blue-500 text-white'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    {savingId === p.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>Save</span>
                  </button>
                </div>
              </div>

              {/* Collapsible Optional / Legacy Overrides (Never required when pasting Ad Code) */}
              {showAdvanced && (
                <div className="pt-3 border-t border-slate-800/80 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Placement Label (Optional)
                      </label>
                      <input
                        type="text"
                        value={p.label}
                        onChange={(e) => patchPlacement(p.id, { label: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Format Override (Auto-detected on paste)
                      </label>
                      <select
                        value={p.format}
                        onChange={(e) =>
                          patchPlacement(p.id, { format: e.target.value as AdPlacement['format'] })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                      >
                        <option value="native_banner">Native Banner</option>
                        <option value="standard_banner">Standard Banner</option>
                        <option value="direct_link">Direct Link</option>
                        <option value="popunder">Popunder</option>
                        <option value="social_bar">Social Bar</option>
                      </select>
                    </div>

                    <div className="flex items-end pb-1.5">
                      {!isDirectFlow && (
                        <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={p.testMode}
                            onChange={(e) => patchPlacement(p.id, { testMode: e.target.checked })}
                          />
                          <span>Show Diagnostic Preview Box on Site</span>
                        </label>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Fallback / Direct Link URL (Optional — auto-filled if Direct Link URL is pasted above)
                    </label>
                    <input
                      type="url"
                      value={p.adDestinationUrl}
                      onChange={(e) => patchPlacement(p.id, { adDestinationUrl: e.target.value })}
                      placeholder="https://..."
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
