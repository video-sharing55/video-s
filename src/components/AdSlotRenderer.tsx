import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { AdPlacement } from '../types.ts';
import {
  inspectAdsterraSnippet,
  normalizeProtocolRelativeUrl,
  normalizeSnippetProtocolsForRender,
  resolvePlacementDirectUrl,
} from '../lib/adsterra.ts';

interface AdSlotRendererProps {
  placement?: AdPlacement;
  instanceKey?: string;
  compact?: boolean;
  className?: string;
}

/**
 * Deduplication registry for viewport-level scripts (Social Bar / Popunder)
 * so React component re-renders or state updates never initialize the same script twice.
 */
const activeViewportScriptKeys = new Set<string>();

function computeStableHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Isolated Adsterra / Third-Party Ad Renderer.
 * - Never mounted inside the Admin Dashboard (public gallery only).
 * - Banner units (Native Banner & Standard Banner atOptions) execute inside a responsive,
 *   auto-sizing srcDoc iframe so multiple placements never collide on global variables (like atOptions)
 *   and ad-blockers fail silently without breaking layout.
 * - Viewport-level units (Social Bar & Popunder) inject once into the public document body
 *   with strict deduplication across React re-renders.
 * - Direct Link units render a clean outbound sponsored banner or power the unlock flows.
 */
