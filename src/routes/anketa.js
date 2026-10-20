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
  const r = await SurveyResponse.findOne({ id: req.params.rid, tgUserId: String(v.user.id) });
  if (!r) return fail(res, 404, 'notFound');
  req.tgUser = v.user;
  req.resp = r;
  next();
});

async function contextOf(r) {
  const s = await Survey.findOne({ agencyId: r.agencyId, id: r.surveyId }).lean();
  const v = r.vacancyId ? await Vacancy.findOne({ agencyId: r.agencyId, id: r.vacancyId }).lean() : null;
  const presetRole = (v && v.role !== 'boshqa' && v.role) || (s && s.role) || '';
  return { s, v, presetRole };
}

// ── Anketa holati ──
router.get('/:rid', guard, asyncHandler(async (req, res) => {
  const r = req.resp;
  const { s, v, presetRole } = await contextOf(r);
  if (!s) return fail(res, 404, 'notFound');
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

  let val;
  try { val = survey.checkAnswer(q, b.value); }
  catch (e) { return fail(res, 400, e.code || 'option'); }

  if (q.type === 'photo') r.photo = val || '';
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
             : q.type === 'photo' ? !!r.photo
             : a[q.id] != null && a[q.id] !== '';
    if (!ok) return fail(res, 400, 'required', { q: q.id });
  }

  const appBase = publicBase(req);
  const out = await survey.finalize(r, { appBase });
  const c = out.candidate;
  const lang = I18N.LANGS.includes(r.lang) ? r.lang : I18N.fromTelegram(req.tgUser.language_code);

  // Nomzodga — rahmat va "Profilim" tugmasi (endi u bog'langan nomzod)
  try {
    const token = tg.platformToken();
    await tg.setChatMenuButton(token, r.chatId || r.tgUserId, I18N.t(lang, 'ank.menu'), `${appBase}/profil.html`)
      .catch(e => console.error('[ANKETA] menyu tugmasi:', e.message));
    await tg.sendMessage(token, r.chatId || r.tgUserId,
      I18N.t(lang, 'ank.botThanks', { name: (c.fullName || '').split(' ')[0] || '' }));
  } catch (e) { console.error('[ANKETA] rahmat xabari ketmadi:', e.message); }

  // Agentlikka. Ariza bo'lsa applications.submit o'zi xabar bergan —
  // ikkinchisini yubormaymiz.
  if (!out.applied) {
    try {
      const agency = await Restaurant.findOne({ id: r.agencyId });
      const chat = agency && agency.telegram && agency.telegram.adminChatId;
      if (chat) {
        await tg.sendMessage(tg.platformToken(), chat,
          `📝 ${out.created ? 'Yangi anketa' : 'Anketa yangilandi'}` +
          (r.channel ? ` · ${survey.CHANNELS[r.channel] || r.channel}` : '') + `\n\n` +
          `${c.fullName || 'Nomsiz'} — ${c.desiredPosition || ''}\n` +
          `${c.phone || ''}${c.phoneVerifiedAt ? ' ✓' : ' (qo\'lda)'}`);
      }
    } catch (e) { console.error('[ANKETA] agentlik xabari ketmadi:', e.message); }
  }

  res.json({ ok: true, created: out.created, applied: out.applied,
    vacancyTitle: out.vacancy ? vac.titleFor(out.vacancy, lang) : '' });
}));

module.exports = router;
