// ── AI PROVAYDER QATLAMI ─────────────────────────────────────
// Yagona interfeys: complete(). Provayder env orqali almashadi,
// chaqiruvchi kod qaysi model ishlatilayotganini bilmasligi kerak.
//
//   AI_PROVIDER   gemini (default) | anthropic
//   GEMINI_API_KEY
//   ANTHROPIC_API_KEY
//
// Model darajalari (tier):
//   'fast'  — chat, qisqa javoblar. Flash-Lite: tezroq, arzonroq.
//   'smart' — baholash va kontent generatsiyasi. Flash: sifatliroq.
//
// MUHIM — modellar 2026-08-06 da haqiqiy chaqiruv bilan tekshirilgan:
//   gemini-2.5-flash, gemini-2.5-flash-lite — YANGI kalitlarga YOPILGAN (404)
//   gemini-2.0-flash-lite                   — bepul kvota yo'q (429)
// Model 404 bera boshlasa, GEMINI_MODEL_FAST / GEMINI_MODEL_SMART env
// o'zgaruvchilari orqali kodga tegmasdan almashtiriladi.
//
// canDisableThinking — ba'zi modellar thinkingBudget:0 ni qabul qilmaydi
// (400 INVALID_ARGUMENT), shuning uchun har model uchun alohida belgilanadi.

const aiQuota = require('./aiQuota');

const MODELS = {
  gemini: {
    fast:  { id: process.env.GEMINI_MODEL_FAST  || 'gemini-3.5-flash-lite', canDisableThinking: false },
    smart: { id: process.env.GEMINI_MODEL_SMART || 'gemini-3.5-flash',      canDisableThinking: true  }
  },
  anthropic: {
    fast:  { id: 'claude-haiku-4-5-20251001', canDisableThinking: false },
    smart: { id: 'claude-haiku-4-5-20251001', canDisableThinking: false }
  }
};

let _gemini = null;
function geminiClient() {
  if (!_gemini) {
    const { GoogleGenAI } = require('@google/genai');
    _gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _gemini;
}

let _anthropic = null;
function anthropicClient() {
  if (!_anthropic) {
    const Anthropic = require('@anthropic-ai/sdk');
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

/** Qaysi provayder faol — kalit mavjudligiga qarab avtomatik tanlanadi. */
function activeProvider() {
  const forced = (process.env.AI_PROVIDER || '').toLowerCase();
  if (forced === 'gemini'    && process.env.GEMINI_API_KEY)    return 'gemini';
  if (forced === 'anthropic' && process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY)    return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}

/** AI umuman sozlanganmi (route'lar 503 qaytarish uchun tekshiradi). */
function isConfigured() {
  return activeProvider() !== null;
}

// ── Gemini ────────────────────────────────────────────────────
async function completeGemini({ system, messages, json, schema, maxTokens, tier }) {
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content) }]
  }));

  const spec = MODELS.gemini[tier];
  const config = { maxOutputTokens: maxTokens };
  // Fikrlash byudjeti 0 — bizning vazifalar uchun kerak emas, kechikish va
  // token sarfini kamaytiradi. Faqat qo'llab-quvvatlaydigan modelga yuboriladi.
  if (spec.canDisableThinking) config.thinkingConfig = { thinkingBudget: 0 };
  if (system) config.systemInstruction = system;
  if (json) {
    config.responseMimeType = 'application/json';
    if (schema) config.responseSchema = schema;
  }

  const response = await geminiClient().models.generateContent({
    model: spec.id,
    contents,
    config
  });

  const text = response.text;
  if (!text) throw new Error('Gemini bo\'sh javob qaytardi');
  return text;
}

// ── Anthropic ─────────────────────────────────────────────────
async function completeAnthropic({ system, messages, json, maxTokens, tier }) {
  // Anthropic'da JSON rejimi yo'q — prefill orqali majburlaymiz.
  const msgs = messages.map(m => ({ role: m.role, content: String(m.content) }));
  if (json) msgs.push({ role: 'assistant', content: '{' });

  const response = await anthropicClient().messages.create({
    model: MODELS.anthropic[tier].id,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages: msgs
  });

  const text = response.content[0].text;
  return json ? '{' + text : text;
}

/**
 * Yagona AI chaqiruvi.
 *
 * @param {object}   opts
 * @param {string}  [opts.system]     — system prompt
 * @param {Array}    opts.messages    — [{ role: 'user'|'assistant', content }]
 * @param {boolean} [opts.json]       — JSON javob talab qilinadi
 * @param {object}  [opts.schema]     — JSON sxemasi (faqat Gemini)
 * @param {number}  [opts.maxTokens]  — default 1024
 * @param {string}  [opts.tier]       — 'fast' | 'smart' (default 'fast')
 * @param {string}  [opts.restaurantId] — kvota sarfini restoran kesimida yozish uchun
 * @returns {Promise<string|object>}  — json:true bo'lsa parse qilingan obyekt
 */
async function complete({ system, messages, json = false, schema, maxTokens = 1024, tier = 'fast', restaurantId }) {
  const provider = activeProvider();
  if (!provider) throw Object.assign(new Error('AI sozlanmagan'), { code: 'AI_NOT_CONFIGURED' });
  if (!Array.isArray(messages) || !messages.length) throw new Error('messages bo\'sh');
  if (!MODELS[provider][tier]) throw new Error(`Noma'lum tier: ${tier}`);

  const args = { system, messages, json, schema, maxTokens, tier };
  let text;

  try {
    // Kvota va RPM navbati orqali o'tkazamiz.
    text = await aiQuota.run(
      MODELS[provider][tier].id,
      () => (provider === 'gemini' ? completeGemini(args) : completeAnthropic(args)),
      restaurantId
    );
  } catch (err) {
    // Gemini kvotasi tugadi yoki xato berdi — Anthropic kaliti bo'lsa, unga o'tamiz.
    const canFallback = provider === 'gemini' && process.env.ANTHROPIC_API_KEY;
    if (!canFallback) throw err;
    console.warn('[ai] Gemini ishlamadi, Anthropic zaxirasiga o\'tildi:', err.message);
    text = await aiQuota.run(MODELS.anthropic[tier].id, () => completeAnthropic(args), restaurantId);
  }

  if (!json) return text;

  try {
    return JSON.parse(text);
  } catch {
    // Model matn ichiga JSON qo'ygan bo'lishi mumkin — birinchi obyektni ajratamiz.
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* pastga tushadi */ }
    }
    throw Object.assign(
      new Error('AI javobini JSON sifatida o\'qib bo\'lmadi'),
      { code: 'AI_BAD_JSON', raw: text.slice(0, 500) }
    );
  }
}

module.exports = { complete, isConfigured, activeProvider, MODELS };
