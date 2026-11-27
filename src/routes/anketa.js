// ── ANKETA (nomzod Mini App'i) ───────────────────────────────
// Nomzod hali bazada yo'q — shuning uchun candidate.js guard'i emas,
// faqat Telegram initData. To'ldirilish (SurveyResponse) shu Telegram
// foydalanuvchisiga tegishli bo'lishi shart: boshqa odam id bilan
// birovning anketasini ocholmasin.

const express = require('express');
const rateLimit = require('express-rate-limit');
const { asyncHandler } = require('../middleware/errorHandler');
const Survey = require('../models/Survey');
const SurveyResponse = require('../models/SurveyResponse');
const Vacancy = require('../models/Vacancy');
const Client = require('../models/Client');
const Restaurant = require('../models/Restaurant');
const initData = require('../services/tgInitData');
const tg = require('../services/telegram');
const vac = require('../services/vacancy');
const survey = require('../services/survey');
const { publicBase } = require('../utils/publicBase');
const I18N = require('../../public/js/th-i18n');

const { track } = require('../services/track');
const router = express.Router();

router.use(rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'net', code: 'net' }
}));

// Xatolar KOD bilan qaytadi — anketa o'z tilida ko'rsatadi (t('ank.err.<kod>'))
const fail = (res, status, code, extra) => res.status(status).json(Object.assign({ error: code, code }, extra));

const guard = asyncHandler(async (req, res, next) => {
  const v = initData.verify(req.get('X-Telegram-Init-Data') || '');
  if (!v.ok) return fail(res, 401, 'auth');
  let r = await SurveyResponse.findOne({ id: req.params.rid, tgUserId: String(v.user.id) });
  // Asosiysiga qo'shilgan takror yozuv (eski tugma) — asosiysi ochiladi
  if (r && r.status === 'merged' && r.mergedInto) {
    r = await SurveyResponse.findOne({ id: r.mergedInto, tgUserId: String(v.user.id) });
  }
  if (!r) return fail(res, 404, 'notFound');
  req.tgUser = v.user;
  req.resp = r;
  next();
});

async function contextOf(r) {
  const s = await Survey.findOne({ agencyId: r.agencyId, id: r.surveyId }).lean();
  const v = r.vacancyId ? await Vacancy.findOne({ agencyId: r.agencyId, id: r.vacancyId }).lean() : null;
  const presetRole = survey.presetRoleOf(r, s, v);
  return { s, v, presetRole };
}

// ── Anketa holati ──
router.get('/:rid', guard, asyncHandler(async (req, res) => {
  const r = req.resp;
  // ?g=1 — «Lavozimim ro'yxatda yo'q»: UMUMIY anketa. Oldin lavozim tanlagan bo'lsa
  // (yozuv lavozim anketasiga o'tgan), javobi hali yo'q yozuv umumiyga qaytadi
  if (req.query.g === '1' && !r.vacancyId && survey.isShell(r)) {
    const def = await survey.ensureDefault(r.agencyId);
    // Lavozim ro'yxatda yo'q — botda oldin tanlangan lavozim va ishlar ham bekor
    if (def && (r.surveyId !== def.id || r.role || (r.offerIds || []).length)) {
      Object.assign(r, { surveyId: def.id, role: '', offerIds: [], updatedAt: new Date() }); await r.save();
    }
  }
  const { s, v, presetRole } = await contextOf(r);
  if (!s) return fail(res, 404, 'notFound');
  // Nomzod yo'li: anketani ochdi (30 daqiqada bir marta — track.QUIET)
  if (r.status !== 'done') track('open', { agencyId: r.agencyId, tgUserId: r.tgUserId, rid: r.id,
    channel: r.channel, name: req.tgUser && req.tgUser.first_name, isTest: r.isTest });
  const answers = Object.assign({}, r.answers || {});
  res.json({
    status: r.status,
    lang: r.lang || '',
    tgLang: I18N.fromTelegram(req.tgUser.language_code),
    answers,
    hasPhoto: !!r.photo,
    phone: r.phone || '',
    phoneVerified: !!r.phoneVerifiedAt,
    step: r.step,
    // Lavozim ma'lum bo'lsa — shartlar shu lavozim bo'yicha (savolning o'zi so'ralmaydi)
    presetRole,
    // bo'lim (sec) va ko'rsatish sharti (showIf) bilan — anketa.html shularni ko'rsatadi
    questions: survey.withMeta(survey.visibleQuestions(s, presetRole)),
    // Sarlavhada — nomzod qaysi ishga to'ldirayotganini ko'rsin (restoran nomisiz)
    vacancy: v ? {
      title: { uz: vac.titleFor(v, 'uz'), ru: vac.titleFor(v, 'ru') },
      salary: { uz: vac.salaryText(v, 'uz'), ru: vac.salaryText(v, 'ru') }
    } : null
  });
}));

// Kirish ekranida "Boshlash" bosildi — analitikada "ochdi, lekin boshlamadi" va "birinchi savolda
// to'xtadi" ajralsin (2026-11-27 tahlilida ikkalasi bitta "(boshlamagan)" edi). Faqat yozuv.
router.post('/:rid/begin', guard, asyncHandler(async (req, res) => {
  const r = req.resp;
  if (r.status !== 'done') track('begin', { agencyId: r.agencyId, tgUserId: r.tgUserId, rid: r.id,
    channel: r.channel, name: req.tgUser && req.tgUser.first_name, isTest: r.isTest });
  res.json({ ok: true });
}));

