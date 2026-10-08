// Renders the final report as print-ready HTML (A4). Same file feeds PDF.co
// and the HTML fallback. Every number on the page comes from node 14; the
// strategist only contributes prose.
const d = $input.first().json;
const { config: cfg, portfolio: pf, ads, aggregates: ag, strategy: st, weights } = d;
const w = d.winner;

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n1 = (v) => (v == null || Number.isNaN(v) ? '–' : (Math.round(v * 10) / 10).toFixed(1));
const n0 = (v) => (v == null || Number.isNaN(v) ? '–' : String(Math.round(v)));
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const dateFmt = (iso) => { try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch (e) { return iso; } };
const short = (s, n) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const A = (a) => a.analysis;
const N = ads.length;
const DIM_LABEL = { hookScore: 'Hook', clarityScore: 'Clarity', valuePropScore: 'Value prop', offerScore: 'Offer', ctaScore: 'CTA', specificityScore: 'Specificity', creativeAngleScore: 'Creative angle', conversionIntentScore: 'Conversion intent' };
const FLAG_SHORT = { quantifiedOutcome: 'Numbers', socialProof: 'Social proof', urgency: 'Urgency', comparison: 'Comparison', objectionHandling: 'Objections', beforeAfter: 'Before/after', customerStory: 'Learner story', priceShown: 'Price on screen', productUiShown: 'App UI shown', humanFace: 'Human face' };
const generated = dateFmt(cfg.runStartedAt);

const tag = (kind) => `<span class="tag tag-${kind}">${kind}</span>`;
const pill = (t, cls = '') => `<span class="pill ${cls}">${esc(t)}</span>`;
const quadClass = (q) => ({ 'Proven winner': 'q1', 'Hidden gem': 'q2', 'Study this': 'q3', Retire: 'q4' }[q] || '');
const thumb = (a, cls = '') => (a.imageUrl
  ? `<div class="thumb ${cls}"><img src="${esc(a.imageUrl)}" alt=""></div>`
  : `<div class="thumb ${cls} ph"><span>${esc(a.mediaType)}</span></div>`);
const bar = (v, max = 10, cls = '') => `<span class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, (v / max) * 100))}%"></i></span>`;
const runhead = (label) => `<div class="runhead"><span>${esc(cfg.brand)} · Ad Library Teardown</span><span>${esc(label)}</span></div>`;
const section = (num, kicker, title, lede) => `<div class="kicker">${num} — ${esc(kicker)}</div><h2>${esc(title)}</h2>${lede ? `<p class="lede">${lede}</p>` : ''}`;

const barsChart = (rows, max) => `<div class="hbars">${rows.map((r) => `
  <div class="hb"><span class="hb-l">${esc(r.label)}</span><span class="hb-t"><i style="width:${max ? (r.count / max) * 100 : 0}%"></i></span><span class="hb-v">${r.count}</span></div>`).join('')}</div>`;

