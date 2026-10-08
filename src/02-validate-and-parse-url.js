// Accepts form or webhook-shaped input, validates the Ad Library link and
// extracts the search context we need later (sort mode decides whether the
// "impression rank" market signal is trustworthy).
const APIFY_ACTOR = 'curious_coder~facebook-ads-library-scraper'; // swap scraper here
const MIN_ADS = 3;
const MAX_ADS = 15;

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

const input = $input.first().json;
const body = input.body || {};
const field = (...keys) => keys.map((k) => input[k] ?? body[k]).find((v) => v !== undefined && v !== null && v !== '');
const raw = String(field('adLibraryUrl', 'Ad Library URL') ?? '').trim();
const brandIn = String(field('brand', 'Brand / competitor name') ?? '').trim();
const preparedBy = String(field('preparedBy', 'Prepared by') ?? '').trim();
let maxAds = parseInt(field('maxAds', 'Ads to analyse (3-15)') ?? 8, 10);
if (!Number.isFinite(maxAds)) maxAds = 8;
maxAds = Math.min(Math.max(maxAds, MIN_ADS), MAX_ADS);

const reject = (reason) => [{ json: { valid: false, error: 'Invalid Facebook Ad Library URL.', reason, receivedUrl: raw } }];

const u = parseUrl(raw);
if (!u) return reject('That is not a web link.');
const host = u.hostname.replace(/^(www|m|web|business)\./, '');
if (host !== 'facebook.com' || !u.pathname.startsWith('/ads/library')) {
  return reject('Expected a facebook.com/ads/library/ link.');
}
const p = u;
const q = (p.get('q') || '').replace(/\+/g, ' ').replace(/^"+|"+$/g, '').trim();
const pageId = p.get('view_all_page_id');
const adId = p.get('id');
// A ?id= link opens one ad; the scraper needs a search or a page to list ads from.
if (adId && !q && !pageId) return reject(`That link opens a single ad (id ${adId}). Paste a search link instead, e.g. https://www.facebook.com/ads/library/?active_status=active&country=IN&q=MySivi&sort_data[mode]=total_impressions`);
if (!q && !pageId) return reject('The link has no search keyword or page id.');

const sortMode = p.get('sort_data[mode]') || '';
const country = (p.get('country') || 'ALL').toUpperCase();

return [{
  json: {
    valid: true,
    adLibraryUrl: raw,
    apifyActor: APIFY_ACTOR,
    maxAds,
    fetchCount: Math.max(10, maxAds + 5), // actor minimum is 10; headroom for dedupe
    country,
    query: q,
    pageId: pageId || null,
    adId: adId || null,
    activeStatus: p.get('active_status') || 'all',
    searchType: p.get('search_type') || '',
    sortMode: sortMode || 'relevance',
    impressionSorted: sortMode === 'total_impressions',
    brand: brandIn || q || (pageId ? `Page ${pageId}` : 'Advertiser'),
    preparedBy,
    runStartedAt: new Date().toISOString(),
  },
}];
