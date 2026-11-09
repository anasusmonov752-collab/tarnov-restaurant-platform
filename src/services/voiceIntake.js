// ── OVOZLI ANKETA (OVOZLI REZYUME) ───────────────────────────
// Ko'k yoqa nomzodi yozishni yoqtirmaydi — ovozli xabar yuboradi. Bot unga
// savollar shablonini beradi, nomzod 1-2 daqiqa gapiradi, AI javoblarni
// anketa maydonlariga SHABLON bo'yicha ajratadi (o'ylab topmaydi), nomzod
// tushunilganini tasdiqlaydi, yetishmaganini (rasm, telefon, tuman...) bot
// chatda bittadan so'raydi. Oxiri — anketaning o'zi: survey.finalize
// (dublikat, telefon tasdig'i, vakansiyaga ariza qoidalari bitta joyda) va
// anketaDone.afterFinalize (rahmat, agentlikka xabar).
//
// Holat — SurveyResponse (mode:'voice', vstep). Anketa.html bilan bir yozuv:
// nomzod istalgan payt Mini App anketasiga o'tib davom etishi mumkin.
// Tugmalar: vi:<amal>:<rid>[:<a>[:<b>]] — routes/telegram handleCallback.

const Survey = require('../models/Survey');
const SurveyResponse = require('../models/SurveyResponse');
const Candidate = require('../models/Candidate');
const Vacancy = require('../models/Vacancy');
const tg = require('./telegram');
const ai = require('./ai');
const survey = require('./survey');
const { isValidRole, ROLES } = require('../data/roles');
const I18N = require('../../public/js/th-i18n');

const T = (lang, k, v) => I18N.t(lang, k, v);
const MAX_AUDIO = 10 * 1024 * 1024, MAX_PHOTO = 1100 * 1024;
const kb = rows => ({ reply_markup: { inline_keyboard: rows } });
const send = (chatId, text, opts) => tg.sendMessage(tg.platformToken(), chatId, text, opts || {})
  .catch(e => { console.error('[VI] xabar ketmadi:', e.message); return null; });
const langOf = (r, from) => I18N.LANGS.includes(r.lang) ? r.lang : I18N.fromTelegram(from && from.language_code);

