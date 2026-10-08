// Parse the strategist memo. If Gemini is down or returns junk the report
// still ships: every section falls back to the deterministic findings.
const base = $('14 — Score, Rank & Find Gaps').first().json;

const collectText = (node) => {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (typeof node === 'object') {
    if (typeof node.text === 'string') return node.text;
    for (const k of ['content', 'parts', 'message', 'output']) if (node[k]) return collectText(node[k]);
    if (node.candidates) return collectText(node.candidates[0]);
  }
  return '';
};
const parseJson = (text) => {
  let t = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s === -1 || e <= s) throw new Error('No JSON in strategist output');
  t = t.slice(s, e + 1);
  try { return JSON.parse(t); } catch (err) { return JSON.parse(t.replace(/,\s*([}\]])/g, '$1')); }
};

// Belt and braces: scrub the phrases that make copy read machine-written.
const BANNED = /\b(leverag\w*|unlock\w*|elevat\w*|robust|seamless\w*|delv\w*|game[- ]changer|cutting[- ]edge|landscape|resonat\w*|crucial|harness\w*|tapestry|synerg\w*|revolutioni[sz]\w*|empower\w*|holistic|comprehensive)\b/gi;
const SWAP = { leverage: 'use', unlock: 'open up', elevate: 'lift', robust: 'solid', seamless: 'smooth', crucial: 'key', resonate: 'land', harness: 'use', comprehensive: 'full', holistic: 'whole' };
const scrub = (v) => {
  if (typeof v === 'string') {
    return v.replace(BANNED, (m) => {
      const stem = Object.keys(SWAP).find((k) => m.toLowerCase().startsWith(k.slice(0, -1)));
      return stem ? SWAP[stem] : '';
    }).replace(/\s{2,}/g, ' ').replace(/!+/g, '.').trim();
  }
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x)]));
  return v;
};
const arr = (v) => (Array.isArray(v) ? v : []);

let strategy = null;
let strategyError = null;
try {
  const p = parseJson(collectText($input.first().json));
  if (!p.headline || !Array.isArray(p.concepts)) throw new Error('Strategist JSON missing headline/concepts');
  strategy = scrub(p);
} catch (e) {
  strategyError = $input.first().json.error ? String($input.first().json.error.message || $input.first().json.error) : e.message;
}

const w = base.winner;
const fallback = {
  headline: `${base.config.brand}: ${base.portfolio.uniqueCreatives} distinct creatives behind ${base.portfolio.uniqueCaptions} captions in the sampled top ads.`,
  executiveSummary: [
    w ? `Top-scoring ad ${w.adId} reached ${w.adStrengthIndex}/100 on the Ad Strength Index.` : 'No ad could be scored.',
    `Average creative score across ${base.aggregates.n} ads: ${base.aggregates.avgCreative}/100.`,
    base.aggregates.hookTypes[0] ? `Most common hook type: ${base.aggregates.hookTypes[0].label} (${base.aggregates.hookTypes[0].count} ads).` : '',
  ].filter(Boolean),
  winnerWhy: w ? [{ point: 'Highest blended score', evidence: w.analysis.whyItWorks }] : [],
  winnerSteal: [],
  hookTakeaway: '', ctaTakeaway: '',
  patterns: [],
  gaps: base.gaps.slice(0, 5).map((g) => ({ title: g.title, evidence: `${g.count ?? '-'} of ${g.n}`, whyItMatters: '', opportunity: '' })),
  concepts: [],
  recommendations: [],
};

const s = strategy || fallback;
return [{
  json: {
    ...base,
    strategy: {
      ...s,
      executiveSummary: arr(s.executiveSummary).slice(0, 4),
      winnerWhy: arr(s.winnerWhy).slice(0, 5),
      patterns: arr(s.patterns).slice(0, 5),
      gaps: arr(s.gaps).slice(0, 5),
      concepts: arr(s.concepts).slice(0, 3),
      recommendations: arr(s.recommendations).slice(0, 6),
    },
    strategySource: strategy ? 'gemini' : 'deterministic fallback',
    strategyError,
  },
}];