router.post('/:rid/lang', guard, asyncHandler(async (req, res) => {
  const lang = String((req.body || {}).lang || '');
  if (!I18N.LANGS.includes(lang)) return fail(res, 400, 'option');
  req.resp.lang = lang;
  req.resp.updatedAt = new Date();
  await req.resp.save();
  res.json({ ok: true });
}));

// ── Bitta javob — har qadamda saqlanadi ──
// Ilova yopilib qolsa ham javoblar yo'qolmaydi, qaytib kelganda davom
// etadi; qaysi savolda to'xtagani (step) statistikaga kerak.
router.post('/:rid/answer', guard, asyncHandler(async (req, res) => {
  const r = req.resp;
  if (r.status === 'done') return fail(res, 409, 'already');
  const b = req.body || {};
  const { s, presetRole } = await contextOf(r);
  const q = survey.visibleQuestions(s, presetRole).find(x => x.id === b.q);
  if (!q) return fail(res, 400, 'option');

  // Telegram tasdiqlagan raqam bor — qo'lda kiritish shart emas
  if (q.type === 'contact' && r.phoneVerifiedAt && (b.value == null || b.value === '')) {
    r.step = q.id; r.updatedAt = new Date(); await r.save();
    return res.json({ ok: true });
  }

  // Rasm: "Keyinroq qo'shaman" — anketa to'xtamasin (rasmi qo'lida yo'q odam shu yerda
  // tashlab ketardi). Rasm kabinetda qo'shiladi, rahmat xabarida eslatiladi (anketaDone).
  if (q.type === 'photo' && b.value === 'later') {
    r.answers = Object.assign({}, r.answers || {}, { photoLater: true });
    r.markModified('answers'); r.step = q.id; r.updatedAt = new Date(); await r.save();
    return res.json({ ok: true });
  }

  let val;
  try { val = survey.checkAnswer(q, b.value); }
  catch (e) { return fail(res, 400, e.code || 'option'); }

  if (q.type === 'photo') {
    r.photo = val || '';
    if (r.answers && r.answers.photoLater) { r.answers = Object.assign({}, r.answers, { photoLater: false }); r.markModified('answers'); }
  }
  else {
    r.answers = Object.assign({}, r.answers || {}, { [q.id]: val });
    r.markModified('answers');
  }
  r.step = q.id;
  r.updatedAt = new Date();
  await r.save();
  res.json({ ok: true });
}));

// ── Yuborish ──
router.post('/:rid/submit', guard, asyncHandler(async (req, res) => {
  const r = req.resp;
  if (r.status === 'done') return fail(res, 409, 'already');

  // Ish beruvchi akkaunti nomzod bo'la olmaydi (bot /start bilan bir xil qoida)
  if (await Client.exists({ tgChatId: r.tgUserId })) return fail(res, 403, 'isClient');

  const { s, presetRole } = await contextOf(r);
  const a = r.answers || {};
  // Faqat ko'rsatilgan savollar majburiy ("Tajribam yo'q" — oxirgi ish so'ralmaydi,
  // oshpazga xostess savoli chiqmaydi) — anketa.html bilan bir qoida
  for (const q of survey.shownQuestions(survey.visibleQuestions(s, presetRole), a, presetRole)) {
    if (!q.required) continue;
    const ok = q.type === 'contact' ? (r.phoneVerifiedAt || a.phone)
             : q.type === 'consent' ? a.consent === true
             : q.type === 'photo' ? !!(r.photo || a.photoLater)
             : a[q.id] != null && a[q.id] !== '';
    if (!ok) return fail(res, 400, 'required', { q: q.id });
  }

  const appBase = publicBase(req);
  // Til tanlanmagan bo'lsa (eski havola, til ekrani o'tkazib yuborilgan) — rahmat qaysi tilda
  // yozilsa, nomzod ham shu tilda saqlanadi: aks holda rahmat ruscha, bot savollari o'zbekcha chiqardi
  if (!I18N.LANGS.includes(r.lang)) { r.lang = I18N.fromTelegram(req.tgUser.language_code); await r.save(); }
  let out;
  try { out = await survey.finalize(r, { appBase }); }
  catch (e) { if (e.already) return fail(res, 409, 'already'); throw e; }
  const lang = I18N.LANGS.includes(r.lang) ? r.lang : I18N.fromTelegram(req.tgUser.language_code);
  // Ovozli rezyumedan kelgan (yetishmaganini Mini App'da to'ldirdi — anketa.html?fill=1):
  // ovoz yozuvi, tavsif va "ovozni afzal ko'radi" ham yoziladi (bot yo'li bilan bir xil)
  const voice = r.mode === 'voice';
  if (voice) await require('../services/voiceIntake').applyVoice(r, out);
  // Rahmat (tugmali), agentlikka xabar, ochiq ishlar soni — ovozli anketa bilan bitta joy
  const { jobs, matches, next } = await require('../services/anketaDone').afterFinalize(r, out,
    { appBase, lang, via: voice ? 'voice' : undefined });

  res.json({ ok: true, created: out.created, applied: out.applied,
    vacancyTitle: out.vacancy ? vac.titleFor(out.vacancy, lang)
      : (out.appliedTo || []).length === 1 ? vac.titleFor(out.appliedTo[0], lang) : '',
    appliedN: out.vacancy ? (out.applied ? 1 : 0) : (out.appliedTo || []).length,
    jobs, matches, next });
}));

module.exports = router;
