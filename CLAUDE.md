# Ad Library Teardown — notes for Claude Code

This repo turns a Meta (Facebook) Ad Library search link into a ranked creative teardown: scrape the top ads with Apify, have Gemini watch each video, score them deterministically, and write an HTML + PDF report.

The same pipeline exists twice:
- **n8n**: `workflow/mysivi-facebook-ad-intelligence.json` (import into n8n; see README "Setup").
- **Local / Claude Code**: `runner/teardown.mjs` runs the *same* Code-node files from `src/` through a small shim that provides n8n's `$input` and `$('Node name')`. Keep `src/` as the single source of truth: edit logic there, never fork it into the runner.

## Running a teardown

1. `.env` must contain `APIFY_TOKEN` and `GEMINI_API_KEY` (copy `.env.example`). Never print, log or commit these values. If `.env` is missing, ask the user to create it themselves; don't ask them to paste keys into chat.
2. Run:
   ```bash
   node runner/teardown.mjs --url "<Ad Library search link>" --brand "<Brand>" --ads 5 --by "<Name>"
   ```
   - The link must be a **search or page** link (`?q=…` or `?view_all_page_id=…`), not a single ad (`?id=…`). Build one with `active_status=active`, the right `country`, and `sort_data[mode]=total_impressions` so the impression-rank signal is valid.
   - `--ads` is clamped to 3–15. Each ad takes about 25–45 s (video upload + 8 s free-tier pacing).
   - `--scrape-file demo/apify-sample-response.json` replays a saved MySivi scrape with no Apify cost. Meta CDN links in it expire, so video analysis on old samples may fall back to copy-only.
3. Outputs land in `output/`: `<brand>-ad-intelligence-report-<date>.html|.pdf|.json` plus the raw `apify-response.json`.
4. After a run, summarise for the user: winner (id, index, hook), how many ads were watched vs. fell back, the counted gaps, and the three concepts. Quote numbers from the `.json`; don't recompute them.

## Rules that keep the analysis honest
- The ranking is **estimated creative effectiveness**, never performance. Don't claim CTR, installs, ROAS, "best performing" or "dominates".
- Creative Score (rubric) and Market Signal (observed library behaviour) are different scales. Don't compare one with the other.
- Weights, ranks, medians, clones and gap counts come from `src/14-score-rank-find-gaps.js`. Change them there, and update the README scoring table in the same change.

## Gemini models
Defaults: `gemini-3.5-flash-lite` (video), `gemini-3.1-flash-lite` (repair), `gemini-3-flash-preview` (memo), `gemini-3.5-flash-lite` (memo backup). Override with `GEMINI_*_MODEL` env vars. On *"too many requests"* the free daily quota for that model is used up: switch models, don't retry in a loop.

## Layout
```
runner/teardown.mjs     local runner (Node 18+, no dependencies)
src/                    n8n Code-node logic + strategist prompt (shared by n8n and the runner)
workflow/               importable n8n workflow (credential names only, no secrets)
report/                 submitted MySivi report (n8n execution #11)
demo/                   sample input/output, saved Apify response, Duolingo run
```
