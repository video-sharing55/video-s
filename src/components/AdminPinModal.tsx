import React, { useEffect, useState } from 'react';
import { Lock, X, Loader2, AlertCircle } from 'lucide-react';
import { adminLogin } from '../lib/api.ts';

interface AdminPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (info: { username: string; usingDefaultPin: boolean }) => void;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError('');
      setLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) return;
    setError('');
    setLoading(true);
    try {
      const res = await adminLogin(pin.trim());
      onSuccess({ username: res.username, usingDefaultPin: res.usingDefaultPin });
    } catch (err: any) {
      setError(err.message || 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-gate-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <Lock className="w-4 h-4 text-zinc-300" />
            </div>
            <div>
              <h2 id="admin-gate-title" className="text-base font-semibold text-white">
                Management Access
              </h2>
              <p className="text-xs text-zinc-500">Server-verified credential required</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="admin-pin-input" className="block text-xs font-medium text-zinc-400 mb-1.5">
              Access PIN / Passphrase
            </label>
            <input
              id="admin-pin-input"
              type="password"
              inputMode="text"
              autoFocus
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter PIN"
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-sm tracking-widest placeholder:tracking-normal placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl border border-red-900/60 bg-red-950/30 text-red-200 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !pin.trim()}
            className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            <span>Verify &amp; Enter</span>
          </button>
        </form>
      </div>
    </div>
  );
};
