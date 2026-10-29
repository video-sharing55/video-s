import React, { useState } from 'react';
import {
  Plus,
  Pencil,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  X,
  Check,
  Sparkles,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type { DownloadOption, PublicationStatus, VideoCategory, VideoEntry } from '../../types.ts';
import {
  adminCreateVideo,
  adminUpdateVideo,
  adminDuplicateVideo,
  adminDeleteVideo,
  adminReorderVideos,
  adminBulkVideos,
  adminClearSamples,
} from '../../lib/api.ts';
import { ImageUploader } from './ImageUploader.tsx';
import { ResilientImage } from '../ResilientImage.tsx';

interface VideoManagerTabProps {
  videos: VideoEntry[];
  categories: VideoCategory[];
  onVideosUpdated: (next: VideoEntry[]) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

const createDefaultDownloadOptions = (): DownloadOption[] => [
  {
    id: `opt-${Date.now()}-1`,
    displayName: '360p — Small Size',
    qualityLabel: '360p SD',
    fileSize: '85 MB',
    format: 'MP4',
    adDestinationUrl: '',
    destinationUrl: 'https://t.me/',
    directDownloadUrl: '',
    enabled: true,
    displayOrder: 0,
  },
  {
    id: `opt-${Date.now()}-2`,
    displayName: '480p — Medium Size',
    qualityLabel: '480p SD',
    fileSize: '165 MB',
    format: 'MP4',
    adDestinationUrl: '',
    destinationUrl: 'https://t.me/',
    directDownloadUrl: '',
    enabled: true,
    displayOrder: 1,
  },
  {
    id: `opt-${Date.now()}-3`,
    displayName: '720p HD — Large Size',
    qualityLabel: '720p HD',
    fileSize: '390 MB',
    format: 'MP4',
    adDestinationUrl: '',
    destinationUrl: 'https://t.me/',
    directDownloadUrl: '',
    enabled: true,
    displayOrder: 2,
  },
  {
    id: `opt-${Date.now()}-4`,
    displayName: '1080p Full HD — Highest Quality',
    qualityLabel: '1080p FHD',
    fileSize: '850 MB',
    format: 'MKV',
    adDestinationUrl: '',
    destinationUrl: 'https://t.me/',
    directDownloadUrl: '',
    enabled: true,
    displayOrder: 3,
  },
];

export const VideoManagerTab: React.FC<VideoManagerTabProps> = ({
  videos,
  categories,
  onVideosUpdated,
  onNotify,
}) => {
  const [editing, setEditing] = useState<Partial<VideoEntry> | null>(null);
  const [tagsInput, setTagsInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | PublicationStatus>('ALL');

  const sampleCount = videos.filter((v) => v.isSample).length;

  const openCreateForm = () => {
    setFormError('');
    setTagsInput('');
    setEditing({
      title: '',
      thumbnailUrl: '',
      description: '',
      category: '',
      tags: [],
      featured: false,
      status: undefined,
      displayOrder: videos.length,
      watchAdUrl: '',
      telegramUrl: '',
      badgeText: '',
      durationLabel: '',
      downloadOptions: createDefaultDownloadOptions(),
    });
  };

  const openEditForm = (vid: VideoEntry) => {
    setFormError('');
    setTagsInput((vid.tags || []).join(', '));
    setEditing({
      ...vid,
      downloadOptions: vid.downloadOptions.map((o) => ({ ...o })),
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (!editing.title?.trim()) {
      setFormError('Video title is required.');
      return;
    }
    if (!editing.thumbnailUrl?.trim()) {
      setFormError('Please upload a thumbnail image or paste a valid image URL.');
      return;
    }

    setFormError('');
    setSaving(true);
    const parsedTags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const resolvedStatus: PublicationStatus =
      editing.status === 'published' || editing.status === 'draft' || editing.status === 'archived'
        ? editing.status
        : 'draft';

    const payload: Partial<VideoEntry> = {
      ...editing,
      title: editing.title.trim(),
      thumbnailUrl: editing.thumbnailUrl.trim(),
      description: (editing.description || '').trim(),
      category: (editing.category || '').trim(),
      badgeText: (editing.badgeText || '').trim(),
      durationLabel: (editing.durationLabel || '').trim(),
      status: resolvedStatus,
      tags: parsedTags,
      downloadOptions: (editing.downloadOptions || []).map((o, idx) => ({
        ...o,
        displayOrder: idx,
      })),
    };

    try {
      const res = editing.id
        ? await adminUpdateVideo(editing.id, payload)
        : await adminCreateVideo(payload);
      onVideosUpdated(res.videos);
      setEditing(null);
      onNotify(
        editing.id
          ? 'Video card updated.'
          : resolvedStatus === 'published'
          ? 'New video card published to homepage.'
          : 'Video card saved as Draft.'
      );
    } catch (err: any) {
      setFormError(err.message || 'Failed to save video card.');
    } finally {
      setSaving(false);
    }
  };

  const moveVideoOrder = async (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= videos.length) return;
    const reordered = [...videos];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIdx, 0, moved);
    try {
      const res = await adminReorderVideos(reordered.map((v) => v.id));
      onVideosUpdated(res.videos);
      onNotify('Display order updated.');
    } catch (err: any) {
      onNotify(err.message || 'Reorder failed.', 'error');
    }
  };

  const handleBulkAction = async (action: 'publish' | 'draft' | 'archive' | 'delete') => {
    if (selectedIds.length === 0) return;
    try {
      const res = await adminBulkVideos(selectedIds, action);
      onVideosUpdated(res.videos);
      setSelectedIds([]);
      onNotify(`Bulk action "${action}" applied.`);
    } catch (err: any) {
      onNotify(err.message || 'Bulk action failed.', 'error');
    }
  };

  const handleClearSamples = async () => {
    try {
      const res = await adminClearSamples();
      onVideosUpdated(res.videos);
      onNotify(`Removed ${res.removed} sample video entries.`);
    } catch (err: any) {
      onNotify(err.message || 'Failed to remove samples.', 'error');
    }
  };

  const updateDownloadOpt = (idx: number, patch: Partial<DownloadOption>) => {
    if (!editing) return;
    const list = [...(editing.downloadOptions || [])];
    list[idx] = { ...list[idx], ...patch };
    setEditing({ ...editing, downloadOptions: list });
  };

  const moveDownloadOpt = (idx: number, dir: -1 | 1) => {
    if (!editing || !editing.downloadOptions) return;
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= editing.downloadOptions.length) return;
    const list = [...editing.downloadOptions];
    const [item] = list.splice(idx, 1);
    list.splice(nextIdx, 0, item);
    setEditing({ ...editing, downloadOptions: list });
  };

  const visibleVideos = videos.filter((v) =>
    statusFilter === 'ALL' ? true : v.status === statusFilter
  );

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Video Cards &amp; Thumbnails</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Upload thumbnails, configure Watch Now sponsor links, Telegram destinations, and per-video download resolutions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {sampleCount > 0 && (
            <button
              type="button"
              onClick={handleClearSamples}
              className="px-3.5 py-2 rounded-lg border border-amber-800/70 bg-amber-950/30 hover:bg-amber-950/60 text-amber-200 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Remove Sample Videos ({sampleCount})</span>
            </button>
          )}
          <button
            type="button"
            onClick={openCreateForm}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Video Card</span>
          </button>
        </div>
      </div>

      {/* Filter & Bulk Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/70 border border-slate-800">
        <div className="flex items-center gap-1.5">
          {(['ALL', 'published', 'draft', 'archived'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize cursor-pointer ${
                statusFilter === st
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {st === 'ALL' ? 'All Cards' : st}
            </button>
          ))}
        </div>

        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400 tabular-nums">{selectedIds.length} selected:</span>
            <button
              type="button"
              onClick={() => handleBulkAction('publish')}
              className="px-2.5 py-1 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-300 hover:bg-emerald-900/60 cursor-pointer"
            >
              Publish
            </button>
            <button
              type="button"
              onClick={() => handleBulkAction('draft')}
              className="px-2.5 py-1 rounded bg-slate-800 text-slate-200 hover:bg-slate-700 cursor-pointer"
            >
              Set Draft
            </button>
            <button
              type="button"
              onClick={() => handleBulkAction('archive')}
              className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
            >
              Archive
            </button>
            <button
              type="button"
              onClick={() => handleBulkAction('delete')}
              className="px-2.5 py-1 rounded bg-red-950/60 border border-red-800 text-red-300 hover:bg-red-900/60 cursor-pointer"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Video Table / List */}
      {visibleVideos.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-14 px-6 text-center space-y-3">
          <p className="text-sm font-medium text-slate-200">No video cards in this view</p>
          <p className="text-xs text-slate-400">
            Click "Add Video Card" to upload your first thumbnail and publish it to the homepage.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-3 px-3 w-8">
                  <input
                    type="checkbox"
                    checked={
                      visibleVideos.length > 0 &&
                      visibleVideos.every((v) => selectedIds.includes(v.id))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(visibleVideos.map((v) => v.id));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                  />
                </th>
                <th className="py-3 px-3">Media Card</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3 text-right">Downloads</th>
                <th className="py-3 px-3 text-right">Order</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {visibleVideos.map((vid) => {
                const fullIndex = videos.findIndex((x) => x.id === vid.id);
                return (
                  <tr key={vid.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(vid.id)}
                        onChange={(e) => {
                          setSelectedIds((prev) =>
                            e.target.checked
                              ? [...prev, vid.id]
                              : prev.filter((id) => id !== vid.id)
                          );
                        }}
                      />
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-3 min-w-[220px]">
                        <div className="w-20 aspect-video rounded-md overflow-hidden bg-slate-950 border border-slate-800 shrink-0">
                          <ResilientImage
                            src={vid.thumbnailUrl}
                            alt={vid.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-100 truncate max-w-[260px]">
                            {vid.title}
                          </p>
                          {(vid.badgeText || vid.durationLabel || vid.isSample) && (
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {[vid.badgeText, vid.durationLabel, vid.isSample ? 'Sample' : '']
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                      {vid.category || <span className="text-slate-500">—</span>}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`font-medium capitalize ${
                          vid.status === 'published'
                            ? 'text-emerald-400'
                            : vid.status === 'draft'
                            ? 'text-amber-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {vid.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-slate-300">
                      {vid.downloadOptions.length}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          disabled={fullIndex <= 0}
                          onClick={() => moveVideoOrder(fullIndex, -1)}
                          aria-label="Move up"
                          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={fullIndex >= videos.length - 1}
                          onClick={() => moveVideoOrder(fullIndex, 1)}
                          aria-label="Move down"
                          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      {confirmDeleteId === vid.id ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const res = await adminDeleteVideo(vid.id);
                                onVideosUpdated(res.videos);
                                setConfirmDeleteId(null);
                                onNotify('Video deleted.');
                              } catch (err: any) {
                                onNotify(err.message || 'Delete failed.', 'error');
                              }
                            }}
                            className="px-2 py-1 rounded bg-red-600 text-white text-[11px] font-semibold cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-[11px] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditForm(vid)}
                            title="Edit"
                            className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const res = await adminDuplicateVideo(vid.id);
                                onVideosUpdated(res.videos);
                                onNotify('Duplicated as draft.');
                              } catch (err: any) {
                                onNotify(err.message || 'Duplicate failed.', 'error');
                              }
                            }}
                            title="Duplicate"
                            className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(vid.id)}
                            title="Delete"
                            className="p-1.5 rounded hover:bg-red-950/60 text-slate-400 hover:text-red-300 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Full Video Editor Drawer / Modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 p-6 text-slate-100 shadow-2xl space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-lg font-semibold text-white">
                {editing.id ? 'Edit Video Card' : 'Create New Video Card'}
              </h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-6">
              {formError && (
                <div className="p-3.5 rounded-xl border border-red-900 bg-red-950/40 text-red-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Image Uploader (Drag & Drop + URL Paste) */}
              <ImageUploader
                value={editing.thumbnailUrl || ''}
                onChange={(url) => setEditing({ ...editing, thumbnailUrl: url })}
                label="Card Thumbnail Image (Upload or URL)"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Video Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={editing.title || ''}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                    placeholder="Enter video title"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Category <span className="text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    list="video-category-suggestions"
                    value={editing.category || ''}
                    onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                    placeholder="Optional category"
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                  <datalist id="video-category-suggestions">
                    {categories.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Publication Status <span className="text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <select
                    value={editing.status || ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        status: (e.target.value || undefined) as PublicationStatus | undefined,
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Default — Draft (Hidden until published)</option>
                    <option value="published">Published (Visible on Homepage)</option>
                    <option value="draft">Draft (Hidden)</option>
                    <option value="archived">Archived (Hidden)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Badge Label{' '}
                    <span className="text-slate-500 font-normal">(Optional, e.g. NEW, 4K HDR)</span>
                  </label>
                  <input
                    type="text"
                    value={editing.badgeText || ''}
                    onChange={(e) => setEditing({ ...editing, badgeText: e.target.value })}
                    placeholder="Optional badge text"
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Duration Label <span className="text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={editing.durationLabel || ''}
                    onChange={(e) => setEditing({ ...editing, durationLabel: e.target.value })}
                    placeholder="Optional (e.g. 24:15)"
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Tags <span className="text-slate-500 font-normal">(Optional, comma separated)</span>
                  </label>
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="Optional tags (e.g. 4K, Subtitled, Exclusive)"
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Description <span className="text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    value={editing.description || ''}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    placeholder="Optional video summary displayed inside the detail modal..."
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
                  />
                </div>
              </div>

              {/* Watch Now & Telegram Destination Configuration */}
              <div className="border-t border-slate-800 pt-5 space-y-4">
                <h4 className="text-sm font-semibold text-white">
                  Watch Now &amp; Telegram Destination
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Per-Video Sponsor / Adsterra Direct Link URL{' '}
                      <span className="text-slate-500 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="url"
                      value={editing.watchAdUrl || ''}
                      onChange={(e) => setEditing({ ...editing, watchAdUrl: e.target.value })}
                      placeholder="Leave blank to use global Watch Unlock Ad URL"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Telegram Channel / Post Destination URL{' '}
                      <span className="text-slate-500 font-normal">(Optional override)</span>
                    </label>
                    <input
                      type="url"
                      value={editing.telegramUrl || ''}
                      onChange={(e) => setEditing({ ...editing, telegramUrl: e.target.value })}
                      placeholder="Leave blank to use default Telegram URL, or enter post link"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Per-Video Download Options */}
              <div className="border-t border-slate-800 pt-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-white">Download Resolutions</h4>
                    <p className="text-xs text-slate-400">
                      Customize resolution tiers, file sizes, sponsor links, and file destinations.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const list = [...(editing.downloadOptions || [])];
                      list.push({
                        id: `opt-${Date.now()}`,
                        displayName: 'New Quality Option',
                        qualityLabel: '720p HD',
                        fileSize: '300 MB',
                        format: 'MP4',
                        adDestinationUrl: '',
                        destinationUrl: 'https://t.me/',
                        directDownloadUrl: '',
                        enabled: true,
                        displayOrder: list.length,
                      });
                      setEditing({ ...editing, downloadOptions: list });
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Option</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {(editing.downloadOptions || []).map((opt, idx) => (
                    <div
                      key={opt.id || idx}
                      className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-200">
                          <input
                            type="checkbox"
                            checked={opt.enabled}
                            onChange={(e) => updateDownloadOpt(idx, { enabled: e.target.checked })}
                          />
                          <span>Enabled</span>
                        </label>
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveDownloadOpt(idx, -1)}
                            className="p-1 text-slate-400 hover:text-white"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveDownloadOpt(idx, 1)}
                            className="p-1 text-slate-400 hover:text-white"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const list = (editing.downloadOptions || []).filter(
                                (_, i) => i !== idx
                              );
                              setEditing({ ...editing, downloadOptions: list });
                            }}
                            className="p-1 text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                        <input
                          type="text"
                          value={opt.displayName}
                          onChange={(e) => updateDownloadOpt(idx, { displayName: e.target.value })}
                          placeholder="Display Label (e.g. 720p HD)"
                          className="sm:col-span-2 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs text-white"
                        />
                        <input
                          type="text"
                          value={opt.qualityLabel}
                          onChange={(e) => updateDownloadOpt(idx, { qualityLabel: e.target.value })}
                          placeholder="Quality (720p)"
                          className="px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs text-white"
                        />
                        <input
                          type="text"
                          value={opt.fileSize}
                          onChange={(e) => updateDownloadOpt(idx, { fileSize: e.target.value })}
                          placeholder="Size (390 MB)"
                          className="px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs text-white"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <input
                          type="url"
                          value={opt.adDestinationUrl}
                          onChange={(e) =>
                            updateDownloadOpt(idx, { adDestinationUrl: e.target.value })
                          }
                          placeholder="Sponsor Ad URL (optional override)"
                          className="px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs text-white"
                        />
                        <input
                          type="url"
                          value={opt.destinationUrl}
                          onChange={(e) =>
                            updateDownloadOpt(idx, { destinationUrl: e.target.value })
                          }
                          placeholder="Destination Page / Telegram Link"
                          className="px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs text-white"
                        />
                        <input
                          type="url"
                          value={opt.directDownloadUrl}
                          onChange={(e) =>
                            updateDownloadOpt(idx, { directDownloadUrl: e.target.value })
                          }
                          placeholder="Optional Direct File URL (.mp4)"
                          className="px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs text-white"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Save Video Card</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