export const AdSlotRenderer: React.FC<AdSlotRendererProps> = ({
  placement,
  instanceKey = 'default',
  compact = false,
  className = '',
}) => {
  const [iframeFailed, setIframeFailed] = useState(false);
  const [adEmpty, setAdEmpty] = useState(false);
  const [measuredHeight, setMeasuredHeight] = useState<number>(0);

  const inspection = useMemo(() => {
    if (!placement) return null;
    return inspectAdsterraSnippet(placement.rawSnippet || '', placement.slot, placement.format);
  }, [placement?.rawSnippet, placement?.slot, placement?.format]);

  const effectiveFormat = useMemo(() => {
    if (!placement) return 'native_banner';
    if (inspection && !inspection.empty && inspection.valid) {
      return inspection.detectedFormat;
    }
    return placement.format;
  }, [placement, inspection]);

  const resolvedDirectUrl = useMemo(() => resolvePlacementDirectUrl(placement), [placement]);

  const isViewportLevelUnit = Boolean(
    placement &&
      placement.enabled &&
      !placement.testMode &&
      (effectiveFormat === 'popunder' ||
        effectiveFormat === 'social_bar' ||
        placement.slot === 'global_popunder') &&
      (placement.rawSnippet.trim() || placement.scriptSrc.trim())
  );

  // Controlled public-only DOM script injection for Social Bar / Popunder formats
  useEffect(() => {
    if (!isViewportLevelUnit || !placement) return;
    if (inspection && !inspection.valid) return;

    const rawCode = placement.rawSnippet.trim()
      ? normalizeSnippetProtocolsForRender(placement.rawSnippet)
      : placement.scriptSrc.trim()
      ? `<script async="async" data-cfasync="false" src="${normalizeProtocolRelativeUrl(
          placement.scriptSrc
        )}"></script>`
      : '';

    if (!rawCode) return;

    const dedupeKey = `${placement.id}:${computeStableHash(rawCode)}`;
    if (activeViewportScriptKeys.has(dedupeKey)) {
      return;
    }

    const injectedNodes: HTMLElement[] = [];

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<body>${rawCode}</body>`, 'text/html');
      const elements = Array.from(doc.body.children);

      elements.forEach((el) => {
        if (el.tagName.toLowerCase() === 'script') {
          const scriptEl = document.createElement('script');
          Array.from(el.attributes).forEach((attr) => {
            const val =
              attr.name.toLowerCase() === 'src'
                ? normalizeProtocolRelativeUrl(attr.value)
                : attr.value;
            scriptEl.setAttribute(attr.name, val);
          });
          if (el.textContent) {
            scriptEl.textContent = el.textContent;
          }
          scriptEl.dataset.adsterraPlacement = placement.id;
          document.body.appendChild(scriptEl);
          injectedNodes.push(scriptEl);
        } else {
          const cloned = el.cloneNode(true) as HTMLElement;
          cloned.dataset.adsterraPlacement = placement.id;
          document.body.appendChild(cloned);
          injectedNodes.push(cloned);
        }
      });

      activeViewportScriptKeys.add(dedupeKey);
    } catch {
      // Fail gracefully if blocked by browser extension or CSP
    }

    return () => {
      injectedNodes.forEach((node) => {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      });
      activeViewportScriptKeys.delete(dedupeKey);
    };
  }, [
    isViewportLevelUnit,
    placement?.id,
    placement?.rawSnippet,
    placement?.scriptSrc,
    inspection?.valid,
  ]);

  const slotMessageKey = useMemo(() => {
    if (!placement) return '';
    return `adslot-${placement.id}-${instanceKey}`;
  }, [placement?.id, instanceKey]);

  const iframeDoc = useMemo(() => {
    if (!placement || isViewportLevelUnit) return '';
    if (inspection && !inspection.valid) return '';

    let bodyMarkup = '';

    if (placement.rawSnippet.trim() && effectiveFormat !== 'direct_link') {
      bodyMarkup = normalizeSnippetProtocolsForRender(placement.rawSnippet);
    } else if (
      placement.format === 'native_banner' &&
      placement.scriptSrc.trim() &&
      placement.containerId.trim()
    ) {
      const safeSrc = normalizeProtocolRelativeUrl(placement.scriptSrc).replace(/"/g, '&quot;');
      const safeId = placement.containerId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
      bodyMarkup = `<script async="async" data-cfasync="false" src="${safeSrc}"></script><div id="${safeId}"></div>`;
    } else if (
      placement.format === 'standard_banner' &&
      placement.scriptSrc.trim() &&
      placement.bannerKey.trim()
    ) {
      const safeSrc = normalizeProtocolRelativeUrl(placement.scriptSrc).replace(/"/g, '&quot;');
      const safeKey = placement.bannerKey.trim().replace(/[^a-zA-Z0-9_-]/g, '');
      const w = placement.bannerWidth || 728;
      const h = placement.bannerHeight || 90;
      bodyMarkup = `<script type="text/javascript">
  atOptions = {
    'key' : '${safeKey}',
    'format' : 'iframe',
    'height' : ${h},
    'width' : ${w},
    'params' : {}
  };
</script>
<script type="text/javascript" src="${safeSrc}"></script>`;
    }

    if (!bodyMarkup) return '';

    const safeSlotKey = slotMessageKey.replace(/[^a-zA-Z0-9_:-]/g, '');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: auto !important;
    min-height: 0 !important;
    background: transparent;
    color: #d4d4d8;
    font-family: system-ui, -apple-system, sans-serif;
    overflow: hidden;
  }
  #ad-root {
    width: 100%;
    height: auto;
    display: flow-root;
  }
  iframe, img { max-width: 100%; }
</style>
</head>
<body>
<div id="ad-root">
${bodyMarkup}
</div>
<script>
(function() {
  var key = "${safeSlotKey}";
  var root = document.getElementById("ad-root");
  var lastHeight = 0;
  var hasRenderedContent = false;

  function measureContentHeight() {
    var maxH = 0;
    if (root) {
      var rootRect = root.getBoundingClientRect();
      maxH = Math.max(maxH, rootRect.height, root.offsetHeight);
      var children = root.children;
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        var tag = child.tagName ? child.tagName.toUpperCase() : "";
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "LINK") continue;
        var rect = child.getBoundingClientRect();
        var childBottom = rect.bottom - rootRect.top;
        maxH = Math.max(maxH, rect.height, childBottom);
      }
    }
    if (document.body) {
      var bodyTop = document.body.getBoundingClientRect().top;
      var bodyChildren = document.body.children;
      for (var j = 0; j < bodyChildren.length; j++) {
        var bChild = bodyChildren[j];
        if (bChild === root) continue;
        var bTag = bChild.tagName ? bChild.tagName.toUpperCase() : "";
        if (bTag === "SCRIPT" || bTag === "STYLE" || bTag === "LINK") continue;
        var bRect = bChild.getBoundingClientRect();
        maxH = Math.max(maxH, bRect.height, bRect.bottom - bodyTop);
      }
    }
    return Math.ceil(maxH);
  }

  function reportHeight() {
    var h = measureContentHeight();
    if (h >= 16) {
      hasRenderedContent = true;
      if (Math.abs(h - lastHeight) > 2) {
        lastHeight = h;
        window.parent.postMessage({ type: "ADSTERRA_SLOT_RESIZE", slotKey: key, height: h }, "*");
      }
    }
  }

  function attachAssetListeners(container) {
    if (!container || !container.querySelectorAll) return;
    var media = container.querySelectorAll("img, iframe");
    for (var k = 0; k < media.length; k++) {
      var el = media[k];
      if (!el.__adBound) {
        el.__adBound = true;
        el.addEventListener("load", reportHeight);
        el.addEventListener("error", reportHeight);
      }
    }
  }

  if (typeof ResizeObserver !== "undefined" && root) {
    new ResizeObserver(reportHeight).observe(root);
  }
  if (typeof MutationObserver !== "undefined" && document.body) {
    new MutationObserver(function() {
      attachAssetListeners(document.body);
      reportHeight();
    }).observe(document.body, { childList: true, subtree: true, attributes: true });
  }
  window.addEventListener("resize", reportHeight);
  window.addEventListener("load", function() {
    attachAssetListeners(document.body);
    reportHeight();
    setTimeout(reportHeight, 500);
    setTimeout(reportHeight, 1500);
    setTimeout(reportHeight, 3500);
    setTimeout(function() {
      reportHeight();
      if (!hasRenderedContent && measureContentHeight() < 16) {
        window.parent.postMessage({ type: "ADSTERRA_SLOT_EMPTY", slotKey: key }, "*");
      }
    }, 8000);
  });
  window.addEventListener("error", function(e) {
    if (e && e.target && e.target.tagName === "SCRIPT") {
      setTimeout(function() {
        if (!hasRenderedContent && measureContentHeight() < 16) {
          window.parent.postMessage({ type: "ADSTERRA_SLOT_SCRIPT_ERROR", slotKey: key }, "*");
        }
      }, 150);
    }
  }, true);
})();
</script>
</body>
</html>`;
  }, [placement, isViewportLevelUnit, inspection, effectiveFormat, slotMessageKey]);

  // Listen for dynamic height updates from the isolated iframe
  useEffect(() => {
    if (!iframeDoc || !slotMessageKey) return;
    setIframeFailed(false);
    setAdEmpty(false);
    setMeasuredHeight(0);

    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object' || data.slotKey !== slotMessageKey) return;
      if (data.type === 'ADSTERRA_SLOT_RESIZE' && typeof data.height === 'number') {
        const clamped = Math.min(Math.max(data.height, 40), 900);
        setIframeFailed(false);
        setAdEmpty(false);
        setMeasuredHeight(clamped);
      } else if (data.type === 'ADSTERRA_SLOT_SCRIPT_ERROR') {
        // Only mark failed if no visual ad content rendered
        setMeasuredHeight((prev) => {
          if (prev <= 0) setIframeFailed(true);
          return prev;
        });
      } else if (data.type === 'ADSTERRA_SLOT_EMPTY') {
        // Hide empty container cleanly if no fill arrived, while keeping iframe mounted in case a slow script responds later
        setMeasuredHeight((prev) => {
          if (prev <= 0) setAdEmpty(true);
          return prev;
        });
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [iframeDoc, slotMessageKey]);

  const stableIframeKey = useMemo(() => {
    if (!placement) return instanceKey;
    return `${placement.id}-${instanceKey}-${computeStableHash(iframeDoc)}`;
  }, [placement?.id, instanceKey, iframeDoc]);

  const hasValidIntegration = useMemo(() => {
    if (!placement || !placement.enabled) return false;
    if (placement.testMode) return true;
    if (inspection && !inspection.empty && !inspection.valid) return false;
    return Boolean(iframeDoc || isViewportLevelUnit || resolvedDirectUrl);
  }, [placement, inspection, iframeDoc, isViewportLevelUnit, resolvedDirectUrl]);

  if (!placement || !hasValidIntegration) {
    return null;
  }

  const wrapperClasses = `w-full min-w-0 shrink-0 ${className}`.trim();

  // Test / Preview Mode Box
  if (placement.testMode) {
    return (
      <aside aria-label="Sponsored advertisement" className={wrapperClasses}>
        <div
          className={`w-full rounded-lg border border-dashed border-zinc-800 bg-zinc-900/40 px-4 ${
            compact ? 'py-2.5' : 'py-3.5'
          } flex items-center justify-between gap-3 text-xs text-zinc-400`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] text-zinc-500 shrink-0">Sponsored Preview ·</span>
            <span className="truncate text-zinc-300">{placement.label}</span>
          </div>
          <span className="text-[11px] font-mono text-zinc-500 shrink-0">{effectiveFormat}</span>
        </div>
      </aside>
    );
  }

  // Viewport-level scripts (Social Bar / Popunder) manage their own DOM overlay/listeners
  if (isViewportLevelUnit) {
    return null;
  }

  // Direct link banner if Direct Link URL or <a href="..."> was configured on a visual slot
  if (!iframeDoc && resolvedDirectUrl) {
    return (
      <aside aria-label="Sponsored advertisement" className={wrapperClasses}>
        <div
          className={`w-full rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-4 ${
            compact ? 'py-2.5' : 'py-3.5'
          } flex items-center justify-between gap-4`}
        >
          <div className="min-w-0">
            <p className="text-[11px] text-zinc-500">Sponsored</p>
            <p className="text-xs font-medium text-zinc-200 truncate">{placement.label}</p>
          </div>
          <a
            href={resolvedDirectUrl}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors whitespace-nowrap shrink-0"
          >
            <span>Visit Sponsor</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </aside>
    );
  }

  if (iframeFailed || !iframeDoc) {
    return null;
  }

  const detectedHeight =
    (inspection?.extractedBannerHeight && inspection.extractedBannerHeight > 0
      ? inspection.extractedBannerHeight
      : placement.bannerHeight) || 90;

  const fallbackHeight = compact ? Math.max(84, detectedHeight) : Math.max(96, detectedHeight);
  const activeHeight = measuredHeight > 0 ? measuredHeight : fallbackHeight;

  return (
    <aside
      aria-label="Sponsored advertisement"
      className={adEmpty ? 'hidden' : wrapperClasses}
    >
      <div className="w-full rounded-lg border border-zinc-800/60 bg-zinc-950/60 p-2 overflow-hidden">
        <div className="flex items-center justify-between px-1 pb-1 text-[11px] text-zinc-500">
          <span>Sponsored</span>
        </div>
        <iframe
          key={stableIframeKey}
          title={`Sponsored placement ${placement.label}`}
          srcDoc={iframeDoc}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-same-origin"
          style={{ height: `${activeHeight}px` }}
          onError={() => setIframeFailed(true)}
          className="block w-full border-0 bg-transparent rounded transition-[height] duration-200"
        />
      </div>
    </aside>
  );
};
