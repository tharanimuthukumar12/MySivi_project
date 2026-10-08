// Deterministic scoring. Gemini only supplies 0-10 sub-scores and flags;
// every weight, rank and gap below is computed here so the same inputs
// always produce the same winner.
const CREATIVE_WEIGHTS = {
  hookScore: 0.20, clarityScore: 0.15, valuePropScore: 0.15, offerScore: 0.15,
  ctaScore: 0.10, specificityScore: 0.10, creativeAngleScore: 0.10, conversionIntentScore: 0.05,
};
const MARKET_WEIGHTS = { impressionRank: 0.5, longevity: 0.3, distribution: 0.2 };
const BLEND = { creative: 0.7, market: 0.3 };
const LONGEVITY_FULL_DAYS = 30;

const cfg = $('02 — Validate & Parse URL').first().json;
const portfolio = $('05 — Normalize, Clean & Fingerprint').first().json.portfolio;
const all = $input.all().map((i) => i.json);
const scored = all.filter((a) => a.analysis);
const unscored = all.filter((a) => !a.analysis).map((a) => ({ adId: a.adId, reason: a.aiError || 'analysis failed' }));
const N = scored.length;

const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const median = (xs) => {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const avg = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const countBy = (xs) => xs.reduce((m, x) => { const k = x || 'n/a'; m[k] = (m[k] || 0) + 1; return m; }, {});
const sortedCounts = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count, share: N ? Math.round((count / N) * 100) : 0 }));
const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const primaryLanguage = (l) => String(l || 'n/a').split(/[,(/&]| and /)[0].trim() || 'n/a';
const offerLabel = (o) => {
  const t = String(o || '');
  if (/^(none|not observed)/i.test(t)) return 'No offer shown';
  const price = t.match(/(₹|rs\.?|inr)\s?\d+/i);
  return price ? `${price[0].replace(/\s+/g, '').replace(/^(rs\.?|inr)/i, '₹')} entry offer` : t.slice(0, 40);
};

// 1) Creative score (0-100) from the rubric.
scored.forEach((a) => {
  const s = a.analysis.scores;
  let total = 0;
  const imputed = [];
  Object.entries(CREATIVE_WEIGHTS).forEach(([k, w]) => {
    let v = s[k];
    if (v == null) { v = 5; imputed.push(k); }
    total += v * w * 10;
  });
  a.creativeScore = r1(total);
  a.imputedScores = imputed;
});

// 2) Creative clones: the same video re-uploaded under another ad id. Only ads
//    whose video was actually watched are compared. Two match when durations are
//    equal and the opening line agrees in the original language or in English
//    (Gemini's transliteration varies).
const lineKey = (t) => { const k = norm(t).slice(0, 16); return k && k !== 'not observed' ? k : null; };
const parent = Object.fromEntries(scored.map((a) => [a.adId, a.adId]));
const root = (id) => (parent[id] === id ? id : (parent[id] = root(parent[id])));
scored.forEach((a, i) => scored.slice(i + 1).forEach((b) => {
  if (a.analysisMode !== 'watched video' || b.analysisMode !== 'watched video') return;
  if (a.durationS == null || a.durationS !== b.durationS) return;
  const sameLine = [['text', 'text'], ['english', 'english']].some(([x, y]) => {
    const ka = lineKey(a.analysis.hook[x]); return ka && ka === lineKey(b.analysis.hook[y]);
  });
  if (sameLine) parent[root(b.adId)] = root(a.adId);
}));
const cloneGroups = {};
scored.forEach((a) => { (cloneGroups[root(a.adId)] = cloneGroups[root(a.adId)] || []).push(a.adId); });
scored.forEach((a) => {
  const g = cloneGroups[root(a.adId)];
  a.cloneCount = g.length;
  a.cloneOf = g.filter((id) => id !== a.adId);
});

// 3) Market signal (0-100) from observable Ad Library behaviour only.
const byPosition = [...scored].sort((x, y) => x.libraryPosition - y.libraryPosition);
byPosition.forEach((a, idx) => {
  const parts = {};
  if (cfg.impressionSorted) parts.impressionRank = N > 1 ? (100 * (N - 1 - idx)) / (N - 1) : 100;
  if (a.daysActive != null) parts.longevity = Math.min(a.daysActive / LONGEVITY_FULL_DAYS, 1) * 100;
  parts.distribution = Math.min((a.platforms.length || 1) / 5, 1) * 60 + Math.min(a.cloneCount - 1, 2) * 20;
  const wSum = Object.keys(parts).reduce((s, k) => s + MARKET_WEIGHTS[k], 0);
  a.marketParts = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, r1(v)]));
  a.marketSignal = r1(Object.entries(parts).reduce((s, [k, v]) => s + v * MARKET_WEIGHTS[k], 0) / wSum);
  a.impressionRankInSample = idx + 1;
});