// ── AI: ovozdan anketa javoblari (SHABLON — faqat aytilgani) ──
const DISTRICT_KEYS = survey.DISTRICTS.map(d => d.key);
const VOICE_SCHEMA = {
  type: 'object',
  properties: {
    fullName:   { type: 'string', nullable: true },
    age:        { type: 'integer', nullable: true },
    birthDate:  { type: 'string', nullable: true },
    role:       { type: 'string', nullable: true, enum: ROLES.map(r => r.key) },
    noExperience: { type: 'boolean', nullable: true },
    jobs: { type: 'array', items: { type: 'object', properties: {
      place: { type: 'string' }, role: { type: 'string', enum: I18N.WORK_ROLES },
      other: { type: 'string', nullable: true }, dur: { type: 'string', enum: I18N.WORK_DURS } },
      required: ['place', 'role', 'dur'] } },
    district:   { type: 'string', nullable: true, enum: DISTRICT_KEYS },
    startWhen:  { type: 'string', nullable: true, enum: ['now', 'w1', 'w2', 'm1'] },
    study:      { type: 'string', nullable: true, enum: ['day', 'evening', 'distance', 'no'] },
    salaryAmount: { type: 'integer', nullable: true },
    salaryNegotiable: { type: 'boolean', nullable: true },
    russian:    { type: 'string', nullable: true, enum: ['fluent', 'medium', 'basic', 'none'] },
    summary:    { type: 'string', nullable: true },
    spokenLang: { type: 'string', nullable: true, enum: ['uz', 'ru'] }
  },
  required: ['fullName', 'age', 'birthDate', 'role', 'noExperience', 'jobs', 'district', 'startWhen', 'study',
             'salaryAmount', 'salaryNegotiable', 'russian', 'summary', 'spokenLang']
};
const VOICE_SYSTEM = `Sen ish izlayotgan odamning ovozli xabarini (o'zbek yoki rus tilida,
shevada, xatolar bilan) restoran ishiga anketa maydonlariga ajratasan.

QOIDALAR:
- Faqat AYTILGAN narsani yoz. Aytilmagan maydon — null (jobs — []). Taxmin qilma.
- fullName — ism va familiya, lotin yozuvida, bosh harf bilan ("Aziza Karimova").
- age — yoshi (son). birthDate — faqat aniq sana aytilsa "YYYY-MM-DD".
- role — qaysi lavozimda ishlamoqchi: ${ROLES.map(r => `${r.key} (${r.label})`).join(', ')}.
  Aytmasa, lekin oldingi ishi aniq bo'lsa ham — null (o'zi tanlaydi).
- jobs — ish joylari, eng ko'pi 3 ta, oxirgisidan: place — joy nomi; role —
  ${I18N.WORK_ROLES.join('|')} (boshqa bo'lsa "boshqa" va other ga lavozim nomi);
  dur — muddat: lt6 (6 oygacha), m6_12 (6 oy–1 yil), y1_3 (1–3 yil), y3_5 (3–5 yil), y5 (5+ yil).
- noExperience — "tajribam yo'q" desa true.
- district — Toshkent tumani: ${DISTRICT_KEYS.join(', ')} (viloyat — Toshkent viloyati).
- startWhen: darhol/ertadan — now; shu hafta — w1; ikki haftada — w2; bir oydan keyin — m1.
- study: talaba — kunduzgi (day), kechki (evening), sirtqi/masofaviy (distance), talaba emas — no.
- salaryAmount — kutgan OYLIK maosh so'mda ("5 mln" -> 5000000). "kelishamiz" — salaryNegotiable true.
- russian — rus tilini bilishi: erkin (fluent), o'rtacha (medium), boshlang'ich (basic), bilmaydi (none).
- summary — nomzod o'zi haqida aytgan muhim faktlar, 1-2 gap, o'zbekcha, uchinchi shaxsda,
  ism, telefon va manzilsiz. Masalan: "Kechki smenada tezkor ishlaydi, mehmonlar bilan muloqotni yaxshi biladi."
- spokenLang — qaysi tilda gapirdi.`;

// Bitta savol uchun (yetishmaganini ovoz bilan aytsa)
const ONE_SYSTEM = `Nomzod bitta savolga ovoz bilan javob berdi. Javobni matnga aylantir va faqat
so'ralgan qiymatni qaytar. Savol: {Q}. Ism bo'lsa — lotin yozuvida "Ism Familiya".
Sana bo'lsa — "YYYY-MM-DD". Ish joylari bo'lsa — jobs maydoni (yuqoridagi qoida).`;
const ONE_SCHEMA = {
  type: 'object',
  properties: {
    value: { type: 'string', nullable: true },
    jobs: VOICE_SCHEMA.properties.jobs,
    noExperience: { type: 'boolean', nullable: true }
  },
  required: ['value', 'jobs', 'noExperience']
};

function salaryBucket(amount, negotiable) {
  if (negotiable && !amount) return 'agree';
  if (!amount || amount < 100000) return '';
  return amount < 6e6 ? 's4_6' : amount < 9e6 ? 's6_9' : amount < 12e6 ? 's9_12' : 's12';
}

/** AI javobidan anketa javoblari — har biri survey.checkAnswer'dan o'tadi */
function answersFrom(p, questions, now = new Date()) {
  const byId = Object.fromEntries(questions.map(q => [q.id, q]));
  const out = {};
  const put = (id, val) => {
    const q = byId[id];
    if (!q || val == null || val === '') return;
    try { out[id] = survey.checkAnswer(q, val); } catch (e) { /* noto'g'ri qiymat — keyin so'raladi */ }
  };
  put('fullName', p.fullName);
  let bd = p.birthDate;
  if (!bd && p.age >= 14 && p.age <= 70) bd = `${new Date(now).getFullYear() - p.age}-06-15`;   // yoshidan (yarim yil aniqlikda)
  put('birthDate', bd);
  if (p.role && isValidRole(p.role)) put('role', p.role);
  if (p.noExperience) put('lastJob', 'none');
  else if (Array.isArray(p.jobs) && p.jobs.length) put('lastJob', p.jobs.slice(0, 3).map(j => ({ place: j.place, role: j.role, other: j.other || '', dur: j.dur })));
  put('location', p.district);
  put('startWhen', p.startWhen);
  put('study', p.study);
  put('salary', salaryBucket(p.salaryAmount, p.salaryNegotiable));
  put('russian', p.russian);
  return out;
}

