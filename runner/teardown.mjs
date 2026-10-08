#!/usr/bin/env node
// Runs the Ad Library teardown without n8n: same Apify actor, same Gemini
// prompts and the exact Code-node files from ../src, executed through a tiny
// shim that provides n8n's $input / $('Node name') helpers.
//
//   node runner/teardown.mjs --url "<Ad Library search link>" --brand MySivi --ads 5
//
// Needs APIFY_TOKEN and GEMINI_API_KEY (in the environment or a .env file).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

// ---------- config ----------
loadDotEnv(join(ROOT, '.env'));
const args = parseArgs(process.argv.slice(2));
if (args.help || (!args.url && !args['scrape-file'])) {
  console.log(`Usage: node runner/teardown.mjs --url "<facebook.com/ads/library search link>" [--brand Name] [--ads 3-15] [--by "Your name"] [--out output]
Options:
  --scrape-file <path>   reuse a saved Apify response instead of scraping (no Apify credit used)
  --no-pdf               skip the Chrome PDF step and keep the HTML only
Env: APIFY_TOKEN, GEMINI_API_KEY, optional GEMINI_VIDEO_MODEL, GEMINI_REPAIR_MODEL, GEMINI_STRATEGY_MODEL, GEMINI_BACKUP_MODEL, PACE_SECONDS`);
  process.exit(args.help ? 0 : 1);
}
const MODELS = {
  video: process.env.GEMINI_VIDEO_MODEL || 'gemini-3.5-flash-lite',
  repair: process.env.GEMINI_REPAIR_MODEL || 'gemini-3.1-flash-lite',
  strategy: process.env.GEMINI_STRATEGY_MODEL || 'gemini-3-flash-preview',
  backup: process.env.GEMINI_BACKUP_MODEL || 'gemini-3.5-flash-lite',
};
const PACE_MS = Number(process.env.PACE_SECONDS || 8) * 1000;
if (!process.env.GEMINI_API_KEY) fail('GEMINI_API_KEY is not set. Copy .env.example to .env and add your free key from aistudio.google.com/apikey');
const OUT = resolve(args.out || join(ROOT, 'output'));
mkdirSync(OUT, { recursive: true });
const log = (...m) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...m);

// ---------- n8n Code-node shim ----------
const outputs = {};
const code = (file) => readFileSync(join(SRC, file), 'utf8');
async function runNode(name, file, items, patch = (s) => s) {
  const $input = { all: () => items, first: () => items[0] };
  const $ = (n) => {
    if (!outputs[n]) throw new Error(`Node "${n}" has no output yet`);
    return { first: () => outputs[n][0], all: () => outputs[n], itemMatching: (i) => outputs[n][i] };
  };
  const fn = new Function('$input', '$', `return (async () => {\n${patch(code(file))}\n})()`);
  const result = await fn($input, $);
  outputs[name] = result;
  return result;
}

// ---------- Gemini REST ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function gemini(model, { prompt, system, video, json = true, temperature = 0.2, maxTokens = 8192 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { error: 'GEMINI_API_KEY is not set' };
  const parts = [];
  if (video) parts.push({ inline_data: { mime_type: 'video/mp4', data: video } });
  parts.push({ text: prompt });
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature, maxOutputTokens: maxTokens, ...(json ? { responseMimeType: 'application/json' } : {}) },
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data;
      const msg = data.error?.message || `HTTP ${res.status}`;
      if (![429, 500, 503].includes(res.status) || attempt === 3) return { error: `${model}: ${msg}` };
      log(`   ${model} busy (${res.status}), retry ${attempt}/2`);
    } catch (e) {
      if (attempt === 3) return { error: `${model}: ${e.message}` };
    }
    await sleep(5000 * attempt);
  }
  return { error: `${model}: no response` };
}

async function downloadVideo(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 18 * 1024 * 1024) return null; // inline limit is 20 MB per request
    return buf.toString('base64');
  } catch (e) { return null; }
}

// ---------- pipeline ----------
const t0 = Date.now();
const form = { 'Ad Library URL': args.url || 'https://www.facebook.com/ads/library/?q=offline', 'Brand / competitor name': args.brand || '', 'Ads to analyse (3-15)': Number(args.ads || 8), 'Prepared by': args.by || '' };

const [cfgItem] = await runNode('02 — Validate & Parse URL', '02-validate-and-parse-url.js', [{ json: form }]);
const cfg = cfgItem.json;
if (!cfg.valid) fail(`${cfg.error} ${cfg.reason}`);
log(`Brand ${cfg.brand} · ${cfg.country} · ${cfg.maxAds} ads · impression-sorted: ${cfg.impressionSorted}`);

