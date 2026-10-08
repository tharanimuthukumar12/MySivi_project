# Ad Library Teardown

An n8n workflow that takes any Meta Ad Library link, scrapes the top running ads with Apify, has Gemini **watch** every video, scores each creative with a fixed rubric computed in code, and returns a ranked PDF teardown: best ad, scoreboard, hook and CTA breakdowns, counted creative gaps, and three new ad concepts to test.

Built for the MySivi Growth & AI Marketing assignment, run on MySivi's own Ad Library.

---

## The one decision that shaped everything

The first scrape returned 15 MySivi ads. When I lined them up, **15 ads had only 3 different captions**. Eleven of them say the same thing word for word (*"Speak English fluently with the power of AI… Start your trial now at just ₹1"*).

Every ad is a Dynamic Creative video. The caption is shared; the **video** is what's being tested. A workflow that reads captions would score 11 of 15 ads identically and "pick a winner" from a tie.

So this workflow:

1. decodes each video's asset id and duration from Meta's CDN url, to prove the creatives really are different;
2. sends the **video itself** to Gemini, which transcribes the first 3 seconds, the spoken CTA, when the app first appears on screen, and which persuasion levers the ad uses;
3. ranks on what's in the video, not on the caption.

---

## Architecture

```text
Form: Ad Library URL ─► 02 Validate & parse ─► 04 Apify scrape ─► 05 Normalize · dedupe · fingerprint
                                                                          │
                       ┌──────────────── 07 Loop (one ad at a time) ◄─────┘
                       │
                       ├─► 08 Build brief ─► 09 Route: video / image / copy
                       │        ─► 10a Gemini watches video  (10b image, 10c copy-only)
                       │        ─► 11 Validate JSON ─► 12 valid? ── no ─► 12a repair ─► 12b parse
                       │        ─► 13 Pace 8 s (free-tier rate limit) ─► back to loop
                       │
                       └─► 14 Score · rank · quadrant · count gaps   (pure code, deterministic)
                           ─► 15 Gemini strategist memo (explains, never re-scores) ─(error)► 15b backup model
                           ─► 16 Validate memo (deterministic fallback if Gemini fails)
                           ─► 17 Build HTML report ─► 18 PDF.co ─► 19 PDF opens in the browser
```

Failure exits, each ending on a readable form page:

| Situation | What the user sees |
|---|---|
| Not an Ad Library link | `Invalid Facebook Ad Library URL.` plus the reason |
| Apify error / timeout | `Unable to retrieve ads. Please retry.` |
| Zero ads | `No ads were found for this query.` |
| Gemini 503 / bad JSON | Retried, then repaired by a second model, then re-run on copy only. The ad is still scored and its card says which mode was used. |
| Strategist fails | Backup model takes over; if that fails too, the report ships with the deterministic findings |
| PDF.co fails | HTML report rendered directly in the browser |

---

## Scoring: AI grades, code decides

Gemini returns 0–10 sub-scores against a written rubric with anchors ("9–10 = stops the scroll inside 2 s *and* is instantly relevant…"). It never picks the winner.

**Creative Score (0–100), computed in node 14**

| Dimension | Weight |
|---|---|
| Hook strength | 20% |
| Message clarity | 15% |
| Value proposition | 15% |
| Offer strength | 15% |
| CTA strength | 10% |
| Specificity | 10% |
| Creative angle | 10% |
| Conversion intent | 5% |

`creativeScore = Σ (subScore × weight × 10)`. A missing grade is imputed at 5 and flagged.

**Market Signal (0–100): observed, not guessed**

The Ad Library hides CTR and spend, but it does show what the advertiser *does*. Advertisers kill ads that lose money, so the ads Meta keeps delivering are revealed preferences.

| Signal | Weight | Source |
|---|---|---|
| Impression rank in sample | 50% | The URL is sorted by `total_impressions`; position is Meta's own ordering |
| Longevity | 30% | Days live, full credit at 30 days |
| Distribution | 20% | Placements + the same creative re-uploaded under other ad ids (clones) |

If the link isn't impression-sorted, rank is dropped and the weights renormalise.

**Ad Strength Index = 0.7 × Creative Score + 0.3 × Market Signal**

The two scores are also split into a 2×2 grid:

- **Proven winner**: above the median on both
- **Hidden gem**: strong creative that Meta isn't pushing yet → test with budget
- **Study this**: the market likes it more than the rubric does → find what the rubric misses
- **Retire**: below the median on both

