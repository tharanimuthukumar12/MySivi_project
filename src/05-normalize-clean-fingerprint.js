// Turns whatever the scraper returned into one clean schema per ad.
// Handles snake_case (curious_coder) and camelCase actor outputs, removes
// exact duplicates, flags shared copy, and decodes the video asset id +
// duration that Meta embeds in the CDN url (that is how we tell 15 ads
// with identical captions apart).
const cfg = $('02 — Validate & Parse URL').first().json;

// n8n's Code sandbox has no URL global, so links are parsed by hand.
const safeDecode = (x) => { try { return decodeURIComponent(x); } catch (e) { return x; } };
const parseUrl = (s) => {
  const m = String(s || '').trim().match(/^(https?):\/\/([^/?#]+)([^?#]*)(\?[^#]*)?/i);
  if (!m) return null;
  const pairs = (m[4] || '').slice(1).split('&').filter(Boolean).map((kv) => {
    const i = kv.indexOf('=');
    return [safeDecode(i === -1 ? kv : kv.slice(0, i)), i === -1 ? '' : safeDecode(kv.slice(i + 1)), kv];
  });
  return {
    origin: `${m[1].toLowerCase()}://${m[2].toLowerCase()}`,
    hostname: m[2].toLowerCase().replace(/:\d+$/, ''),
    pathname: m[3] || '/',
    pairs,
    get: (k) => { const hit = pairs.find((p) => p[0] === k); return hit ? hit[1] : null; },
  };
};

const ZW = /[​-‍﻿]/g;
const decodeEntities = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const clean = (v) => {
  if (v == null) return '';
  if (typeof v === 'object') v = v.text ?? '';
  return decodeEntities(String(v))
    .replace(/<[^>]+>/g, ' ')
    .replace(ZW, '')
    .replace(/�/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};
const isTemplate = (s) => /\{\{\s*[\w.]+\s*\}\}/.test(String(s || ''));
const pick = (...vals) => vals.map(clean).find((v) => v && !isTemplate(v)) || '';

const TRACKING = /^(utm_|fbclid|gclid|igshid|mc_|ref$|referrer$|_branch|campaign|adset|ad_id|af_)/i;
const cleanUrl = (url) => {
  const x = parseUrl(String(url || '').replace(/^http:\/\//i, 'https://'));
  if (!x) return String(url || '');
  const kept = x.pairs.filter(([k]) => !TRACKING.test(k)).map((p) => p[2]);
  return `${x.origin}${x.pathname}${kept.length ? `?${kept.join('&')}` : ''}`;
};

// Meta CDN video urls carry base64 JSON in `efg` with the asset id and duration.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const b64decode = (str) => {
  let bits = 0; let val = 0; let out = '';
  for (const ch of str.replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '')) {
    val = ((val << 6) | B64.indexOf(ch)) & 0xffffff; bits += 6;
    if (bits >= 8) { bits -= 8; out += String.fromCharCode((val >> bits) & 255); }
  }
  return out;
};
const decodeEfg = (url) => {
  try {
    const x = parseUrl(url);
    const efg = x && x.get('efg');
    if (!efg) return {};
    const j = JSON.parse(b64decode(efg));
    return { assetId: j.xpv_asset_id ? String(j.xpv_asset_id) : null, durationS: j.duration_s ?? null };
  } catch (e) { return {}; }
};

const SCRIPTS = [
  [/[஀-௿]/, 'Tamil'], [/[ಀ-೿]/, 'Kannada'], [/[ఀ-౿]/, 'Telugu'],
  [/[ഀ-ൿ]/, 'Malayalam'], [/[ঀ-৿]/, 'Bengali'], [/[઀-૿]/, 'Gujarati'],
  [/[਀-੿]/, 'Punjabi'], [/[଀-୿]/, 'Odia'], [/[ऀ-ॿ]/, 'Hindi'],
];
const HINGLISH = /\b(karo|kare|karein|sirf|mein|hai|hain|se|shuru|aap|apni|apna|bolo|seekho|sikho|kya|nahi|abhi|ab)\b/i;
const detectLanguage = (text) => {
  const hit = SCRIPTS.find(([re]) => re.test(text));
  if (hit) return hit[1];
  if (HINGLISH.test(text)) return 'Hinglish';
  return text ? 'English' : 'Unknown';
};

const hash = (s) => {
  let h = 5381;
  for (const ch of String(s)) h = ((h << 5) + h + ch.codePointAt(0)) >>> 0;
  return h.toString(36);
};
const copyKey = (s) => String(s).toLowerCase().replace(/#\w+/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Node 04 returns the whole Apify response as one text item, so the success
// path always runs exactly once (empty list and actor errors included).
const rows = [];
$input.all().forEach(({ json: j }) => {
  if (typeof j.raw === 'string') {
    try { const p = JSON.parse(j.raw); rows.push(...(Array.isArray(p) ? p : [p])); } catch (e) { rows.push({ error: 'Scraper returned non-JSON output' }); }
  } else rows.push(j);
});
const scraperError = (rows.find((j) => j && j.error) || {}).error || null;
const rawItems = rows.filter((j) => j && (j.ad_archive_id || j.adArchiveID || j.adArchiveId || j.adId));

const nowMs = Date.now();
const seenIds = new Set();
const seenAssets = new Map();
const ads = [];
const duplicates = [];
let reportedTotal = null;

rawItems.forEach((r, idx) => {
  const s = r.snapshot || r.adSnapshot || {};
  const cards = Array.isArray(s.cards) ? s.cards : [];
  const firstCard = cards[0] || {};
  const adId = String(r.ad_archive_id || r.adArchiveID || r.adArchiveId || r.adId);
  if (Number.isFinite(r.total)) reportedTotal = Math.max(reportedTotal || 0, r.total);

  const videos = [...(s.videos || []), ...cards.filter((c) => c.video_sd_url || c.video_hd_url)];
  const images = [...(s.images || []), ...cards.filter((c) => c.original_image_url || c.resized_image_url)];
  const v0 = videos[0];
  const videoUrl = v0 ? (v0.video_sd_url || v0.video_hd_url) : (r.videoUrl || '');
  const imageUrl = (v0 && v0.video_preview_image_url) || (images[0] && (images[0].original_image_url || images[0].resized_image_url)) || r.imageUrl || '';
  const assetIds = [...new Set(videos.map((v) => decodeEfg(v.video_sd_url || v.video_hd_url).assetId).filter(Boolean))].sort();
  const durationS = videoUrl ? (decodeEfg(videoUrl).durationS ?? null) : null;

  const headline = pick(s.title, firstCard.title, r.title, r.headline);
  const body = pick(s.body, firstCard.body, r.body, r.adText, r.primaryText);
  const linkDescription = pick(s.link_description, firstCard.link_description);
  const cta = pick(s.cta_text, firstCard.cta_text, r.ctaText, r.cta) || 'None';
  const templateLeak = [s.title, s.body && s.body.text, s.link_description].some(isTemplate);
  const hashtags = (body.match(/#[\p{L}\p{N}_]+/gu) || []);
  const bodyNoTags = clean(body.replace(/#[\p{L}\p{N}_]+/gu, ' ')).replace(/ +\n/g, '\n').replace(/\n +/g, '\n');

  const startSec = r.start_date || (r.startDate ? Date.parse(r.startDate) / 1000 : null)
    || (r.start_date_formatted ? Date.parse(r.start_date_formatted.replace(' ', 'T') + 'Z') / 1000 : null);
  const daysActive = startSec ? Math.max(0, Math.round((nowMs - startSec * 1000) / 86400000)) : null;
  const platforms = (r.publisher_platform || r.publisherPlatform || r.platforms || []).map((x) => String(x).toLowerCase());
  const linkUrl = cleanUrl(s.link_url || firstCard.link_url || r.linkUrl);

  // Exact duplicates: same ad id, or the exact same set of creative assets.
  const assetKey = assetIds.join('|');
  if (seenIds.has(adId)) { duplicates.push({ adId, reason: 'same ad id' }); return; }
  if (assetKey && seenAssets.has(assetKey)) { duplicates.push({ adId, reason: 'same creative assets', duplicateOf: seenAssets.get(assetKey) }); return; }
  seenIds.add(adId);
  if (assetKey) seenAssets.set(assetKey, adId);

  ads.push({
    adId,
    pageName: clean(r.page_name || s.page_name || r.pageName),
    pageId: String(r.page_id || s.page_id || r.pageId || ''),
    adLibraryUrl: r.ad_library_url || `https://www.facebook.com/ads/library/?id=${adId}`,
    libraryPosition: Number(r.position) || idx + 1,
    startDate: startSec ? new Date(startSec * 1000).toISOString().slice(0, 10) : null,
    daysActive,
    platforms,
    displayFormat: s.display_format || r.displayFormat || '',
    variantCount: Math.max(cards.length, videos.length, images.length, 1),
    mediaType: videoUrl ? 'video' : imageUrl ? 'image' : 'text',
    videoUrl,
    imageUrl,
    assetIds,
    durationS,
    headline,
    body: bodyNoTags,
    hashtags,
    linkDescription,
    linkUrl,
    linkDomain: ((parseUrl(linkUrl) || {}).hostname || '').replace(/^www\./, ''),
    cta,
    language: detectLanguage(`${headline} ${body}`),
    templateLeak,
    copyFingerprint: hash(copyKey(`${headline}|${bodyNoTags}`)),
    rawData: r,
  });
});

if (!ads.length) {
  return [{ json: { noAds: true, message: 'No ads were found for this query.', scraperError, scrapedRows: rawItems.length } }];
}

const sample = ads.slice(0, cfg.maxAds);
const copyGroups = {};
sample.forEach((a) => { copyGroups[a.copyFingerprint] = (copyGroups[a.copyFingerprint] || 0) + 1; });
sample.forEach((a) => { a.copyGroupSize = copyGroups[a.copyFingerprint]; a.sameCopy = a.copyGroupSize > 1; });

const uniq = (arr) => [...new Set(arr.filter(Boolean))];
const portfolio = {
  scrapedRows: rawItems.length,
  duplicatesRemoved: duplicates.length,
  duplicates,
  sampleSize: sample.length,
  reportedActiveAds: reportedTotal,
  pages: uniq(sample.map((a) => a.pageName)),
  uniqueCaptions: Object.keys(copyGroups).length,
  uniqueCreatives: uniq(sample.map((a) => a.assetIds.join('|') || a.videoUrl || a.imageUrl || a.adId)).length,
  mediaMix: sample.reduce((m, a) => ({ ...m, [a.mediaType]: (m[a.mediaType] || 0) + 1 }), {}),
  dcoShare: sample.filter((a) => a.displayFormat === 'DCO').length,
  templateLeaks: sample.filter((a) => a.templateLeak).map((a) => a.adId),
  captionLanguages: uniq(sample.map((a) => a.language)),
  platforms: uniq(sample.flatMap((a) => a.platforms)),
  destinations: sample.reduce((m, a) => ({ ...m, [a.linkDomain || 'none']: (m[a.linkDomain || 'none'] || 0) + 1 }), {}),
  ctaButtons: uniq(sample.map((a) => a.cta)),
  oldestStart: sample.map((a) => a.startDate).filter(Boolean).sort()[0] || null,
  newestStart: sample.map((a) => a.startDate).filter(Boolean).sort().slice(-1)[0] || null,
};

return sample.map((a, i) => ({ json: { ...a, sampleIndex: i + 1, portfolio } }));
