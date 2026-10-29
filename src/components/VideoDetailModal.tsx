import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Download,
  ExternalLink,
  Lock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Send,
  FileDown,
} from 'lucide-react';
import type { DownloadOption, SiteSettings, VideoEntry } from '../types.ts';
import { ResilientImage } from './ResilientImage.tsx';
import {
  startUnlockFlow,
  markUnlockAdOpened,
  confirmUnlockReturn,
  checkUnlockStatus,
} from '../lib/api.ts';

interface VideoDetailModalProps {
  video: VideoEntry | null;
  settings: SiteSettings;
  autoStartWatch?: boolean;
  onClose: () => void;
}

type ModalStep = 'watch_unlock' | 'download_list' | 'download_unlock';

export const VideoDetailModal: React.FC<VideoDetailModalProps> = ({
  video,
  settings,
  onClose,
}) => {
  const [step, setStep] = useState<ModalStep>('watch_unlock');
  const [selectedOption, setSelectedOption] = useState<DownloadOption | null>(null);

  const [initializingWatch, setInitializingWatch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [unlockToken, setUnlockToken] = useState('');
  const [unlockMode, setUnlockMode] = useState<string>(settings.unlockMode);
  const [adUrl, setAdUrl] = useState('');
  const [adOpened, setAdOpened] = useState(false);
  const [returnedFromAdTab, setReturnedFromAdTab] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [targetUrl, setTargetUrl] = useState('');
  const [directUrl, setDirectUrl] = useState('');

  const leftTabAfterClickRef = useRef(false);

  const loadFreshWatchSession = useCallback(
    async (targetVideo: VideoEntry, isCancelled?: () => boolean) => {
      setInitializingWatch(true);
      setErrorMsg('');
      setUnlockToken('');
      setAdUrl('');
      setAdOpened(false);
      setReturnedFromAdTab(false);
      setUnlocked(false);
      setTargetUrl('');
      setDirectUrl('');
      leftTabAfterClickRef.current = false;

      try {
        const res = await startUnlockFlow({ videoId: targetVideo.id, flowType: 'watch' });
        if (isCancelled?.()) return;
        setUnlockToken(res.token);
        setUnlockMode(res.mode);
        setAdUrl(res.adUrl);
        setUnlocked(res.unlocked);
        setTargetUrl(res.targetUrl);
        setDirectUrl(res.directUrl);
      } catch (err: any) {
        if (isCancelled?.()) return;
        setErrorMsg(err.message || 'Unable to initialize video unlock step.');
      } finally {
        if (!isCancelled?.()) {
          setInitializingWatch(false);
        }
      }
    },
    []
  );

  // Initialize fresh ephemeral unlock state whenever a video is opened
  useEffect(() => {
    setStep('watch_unlock');
    setSelectedOption(null);
    setLoading(false);
    setErrorMsg('');
    setUnlockToken('');
    setAdUrl('');
    setAdOpened(false);
    setReturnedFromAdTab(false);
    setUnlocked(false);
    setTargetUrl('');
    setDirectUrl('');
    leftTabAfterClickRef.current = false;

    if (!video) return;

    let cancelled = false;
    loadFreshWatchSession(video, () => cancelled);

    return () => {
      cancelled = true;
    };
  }, [video?.id, loadFreshWatchSession]);

  // Reset unlock state if restored from browser back-forward cache
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted && video) {
        loadFreshWatchSession(video);
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [video, loadFreshWatchSession]);

  // Detect genuine tab switch & return after clicking Unlock Video
  useEffect(() => {
    if (!adOpened || unlocked) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        leftTabAfterClickRef.current = true;
      } else if (document.visibilityState === 'visible' && leftTabAfterClickRef.current) {
        setReturnedFromAdTab(true);
      }
    };

    const handleBlur = () => {
      leftTabAfterClickRef.current = true;
    };

    const handleFocus = () => {
      if (leftTabAfterClickRef.current) {
        setReturnedFromAdTab(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [adOpened, unlocked]);

  // Close on Escape
  useEffect(() => {
    if (!video) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [video, onClose]);

  // Poll S2S Postback status if postback_verified mode and ad has been opened
  useEffect(() => {
    if (!unlockToken || unlocked || unlockMode !== 'postback_verified' || !adOpened) return;
    const timer = window.setInterval(async () => {
      try {
        const status = await checkUnlockStatus(unlockToken);
        if (status.unlocked) {
          setUnlocked(true);
          setTargetUrl(status.targetUrl);
          setDirectUrl(status.directUrl);
          setErrorMsg('');
        }
      } catch {
        // Ignore transient network poll errors
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [unlockToken, unlocked, unlockMode, adOpened]);

  if (!video) return null;

  const initiateDownloadOption = async (opt: DownloadOption) => {
    setErrorMsg('');
    setLoading(true);
    setSelectedOption(opt);
    try {
      const res = await startUnlockFlow({
        videoId: video.id,
        flowType: 'download',
        optionId: opt.id,
      });
      setUnlockToken(res.token);
      setUnlockMode(res.mode);
      setAdUrl(res.adUrl);
      setUnlocked(res.unlocked);
      setTargetUrl(res.targetUrl);
      setDirectUrl(res.directUrl);
      setAdOpened(false);
      setReturnedFromAdTab(false);
      leftTabAfterClickRef.current = false;
      setStep('download_unlock');
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to initialize download option.');
    } finally {
      setLoading(false);
    }
  };

  const handleSponsorClick = async () => {
    if (!unlockToken) return;
    setErrorMsg('');
    leftTabAfterClickRef.current = false;
    setReturnedFromAdTab(false);
    try {
      await markUnlockAdOpened(unlockToken);
      setAdOpened(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not start the advertising unlock step.');
    }
  };

  const handleUnconfiguredUnlockClick = () => {
    setErrorMsg(
      'No advertising destination URL is configured for this video yet. Please add an Adsterra Direct Link URL in the Admin Panel (Video Card settings or Adsterra & Ads → Watch Now Direct-Link Sponsor).'
    );
  };

  const handleConfirmReturn = async () => {
    if (!unlockToken) return;
    setErrorMsg('');
    setLoading(true);
    try {
      const res = await confirmUnlockReturn(unlockToken);
      setUnlocked(res.unlocked);
      setTargetUrl(res.targetUrl);
      setDirectUrl(res.directUrl);
    } catch (err: any) {
      setErrorMsg(err.message || 'Please visit the opened advertising page first before continuing.');
    } finally {
      setLoading(false);
    }
  };

  const enabledDownloadOptions = (video.downloadOptions || []).filter((o) => o.enabled);

  const unlockHeading = settings.unlockModalTitle?.trim() || 'ভিডিও আনলক করুন';
  const unlockInstruction =
    settings.unlockModalDescription?.trim() ||
    'ভিডিওটি দেখতে নিচের Unlock Video বাটনে ক্লিক করে বিজ্ঞাপন ধাপটি সম্পন্ন করুন। ফিরে আসার পর Telegram লিংক সক্রিয় হবে।';
  const unlockCtaLabel =
    settings.unlockButtonLabel?.trim() && settings.unlockButtonLabel.trim() !== 'Unlock'
      ? settings.unlockButtonLabel.trim()
      : 'Unlock Video';
  const continueTelegramLabel =
    settings.playButtonLabel?.trim() && settings.playButtonLabel.trim() !== 'Play on Telegram'
      ? settings.playButtonLabel.trim()
      : 'Continue to Telegram';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-modal-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Controls */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/80 bg-zinc-950/90">
          {step !== 'watch_unlock' ? (
            <button
              type="button"
              onClick={() => {
                setErrorMsg('');
                if (step === 'download_unlock') {
                  setStep('download_list');
                } else {
                  setStep('watch_unlock');
                  loadFreshWatchSession(video);
                }
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 transition-colors py-1 px-2 -ml-2 rounded-lg focus-visible:outline-2 focus-visible:outline-amber-400 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          ) : (
            <div className="text-xs text-zinc-400 truncate pr-4">
              {[video.category?.trim(), video.durationLabel?.trim(), video.badgeText?.trim()]
                .filter(Boolean)
                .map((item, idx) => (
                  <React.Fragment key={`${item}-${idx}`}>
                    {idx > 0 && <span className="mx-1.5 text-zinc-600">·</span>}
                    <span className={item === video.badgeText?.trim() ? 'text-zinc-300' : ''}>
                      {item}
                    </span>
                  </React.Fragment>
                ))}
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* WATCH UNLOCK INTERFACE ("ভিডিও আনলক করুন") */}
          {step === 'watch_unlock' && (
            <div className="space-y-5">
              {/* Video Thumbnail & Title Header */}
              <div className="flex items-center gap-3.5 p-3 rounded-xl border border-zinc-800/80 bg-zinc-900/40">
                <div className="w-24 sm:w-28 aspect-video rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800 shrink-0">
                  <ResilientImage
                    src={video.thumbnailUrl}
                    alt={video.title}
                    fallbackTitle={video.title}
                    lazy={false}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm sm:text-base font-semibold text-white line-clamp-2 leading-snug">
                    {video.title}
                  </p>
                  {video.description?.trim() ? (
                    <p className="text-xs text-zinc-400 line-clamp-2">{video.description}</p>
                  ) : null}
                </div>
              </div>

              {/* Heading: "ভিডিও আনলক করুন" & Instruction */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                    {unlocked ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <Lock className="w-5 h-5" style={{ color: settings.accentColor }} />
                    )}
                  </div>
                  <h2 id="video-modal-title" className="text-xl font-semibold text-white">
                    {unlockHeading}
                  </h2>
                </div>

                <p className="text-sm leading-relaxed text-zinc-300">{unlockInstruction}</p>
              </div>

              {errorMsg && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-red-900/60 bg-red-950/30 text-red-200 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {initializingWatch ? (
                <div className="w-full min-h-[48px] rounded-xl border border-zinc-800 bg-zinc-900/60 flex items-center justify-center gap-2 text-xs text-zinc-300">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Preparing unlock step...</span>
                </div>
              ) : !unlocked ? (
                <div className="space-y-3.5">
                  {/* Step 2: Unlock Video Button */}
                  {adUrl ? (
                    <a
                      href={adUrl}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      onClick={handleSponsorClick}
                      style={{ backgroundColor: settings.accentColor }}
                      className="w-full min-h-[48px] px-5 py-3 rounded-xl font-semibold text-sm text-zinc-950 hover:opacity-95 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <span>{unlockCtaLabel}</span>
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={handleUnconfiguredUnlockClick}
                      style={{ backgroundColor: settings.accentColor }}
                      className="w-full min-h-[48px] px-5 py-3 rounded-xl font-semibold text-sm text-zinc-950 hover:opacity-95 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
                    >
                      <span>{unlockCtaLabel}</span>
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  )}

                  {/* Honest Return-and-Continue step after sponsor link was opened */}
                  {adOpened && unlockMode === 'return_continue' && (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 space-y-3 animate-fadeIn">
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        {returnedFromAdTab
                          ? 'Welcome back. Confirm below after completing the sponsor visit to reveal the Telegram destination.'
                          : settings.returnContinuePrompt ||
                            'Advertising page opened in a new tab. Visit the opened sponsor page, then return to this tab and confirm below to continue.'}
                      </p>

                      <button
                        type="button"
                        onClick={handleConfirmReturn}
                        disabled={loading}
                        className="w-full min-h-[44px] px-4 py-2.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {loading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        <span>
                          {settings.returnContinueButtonLabel || 'I Visited Sponsor — Continue'}
                        </span>
                      </button>

                      {adUrl && (
                        <p className="text-[11px] text-zinc-500">
                          Popup blocked or tab failed to open?{' '}
                          <a
                            href={adUrl}
                            target="_blank"
                            rel="noopener noreferrer sponsored"
                            onClick={handleSponsorClick}
                            className="text-zinc-300 underline hover:text-white"
                          >
                            Open advertising link again
                          </a>
                        </p>
                      )}
                    </div>
                  )}

                  {/* Verified S2S Postback Polling Mode */}
                  {adOpened && unlockMode === 'postback_verified' && (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 space-y-2.5 text-xs text-zinc-300">
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-4 h-4 animate-spin text-amber-400 shrink-0" />
                        <span>
                          Waiting for server postback confirmation from advertising provider...
                        </span>
                      </div>
                      {adUrl && (
                        <p className="text-[11px] text-zinc-500">
                          Popup blocked?{' '}
                          <a
                            href={adUrl}
                            target="_blank"
                            rel="noopener noreferrer sponsored"
                            className="text-zinc-300 underline hover:text-white"
                          >
                            Open advertising link again
                          </a>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* Step 3: Continuation Interface with Configured Telegram Destination */
                <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-5 space-y-4 animate-fadeIn">
                  <div className="flex items-center gap-2 text-emerald-300 text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Unlock step complete — Telegram destination ready</span>
                  </div>
                  <a
                    href={targetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ backgroundColor: settings.accentColor }}
                    className="w-full min-h-[48px] px-5 py-3 rounded-xl font-semibold text-sm text-zinc-950 hover:opacity-95 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <Send className="w-4 h-4" />
                    <span>{continueTelegramLabel}</span>
                  </a>
                </div>
              )}

              {/* Preserved Download Now Access */}
              {settings.downloadButtonVisible && (
                <div className="pt-2 border-t border-zinc-900">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg('');
                      setStep('download_list');
                    }}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl font-semibold text-xs bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>{settings.downloadButtonLabel || 'Download Now'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* DOWNLOAD OPTIONS SELECTION */}
          {step === 'download_list' && (
            <div className="space-y-5 py-1">
              <div>
                <h3 className="text-xl font-semibold text-white">{settings.downloadModalTitle}</h3>
                <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                  {settings.downloadModalDescription}
                </p>
              </div>

              {errorMsg && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-red-900/60 bg-red-950/30 text-red-200 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {enabledDownloadOptions.length === 0 ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-center text-sm text-zinc-400">
                  No download resolutions are currently enabled for this release.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {enabledDownloadOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={loading}
                      onClick={() => initiateDownloadOption(opt)}
                      className="w-full p-4 rounded-xl border border-zinc-800 hover:border-zinc-600 bg-zinc-900/50 hover:bg-zinc-900 transition-colors flex items-center justify-between gap-4 text-left cursor-pointer group"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-zinc-100 group-hover:text-white truncate">
                          {opt.displayName}
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5 tabular-nums">
                          <span>{opt.qualityLabel}</span>
                          {opt.format ? (
                            <>
                              <span className="mx-1.5 text-zinc-600">·</span>
                              <span>{opt.format}</span>
                            </>
                          ) : null}
                          {opt.fileSize ? (
                            <>
                              <span className="mx-1.5 text-zinc-600">·</span>
                              <span>{opt.fileSize}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <div className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-300 group-hover:text-white">
                        <span>Continue</span>
                        <Download className="w-4 h-4" />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <p className="text-xs text-zinc-500">{settings.downloadAdNoticeText}</p>
            </div>
          )}

          {/* DOWNLOAD OPTION UNLOCK & FILE ACCESS */}
          {step === 'download_unlock' && selectedOption && (
            <div className="space-y-5 py-2">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                  {unlocked ? (
                    <FileDown className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Lock className="w-5 h-5 text-amber-400" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {selectedOption.displayName}
                  </h3>
                  <p className="text-xs text-zinc-400 tabular-nums">
                    {selectedOption.qualityLabel}
                    {selectedOption.fileSize ? ` · ${selectedOption.fileSize}` : ''}
                    {selectedOption.format ? ` · ${selectedOption.format}` : ''}
                  </p>
                </div>
              </div>

              {errorMsg && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-red-900/60 bg-red-950/30 text-red-200 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {!unlocked ? (
                <div className="space-y-4">
                  <p className="text-sm text-zinc-300 leading-relaxed">
                    Visit the sponsor destination below in a new tab first. Note: clicking the sponsor button opens an external advertisement page, not the media file itself.
                  </p>

                  <a
                    href={adUrl}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    onClick={handleSponsorClick}
                    style={{ backgroundColor: settings.accentColor }}
                    className="w-full min-h-[48px] px-5 py-3 rounded-xl font-semibold text-sm text-zinc-950 hover:opacity-95 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <span>Visit Sponsor Link to Unlock</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>

                  {adOpened && unlockMode === 'return_continue' && (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 space-y-3">
                      <p className="text-xs text-zinc-300">{settings.returnContinuePrompt}</p>
                      <button
                        type="button"
                        onClick={handleConfirmReturn}
                        disabled={loading}
                        className="w-full min-h-[44px] px-4 py-2.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {loading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        <span>{settings.returnContinueButtonLabel}</span>
                      </button>
                    </div>
                  )}

                  {adOpened && unlockMode === 'postback_verified' && (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 flex items-center gap-3 text-xs text-zinc-300">
                      <Loader2 className="w-4 h-4 animate-spin text-amber-400 shrink-0" />
                      <span>Waiting for verified sponsor callback...</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-5 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-300 text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Download destination unlocked</span>
                  </div>

                  {targetUrl && (
                    <a
                      href={targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ backgroundColor: settings.accentColor }}
                      className="w-full min-h-[46px] px-5 py-3 rounded-xl font-semibold text-sm text-zinc-950 hover:opacity-95 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Open Download Destination ({selectedOption.qualityLabel})</span>
                    </a>
                  )}

                  {directUrl && (
                    <a
                      href={directUrl}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full min-h-[46px] px-5 py-3 rounded-xl font-semibold text-sm bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-100 transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <FileDown className="w-4 h-4" />
                      <span>Direct File Download ({selectedOption.format || 'File'})</span>
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
