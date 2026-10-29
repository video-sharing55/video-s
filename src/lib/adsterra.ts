import type { AdFormat, AdPlacement, PlacementSlot } from '../types.ts';

export interface AdSnippetInspection {
  valid: boolean;
  empty: boolean;
  detectedFormat: AdFormat;
  formatLabel: string;
  extractedDirectUrl: string;
  extractedScriptUrls: string[];
  extractedContainerId: string;
  extractedBannerWidth: number;
  extractedBannerHeight: number;
  usesViewportInjection: boolean;
  error?: string;
  warning?: string;
}

const FORMAT_LABELS: Record<AdFormat, string> = {
  native_banner: 'Native Banner',
  standard_banner: 'Standard Banner (atOptions)',
  direct_link: 'Direct Link',
  popunder: 'Popunder Script',
  social_bar: 'Social Bar Script',
};

/**
 * Normalize protocol-relative URLs (e.g. //pl12345.profitablecpmrate.com/...)
 * to https:// so they load reliably inside srcDoc iframes and HTTPS pages.
 */
export function normalizeProtocolRelativeUrl(url: string): string {
  const trimmed = (url || '').trim();
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }
  return trimmed;
}

/**
 * Normalize protocol-relative script/href attributes in an HTML snippet at render time
 * without altering the administrator's saved source text in the database.
 */