let raw;
if (args['scrape-file']) {
  raw = readFileSync(resolve(args['scrape-file']), 'utf8');
  log(`Using saved scrape ${args['scrape-file']}`);
} else {
  if (!process.env.APIFY_TOKEN) fail('APIFY_TOKEN is not set (see .env.example)');
  log('Scraping the Ad Library with Apify…');
  const res = await fetch(`https://api.apify.com/v2/acts/${cfg.apifyActor}/run-sync-get-dataset-items?timeout=170`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.APIFY_TOKEN}` },
    body: JSON.stringify({ urls: [{ url: cfg.adLibraryUrl }], count: cfg.fetchCount, limitPerSource: cfg.fetchCount, scrapeAdDetails: false, 'scrapePageAds.activeStatus': 'active', 'scrapePageAds.countryCode': cfg.country }),
  });
  raw = await res.text();
  if (!res.ok) fail(`Unable to retrieve ads. Apify said: ${raw.slice(0, 300)}`);
  writeFileSync(join(OUT, 'apify-response.json'), raw);
}

const normalized = await runNode('05 — Normalize, Clean & Fingerprint', '05-normalize-clean-fingerprint.js', [{ json: { raw } }]);
if (normalized[0].json.noAds) fail(`No ads were found for this query. ${normalized[0].json.scraperError || ''}`);
log(`${normalized.length} ads kept · ${normalized[0].json.portfolio.reportedActiveAds ?? '?'} active in library · ${normalized[0].json.portfolio.uniqueCaptions} captions / ${normalized[0].json.portfolio.uniqueCreatives} creatives`);

const analysed = [];
for (const [i, item] of normalized.entries()) {
  const [briefItem] = await runNode('08 — Build Analysis Brief', '08-build-analysis-brief.js', [item]);
  const ad = briefItem.json;
  log(`(${i + 1}/${normalized.length}) ${ad.adId} · ${ad.mediaType}${ad.durationS ? ` ${ad.durationS}s` : ''}`);

  let response;
  if (ad.route === 'video') {
    const video = await downloadVideo(ad.videoUrl);
    response = video ? await gemini(MODELS.video, { prompt: ad.prompt, video, json: false }) : { error: 'video download failed or too large' };
  } else {
    response = await gemini(MODELS.video, { prompt: ad.promptCopyOnly });
  }
  let [checked] = await runNode('11 — Validate AI JSON', '11-validate-ai-json.js', [{ json: response }]);

  if (!checked.json.aiValid) {
    log(`   first pass failed (${checked.json.aiError}); repairing with ${MODELS.repair}`);
    const prompt = `The previous attempt failed (${checked.json.aiError}). Its raw output, possibly empty or truncated, was:\n<<<\n${checked.json.aiRaw || ''}\n>>>\nIf that output contains a usable analysis, repair it into valid JSON. Otherwise redo the task below from the copy only.\n\n${ad.promptCopyOnly}`;
    const repaired = await gemini(MODELS.repair, { prompt, temperature: 0.1 });
    [checked] = await runNode('12b — Parse Repaired JSON', '11-validate-ai-json.js', [{ json: repaired }],
      (s) => s.replace("'08 — Build Analysis Brief'", "'11 — Validate AI JSON'").replace("const ATTEMPT = 'first'", "const ATTEMPT = 'repair'"));
  }
  log(`   ${checked.json.aiValid ? `${checked.json.analysisMode} · hook: "${String(checked.json.analysis.hook.english).slice(0, 70)}"` : `not scored: ${checked.json.aiError}`}`);
  analysed.push(checked);
  if (i < normalized.length - 1) await sleep(PACE_MS);
}

const [scoredItem] = await runNode('14 — Score, Rank & Find Gaps', '14-score-rank-find-gaps.js', analysed);
const scored = scoredItem.json;
log(scored.winner ? `Scored ${scored.ads.length} · winner ${scored.winner.adId} (index ${scored.winner.adStrengthIndex})` : `Scored 0 of ${analysed.length} ads; the report will list why`);

log(`Writing the strategist memo with ${MODELS.strategy}…`);
const system = code('15-strategist-system-prompt.txt');
let memo = await gemini(MODELS.strategy, { prompt: scored.strategistPrompt, system, temperature: 0.5, maxTokens: 12000 });
if (memo.error) {
  log(`   ${memo.error}; using backup ${MODELS.backup}`);
  memo = await gemini(MODELS.backup, { prompt: scored.strategistPrompt, system, temperature: 0.5, maxTokens: 12000 });
}
const [final] = await runNode('16 — Validate Strategy JSON', '16-validate-strategy-json.js', [{ json: memo }]);
const [report] = await runNode('17 — Build Report (HTML)', '17-build-report-html.js', [final]);

const base = join(OUT, report.json.fileName);
writeFileSync(`${base}.html`, report.json.html);
writeFileSync(`${base}.json`, JSON.stringify({ summary: report.json.summary, ...final.json }, null, 2));
log(`HTML  ${base}.html`);
if (!args['no-pdf']) {
  const pdf = printPdf(`${base}.html`, `${base}.pdf`);
  log(pdf ? `PDF   ${pdf}` : 'PDF   skipped (Chrome/Chromium not found; open the HTML and print to PDF)');
}
log(`Done in ${Math.round((Date.now() - t0) / 1000)}s · memo: ${final.json.strategySource}`);

// ---------- helpers ----------
function printPdf(htmlPath, pdfPath) {
  const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  const chrome = candidates.find((p) => existsSync(p));
  if (!chrome) return null;
  const r = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=20000', `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`], { stdio: 'ignore' });
  return r.status === 0 && existsSync(pdfPath) ? pdfPath : null;
}
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true; else { out[key] = next; i += 1; }
  }
  return out;
}
function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
function fail(msg) { console.error(`✖ ${msg}`); process.exit(1); }