// ── Anketa konteksti ──
async function contextOf(r) {
  const s = await Survey.findOne({ agencyId: r.agencyId, id: r.surveyId }).lean();
  const v = r.vacancyId ? await Vacancy.findOne({ agencyId: r.agencyId, id: r.vacancyId }, 'role').lean() : null;
  const presetRole = (v && isValidRole(v.role) && v.role) || (s && s.role) || '';
  const visible = s ? survey.visibleQuestions(s, presetRole) : [];
  return { s, presetRole, visible };
}
const answered = (q, r) => {
  const a = r.answers || {};
  return q.type === 'contact' ? !!(r.phoneVerifiedAt || a.phone)
    : q.type === 'consent' ? a.consent === true
    : q.type === 'photo' ? !!r.photo
    : a[q.id] != null && a[q.id] !== '';
};
async function missingOf(r) {
  const { visible, presetRole } = await contextOf(r);
  return survey.shownQuestions(visible, r.answers || {}, presetRole).filter(q => q.required && !answered(q, r));
}

// ── Kirish: "🎤 Ovoz bilan" tugmasi (startSurvey xabarida) ──
function entryButton(r, lang) {
  return { text: T(lang, 'vi.btn'), callback_data: `vi:go:${r.id}` };
}

async function sendTemplate(r, chatId, lang) {
  await send(chatId, T(lang, 'vi.template'), kb([[{ text: T(lang, 'vi.toForm'), callback_data: `vi:form:${r.id}` }]]));
  // AI ovozi (Aisha) yoqilgan bo'lsa — shablonni ovoz bilan ham (services/tts)
  await require('./tts').speak(chatId, T(lang, 'vi.templateSay'), lang).catch(() => {});
}

// ── Ko'rsatish: AI tushungani ──
function reviewText(r, lang, missing) {
  const a = r.answers || {};
  const opt = (id, key) => { const d = key && survey.template().find(q => q.id === id); const o = d && (d.options || []).find(x => x.key === key); return o ? (o.label[lang] || o.label.uz) : ''; };
  const work = a.lastJob === 'none' ? T(lang, 'ank.w.none')
    : Array.isArray(a.lastJob) ? a.lastJob.map(w => `${w.role === 'boshqa' ? w.other : T(lang, 'role.' + w.role)} — ${w.place} (${T(lang, 'ank.w.dur.' + w.dur)})`).join('; ') : '';
  const age = a.birthDate ? survey.ageOf(new Date(a.birthDate + 'T00:00:00+05:00')) : null;
  const rows = [
    [T(lang, 'vi.fName'), a.fullName], [T(lang, 'vi.fAge'), age ? T(lang, 'cb.ageVal', { n: age }) : ''],
    [T(lang, 'vi.fRole'), a.role ? T(lang, 'role.' + a.role) : ''], [T(lang, 'vi.fWork'), work],
    [T(lang, 'vi.fLoc'), opt('location', a.location)], [T(lang, 'vi.fStart'), opt('startWhen', a.startWhen)],
    [T(lang, 'vi.fSal'), opt('salary', a.salary)], [T(lang, 'vi.fRu'), opt('russian', a.russian)]
  ].filter(x => x[1]).map(([k, v]) => `• ${k}: ${v}`);
  return [T(lang, 'vi.review'), '', ...(rows.length ? rows : [T(lang, 'vi.reviewNone')]),
    r.vSummary ? '\n' + r.vSummary : '', '',
    missing.length ? T(lang, 'vi.stillNeed', { n: missing.length }) : T(lang, 'vi.allSet')].filter(x => x !== null).join('\n');
}