// 4) Blend, rank, quadrant.
scored.forEach((a) => { a.adStrengthIndex = r1(a.creativeScore * BLEND.creative + a.marketSignal * BLEND.market); });
scored.sort((x, y) => (y.adStrengthIndex - x.adStrengthIndex) || (y.creativeScore - x.creativeScore) || (x.libraryPosition - y.libraryPosition));
const medC = median(scored.map((a) => a.creativeScore));
const medM = median(scored.map((a) => a.marketSignal));
scored.forEach((a, i) => {
  a.rank = i + 1;
  const hiC = a.creativeScore >= medC;
  const hiM = a.marketSignal >= medM;
  a.quadrant = hiC && hiM ? 'Proven winner' : hiC ? 'Hidden gem' : hiM ? 'Study this' : 'Retire';
});

// 5) Patterns across the sample.
const A = (a) => a.analysis;
const dims = Object.keys(CREATIVE_WEIGHTS);
const aggregates = {
  n: N,
  avgCreative: r1(avg(scored.map((a) => a.creativeScore))),
  avgMarket: r1(avg(scored.map((a) => a.marketSignal))),
  avgDims: Object.fromEntries(dims.map((k) => [k, r1(avg(scored.map((a) => A(a).scores[k])))])),
  hookTypes: sortedCounts(countBy(scored.map((a) => A(a).hook.type))),
  formats: sortedCounts(countBy(scored.map((a) => A(a).format))),
  talent: sortedCounts(countBy(scored.map((a) => A(a).talent))),
  spokenLanguages: sortedCounts(countBy(scored.map((a) => primaryLanguage(A(a).language)))),
  angles: sortedCounts(countBy(scored.map((a) => A(a).creativeAngle))),
  awareness: sortedCounts(countBy(scored.map((a) => A(a).awarenessLevel))),
  funnel: sortedCounts(countBy(scored.map((a) => A(a).funnelStage))),
  ctaButtons: sortedCounts(countBy(scored.map((a) => a.cta))),
  spokenCtaNone: scored.filter((a) => /^(none|not observed)/i.test(A(a).cta.spoken)).length,
  offers: sortedCounts(countBy(scored.map((a) => offerLabel(A(a).offer)))),
  medianProductSec: median(scored.map((a) => A(a).productFirstSeenSec)),
  medianBrandSec: median(scored.map((a) => A(a).brandFirstMentionSec)),
  captionsShare: N ? Math.round((scored.filter((a) => A(a).captionsBurnedIn).length / N) * 100) : 0,
  flags: Object.fromEntries(Object.keys(scored[0] ? A(scored[0]).flags : {}).map((k) => [k, scored.filter((a) => A(a).flags[k]).length])),
  medianDuration: median(scored.map((a) => a.durationS)),
  cloneGroups: Object.values(cloneGroups).filter((g) => g.length > 1),
  quadrants: sortedCounts(countBy(scored.map((a) => a.quadrant))),
  analysisModes: sortedCounts(countBy(scored.map((a) => a.analysisMode))),
};

// 6) Gap candidates - counted, never guessed. The strategist may only build on these.
const FLAG_LABEL = {
  quantifiedOutcome: 'a quantified outcome (a number, a timeline, a salary or score jump)',
  socialProof: 'social proof (learner counts, ratings, testimonials)',
  urgency: 'urgency or a deadline',
  comparison: 'a comparison against the alternative (tutor, coaching class, YouTube)',
  objectionHandling: 'objection handling (shy, no time, weak grammar, too old)',
  beforeAfter: 'a before -> after transformation',
  customerStory: 'a real learner story',
  priceShown: 'the price inside the creative itself',
};
const gaps = [];
Object.entries(FLAG_LABEL).forEach(([k, label]) => {
  const c = aggregates.flags[k] || 0;
  if (N && c / N <= 0.25) gaps.push({ key: k, severity: 1 - c / N, title: c ? `Only ${c} of ${N} ads use ${label}` : `None of the ${N} ads use ${label}`, count: c, n: N, examples: scored.filter((a) => A(a).flags[k]).map((a) => a.adId) });
});
const topHook = aggregates.hookTypes[0];
if (topHook && topHook.share >= 50) gaps.push({ key: 'hookMonoculture', severity: topHook.share / 100, title: `${topHook.share}% of hooks are the same type (${topHook.label})`, count: topHook.count, n: N });
if (aggregates.ctaButtons.length === 1) gaps.push({ key: 'ctaMonoculture', severity: 0.7, title: `All ${N} ads end on the same button: "${aggregates.ctaButtons[0].label}"`, count: N, n: N });
if (aggregates.spokenCtaNone >= N / 2) gaps.push({ key: 'silentCta', severity: aggregates.spokenCtaNone / N, title: `${aggregates.spokenCtaNone} of ${N} creatives never say or show what to do next`, count: aggregates.spokenCtaNone, n: N });
const topOffer = aggregates.offers[0];
if (topOffer && N > 2 && topOffer.share >= 80) gaps.push({ key: 'offerMonoculture', severity: 0.6, title: `${topOffer.count} of ${N} ads lean on one offer ("${topOffer.label}") with no offer ladder`, count: topOffer.count, n: N });
if (aggregates.medianProductSec != null && aggregates.medianProductSec > 6) gaps.push({ key: 'lateProduct', severity: Math.min(aggregates.medianProductSec / 20, 1), title: `The product shows up late: median first appearance at ${aggregates.medianProductSec}s`, count: null, n: N });
if (aggregates.captionsShare < 50) gaps.push({ key: 'soundOff', severity: 1 - aggregates.captionsShare / 100, title: `Only ${aggregates.captionsShare}% of creatives work with the sound off`, count: null, n: N });
if (cfg.country === 'IN') {
  const seen = new Set([...portfolio.captionLanguages, ...aggregates.spokenLanguages.map((l) => l.label)].join(' ').match(/Hindi|Hinglish|Tamil|Kannada|Telugu|Bengali|Marathi|Malayalam|Gujarati|Punjabi|Odia/g) || []);
  const missing = ['Telugu', 'Bengali', 'Marathi', 'Malayalam', 'Gujarati'].filter((l) => !seen.has(l));
  if (missing.length >= 3) gaps.push({ key: 'languageCoverage', severity: 0.5, title: `Sample covers ${[...seen].join(', ') || 'no regional language'}; nothing in ${missing.slice(0, 3).join(', ')}`, count: seen.size, n: N, note: 'Within the sampled top ads only - the full library may differ.' });
}
gaps.sort((a, b) => b.severity - a.severity);

