---
description: Run an Ad Library teardown for a brand or Ad Library link and summarise the result
argument-hint: <brand name or Ad Library search link> [number of ads]
---

Run the Ad Library teardown for: $ARGUMENTS

1. Check `.env` exists with `APIFY_TOKEN` and `GEMINI_API_KEY` set (check presence only; never print the values). If either is missing, stop and tell the user to copy `.env.example` to `.env` and fill it in.
2. If the argument is a brand name rather than a link, build the search link:
   `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=IN&is_targeted_country=false&media_type=all&q=%22<Brand>%22&search_type=keyword_exact_phrase&sort_data[direction]=desc&sort_data[mode]=total_impressions`
   (URL-encode the brand; ask which country if the brand clearly isn't Indian.) Reject single-ad `?id=` links and ask for a search link instead.
3. Run `node runner/teardown.mjs --url "<link>" --brand "<Brand>" --ads <n, default 5>` in the background and report progress as ads complete.
4. When it finishes, read the generated `output/*.json` and reply with: the winner (ad id, Ad Strength Index, hook in original language + English), watched vs. fallback counts, the top 3 counted gaps, the three new concepts (one line each), and the path to the PDF/HTML. Use the numbers from the file; don't recompute them, and don't describe the ranking as performance.