// ── Navbatdagi yetishmagan savol ──
async function askNext(r, chatId, lang, appBase) {
  const missing = await missingOf(r);
  if (!missing.length) return finish(r, chatId, lang, appBase);
  const q = missing[0];
  const { visible } = await contextOf(r);
  const qi = visible.findIndex(x => x.id === q.id);
  await SurveyResponse.updateOne({ _id: r._id }, { $set: { vstep: 'chase', vAsk: q.id, updatedAt: new Date() } });
  const title = (q.text && (q.text[lang] || q.text.uz)) || q.id;
  const hint = q.hint && (q.hint[lang] || q.hint.uz);
  const body = `❓ ${title}${hint ? '\n' + hint : ''}`;
  if (q.type === 'choice') {
    const btns = (q.options || []).map((o, oi) => ({ text: o.label[lang] || o.label.uz, callback_data: `vi:a:${r.id}:${qi}:${oi}` }));
    const rows = [];
    for (let i = 0; i < btns.length; i += 2) rows.push(btns.slice(i, i + 2));
    return send(chatId, body, kb(rows));
  }
  if (q.type === 'work') return send(chatId, body + '\n\n' + T(lang, 'vi.workHow'), kb([[{ text: T(lang, 'ank.w.noneLink'), callback_data: `vi:none:${r.id}` }]]));
  if (q.type === 'contact') return send(chatId, body, { reply_markup: { keyboard: [[{ text: T(lang, 'vi.shareBtn'), request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } });
  if (q.type === 'photo') return send(chatId, body + '\n\n' + T(lang, 'vi.photoHow'));
  if (q.type === 'date') return send(chatId, body + '\n\n' + T(lang, 'vi.dateHow'));
  if (q.type === 'consent') return send(chatId, T(lang, 'vi.consent'), kb([[{ text: T(lang, 'vi.consentOk'), callback_data: `vi:ok:${r.id}` }]]));
  return send(chatId, body + '\n\n' + T(lang, 'vi.textHow'));
}

// ── Tugadi: anketaning o'zi ──
async function finish(r, chatId, lang, appBase) {
  const fresh = await SurveyResponse.findOne({ _id: r._id });
  if (!fresh || fresh.status === 'done') return null;
  const out = await survey.finalize(fresh, { appBase });
  // Ovozli rezyume (mijoz eshitadi) va o'zi haqida tavsif
  const set = {};
  if (fresh.voiceFileId) set.voiceIntro = { fileId: fresh.voiceFileId, dur: fresh.voiceDur || 0 };
  if (fresh.vSummary && (out.created || !out.candidate.summary)) set.summary = fresh.vSummary;
  set.prefersVoice = true;
  await Candidate.updateOne({ _id: out.candidate._id }, { $set: set });
  await send(chatId, T(lang, 'vi.done'), { reply_markup: { remove_keyboard: true } });
  await require('./anketaDone').afterFinalize(fresh, out, { appBase, lang, via: 'voice' });
  return out;
}

// ── Ovozni tahlil qilish ──
// voice — ovozli xabar; bo'lmasa text (o'zi yozib yuborgan rezyume)
async function processVoice(r, voice, chatId, lang, appBase, text = '') {
  await send(chatId, T(lang, voice ? 'vi.listening' : 'vi.reading'));
  let parsed;
  try {
    let content;
    if (voice) {
      const f = await tg.getFileBase64(tg.platformToken(), voice.file_id, { maxBytes: MAX_AUDIO });
      content = [{ audio: { mimeType: voice.mime_type || 'audio/ogg', data: f.base64 } }, 'Nomzodning ovozli xabari.'];
    } else content = 'Nomzodning yozma xabari:\n' + String(text).slice(0, 1500);
    parsed = await ai.complete({
      system: VOICE_SYSTEM,
      messages: [{ role: 'user', content }],
      json: true, schema: VOICE_SCHEMA, maxTokens: 900, tier: 'fast', restaurantId: r.agencyId
    });
  } catch (e) {
    console.error('[VI] ovoz tahlili:', e.message);
    return send(chatId, T(lang, 'vi.aiFail'), kb([[{ text: T(lang, 'vi.toForm'), callback_data: `vi:form:${r.id}` }]]));
  }
  const { visible } = await contextOf(r);
  const got = answersFrom(parsed || {}, visible);
  const set = { vstep: 'review', updatedAt: new Date() };
  for (const [k, v] of Object.entries(got)) set['answers.' + k] = v;
  if (parsed && parsed.summary) set.vSummary = String(parsed.summary).slice(0, 300);
  if (voice && (!r.voiceFileId || (voice.duration || 0) >= (r.voiceDur || 0))) { set.voiceFileId = voice.file_id; set.voiceDur = Math.min(600, voice.duration || 0); }
  if (!r.lang && parsed && parsed.spokenLang) set.lang = parsed.spokenLang;
  const up = await SurveyResponse.findOneAndUpdate({ _id: r._id }, { $set: set }, { new: true });
  const L = up.lang || lang;
  const missing = await missingOf(up);
  return send(chatId, reviewText(up, L, missing), kb([
    [{ text: T(L, 'vi.ok'), callback_data: `vi:y:${r.id}` }],
    [{ text: T(L, 'vi.redo'), callback_data: `vi:re:${r.id}` }]]));
}

// Bitta yetishmagan savolga javob (matn yoki ovoz)
async function answerOne(r, q, { text, voice }, chatId, lang, appBase) {
  let value = text;
  let jobs = null, none = false;
  if (voice) {
    try {
      const f = await tg.getFileBase64(tg.platformToken(), voice.file_id, { maxBytes: MAX_AUDIO });
      const p = await ai.complete({
        system: ONE_SYSTEM.replace('{Q}', (q.text && q.text.uz) || q.id) + '\n' + (q.type === 'work' ? VOICE_SYSTEM : ''),
        messages: [{ role: 'user', content: [{ audio: { mimeType: voice.mime_type || 'audio/ogg', data: f.base64 } }, 'Javob.'] }],
        json: true, schema: ONE_SCHEMA, maxTokens: 400, tier: 'fast', restaurantId: r.agencyId
      });
      value = p && p.value; jobs = p && p.jobs; none = !!(p && p.noExperience);
    } catch (e) { return send(chatId, T(lang, 'vi.aiFail')); }
  } else if (q.type === 'work') {
    // Matn bilan yozilgan ish joyi — AI ajratadi
    try {
      const p = await ai.complete({ system: ONE_SYSTEM.replace('{Q}', q.text.uz) + '\n' + VOICE_SYSTEM,
        messages: [{ role: 'user', content: String(text).slice(0, 400) }], json: true, schema: ONE_SCHEMA, maxTokens: 400, tier: 'fast', restaurantId: r.agencyId });
      jobs = p && p.jobs; none = !!(p && p.noExperience);
    } catch (e) { return send(chatId, T(lang, 'vi.aiFail')); }
  }

  let val;
  try {
    if (q.type === 'work') val = survey.checkAnswer(q, none ? 'none' : (jobs || []).slice(0, 3).map(j => ({ place: j.place, role: j.role, other: j.other || '', dur: j.dur })));
    else if (q.type === 'date') val = survey.checkAnswer(q, parseDate(value));
    else if (q.type === 'choice') {
      const t = String(value || '').toLowerCase().trim();
      const o = (q.options || []).find(x => [x.label.uz, x.label.ru].some(l => String(l).toLowerCase() === t || String(l).toLowerCase().startsWith(t)));
      val = survey.checkAnswer(q, o ? o.key : '');
    }
    else val = survey.checkAnswer(q, value);
  } catch (e) {
    await send(chatId, T(lang, 'vi.err.' + (['fullName', 'date', 'age', 'phone', 'work', 'length'].includes(e.code) ? e.code : 'other')));
    return askNext(r, chatId, lang, appBase);
  }
  const set = { updatedAt: new Date() };
  if (q.type === 'contact') set['answers.phone'] = val; else set['answers.' + q.id] = val;
  const up = await SurveyResponse.findOneAndUpdate({ _id: r._id }, { $set: set }, { new: true });
  return askNext(up, chatId, lang, appBase);
}

// "12.05.2001", "12/05/2001", "2001-05-12" -> "YYYY-MM-DD"
function parseDate(s) {
  const t = String(s || '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[./\- ](\d{1,2})[./\- ](\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return t;
}

/**
 * Webhook: ochiq ovozli anketa bo'lsa xabar shu yerda (ovoz, matn, rasm).
 * @returns {Promise<boolean>} true — qabul qilindi, boshqa yo'lga ketmaydi
 */
async function onMessage({ msg, chatId, appBase }) {
  const fromId = String((msg.from && msg.from.id) || chatId);
  const r = await SurveyResponse.findOne({ tgUserId: fromId, status: 'started', mode: 'voice' }).sort({ updatedAt: -1 });
  if (!r || !['consent', 'wait', 'review', 'chase'].includes(r.vstep)) return false;
  const lang = langOf(r, msg.from);
  const text = String(msg.text || '').trim();
  const voice = msg.voice || msg.audio || null;

  if (r.vstep === 'consent') { await send(chatId, T(lang, 'vi.consentFirst')); return true; }

  if (r.vstep === 'wait' || r.vstep === 'review') {
    if (voice) { await processVoice(r, voice, chatId, lang, appBase); return true; }
    if (text.length >= 25) { await processVoice(r, null, chatId, lang, appBase, text); return true; }
    await send(chatId, T(lang, r.vstep === 'wait' ? 'vi.needVoice' : 'vi.reviewHint'));
    return true;
  }

  // chase — bitta savol
  const { visible } = await contextOf(r);
  const q = visible.find(x => x.id === r.vAsk);
  if (!q) { await askNext(r, chatId, lang, appBase); return true; }
  if (q.type === 'photo') {
    const ph = Array.isArray(msg.photo) && msg.photo.length ? msg.photo : null;
    if (!ph) { await send(chatId, T(lang, 'vi.photoHow')); return true; }
    // 1280px gacha eng kattasi (Telegram bir nechta o'lcham beradi)
    const best = ph.filter(p => (p.width || 0) <= 1280).pop() || ph[0];
    try {
      const f = await tg.getFileBase64(tg.platformToken(), best.file_id, { maxBytes: MAX_PHOTO });
      const url = 'data:image/jpeg;base64,' + f.base64;
      survey.checkAnswer(q, url);
      const up = await SurveyResponse.findOneAndUpdate({ _id: r._id }, { $set: { photo: url, updatedAt: new Date() } }, { new: true });
      await send(chatId, T(lang, 'vi.photoOk'));
      await askNext(up, chatId, lang, appBase);
    } catch (e) { await send(chatId, T(lang, 'vi.err.photo')); }
    return true;
  }
  if (q.type === 'contact' && !text) { await askNext(r, chatId, lang, appBase); return true; }
  if (!text && !voice) { await askNext(r, chatId, lang, appBase); return true; }
  await answerOne(r, q, { text, voice }, chatId, lang, appBase);
  return true;
}

/** Kontakt (Telegram tasdiqlagan raqam) kelgandan keyin — keyingi savol */
async function afterContact(chatId, from, appBase) {
  const fromId = String((from && from.id) || chatId);
  const r = await SurveyResponse.findOne({ tgUserId: fromId, status: 'started', mode: 'voice', vstep: 'chase' }).sort({ updatedAt: -1 });
  if (!r) return false;
  const lang = langOf(r, from);
  await send(chatId, '✓', { reply_markup: { remove_keyboard: true } });
  await askNext(r, chatId, lang, appBase);
  return true;
}

/**
 * Tugma: vi:go | vi:ok | vi:y | vi:re | vi:form | vi:none | vi:a:<qi>:<oi>
 * @returns {{ ok, text, alert?, edit?, keyboard? }} (iv/ps bilan bir xil shakl)
 */
const CB_RE = /^vi:(go|ok|y|re|form|none|a):([0-9a-f-]{36})(?::(\d{1,2}):(\d{1,2}))?$/;
async function handleCallback({ data, chatId, from, appBase = '' }) {
  const m = CB_RE.exec(String(data || ''));
  if (!m) return { ok: false, text: '' };
  const [, op, rid, qi, oi] = m;
  const fromId = String((from && from.id) || chatId);
  const r = await SurveyResponse.findOne({ id: rid, tgUserId: fromId });
  if (!r) return { ok: false, text: 'Topilmadi / Не найдено', alert: true };
  if (r.status === 'done') return { ok: true, text: '✓' };
  const lang = langOf(r, from);

  if (op === 'go') {
    await SurveyResponse.updateOne({ _id: r._id }, { $set: { mode: 'voice', vstep: 'consent', lang: r.lang || lang, updatedAt: new Date() } });
    await send(chatId, T(lang, 'vi.consent'), kb([[{ text: T(lang, 'vi.consentOk'), callback_data: `vi:ok:${rid}` }]]));
    return { ok: true, text: '🎤' };
  }
  if (op === 'ok') {
    await SurveyResponse.updateOne({ _id: r._id }, { $set: { 'answers.consent': true, vstep: r.vstep === 'chase' ? 'chase' : 'wait', updatedAt: new Date() } });
    if (r.vstep === 'chase') { await askNext(await SurveyResponse.findOne({ _id: r._id }), chatId, lang, appBase); return { ok: true, text: '✓' }; }
    await sendTemplate(r, chatId, lang);
    return { ok: true, text: '✓', edit: T(lang, 'vi.consentDone') };
  }
  if (op === 're') {
    await SurveyResponse.updateOne({ _id: r._id }, { $set: { vstep: 'wait', updatedAt: new Date() } });
    await send(chatId, T(lang, 'vi.redoHow'));
    return { ok: true, text: '🎤' };
  }
  if (op === 'y') {
    await askNext(r, chatId, lang, appBase);
    return { ok: true, text: '✓' };
  }
  if (op === 'form') {
    // Mini App anketasiga o'tish — javoblar saqlangan, o'sha yozuv davom etadi
    await SurveyResponse.updateOne({ _id: r._id }, { $set: { mode: '', vstep: '', updatedAt: new Date() } });
    await send(chatId, T(lang, 'vi.formNote'), appBase ? kb([[{ text: T(lang, 'ank.botOpen'), web_app: { url: `${appBase}/anketa.html?r=${rid}` } }]]) : {});
    return { ok: true, text: '📝' };
  }
  const { visible } = await contextOf(r);
  if (op === 'none') {
    const q = visible.find(x => x.type === 'work');
    if (q) await SurveyResponse.updateOne({ _id: r._id }, { $set: { [`answers.${q.id}`]: 'none', updatedAt: new Date() } });
    await askNext(await SurveyResponse.findOne({ _id: r._id }), chatId, lang, appBase);
    return { ok: true, text: '✓' };
  }
  // a — variantli savolga javob
  const q = visible[+qi];
  const o = q && (q.options || [])[+oi];
  if (!q || !o) return { ok: false, text: T(lang, 'ivx.kStale'), alert: true };
  await SurveyResponse.updateOne({ _id: r._id }, { $set: { [`answers.${q.id}`]: o.key, updatedAt: new Date() } });
  await askNext(await SurveyResponse.findOne({ _id: r._id }), chatId, lang, appBase);
  return { ok: true, text: '✓', edit: `✓ ${(q.text && (q.text[lang] || q.text.uz)) || ''}: ${o.label[lang] || o.label.uz}` };
}

/** Ovozli xabar -> matn (AI rekruter suhbati uchun; routes/telegram nomzod chati) */
async function transcribe(voice, agencyId) {
  if (!voice || !voice.file_id) return '';
  const f = await tg.getFileBase64(tg.platformToken(), voice.file_id, { maxBytes: MAX_AUDIO });
  const text = await ai.complete({
    system: 'Ovozli xabarni (o\'zbek yoki rus tilida) so\'zma-so\'z matnga aylantir. Faqat aytilgan matnni qaytar, izohsiz. Tushunarsiz bo\'lsa — bo\'sh qator.',
    messages: [{ role: 'user', content: [{ audio: { mimeType: voice.mime_type || 'audio/ogg', data: f.base64 } }, 'Matnga aylantir.'] }],
    maxTokens: 600, tier: 'fast', restaurantId: agencyId
  });
  return String(text || '').trim().slice(0, 2000);
}

module.exports = { transcribe, entryButton, onMessage, afterContact, handleCallback, answersFrom, salaryBucket, parseDate, missingOf, VOICE_SCHEMA, CB_RE };