**Gaps are counted, not written.** Node 14 counts which levers each ad uses (social proof, comparison, before/after, urgency, objection handling, learner story, price on screen…), plus CTA and offer monoculture, late product reveal, sound-off readiness and language coverage. A lever used by ≤ 25% of ads becomes a gap candidate, with its count. The strategist prompt can only expand on those candidates; it can't invent new numbers.

---

## Setup (all free)

1. **Import** `workflow/mysivi-facebook-ad-intelligence.json` into n8n (cloud trial or self-hosted).
2. **Apify**: copy your API token from console.apify.com → Settings → API & Integrations. On node `04`, create a *Header Auth* credential with Name `Authorization` and Value `Bearer <token>`.
3. **Gemini**: create a key at aistudio.google.com/apikey. Add it as a *Google Gemini (PaLM) API* credential on nodes `10a`, `10b`, `10c`, `12a`, `15`, `15b`.
4. **PDF.co**: node `18` runs on n8n's free AI credits on n8n Cloud. Self-hosted: add a free PDF.co key, or let the HTML fallback render the report.
5. Open the form URL from node `01`, paste an Ad Library link, submit.

Cost of one 10-ad run: about **$0.01** of Apify's free monthly credit (the actor charges $0.75 per 1,000 ads). Gemini on the free tier. PDF on n8n's free credits.

---

## Run it without n8n (Node or Claude Code)

`runner/teardown.mjs` runs the same pipeline locally. It executes the exact Code-node files in `src/` through a small shim, so the n8n and local versions can't drift apart. Node 18+, no npm install.

```bash
cp .env.example .env        # add APIFY_TOKEN and GEMINI_API_KEY
node runner/teardown.mjs \
  --url "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=IN&is_targeted_country=false&media_type=all&q=%22MySivi%22&search_type=keyword_exact_phrase&sort_data[direction]=desc&sort_data[mode]=total_impressions" \
  --brand MySivi --ads 5 --by "Your name"
```

The report lands in `output/` as HTML, PDF (if Chrome is installed) and JSON. `npm run demo` replays the saved MySivi scrape in `demo/apify-sample-response.json`, so no Apify credit is used.

**In Claude Code:** open the folder and run `/teardown MySivi` (or paste any Ad Library search link). `CLAUDE.md` tells Claude how to run it, how to read the result, and what not to claim.

## Demo

**Input** (`demo/sample-input.json`)

```json
{
  "Ad Library URL": "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=IN&is_targeted_country=false&media_type=all&q=%22MySivi%22&search_type=keyword_exact_phrase&sort_data[direction]=desc&sort_data[mode]=total_impressions",
  "Brand / competitor name": "MySivi",
  "Ads to analyse (3-15)": 10,
  "Prepared by": "Tharani M"
}
```

**Output**: `report/mysivi-ad-intelligence-report.pdf` (17 pages, rendered by PDF.co inside n8n) and the full ranked JSON in `demo/sample-output.json`.

