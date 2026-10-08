// Gemini returns text; we need a trustworthy object. Pull every text part out
// of the response, strip fences, parse, then clamp/normalise every field the
// scorer depends on. Anything unusable is routed to the repair step.
const SOURCE_NODE = '08 — Build Analysis Brief';
const ATTEMPT = 'first';

const collectText = (node) => {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (typeof node === 'object') {
    if (typeof node.text === 'string') return node.text;
    if (node.content) return collectText(node.content);
    if (node.parts) return collectText(node.parts);
    if (node.candidates) return collectText(node.candidates[0]);
    if (node.message) return collectText(node.message);
    if (node.output) return collectText(node.output);
  }
  return '';
};

const parseJson = (text) => {
  let t = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object in model output');
  t = t.slice(start, end + 1);
  try { return JSON.parse(t); } catch (e) {
    return JSON.parse(t.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"'));
  }
};

const SCORE_KEYS = ['hookScore', 'clarityScore', 'valuePropScore', 'offerScore', 'ctaScore', 'specificityScore', 'creativeAngleScore', 'conversionIntentScore', 'productVisibility', 'textDensity'];
const FLAG_KEYS = ['quantifiedOutcome', 'socialProof', 'urgency', 'comparison', 'objectionHandling', 'beforeAfter', 'customerStory', 'priceShown', 'productUiShown', 'humanFace'];
const clampScore = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(10, Math.max(0, Math.round(n))) : null;
};
const num = (v) => (v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const str = (v, d = 'not observed') => (v == null || v === '' ? d : String(v).trim());
const list = (v) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 8) : []);
const bool = (v) => v === true || v === 'true' || v === 'yes';
const FORMATS = ['AI-generated story', 'UGC talking head', 'Video-call demo', 'App screen demo', 'Text-on-screen testimonial', 'Lesson snippet', 'Skit / drama', 'Static image', 'Carousel', 'Unknown (copy-only)'];
const key4 = (x) => String(x || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 4);
const canonFormat = (f) => FORMATS.find((x) => key4(x) === key4(f)) || (f ? String(f).trim() : 'Other');

const normalise = (p) => {
  const scores = {};
  SCORE_KEYS.forEach((k) => { scores[k] = clampScore(p.scores && p.scores[k]); });
  const flags = {};
  FLAG_KEYS.forEach((k) => { flags[k] = bool(p.flags && p.flags[k]); });
  const hook = p.hook || {};
  const cta = p.cta || {};
  return {
    confidence: ['high', 'medium', 'low'].includes(p.confidence) ? p.confidence : 'medium',
    language: str(p.language),
    format: canonFormat(p.format),
    talent: str(p.talent, 'not observed'),
    first3s: { visual: str(p.first3s && p.first3s.visual), audioOrText: str(p.first3s && p.first3s.audioOrText) },
    hook: { text: str(hook.text), english: str(hook.english || hook.text), type: str(hook.type, 'Other').split('|')[0].trim(), strength: clampScore(hook.strength ?? scores.hookScore) },
    body: str(p.body),
    cta: { spoken: str(cta.spoken, 'none'), button: str(cta.button, ''), strengthNote: str(cta.strengthNote, '') },
    headline: str(p.headline, ''),
    offer: str(p.offer, 'none observed'),
    productFirstSeenSec: num(p.productFirstSeenSec),
    brandFirstMentionSec: num(p.brandFirstMentionSec),
    captionsBurnedIn: bool(p.captionsBurnedIn),
    targetAudience: str(p.targetAudience), painPoint: str(p.painPoint), desiredOutcome: str(p.desiredOutcome),
    valueProposition: str(p.valueProposition), creativeAngle: str(p.creativeAngle), emotionalTrigger: str(p.emotionalTrigger),
    awarenessLevel: str(p.awarenessLevel), funnelStage: str(p.funnelStage),
    proofMechanism: str(p.proofMechanism, 'none'), urgencyMechanism: str(p.urgencyMechanism, 'none'),
    visualConcept: str(p.visualConcept), patternInterrupt: str(p.patternInterrupt, 'none'),
    flags, scores,
    observed: list(p.observed), inferred: list(p.inferred),
    whyItWorks: str(p.whyItWorks, ''), weakness: str(p.weakness, ''), recommendation: str(p.recommendation, ''),
  };
};

return $input.all().map((item, i) => {
  const ad = $(SOURCE_NODE).itemMatching ? $(SOURCE_NODE).itemMatching(i).json : $(SOURCE_NODE).all()[i].json;
  const res = item.json || {};
  const text = collectText(res);
  let analysis = null;
  let aiError = null;
  try {
    const parsed = parseJson(text);
    const missing = ['hook', 'scores'].filter((k) => !parsed[k]);
    if (missing.length) throw new Error(`Missing keys: ${missing.join(', ')}`);
    analysis = normalise(parsed);
    if (SCORE_KEYS.slice(0, 8).filter((k) => analysis.scores[k] === null).length > 2) throw new Error('Too many missing scores');
  } catch (e) {
    analysis = null;
    aiError = res.error ? (res.error.message || String(res.error)) : e.message;
  }
  const out = { ...ad, analysis, aiValid: !!analysis, aiError, aiAttempt: ATTEMPT };
  if (!analysis) out.aiRaw = String(text || '').slice(0, 3000);
  if (analysis && ATTEMPT === 'repair') out.analysisMode = 'copy-only fallback';
  else if (analysis) out.analysisMode = ad.route === 'video' ? 'watched video' : ad.route === 'image' ? 'read image' : 'copy only';
  return { json: out };
});