// 7) Brief for the strategist (compact, evidence-first).
const winner = scored[0];
const line = (a) => {
  const x = A(a);
  const flags = Object.entries(x.flags).filter(([, v]) => v).map(([k]) => k).join(',') || 'none';
  return `#${a.rank} ad ${a.adId} | index ${a.adStrengthIndex} (creative ${a.creativeScore}, market ${a.marketSignal}, ${a.quadrant}) | ${x.format}, ${x.language}, ${a.durationS || '?'}s | hook[${x.hook.type}, ${x.scores.hookScore}/10]: "${x.hook.english}" | angle: ${x.creativeAngle} | offer: ${x.offer} | spoken CTA: ${x.cta.spoken} | product at ${x.productFirstSeenSec ?? '?'}s | flags: ${flags} | weakness: ${x.weakness}`;
};
const strategistPrompt = [
  `ADVERTISER: ${cfg.brand} | Market: ${cfg.country} | Source: Meta Ad Library, ${cfg.activeStatus} ads, sorted by ${cfg.sortMode}.`,
  `PORTFOLIO (observed): ${portfolio.reportedActiveAds ?? 'unknown'} active ads reported by the library; sample ${N}; ${portfolio.pages.length} Facebook pages in sample (${portfolio.pages.join('; ')}); ${portfolio.uniqueCreatives} unique creatives but only ${portfolio.uniqueCaptions} unique captions; ${portfolio.dcoShare}/${portfolio.sampleSize} are Dynamic Creative; caption languages: ${portfolio.captionLanguages.join(', ')}; destinations: ${JSON.stringify(portfolio.destinations)}; template placeholders leaking in ${portfolio.templateLeaks.length} ads.`,
  `AGGREGATES: avg creative ${aggregates.avgCreative}, avg market ${aggregates.avgMarket}; hook types ${JSON.stringify(aggregates.hookTypes.map((h) => `${h.label}:${h.count}`))}; formats ${JSON.stringify(aggregates.formats.map((h) => `${h.label}:${h.count}`))}; median product reveal ${aggregates.medianProductSec}s; sound-off ready ${aggregates.captionsShare}%; flags ${JSON.stringify(aggregates.flags)}; creative clones ${JSON.stringify(aggregates.cloneGroups)}.`,
  'RANKED ADS:',
  ...scored.map(line),
  `WINNER DETAIL: ${JSON.stringify({ adId: winner && winner.adId, observed: winner && A(winner).observed, whyItWorks: winner && A(winner).whyItWorks, first3s: winner && A(winner).first3s, scores: winner && A(winner).scores })}`,
  'GAP CANDIDATES (counted from the data, ordered by severity):',
  ...gaps.map((g, i) => `${i + 1}. ${g.title}${g.note ? ` (${g.note})` : ''}`),
].join('\n');

return [{
  json: {
    config: cfg,
    portfolio,
    weights: { creative: CREATIVE_WEIGHTS, market: MARKET_WEIGHTS, blend: BLEND, longevityFullDays: LONGEVITY_FULL_DAYS },
    ads: scored,
    unscored,
    winner,
    aggregates,
    gaps,
    medians: { creative: medC, market: medM },
    strategistPrompt,
  },
}];