// Creative vs market scatter (SVG).
const scatter = () => {
  const W = 300; const H = 180; const P = 30;
  const x = (v) => P + (v / 100) * (W - P - 10);
  const y = (v) => H - P - (v / 100) * (H - P - 10);
  const mc = d.medians.creative ?? 50; const mm = d.medians.market ?? 50;
  const dots = ads.map((a) => `<g><circle cx="${x(a.creativeScore)}" cy="${y(a.marketSignal)}" r="${a.rank === 1 ? 8 : 6.5}" class="${a.rank === 1 ? 'dot win' : 'dot'}"/><text x="${x(a.creativeScore)}" y="${y(a.marketSignal) + 3}" class="dl">${a.rank}</text></g>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="scatter">
    <line x1="${x(mc)}" y1="10" x2="${x(mc)}" y2="${H - P}" class="med"/><line x1="${P}" y1="${y(mm)}" x2="${W - 10}" y2="${y(mm)}" class="med"/>
    <line x1="${P}" y1="${H - P}" x2="${W - 10}" y2="${H - P}" class="ax"/><line x1="${P}" y1="10" x2="${P}" y2="${H - P}" class="ax"/>
    <text x="${W - 12}" y="20" class="ql" text-anchor="end">Proven winner</text><text x="${P + 4}" y="20" class="ql">Study this</text>
    <text x="${W - 12}" y="${H - P - 6}" class="ql" text-anchor="end">Hidden gem</text><text x="${P + 4}" y="${H - P - 6}" class="ql">Retire</text>
    <text x="${(W + P) / 2}" y="${H - 8}" class="at" text-anchor="middle">Creative score →</text>
    <text x="10" y="${(H - P) / 2}" class="at" text-anchor="middle" transform="rotate(-90 10 ${(H - P) / 2})">Market signal →</text>
    ${dots}</svg>`;
};

// Time-to-product strip.
const revealStrip = () => {
  const rows = ads.filter((a) => A(a).productFirstSeenSec != null || A(a).brandFirstMentionSec != null);
  if (!rows.length) return '<p class="muted">Not enough timing data observed.</p>';
  const maxS = Math.max(15, ...rows.map((a) => Math.max(A(a).productFirstSeenSec || 0, A(a).brandFirstMentionSec || 0, a.durationS || 0)));
  const W = 300; const L = 34; const rowH = 14;
  const H = rows.length * rowH + 22;
  const x = (s) => L + (s / maxS) * (W - L - 8);
  const ticks = [0, 5, 10, 15, 20, 30, 45, 60].filter((t) => t <= maxS);
  return `<svg viewBox="0 0 ${W} ${H}" class="strip">${ticks.map((t) => `<line x1="${x(t)}" y1="4" x2="${x(t)}" y2="${H - 16}" class="grid"/><text x="${x(t)}" y="${H - 4}" class="at" text-anchor="middle">${t}s</text>`).join('')}
    ${rows.map((a, i) => { const yy = 10 + i * rowH; const p = A(a).productFirstSeenSec; const b = A(a).brandFirstMentionSec; return `<text x="0" y="${yy + 3}" class="at">#${a.rank}</text>${a.durationS ? `<line x1="${x(0)}" y1="${yy}" x2="${x(a.durationS)}" y2="${yy}" class="dur"/>` : ''}${b != null ? `<rect x="${x(b) - 3}" y="${yy - 3}" width="6" height="6" class="brand"/>` : ''}${p != null ? `<circle cx="${x(p)}" cy="${yy}" r="3.4" class="prod"/>` : ''}`; }).join('')}
  </svg><div class="legend"><span><i class="lg prod"></i>App/product first on screen</span><span><i class="lg brand"></i>Brand first named</span><span><i class="lg dur"></i>Video length</span></div>`;
};

const dimRows = (a) => Object.keys(DIM_LABEL).map((k) => `<div class="dim"><span>${DIM_LABEL[k]}</span>${bar(A(a).scores[k] ?? 0)}<b>${A(a).scores[k] ?? '–'}</b><em>${Math.round(weights.creative[k] * 100)}%</em></div>`).join('');

// ---------- PAGES ----------
const thesis = pf.uniqueCaptions < pf.uniqueCreatives
  ? `${pf.sampleSize} ads, ${pf.uniqueCreatives} different creatives, ${pf.uniqueCaptions} caption${pf.uniqueCaptions === 1 ? '' : 's'}. Score these ads on copy and most of them tie. So the workflow watched every video and judged the creative, not the caption.`
  : `${pf.sampleSize} ads analysed. Each creative was opened and judged on its own, not only on its caption.`;

const cover = `
<section class="page cover">
  <div class="cv-top"><span class="kicker">Ad Library Teardown · Meta · ${esc(cfg.country)}</span><span class="mono muted">${esc(generated)}</span></div>
  <div class="cv-mid">
    <div class="cv-brand">${esc(cfg.brand)}</div>
    <div class="cv-title">${esc(st.headline || '')}</div>
    <div class="cv-thesis"><div class="mono kicker">The one thing to know</div><p>${esc(thesis)}</p></div>
  </div>
  <div class="cv-stats">
    <div><b>${N}</b><span>ads scored</span></div>
    <div><b>${pf.reportedActiveAds ?? '–'}</b><span>active ads in library</span></div>
    <div><b>${pf.uniqueCreatives}</b><span>unique creatives</span></div>
    <div><b>${pf.uniqueCaptions}</b><span>unique captions</span></div>
    <div><b>${pf.pages.length}</b><span>Facebook pages</span></div>
  </div>
  <div class="cv-foot">
    <div><span class="muted">Source</span><span class="mono src">${esc(short(cfg.adLibraryUrl, 140))}</span></div>
    <div><span class="muted">Sample</span><span>Top ${N} active ads by Meta's ${cfg.impressionSorted ? 'impression' : esc(cfg.sortMode)} sort · ${pf.duplicatesRemoved} duplicates removed</span></div>
    <div><span class="muted">Pipeline</span><span>n8n · Apify · Gemini (video understanding) · deterministic scoring</span></div>
    ${cfg.preparedBy ? `<div><span class="muted">Prepared by</span><span>${esc(cfg.preparedBy)}</span></div>` : ''}
  </div>
</section>`;

const execSummary = `
<section class="page">
  ${runhead('01 Executive summary')}
  ${section('01', 'Executive summary', 'What the library is telling us', esc(st.headline || ''))}
  <ul class="bullets big">${st.executiveSummary.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
  <div class="kpis">
    <div><span>Best ad</span><b>${w ? n1(w.adStrengthIndex) : '–'}</b><em>Ad Strength Index</em></div>
    <div><span>Avg creative</span><b>${n1(ag.avgCreative)}</b><em>of 100</em></div>
    <div><span>Avg market signal</span><b>${n1(ag.avgMarket)}</b><em>of 100</em></div>
    <div><span>Product on screen</span><b>${ag.medianProductSec ?? '–'}${ag.medianProductSec != null ? 's' : ''}</b><em>median first reveal</em></div>
    <div><span>Sound-off ready</span><b>${ag.captionsShare}%</b><em>burned-in captions</em></div>
  </div>
  <div class="two">
    <div class="box">
      <div class="box-h">Portfolio, as observed</div>
      <table class="kv">
        <tr><td>Active ads reported</td><td>${pf.reportedActiveAds ?? '–'}</td></tr>
        <tr><td>Pages running ads (sample)</td><td>${pf.pages.map(esc).join('<br>')}</td></tr>
        <tr><td>Dynamic Creative share</td><td>${pf.dcoShare}/${pf.sampleSize}</td></tr>
        <tr><td>Caption languages</td><td>${pf.captionLanguages.map(esc).join(', ')}</td></tr>
        <tr><td>Destinations</td><td>${Object.entries(pf.destinations).map(([k, v]) => `${esc(k)} (${v})`).join(', ')}</td></tr>
        <tr><td>Placements</td><td>${pf.platforms.map(esc).join(', ')}</td></tr>
        ${pf.templateLeaks.length ? `<tr><td>Template leaks</td><td>${pf.templateLeaks.length} ads show raw <span class="mono">{{product.name}}</span> placeholders in the library</td></tr>` : ''}
      </table>
    </div>
    <div class="box">
      <div class="box-h">How to read this report</div>
      <p class="small">${tag('observed')} seen, heard or scraped directly.<br>${tag('inferred')} Gemini's judgement, always phrased as "likely".<br>${tag('estimated')} a score computed in n8n from the two above.</p>
      <p class="small">The ranking is estimated creative effectiveness from observable characteristics. It is not campaign performance — the Ad Library does not expose CTR, CPI or ROAS.</p>
      <div class="box-h" style="margin-top:4mm">Where the ads land</div>
      ${barsChart(ag.quadrants, N)}
    </div>
  </div>
</section>`;

const pipeline = ['Ad Library URL', 'Apify scrape', 'Normalize · dedupe · fingerprint', 'Gemini watches each video', 'Validate / repair JSON', 'Score in code', 'Rank + quadrant', 'Strategist memo', 'PDF'];
const methodology = `
<section class="page">
  ${runhead('02 Methodology')}
  ${section('02', 'Methodology', 'How the winner is picked', 'Gemini describes and grades. n8n does the maths. The same inputs always give the same ranking.')}
  <div class="flow">${pipeline.map((p, i) => `<div class="step"><span class="mono">${String(i + 1).padStart(2, '0')}</span>${esc(p)}</div>`).join('<div class="arrow">→</div>')}</div>
  <div class="two">
    <div class="box">
      <div class="box-h">Creative Score · 0–100 ${tag('estimated')}</div>
      <table class="weights">${Object.entries(weights.creative).map(([k, v]) => `<tr><td>${DIM_LABEL[k]}</td><td>${bar(v * 100, 20, 'thin')}</td><td class="mono">${Math.round(v * 100)}%</td></tr>`).join('')}</table>
      <p class="small muted">Each dimension is a 0–10 grade from Gemini against a written rubric with anchors. Weighted sum × 10. Missing grades are imputed at 5 and flagged.</p>
    </div>
    <div class="box">
      <div class="box-h">Market Signal · 0–100 ${tag('observed')}</div>
      <table class="weights">
        <tr><td>Impression rank in sample</td><td>${bar(weights.market.impressionRank * 100, 60, 'thin')}</td><td class="mono">${Math.round(weights.market.impressionRank * 100)}%</td></tr>
        <tr><td>Longevity (full at ${weights.longevityFullDays} days)</td><td>${bar(weights.market.longevity * 100, 60, 'thin')}</td><td class="mono">${Math.round(weights.market.longevity * 100)}%</td></tr>
        <tr><td>Distribution (placements + clones)</td><td>${bar(weights.market.distribution * 100, 60, 'thin')}</td><td class="mono">${Math.round(weights.market.distribution * 100)}%</td></tr>
      </table>
      <p class="small muted">Advertisers kill ads that lose money. An ad Meta ranks high on impressions, that has survived for weeks, or that has been re-uploaded as a clone is a revealed preference — the closest public proxy to "this one works". ${cfg.impressionSorted ? '' : '<b>This run was not impression-sorted, so rank is excluded and weights renormalised.</b>'}</p>
    </div>
  </div>
  <div class="formula mono">Ad Strength Index = ${weights.blend.creative} × Creative Score + ${weights.blend.market} × Market Signal</div>
  <div class="two">
    <div class="box"><div class="box-h">Quadrants</div><p class="small"><b>Proven winner</b> — above median on both. <b>Hidden gem</b> — strong creative the market hasn't backed yet: give it budget. <b>Study this</b> — the market likes it more than the rubric does: find what the rubric misses. <b>Retire</b> — below median on both.</p></div>
    <div class="box"><div class="box-h">Sampling & cleaning</div><p class="small">${pf.scrapedRows} rows scraped, ${pf.duplicatesRemoved} exact duplicates removed (same ad id or identical video assets), top ${N} kept in Meta's order. Video asset ids and durations were decoded from the CDN urls to separate ads that share a caption. ${ag.analysisModes.map((m) => `${m.count} × ${esc(m.label)}`).join(', ')}.${d.unscored.length ? ` ${d.unscored.length} ad(s) could not be scored and are listed at the end.` : ''}</p></div>
  </div>
</section>`;

const bestAd = !w ? '' : `
<section class="page">
  ${runhead('03 Best ad')}
  ${section('03', 'Best ad in the sample', `Ad ${w.adId} — ${A(w).hook.english ? short(A(w).hook.english, 70) : ''}`, 'Strongest ad in the sampled set based on our creative/conversion scoring framework, blended with observable market signals.')}
  <div class="best">
    <div class="best-l">${thumb(w, 'tall')}<a class="mono small" href="${esc(w.adLibraryUrl)}">View in Ad Library ↗</a><div class="small muted">${esc(w.pageName)}<br>Live since ${esc(w.startDate || '–')} · ${w.daysActive ?? '–'} days<br>${w.durationS ? `${w.durationS}s video · ` : ''}${esc(A(w).language)}</div></div>
    <div class="best-r">
      <div class="score-hero"><div><span class="mono kicker">Rank 1 of ${N}</span><b>${n1(w.adStrengthIndex)}</b><em>Ad Strength Index</em></div>
        <div class="sub"><div><span>Creative</span><b>${n1(w.creativeScore)}</b></div><div><span>Market</span><b>${n1(w.marketSignal)}</b></div><div><span>Quadrant</span>${pill(w.quadrant, quadClass(w.quadrant))}</div></div></div>
      <div class="dims">${dimRows(w)}</div>
      <div class="field"><label>Hook ${tag('observed')} ${pill(A(w).hook.type)}</label><p class="quote">${esc(A(w).hook.text)}</p>${A(w).hook.english !== A(w).hook.text ? `<p class="trans">${esc(A(w).hook.english)}</p>` : ''}</div>
      <div class="field"><label>First 3 seconds ${tag('observed')}</label><p>${esc(A(w).first3s.visual)}</p></div>
      <div class="field"><label>Body ${tag('observed')}</label><p>${esc(A(w).body)}</p></div>
      <div class="field"><label>CTA ${tag('observed')}</label><p>Said/shown: <b>${esc(A(w).cta.spoken)}</b> · Button: <b>${esc(w.cta)}</b></p></div>
    </div>
  </div>
  <div class="two">
    <div class="box"><div class="box-h">Why it wins</div><ul class="ev">${(st.winnerWhy.length ? st.winnerWhy : [{ point: 'Rubric', evidence: A(w).whyItWorks }]).map((x) => `<li><b>${esc(x.point)}</b><span>${esc(x.evidence)}</span></li>`).join('')}</ul></div>
    <div class="box"><div class="box-h">Steal this</div><ul class="bullets">${(st.winnerSteal || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul><div class="box-h" style="margin-top:3mm">Biggest leak ${tag('inferred')}</div><p class="small">${esc(A(w).weakness)}</p><div class="box-h" style="margin-top:3mm">Test next</div><p class="small">${esc(A(w).recommendation)}</p></div>
  </div>
</section>`;

const scoreboard = `
<section class="page">
  ${runhead('04 Scoreboard')}
  ${section('04', 'Ad scoreboard', 'All scored ads, ranked', 'Sorted by Ad Strength Index. Ties break on creative score, then on Meta\'s own order.')}
  <table class="board">
    <thead><tr><th>#</th><th></th><th>Ad</th><th>Hook</th><th class="r">Hook</th><th class="r">Offer</th><th class="r">CTA</th><th class="r">Creative</th><th class="r">Market</th><th class="r">Index</th></tr></thead>
    <tbody>${ads.map((a) => `<tr class="${a.rank === 1 ? 'win' : ''}">
      <td class="mono">${a.rank}</td><td>${thumb(a, 'mini')}</td>
      <td><b class="mono">${esc(a.adId)}</b><br><span class="muted">${esc(A(a).format)} · ${esc(short(A(a).language.split(/[,(]/)[0].trim(), 12))}${a.durationS ? ` · ${a.durationS}s` : ''}</span></td>
      <td><span class="muted">${esc(A(a).hook.type)} ·</span> ${esc(short(A(a).hook.english, 62))}</td>
      <td class="r mono">${A(a).scores.hookScore ?? '–'}</td><td class="r mono">${A(a).scores.offerScore ?? '–'}</td><td class="r mono">${A(a).scores.ctaScore ?? '–'}</td>
      <td class="r mono">${n1(a.creativeScore)}</td><td class="r mono">${n1(a.marketSignal)}</td><td class="r mono strong">${n1(a.adStrengthIndex)}<br><span class="qtag ${quadClass(a.quadrant)}">${esc(a.quadrant)}</span></td></tr>`).join('')}</tbody>
  </table>
  <div class="two" style="margin-top:4mm">
    <div class="box">${scatter()}</div>
    <div class="box"><div class="box-h">Reading the grid</div><p class="small">Numbers are ranks. Dashed lines are the sample medians (creative ${n1(d.medians.creative)}, market ${n1(d.medians.market)}).</p>
      ${ads.filter((a) => a.quadrant === 'Hidden gem').length ? `<p class="small"><b>Hidden gems:</b> ${ads.filter((a) => a.quadrant === 'Hidden gem').map((a) => `#${a.rank}`).join(', ')} — strong on paper, not yet backed by Meta's delivery. Cheapest wins to test.</p>` : ''}
      ${ads.filter((a) => a.quadrant === 'Study this').length ? `<p class="small"><b>Study this:</b> ${ads.filter((a) => a.quadrant === 'Study this').map((a) => `#${a.rank}`).join(', ')} — the market rewards something the rubric under-scores. Worth a frame-by-frame look.</p>` : ''}
      ${ag.cloneGroups.length ? `<p class="small"><b>Creative clones:</b> ${ag.cloneGroups.map((g) => g.join(' = ')).join('; ')} — same video uploaded under multiple ad ids, a sign the advertiser is scaling it.</p>` : ''}
    </div>
  </div>
</section>`;

const card = (a) => `
<article class="card">
  <div class="card-l">${thumb(a)}<div class="small muted mono">${esc(a.adId)}</div></div>
  <div class="card-r">
    <div class="card-h"><span class="mono kicker">Ad #${String(a.rank).padStart(2, '0')}</span><span class="muted small">${esc(a.pageName)} · ${esc(A(a).format)} · ${esc(A(a).language)}${a.durationS ? ` · ${a.durationS}s` : ''} · ${esc(a.analysisMode)}</span></div>
    <div class="chips"><span>Index <b>${n1(a.adStrengthIndex)}</b></span><span>Creative <b>${n1(a.creativeScore)}</b></span><span>Market <b>${n1(a.marketSignal)}</b></span>${pill(a.quadrant, quadClass(a.quadrant))}${a.sameCopy ? pill(`caption shared ×${a.copyGroupSize}`, 'ghost') : ''}${a.cloneOf.length ? pill(`clone of ${a.cloneOf.join(', ')}`, 'ghost') : ''}</div>
    <div class="grid3">
      <div class="field span2"><label>Hook · ${esc(A(a).hook.type)} · ${A(a).scores.hookScore ?? '–'}/10</label><p class="quote sm">${esc(A(a).hook.text)}</p>${A(a).hook.english !== A(a).hook.text ? `<p class="trans">${esc(A(a).hook.english)}</p>` : ''}</div>
      <div class="field"><label>CTA</label><p>${esc(A(a).cta.spoken)} <span class="muted">· "${esc(a.cta)}"</span></p><label>Offer</label><p>${esc(A(a).offer)}</p></div>
      <div class="field span3"><label>Body</label><p>${esc(A(a).body)}</p></div>
      <div class="field"><label>Angle · likely target</label><p>${esc(A(a).creativeAngle)} — <span class="muted">${esc(A(a).targetAudience)}</span></p></div>
      <div class="field"><label>Pain → outcome</label><p>${esc(A(a).painPoint)} → ${esc(A(a).desiredOutcome)}</p></div>
      <div class="field"><label>Why it works</label><p>${esc(A(a).whyItWorks)}</p></div>
      <div class="field"><label>Weakness</label><p>${esc(A(a).weakness)}</p></div>
      <div class="field span2 rec"><label>Recommendation</label><p>${esc(A(a).recommendation)}</p></div>
    </div>
  </div>
</article>`;

const individual = `
<section class="page flow-page">
  ${runhead('05 Individual ads')}
  ${section('05', 'Individual ad analysis', 'Every ad, one card each', 'Hook, body and CTA as observed in the creative; target, angle and verdicts are Gemini\'s inference.')}
  ${ads.map(card).join('')}
</section>`;

const hooks = `
<section class="page">
  ${runhead('06 Hooks')}
  ${section('06', 'Hook analysis', 'What happens in the first three seconds', esc(st.hookTakeaway || ''))}
  <div class="two">
    <div class="box"><div class="box-h">Hook types</div>${barsChart(ag.hookTypes, N)}<p class="small muted">Average hook score ${n1(ag.avgDims.hookScore)}/10.</p></div>
    <div class="box"><div class="box-h">Time to product ${tag('observed')}</div>${revealStrip()}<p class="small muted">Median product reveal ${ag.medianProductSec ?? '–'}s · median brand mention ${ag.medianBrandSec ?? '–'}s.</p></div>
  </div>
  <table class="board compact">
    <thead><tr><th>#</th><th>Opening visual</th><th>Hook (English)</th><th>Type</th><th class="r">Score</th></tr></thead>
    <tbody>${ads.map((a) => `<tr><td class="mono">${a.rank}</td><td>${esc(short(A(a).first3s.visual, 110))}</td><td>${esc(short(A(a).hook.english, 120))}</td><td>${esc(A(a).hook.type)}</td><td class="r mono">${A(a).scores.hookScore ?? '–'}</td></tr>`).join('')}</tbody>
  </table>
</section>`;

const ctas = `
<section class="page">
  ${runhead('07 CTAs')}
  ${section('07', 'CTA analysis', 'How each ad asks for the install', esc(st.ctaTakeaway || ''))}
  <div class="kpis three">
    <div><span>Button variety</span><b>${ag.ctaButtons.length}</b><em>${esc(ag.ctaButtons.map((c) => `"${c.label}" ×${c.count}`).join(', '))}</em></div>
    <div><span>Silent CTAs</span><b>${ag.spokenCtaNone}/${N}</b><em>never say what to do next</em></div>
    <div><span>Avg CTA score</span><b>${n1(ag.avgDims.ctaScore)}</b><em>of 10 · offer ${n1(ag.avgDims.offerScore)}</em></div>
  </div>
  <div class="box"><div class="box-h">Offers observed</div>${barsChart(ag.offers, N)}</div>
  <table class="board compact" style="margin-top:5mm">
    <thead><tr><th>#</th><th>Said / shown in the creative</th><th>Button</th><th>Note</th><th class="r">CTA</th></tr></thead>
    <tbody>${ads.map((a) => `<tr><td class="mono">${a.rank}</td><td>${esc(short(A(a).cta.spoken, 90))}</td><td>${esc(a.cta)}</td><td class="muted">${esc(short(A(a).cta.strengthNote, 110))}</td><td class="r mono">${A(a).scores.ctaScore ?? '–'}</td></tr>`).join('')}</tbody>
  </table>
</section>`;

const flagKeys = Object.keys(FLAG_SHORT);
const patterns = `
<section class="page">
  ${runhead('08 Creative patterns')}
  ${section('08', 'Creative patterns', 'What this advertiser keeps doing', '')}
  <div class="pgrid">${st.patterns.map((p) => `<div class="box"><div class="box-h">${esc(p.title)}</div><p class="small">${esc(p.insight)}</p><p class="ev-line">${esc(p.evidence)}</p></div>`).join('')}</div>
  <div class="three-col">
    <div class="box"><div class="box-h">Formats</div>${barsChart(ag.formats, N)}</div>
    <div class="box"><div class="box-h">Spoken language</div>${barsChart(ag.spokenLanguages, N)}</div>
    <div class="box"><div class="box-h">Talent</div>${barsChart(ag.talent, N)}</div>
  </div>
  <div class="box"><div class="box-h">Evidence grid — which ads use which lever ${tag('observed')}</div>
    <table class="matrix"><thead><tr><th></th>${flagKeys.map((k) => `<th><span>${FLAG_SHORT[k]}</span></th>`).join('')}</tr></thead>
    <tbody>${ads.map((a) => `<tr><td class="mono">#${a.rank}</td>${flagKeys.map((k) => `<td>${A(a).flags[k] ? '<i class="on"></i>' : '<i></i>'}</td>`).join('')}</tr>`).join('')}
    <tr class="tot"><td>Total</td>${flagKeys.map((k) => `<td class="mono">${ag.flags[k] || 0}</td>`).join('')}</tr></tbody></table>
  </div>
</section>`;

const gapsPage = `
<section class="page">
  ${runhead('09 Gaps')}
  ${section('09', 'Competitive gaps', 'What nobody in this sample is doing', 'Each gap starts from a count in the evidence grid, not from opinion.')}
  ${st.gaps.map((g, i) => `<div class="gap"><div class="gap-n mono">${String(i + 1).padStart(2, '0')}</div><div><h3>${esc(g.title)}</h3><p class="ev-line">${esc(g.evidence)}</p>${g.whyItMatters ? `<p class="small"><b>Why it matters.</b> ${esc(g.whyItMatters)}</p>` : ''}${g.opportunity ? `<p class="small opp"><b>Opportunity.</b> ${esc(g.opportunity)}</p>` : ''}</div></div>`).join('')}
</section>`;

const concepts = `
<section class="page flow-page">
  ${runhead('10 New concepts')}
  ${section('10', 'Three new ad concepts', 'Built on the gaps, not on the competitor\'s ads', '')}
  ${st.concepts.map((c, i) => `<article class="concept">
    <div class="concept-h"><span class="mono kicker">Concept ${i + 1}</span><h3>${esc(c.name)}</h3>${pill(`exploits: ${c.exploitsGap}`, 'ghost')}${pill(c.format)}</div>
    <div class="grid2">
      <div class="field"><label>Hook</label><p class="quote sm">${esc(c.hook)}</p>${c.hookEnglish && c.hookEnglish !== c.hook ? `<p class="trans">${esc(c.hookEnglish)}</p>` : ''}<label>Angle</label><p>${esc(c.angle)}</p></div>
      <div class="field"><label>Script</label><ol class="beats">${(c.script || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>
      <div class="field"><label>Caption</label><p>${esc(c.caption || c.body)}</p><label>CTA</label><p><b>${esc(c.cta)}</b></p></div>
      <div class="field"><label>Why it could work</label><p>${esc(c.whyItCouldWork)}</p><label>Measure · kill if</label><p>${esc(c.successMetric)} · <span class="muted">${esc(c.killCriteria)}</span></p></div>
    </div></article>`).join('')}
</section>`;

const recs = `
<section class="page">
  ${runhead('11 Recommendations')}
  ${section('11', 'Final recommendations', 'What I would do on Monday', '')}
  <table class="board recs"><thead><tr><th>Action</th><th>Why</th><th>Effort</th><th>Impact</th></tr></thead>
  <tbody>${st.recommendations.map((r) => `<tr><td><b>${esc(r.action)}</b></td><td>${esc(r.why)}</td><td>${pill(r.effort, 'ghost')}</td><td>${pill(r.impact, r.impact === 'High' ? 'hot' : 'ghost')}</td></tr>`).join('')}</tbody></table>
  <div class="kicker" style="margin-top:12mm">12 — Disclaimer & limitations</div>
  <div class="box disclaimer">
    <p><b>The ranking represents estimated creative effectiveness based on observable ad characteristics. It is not based on private campaign performance data.</b> The Meta Ad Library does not expose CTR, CPI, CPA, ROAS or spend for commercial ads in India.</p>
    <ul class="small">
      <li>Sample: top ${N} active ads by Meta's ${cfg.impressionSorted ? 'impression' : esc(cfg.sortMode)} sort out of ${pf.reportedActiveAds ?? 'an unknown number of'} reported. Patterns describe this sample, not the whole account.</li>
      <li>Creative grades come from Gemini against a fixed rubric; they are judgements and can vary slightly between runs. Weights, ranks, medians and gaps are deterministic.</li>
      <li>Market Signal uses public behaviour (sort order, run length, placements, clones) as a proxy for advertiser confidence. It can be wrong for new ads or ads paused for reasons unrelated to results.</li>
      <li>Dynamic Creative ads hold several variants; the first video variant was analysed. Creative URLs from Meta expire after a few days, so thumbnails in older copies of this report may not load.</li>
      ${d.unscored.length ? `<li>Not scored: ${d.unscored.map((u) => `${esc(u.adId)} (${esc(short(u.reason, 60))})`).join('; ')}.</li>` : ''}
      <li>Strategist memo source: ${esc(d.strategySource)}. Generated ${esc(generated)}.</li>
    </ul>
  </div>
</section>`;

const CSS = `
@page{size:A4;margin:12mm 0}
@page:first{margin:0}
:root{--ink:#121417;--ink2:#33383F;--muted:#6B7280;--line:#E4E6EA;--soft:#F5F6F8;--accent:#E4572E;--accentSoft:#FBE9E3}
*{box-sizing:border-box}
html,body{margin:0;background:#fff;color:var(--ink);font-family:'IBM Plex Sans','Noto Sans Tamil','Noto Sans Kannada','Noto Sans Devanagari','Noto Sans Telugu','Noto Sans Bengali','Noto Sans Malayalam',sans-serif;font-size:9.2pt;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:210mm;padding:0 15mm;page-break-after:always;break-after:page}
.cover{height:297mm;padding:18mm 16mm;display:flex;flex-direction:column}
.mono{font-family:'IBM Plex Mono',monospace}.muted{color:var(--muted)}.small{font-size:8.4pt}.strong{font-weight:600}
.kicker{font:500 7.2pt 'IBM Plex Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-bottom:1.5mm}
.runhead{display:flex;justify-content:space-between;font:500 7pt 'IBM Plex Mono',monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--line);padding:2mm 0 2.5mm;margin-bottom:7mm}
h2{font-size:16pt;font-weight:600;letter-spacing:-.01em;margin:0 0 2mm;line-height:1.2}
h3{font-size:10.5pt;font-weight:600;margin:0 0 1mm}
.lede{color:var(--ink2);font-size:10pt;max-width:165mm;margin:0 0 6mm}
.cv-top{display:flex;justify-content:space-between}
.cv-mid{margin-top:46mm}
.cv-brand{font-size:40pt;font-weight:600;letter-spacing:-.02em;line-height:1}
.cv-title{font-size:17pt;font-weight:300;line-height:1.3;margin-top:6mm;max-width:160mm;color:var(--ink2)}
.cv-thesis{margin-top:14mm;border-left:3px solid var(--accent);padding:1mm 0 1mm 5mm;max-width:150mm}
.cv-thesis p{font-size:11pt;margin:1mm 0 0}
.cv-stats{display:grid;grid-template-columns:repeat(5,1fr);border-top:1px solid var(--ink);border-bottom:1px solid var(--line);margin-top:auto;padding:5mm 0}
.cv-stats b{display:block;font:500 20pt 'IBM Plex Mono',monospace}.cv-stats span{font-size:7.8pt;color:var(--muted)}
.cv-foot{margin-top:6mm;display:grid;gap:1.5mm;font-size:8pt}
.cv-foot div{display:grid;grid-template-columns:28mm 1fr}.src{word-break:break-all;font-size:7pt}
.bullets{padding-left:4.5mm;margin:0 0 4mm}.bullets li{margin:0 0 1.6mm}.bullets.big li{font-size:10.2pt;margin-bottom:2.4mm}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);border-top:1px solid var(--ink);border-bottom:1px solid var(--line);margin:4mm 0 6mm}
.kpis.three{grid-template-columns:repeat(3,1fr)}
.kpis div{padding:3.5mm 3mm 3.5mm 0}.kpis span{display:block;font-size:7.6pt;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.kpis b{display:block;font:500 17pt 'IBM Plex Mono',monospace;margin:1mm 0}.kpis em{font-style:normal;font-size:7.6pt;color:var(--muted)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-bottom:5mm}
.three-col{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4mm;margin:4mm 0}
.pgrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:3.5mm}.pgrid .box p{font-size:7.8pt}.pgrid .ev-line{font-size:7pt}
.box{border:1px solid var(--line);border-radius:2mm;padding:3.5mm 4mm;break-inside:avoid}
.box-h{font-weight:600;font-size:8.6pt;margin-bottom:2mm;display:flex;gap:2mm;align-items:center}
.kv{width:100%;border-collapse:collapse;font-size:8.2pt}.kv td{border-top:1px solid var(--line);padding:1.4mm 0;vertical-align:top}.kv td:first-child{color:var(--muted);width:42%}
.tag{font:500 6.4pt 'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:.05em;padding:.3mm 1.4mm;border-radius:1mm;vertical-align:1px}
.tag-observed{background:#E8F1EC;color:#22603A}.tag-inferred{background:#F3EDE2;color:#7A5517}.tag-estimated{background:var(--accentSoft);color:#A53A18}
.pill{display:inline-block;font-size:7.2pt;padding:.4mm 2mm;border-radius:3mm;background:var(--soft);color:var(--ink2);margin:0 1mm 1mm 0;white-space:nowrap}
.pill.q1{background:var(--ink);color:#fff}.pill.q2{background:var(--accentSoft);color:#A53A18}.pill.q3{background:#ECEFF4;color:#334}.pill.q4{background:#fff;border:1px solid var(--line);color:var(--muted)}
.pill.ghost{background:#fff;border:1px solid var(--line)}.pill.hot{background:var(--accent);color:#fff}
.bar{display:inline-block;height:1.6mm;background:var(--soft);border-radius:1mm;overflow:hidden;width:100%}.bar i{display:block;height:100%;background:var(--accent)}
.bar.thin{height:1.2mm}.bar.thin i{background:var(--ink)}
.hbars .hb{display:grid;grid-template-columns:38% 1fr 6mm;gap:2mm;align-items:center;font-size:8pt;margin-bottom:1.3mm}
.hb-l{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hb-t{height:2.4mm;background:var(--soft);border-radius:1mm;overflow:hidden}.hb-t i{display:block;height:100%;background:var(--ink)}.hb-v{font-family:'IBM Plex Mono';text-align:right}
.flow{display:flex;flex-wrap:wrap;align-items:center;gap:1.5mm;margin-bottom:6mm}
.step{border:1px solid var(--line);border-radius:1.5mm;padding:1.6mm 2.4mm;font-size:7.8pt;background:var(--soft)}.step span{color:var(--accent);margin-right:1.4mm;font-size:7pt}
.arrow{color:var(--muted);font-size:8pt}
.weights{width:100%;border-collapse:collapse;font-size:8.2pt}.weights td{padding:1.1mm 0}.weights td:first-child{width:46%}.weights td:nth-child(2){padding:0 3mm}.weights td:last-child{text-align:right;width:10mm}
.formula{background:var(--ink);color:#fff;padding:3.5mm 4mm;border-radius:2mm;font-size:9pt;margin-bottom:5mm}
.best{display:grid;grid-template-columns:58mm 1fr;gap:7mm;margin-bottom:5mm}
.best-l{display:flex;flex-direction:column;gap:2mm}
.thumb{background:var(--soft);border-radius:2mm;overflow:hidden;aspect-ratio:9/16;width:100%}.thumb img{width:100%;height:100%;object-fit:cover;display:block}
.thumb.tall{width:58mm}.thumb.mini{width:6mm;border-radius:1mm}.thumb.ph{display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:7pt}
.score-hero{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid var(--line);padding-bottom:3mm;margin-bottom:3mm}
.score-hero b{display:block;font:500 34pt 'IBM Plex Mono',monospace;line-height:1;color:var(--accent)}.score-hero em{font-style:normal;font-size:8pt;color:var(--muted)}
.score-hero .sub{display:flex;gap:5mm}.score-hero .sub span{display:block;font-size:7.4pt;color:var(--muted)}.score-hero .sub b{font-size:13pt;color:var(--ink)}
.dims{display:grid;grid-template-columns:1fr 1fr;gap:1mm 6mm;margin-bottom:3mm}
.dim{display:grid;grid-template-columns:24mm 1fr 5mm 7mm;gap:2mm;align-items:center;font-size:7.8pt}.dim b{font-family:'IBM Plex Mono';text-align:right}.dim em{font-style:normal;color:var(--muted);font-size:7pt;text-align:right}
.field{margin-bottom:2.4mm}.field label{display:block;font:500 6.8pt 'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 .8mm}
.field p{margin:0 0 1.4mm}
.quote{font-size:11pt;font-weight:500;border-left:2px solid var(--accent);padding-left:3mm}.quote.sm{font-size:9.2pt}
.trans{color:var(--muted);font-style:italic;padding-left:3.5mm}
.ev{list-style:none;padding:0;margin:0}.ev li{border-top:1px solid var(--line);padding:1.6mm 0;font-size:8.4pt}.ev li b{display:block}.ev li span{color:var(--ink2)}
.ev-line{font:400 7.6pt 'IBM Plex Mono',monospace;color:var(--muted);margin:1mm 0 0}
.board{width:100%;border-collapse:collapse;font-size:7.9pt}
.board th{font:500 6.8pt 'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);text-align:left;border-bottom:1px solid var(--ink);padding:1.4mm 1.6mm}
.board td{border-bottom:1px solid var(--line);padding:1.2mm 1.6mm;vertical-align:top}.board .r{text-align:right}.board tr.win td{background:var(--accentSoft)}
.board.compact td{padding:1.3mm 1.6mm}
.scatter,.strip{width:100%;height:auto}
.scatter .ax{stroke:var(--ink);stroke-width:.8}.scatter .med{stroke:var(--muted);stroke-dasharray:3 3;stroke-width:.6}
.scatter .dot{fill:#fff;stroke:var(--ink);stroke-width:1}.scatter .dot.win{fill:var(--accent);stroke:var(--accent)}
.scatter .dl{font:500 6.5px 'IBM Plex Mono';text-anchor:middle;fill:var(--ink)}.ql{font:500 6.5px 'IBM Plex Sans';fill:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.at{font:400 6.5px 'IBM Plex Mono';fill:var(--muted)}
.strip .grid{stroke:var(--line);stroke-width:.6}.strip .dur{stroke:#D5D8DD;stroke-width:2}.strip .prod{fill:var(--accent)}.strip .brand{fill:var(--ink)}
.legend{display:flex;gap:4mm;font-size:7pt;color:var(--muted);margin-top:1mm}.lg{display:inline-block;width:2.4mm;height:2.4mm;margin-right:1mm;vertical-align:-1px}
.lg.prod{background:var(--accent);border-radius:50%}.lg.brand{background:var(--ink)}.lg.dur{background:#D5D8DD;height:1mm;vertical-align:1px}
.card{display:grid;grid-template-columns:24mm 1fr;gap:4.5mm;border-top:1px solid var(--ink);padding:3.5mm 0 2mm;break-inside:avoid}
.card-l .thumb{width:24mm}.card-l .mono{font-size:6.2pt;margin-top:1mm}.card-h{display:flex;gap:3mm;align-items:baseline;margin-bottom:1.5mm}
.chips{margin-bottom:2mm;font-size:7.8pt}.chips>span:not(.pill){margin-right:3.5mm}.chips b{font-family:'IBM Plex Mono'}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 6mm}.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 4.5mm}.span2{grid-column:span 2}.span3{grid-column:span 3}
.field.rec p{background:var(--soft);padding:1.6mm 2.4mm;border-radius:1.4mm}
.card .field p{font-size:7.7pt;line-height:1.38}.card .field{margin-bottom:1.6mm}.card .quote.sm{font-size:8.6pt}
.qtag{display:inline-block;font:500 6pt 'IBM Plex Sans';text-transform:uppercase;letter-spacing:.04em;color:var(--muted);white-space:nowrap}.qtag.q1{color:var(--ink)}.qtag.q2{color:#A53A18}
.matrix{border-collapse:collapse;font-size:7.6pt;width:100%}
.matrix th{height:19mm;vertical-align:bottom;padding:0}.matrix th span{display:inline-block;transform:rotate(-55deg);transform-origin:left bottom;white-space:nowrap;margin-left:2mm;font-weight:500;font-size:7pt;color:var(--ink2)}
.matrix td{text-align:center;border-bottom:1px solid var(--line);padding:1mm}.matrix td:first-child{text-align:left;width:12mm}
.matrix i{display:inline-block;width:2.6mm;height:2.6mm;border-radius:50%;border:1px solid var(--line)}.matrix i.on{background:var(--ink);border-color:var(--ink)}
.matrix tr.tot td{border-top:1px solid var(--ink);font-weight:600}
.gap{display:grid;grid-template-columns:12mm 1fr;gap:3mm;border-top:1px solid var(--line);padding:4mm 0;break-inside:avoid}
.gap-n{font-size:16pt;color:var(--accent)}.opp{background:var(--accentSoft);padding:1.6mm 2.4mm;border-radius:1.4mm}
.concept{border:1px solid var(--line);border-radius:2mm;padding:4mm 4.5mm;margin-bottom:5mm;break-inside:avoid}
.concept-h{display:flex;flex-wrap:wrap;gap:2mm;align-items:baseline;margin-bottom:2.5mm}.concept-h h3{margin:0 2mm 0 0;font-size:11.5pt}
.beats{padding-left:4mm;margin:0;font-size:8.2pt}.beats li{margin-bottom:.8mm}
.recs td:first-child{width:34%}
.disclaimer p{margin:0 0 2mm}
`;

const FONTS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&family=Noto+Sans+Bengali&family=Noto+Sans+Devanagari&family=Noto+Sans+Kannada&family=Noto+Sans+Malayalam&family=Noto+Sans+Tamil&family=Noto+Sans+Telugu&display=swap';
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(cfg.brand)} — Ad Library Teardown</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="${FONTS}" rel="stylesheet"><style>${CSS}</style></head>
<body>${cover}${execSummary}${methodology}${bestAd}${scoreboard}${individual}${hooks}${ctas}${patterns}${gapsPage}${concepts}${recs}</body></html>`;

const slug = String(cfg.brand).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'advertiser';
const fileName = `${slug}-ad-intelligence-report-${cfg.runStartedAt.slice(0, 10)}`;

return [{
  json: {
    fileName,
    html,
    summary: {
      brand: cfg.brand,
      adsScored: N,
      winner: w ? { adId: w.adId, adStrengthIndex: w.adStrengthIndex, creativeScore: w.creativeScore, marketSignal: w.marketSignal, hook: A(w).hook, cta: A(w).cta, body: A(w).body, adLibraryUrl: w.adLibraryUrl } : null,
      ranking: ads.map((a) => ({ rank: a.rank, adId: a.adId, index: a.adStrengthIndex, creative: a.creativeScore, market: a.marketSignal, quadrant: a.quadrant, hookType: A(a).hook.type, hook: A(a).hook.english })),
      gaps: st.gaps.map((g) => g.title),
      strategySource: d.strategySource,
    },
  },
}];