**What the submitted run found** (n8n execution #11, 10 ads, 4 min 27 s)

| | |
|---|---|
| Analysis coverage | 10 / 10 videos watched by Gemini, 0 fallbacks, 0 unscored |
| Portfolio | 917 active ads, 5 Facebook pages, 10/10 Dynamic Creative, 3 captions across 10 creatives |
| Best ad | `946551737840774`, Ad Strength Index **86.7** (creative 84, market 93). A Hindi AI-generated biking skit opening with *"Door reh, paas mat aa"* ("Stay away, don't come close") that turns into an objection-handling dialogue ending on the ₹1 trial |
| Clones detected | 2 pairs re-uploaded under different ad ids (`946551737840774 = 936537375615758`, `2525947104551219 = 2805580133171301`), matching a manual check of the thumbnails |
| Study this | `1083327227503975`, a plain text-on-screen testimonial: creative 56, but Meta's #2 by impressions |
| Counted gaps | 0/10 before→after, 1/10 real learner story, median product reveal at 16 s, nothing in Telugu/Bengali/Marathi |
| New concepts | *Interview Transformation* (Hinglish), *Coaching Class Comparison* (Tamil), *3-Second UI Reveal* (Telugu) |

**Models used** (all Gemini free tier, one key)

| Step | Model | Why |
|---|---|---|
| Watch video / image / copy | `gemini-3.5-flash-lite` | fast, video-capable, generous free quota |
| Repair / copy-only fallback | `gemini-3.1-flash-lite` | a different model, so one overloaded model can't take out both paths |
| Strategist memo | `gemini-3-flash-preview` | stronger reasoning for the one synthesis call |
| Strategist backup | `gemini-3.5-flash-lite` | used only if the primary errors |

`gemini-3.5-flash` gives slightly richer video notes (run #7 used it) but its free daily quota runs out after a few full runs. Swap the model id in nodes 10a–10c if you have quota.

## How it was tested

Eleven executions on the live instance. The ones that taught me something:

| Run | Result | What it caught / proved |
|---|---|---|
| #1 | Ended on *Invalid Facebook Ad Library URL* | n8n's Code sandbox has no `URL` global, so I wrote a hand-rolled URL and base64 parser. It also proved the invalid-URL exit works. |
| #3 | Ended on *No ads were found* | Apify rejects runs with fewer than 10 results, and an error branch double-fired. Fix: minimum fetch of 10, and a single raw-response path. |
| #4 | 1/3 watched, 2 repaired | Gemini 503 on `flash-latest`. The repair path worked; a model probe showed which models were healthy. |
| #7 | 10/10 watched, strategist 503 | Full intelligence layer working. Added the backup strategist node. |
| #8 | All fell back to copy-only | Free quota exhausted on one model. Spread models across steps and only compare clones between watched videos. |
| #10 | 9/10 watched, 1 repaired | Malformed JSON from Gemini was repaired automatically. |
| **#11** | **10/10 watched, memo OK, PDF OK** | Submitted run |
| #12 | Duolingo, India, 5 ads, 15-page PDF | **Same workflow, different advertiser, no changes.** Winner: *"learn a language with 10 minutes per day"* (79.8). Counted gap: no regional-language creatives at all, the opposite of MySivi's Hindi/Tamil/Kannada mix. Output in `demo/competitor-run-duolingo.pdf`. |

---

## Files

```text
mysivi-ad-intelligence/
├── README.md
├── CLAUDE.md · .claude/commands/teardown.md       ← run it from Claude Code with /teardown
├── runner/teardown.mjs                             ← local runner (same src/, no n8n)
├── .env.example                                    ← APIFY_TOKEN, GEMINI_API_KEY
├── workflow/mysivi-facebook-ad-intelligence.json   ← import this (credential names only, no secrets)
├── report/mysivi-ad-intelligence-report.pdf        ← generated by the workflow (PDF.co node)
├── report/mysivi-ad-intelligence-report.html       ← same report, HTML
├── demo/sample-input.json · sample-output.json · apify-sample-response.json · Duolingo run
├── src/                                            ← every Code node + the strategist prompt, as readable files
└── assets/                                         ← ad thumbnails, report page previews
```

---

## Limitations (honest ones)

- **No performance data.** The ranking is estimated creative effectiveness from observable characteristics. It is not CTR, CPI or ROAS, and the report never claims it is.
- **Sample, not census.** The top N ads by Meta's impression sort, out of the hundreds MySivi runs. Patterns describe the sample.
- **Gemini grades are judgements.** Re-runs can move a sub-score by a point. Weights, ranks, medians and gap counts are deterministic for a given set of grades.
- **Market Signal is a proxy.** A brand-new strong ad scores low on longevity, and an ad can survive for reasons unrelated to results.
- **One variant per ad.** Dynamic Creative ads hold several videos; the first variant is analysed.
- **Meta CDN links expire** after a few days, so thumbnails in an old PDF can go blank. Re-run to refresh.
- **Runtime.** About 25–45 s per ad because each video is uploaded to Gemini and processed, plus an 8 s pause for free-tier rate limits. 10 ads ≈ 4–6 minutes on flash-lite.
- **Free-tier quotas are real.** Heavy back-to-back testing can exhaust one model's daily quota. The workflow degrades gracefully (repair, then copy-only, with each ad's mode printed in the report), but the best output comes from a fresh quota.
- **Gemini transliteration varies.** The same Hindi line can come back as "paas" or "pass", which is why clone matching compares both the original text and the English translation.
- **n8n form runs wait for the browser.** Runs started from the form end on a completion page. Runs started headless (API/MCP) stay in *waiting* until that page is opened. That's harmless, but stop them in the Executions tab.