export function normalizeSnippetProtocolsForRender(snippet: string): string {
  if (!snippet) return '';
  return snippet
    .replace(/(\b(?:src|href)\s*=\s*["'])\/\//gi, '$1https://')
    .replace(/(url\s*\(\s*["']?)\/\//gi, '$1https://');
}

export function isValidAdHttpUrl(raw: string): boolean {
  const normalized = normalizeProtocolRelativeUrl(raw);
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Inspect pasted Adsterra code or URL, auto-detect its ad format, extract
 * embedded configuration (Direct Link URL, script URLs, container IDs, banner dimensions),
 * and surface actionable configuration diagnostics.
 */
export function inspectAdsterraSnippet(
  rawInput: string,
  slot?: PlacementSlot,
  fallbackFormat: AdFormat = 'native_banner'
): AdSnippetInspection {
  const raw = (rawInput || '').trim();

  if (!raw) {
    return {
      valid: true,
      empty: true,
      detectedFormat: fallbackFormat,
      formatLabel: FORMAT_LABELS[fallbackFormat],
      extractedDirectUrl: '',
      extractedScriptUrls: [],
      extractedContainerId: '',
      extractedBannerWidth: 0,
      extractedBannerHeight: 0,
      usesViewportInjection: fallbackFormat === 'popunder' || fallbackFormat === 'social_bar',
    };
  }

  if (raw.length > 16000) {
    return {
      valid: false,
      empty: false,
      detectedFormat: fallbackFormat,
      formatLabel: FORMAT_LABELS[fallbackFormat],
      extractedDirectUrl: '',
      extractedScriptUrls: [],
      extractedContainerId: '',
      extractedBannerWidth: 0,
      extractedBannerHeight: 0,
      usesViewportInjection: false,
      error: 'Ad code exceeds the 16 KB safety limit.',
    };
  }

  // Block admin session hijacking or parent-frame credential theft
  const restrictedPatterns: { pattern: RegExp; reason: string }[] = [
    {
      pattern: /\/api\/admin\b/i,
      reason: 'Snippet may not reference protected /api/admin endpoints.',
    },
    {
      pattern: /admin_session|nocturne_admin/i,
      reason: 'Snippet contains restricted admin session identifiers.',
    },
    {
      pattern: /parent\.document\.cookie|top\.document\.cookie/i,
      reason: 'Snippet may not access parent frame cookies.',
    },
  ];

  for (const rule of restrictedPatterns) {
    if (rule.pattern.test(raw)) {
      return {
        valid: false,
        empty: false,
        detectedFormat: fallbackFormat,
        formatLabel: FORMAT_LABELS[fallbackFormat],
        extractedDirectUrl: '',
        extractedScriptUrls: [],
        extractedContainerId: '',
        extractedBannerWidth: 0,
        extractedBannerHeight: 0,
        usesViewportInjection: false,
        error: rule.reason,
      };
    }
  }

  // Case 1: Pure Direct Link URL pasted directly into the Ad Code box
  if (!raw.includes('<') && !raw.includes('>')) {
    if (isValidAdHttpUrl(raw)) {
      const normalizedUrl = normalizeProtocolRelativeUrl(raw);
      return {
        valid: true,
        empty: false,
        detectedFormat: 'direct_link',
        formatLabel: FORMAT_LABELS.direct_link,
        extractedDirectUrl: normalizedUrl,
        extractedScriptUrls: [],
        extractedContainerId: '',
        extractedBannerWidth: 0,
        extractedBannerHeight: 0,
        usesViewportInjection: false,
      };
    }
    return {
      valid: false,
      empty: false,
      detectedFormat: fallbackFormat,
      formatLabel: FORMAT_LABELS[fallbackFormat],
      extractedDirectUrl: '',
      extractedScriptUrls: [],
      extractedContainerId: '',
      extractedBannerWidth: 0,
      extractedBannerHeight: 0,
      usesViewportInjection: false,
      error:
        'Pasted text is neither an HTML/JavaScript ad snippet (<script>...</script>) nor a valid https:// Direct Link URL.',
    };
  }

  // Check balanced <script> tags if <script is present
  const openScriptCount = (raw.match(/<script\b/gi) || []).length;
  const closeScriptCount = (raw.match(/<\/script\s*>/gi) || []).length;
  if (openScriptCount !== closeScriptCount) {
    return {
      valid: false,
      empty: false,
      detectedFormat: fallbackFormat,
      formatLabel: FORMAT_LABELS[fallbackFormat],
      extractedDirectUrl: '',
      extractedScriptUrls: [],
      extractedContainerId: '',
      extractedBannerWidth: 0,
      extractedBannerHeight: 0,
      usesViewportInjection: false,
      error: 'Incomplete <script> tag detected. Please paste the complete Adsterra snippet including closing </script>.',
    };
  }

  // Extract script src attributes
  const scriptSrcMatches = Array.from(
    raw.matchAll(/<script\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)
  ).map((m) => normalizeProtocolRelativeUrl(m[1]));

  for (const src of scriptSrcMatches) {
    if (!isValidAdHttpUrl(src)) {
      return {
        valid: false,
        empty: false,
        detectedFormat: fallbackFormat,
        formatLabel: FORMAT_LABELS[fallbackFormat],
        extractedDirectUrl: '',
        extractedScriptUrls: [],
        extractedContainerId: '',
        extractedBannerWidth: 0,
        extractedBannerHeight: 0,
        usesViewportInjection: false,
        error: `Invalid script src URL "${src}". Script URLs must use https://, http://, or // protocol.`,
      };
    }
  }

  // Extract anchor href if snippet is an <a href="..."> direct link tag
  const anchorHrefMatch = raw.match(/<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["'][^>]*>/i);
  const extractedAnchorUrl = anchorHrefMatch
    ? normalizeProtocolRelativeUrl(anchorHrefMatch[1])
    : '';

  if (openScriptCount === 0 && extractedAnchorUrl && isValidAdHttpUrl(extractedAnchorUrl)) {
    return {
      valid: true,
      empty: false,
      detectedFormat: 'direct_link',
      formatLabel: FORMAT_LABELS.direct_link,
      extractedDirectUrl: extractedAnchorUrl,
      extractedScriptUrls: [],
      extractedContainerId: '',
      extractedBannerWidth: 0,
      extractedBannerHeight: 0,
      usesViewportInjection: false,
    };
  }

  if (openScriptCount === 0) {
    return {
      valid: false,
      empty: false,
      detectedFormat: fallbackFormat,
      formatLabel: FORMAT_LABELS[fallbackFormat],
      extractedDirectUrl: '',
      extractedScriptUrls: [],
      extractedContainerId: '',
      extractedBannerWidth: 0,
      extractedBannerHeight: 0,
      usesViewportInjection: false,
      error: 'No executable <script> tag or valid Direct Link <a href="..."> found in the pasted code.',
    };
  }

  // Extract container div ID (e.g. <div id="container-xxxx"></div>)
  const containerMatch = raw.match(/<div\b[^>]*?\bid\s*=\s*["']([^"']+)["'][^>]*>/i);
  const extractedContainerId = containerMatch ? containerMatch[1].trim() : '';

  // Detect atOptions Standard Banner
  const hasAtOptions = /\batOptions\s*=/.test(raw);
  const widthMatch = raw.match(/['"]?width['"]?\s*:\s*(\d+)/i);
  const heightMatch = raw.match(/['"]?height['"]?\s*:\s*(\d+)/i);
  const extractedBannerWidth = widthMatch ? Number(widthMatch[1]) || 0 : 0;
  const extractedBannerHeight = heightMatch ? Number(heightMatch[1]) || 0 : 0;

  let detectedFormat: AdFormat = fallbackFormat;
  if (hasAtOptions) {
    detectedFormat = 'standard_banner';
  } else if (extractedContainerId || /invoke\.js/i.test(raw)) {
    detectedFormat = 'native_banner';
  } else if (/social[-_]?bar/i.test(raw)) {
    detectedFormat = 'social_bar';
  } else if (/popunder/i.test(raw) || slot === 'global_popunder') {
    detectedFormat = fallbackFormat === 'social_bar' ? 'social_bar' : 'popunder';
  } else if (scriptSrcMatches.length > 0 && !extractedContainerId) {
    // Standalone single external script tag without container/atOptions is typically Adsterra Social Bar or Popunder
    detectedFormat =
      fallbackFormat === 'popunder' || fallbackFormat === 'social_bar'
        ? fallbackFormat
        : 'social_bar';
  }

  let warning: string | undefined;
  if (
    (slot === 'watch_unlock_flow' || slot === 'download_option_flow') &&
    detectedFormat !== 'direct_link'
  ) {
    warning =
      'Unlock flows open an outbound URL in a new tab. Paste an Adsterra Direct Link URL (https://...) here for reliable click-to-unlock redirection.';
  } else if (scriptSrcMatches.length === 0 && hasAtOptions) {
    warning =
      'Found atOptions configuration without a companion <script src=".../invoke.js"></script> tag. Ensure both script tags from Adsterra are pasted.';
  }

  return {
    valid: true,
    empty: false,
    detectedFormat,
    formatLabel: FORMAT_LABELS[detectedFormat],
    extractedDirectUrl:
      extractedAnchorUrl && isValidAdHttpUrl(extractedAnchorUrl) ? extractedAnchorUrl : '',
    extractedScriptUrls: scriptSrcMatches,
    extractedContainerId,
    extractedBannerWidth,
    extractedBannerHeight,
    usesViewportInjection: detectedFormat === 'popunder' || detectedFormat === 'social_bar',
    warning,
  };
}

/**
 * Resolve the effective Direct Link URL from a placement, checking both
 * pasted Ad Code (raw URL or <a href="...">) and adDestinationUrl.
 */
export function resolvePlacementDirectUrl(placement?: AdPlacement): string {
  if (!placement) return '';
  const fromSnippet = inspectAdsterraSnippet(
    placement.rawSnippet,
    placement.slot,
    placement.format
  ).extractedDirectUrl;
  if (fromSnippet) return fromSnippet;
  const dest = normalizeProtocolRelativeUrl(placement.adDestinationUrl || '');
  return isValidAdHttpUrl(dest) ? dest : '';
}
