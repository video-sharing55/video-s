import React, { useRef, useState } from 'react';
import { Upload, Link2, Trash2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { adminUploadImageWithProgress, adminDeleteUploadedImage } from '../../lib/api.ts';
import { ResilientImage } from '../ResilientImage.tsx';

interface ImageUploaderProps {
  value: string;
  onChange: (nextUrl: string) => void;
  label?: string;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  value,
  onChange,
  label = 'Thumbnail Image',
}) => {
  const [mode, setMode] = useState<'upload' | 'url'>(
    value && value.startsWith('http') ? 'url' : 'upload'
  );
  const [urlInput, setUrlInput] = useState(value.startsWith('http') ? value : '');
  const [urlError, setUrlError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const validateAndApplyUrl = (raw: string) => {
    setUrlInput(raw);
    setUrlError('');
    if (!raw.trim()) {
      onChange('');
      return;
    }
    try {
      const parsed = new URL(raw.trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setUrlError('Image URL must start with http:// or https://');
        return;
      }
      // Verify image loads in browser before confirming
      const probe = new Image();
      probe.referrerPolicy = 'no-referrer';
      probe.onload = () => {
        setUrlError('');
        onChange(raw.trim());
      };
      probe.onerror = () => {
        setUrlError('URL cannot be loaded as a valid accessible image.');
      };
      probe.src = raw.trim();
    } catch {
      setUrlError('Enter a valid complete image URL (e.g. https://example.com/image.jpg).');
    }
  };

  const handleFile = async (file: File) => {
    setUploadError('');
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
    if (!allowed.includes(file.type)) {
      setUploadError('Unsupported image format. Please choose JPG, PNG, WebP, AVIF, or GIF.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setUploadError('File exceeds 8 MB maximum upload size.');
      return;
    }

    setUploading(true);
    setProgress(5);
    try {
      const res = await adminUploadImageWithProgress(file, (pct) => setProgress(pct));
      onChange(res.url);
    } catch (err: any) {
      setUploadError(err.message || 'Image upload failed.');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleRemoveImage = async () => {
    if (value.startsWith('/uploads/')) {
      const filename = value.replace('/uploads/', '');
      try {
        await adminDeleteUploadedImage(filename);
      } catch {
        // Ignore if file already removed
      }
    }
    setUrlInput('');
    onChange('');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-300">{label}</span>
        <div className="inline-flex rounded-lg bg-slate-900 p-0.5 border border-slate-800">
          <button
            type="button"
            onClick={() => setMode('upload')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
              mode === 'upload'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload File</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('url')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
              mode === 'url'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Paste URL</span>
          </button>
        </div>
      </div>

      {mode === 'upload' ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
            dragActive
              ? 'border-blue-500 bg-blue-950/20'
              : 'border-slate-700 hover:border-slate-600 bg-slate-900/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
          {uploading ? (
            <div className="space-y-2 py-2">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400 mx-auto" />
              <p className="text-xs text-slate-300 tabular-nums">Uploading... {progress}%</p>
              <div className="w-full max-w-xs mx-auto h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-transform"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Upload className="w-6 h-6 text-slate-400 mx-auto" />
              <p className="text-xs font-medium text-slate-200">
                Drag and drop an image here, or click to browse
              </p>
              <p className="text-[11px] text-slate-500">
                JPG, PNG, WebP, AVIF, GIF up to 8 MB
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => validateAndApplyUrl(e.target.value)}
            placeholder="https://example.com/thumbnail.jpg"
            className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
          {urlError && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{urlError}</span>
            </p>
          )}
        </div>
      )}

      {uploadError && (
        <p className="text-xs text-red-400 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{uploadError}</span>
        </p>
      )}

      {/* Live Preview & Remove/Replace Controls */}
      {value && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-24 aspect-video rounded-lg overflow-hidden bg-slate-950 border border-slate-800 shrink-0">
              <ResilientImage
                src={value}
                alt="Preview"
                lazy={false}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Preview Ready</span>
              </div>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">{value}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRemoveImage}
            className="px-2.5 py-1.5 rounded-lg bg-red-950/50 hover:bg-red-900/60 border border-red-900/60 text-xs text-red-300 inline-flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove</span>
          </button>
        </div>
      )}
    </div>
  );
};
