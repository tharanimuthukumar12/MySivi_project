// Builds the analysis brief for one ad. The prompt is identical across media
// types except for one instruction line, so video, image and copy-only
// analyses stay comparable on the same rubric.
const HOOK_TYPES = 'Pain | Curiosity | Contrarian | Question | Benefit | Fear | Social Proof | Authority | Offer | Urgency | Transformation | Comparison | Story';
const FORMATS = 'AI-generated story | UGC talking head | Video-call demo | App screen demo | Text-on-screen testimonial | Lesson snippet | Skit / drama | Static image | Carousel | Unknown (copy-only)';

const SCHEMA = `{
  "adId": "string",
  "confidence": "high | medium | low",
  "language": "language(s) actually spoken or written in the creative",
  "format": "one of: ${FORMATS}",
  "talent": "real people | AI-generated characters | animation | none",
  "first3s": { "visual": "what is on screen in the first 3 seconds", "audioOrText": "exact words heard or shown in the first 3 seconds, original language" },
  "hook": { "text": "the hook, verbatim, original language", "english": "English translation (same as text if already English)", "type": "one of: ${HOOK_TYPES}", "strength": 0 },
  "body": "the core message after the hook, 1-3 sentences, observed",
  "cta": { "spoken": "CTA said or shown inside the creative, or 'none'", "button": "the button label", "strengthNote": "why this CTA is strong or weak, one line" },
  "headline": "string",
  "offer": "observed offer, or 'none observed'",
  "productFirstSeenSec": "number or null - second the app/product UI first appears",
  "brandFirstMentionSec": "number or null - second the brand name is first shown or said",
  "captionsBurnedIn": "boolean - works with sound off",
  "targetAudience": "LIKELY audience (inference)",
  "painPoint": "string",
  "desiredOutcome": "string",
  "valueProposition": "string",
  "creativeAngle": "short label, e.g. 'Problem -> Solution', 'Aspirational story', 'Live demo'",
  "emotionalTrigger": "string",
  "awarenessLevel": "Unaware | Problem-aware | Solution-aware | Product-aware | Most-aware",
  "funnelStage": "TOF | MOF | BOF",
  "proofMechanism": "observed proof, or 'none'",
  "urgencyMechanism": "observed urgency, or 'none'",
  "visualConcept": "string",
  "patternInterrupt": "what (if anything) breaks the scroll, or 'none'",
  "flags": { "quantifiedOutcome": false, "socialProof": false, "urgency": false, "comparison": false, "objectionHandling": false, "beforeAfter": false, "customerStory": false, "priceShown": false, "productUiShown": false, "humanFace": false },
  "scores": { "hookScore": 0, "clarityScore": 0, "valuePropScore": 0, "offerScore": 0, "ctaScore": 0, "specificityScore": 0, "creativeAngleScore": 0, "conversionIntentScore": 0, "productVisibility": 0, "textDensity": 0 },
  "observed": ["3-6 short facts you directly saw, heard or read"],
  "inferred": ["2-4 judgements, each starting with 'Likely' or 'Appears'"],
  "whyItWorks": "1-2 sentences tied to a specific moment or line",
  "weakness": "the single biggest leak, specific",
  "recommendation": "one concrete edit worth testing"
}`;

const RUBRIC = `Score each 0-10 as an integer. Most real ads land between 4 and 8; give 9-10 only for something you would show a team as a reference.
- hookScore: 9-10 = stops the scroll inside 2s AND is instantly relevant to the viewer's problem; 5-6 = clear but generic; 0-3 = slow, logo-first or confusing.
- clarityScore: after one distracted view, could someone say what the product is and what it does?
- valuePropScore: is the promised outcome meaningful and different from the alternatives (tutors, classes, YouTube, other apps)?
- offerScore: is there a concrete, low-risk reason to act now (price, trial, guarantee)? 0 if no offer.
- ctaScore: is the next step explicit, low-friction and consistent with the offer (spoken/on-screen CTA plus button)?
- specificityScore: numbers, named situations and concrete details score high; vague claims score low.
- creativeAngleScore: does the format feel native and fresh in the feed, or like a tired template?
- conversionIntentScore: how directly does the creative push the viewer to act now?
- productVisibility: how clearly and how long the product itself is shown.
- textDensity: 0 = no on-screen text, 10 = wall of text.`;

const MEDIA_LINE = {
  video: 'THE VIDEO IS ATTACHED. Watch all of it and listen to the audio. The hook is whatever happens in the first ~3 seconds. Use timestamps in seconds.',
  image: 'THE IMAGE IS ATTACHED. If this is the thumbnail of a video ad (media note below), say so in "observed" and keep confidence at medium or lower.',
  text: 'NO CREATIVE COULD BE RETRIEVED. Analyse the copy only, set format to "Unknown (copy-only)", confidence to "low", and do not describe visuals you cannot see.',
};

const build = (a, mediaLine) => {
  const meta = {
    adId: a.adId,
    page: a.pageName,
    runningSince: a.startDate,
    daysActive: a.daysActive,
    placements: a.platforms,
    displayFormat: a.displayFormat,
    creativeVariantsInAd: a.variantCount,
    mediaType: a.mediaType,
    videoDurationSec: a.durationS,
    headline: a.headline || '(none)',
    primaryText: a.body || '(none)',
    hashtags: a.hashtags,
    ctaButton: a.cta,
    destination: a.linkDomain,
    captionLanguage: a.language,
    captionSharedWithOtherAds: a.sameCopy ? `yes - ${a.copyGroupSize} ads in this sample use this exact caption` : 'no',
    templatePlaceholdersVisibleInLibrary: a.templateLeak,
  };
  return [
    'ROLE',
    'You are a senior performance-creative strategist auditing a live Meta ad for a growth team. You are precise and skeptical, and you never invent what you cannot see or hear.',
    '',
    'INPUT 1 - OBSERVED METADATA (scraped from the Meta Ad Library, treat as fact):',
    JSON.stringify(meta, null, 2),
    '',
    `INPUT 2 - ${mediaLine}`,
    '',
    'HOW TO THINK',
    '- In Dynamic Creative accounts the caption is often shared by many ads. Treat the creative itself as the ad; the caption is secondary.',
    '- Quote the hook verbatim in its original language, then translate it.',
    '- OBSERVED means you saw, heard or read it. INFERRED is your judgement. Never present an inference as a fact.',
    '- Never claim performance (CTR, installs, ROAS). You are judging observable creative quality only.',
    '- If something is not determinable, write "not observed" (or null for numbers) instead of guessing.',
    '',
    'SCORING RUBRIC',
    RUBRIC,
    '',
    'OUTPUT',
    'Return ONLY one JSON object, no markdown fences, no commentary, matching exactly this shape:',
    SCHEMA,
  ].join('\n');
};

return $input.all().map(({ json: a }) => {
  const { rawData, ...ad } = a;
  return {
    json: {
      ...ad,
      route: ad.mediaType,
      prompt: build(ad, MEDIA_LINE[ad.mediaType]),
      promptCopyOnly: build(ad, MEDIA_LINE.text),
    },
  };
});
