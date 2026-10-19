// ── ANKETA XIZMATI ───────────────────────────────────────────
// O'z nomzod oqimi: e'lon havolasi -> bot -> Mini App anketa -> bazada
// TAYYOR nomzod (va vakansiya havolasi bo'lsa — ariza).
//
// Asosiy qoida: javob nomzod maydoniga SHABLON bo'yicha tushadi
// (toFields). AI talqin qilmaydi — har savolning yopiq variantlari bor,
// erkin matn faqat ism va oxirgi ish joyi.
//
// Telefon — Telegram "kontaktni ulashish" (bot webhook'i tasdiqlaydi).
// Rozilik — alohida qadam; usiz nomzod yaratilmaydi.

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const Survey = require('../models/Survey');
const SurveyResponse = require('../models/SurveyResponse');
const Candidate = require('../models/Candidate');
const Vacancy = require('../models/Vacancy');
const applications = require('./applications');
const applyReveal = require('./applyReveal');
const { phoneKey } = require('../utils/candidateKeys');
const { ROLES, isValidRole } = require('../data/roles');
const I18N = require('../../public/js/th-i18n');

// ── E'lon manbalari (havoladagi kanal) ──
// Kalit faqat kichik lotin harflari: payload'da '_' ajratuvchi.
const CHANNELS = {
  tg:    'Telegram',
  ig:    'Instagram',
  fb:    'Facebook',
  olx:   'OLX',
  hh:    'hh.uz',
  qr:    'QR kod',
  ref:   'Tanish orqali',
  site:  'Sayt',
  other: 'Boshqa'
};

// ── Shablon variantlari ──
const o = (key, uz, ru) => ({ key, uz, ru });

const DISTRICTS = [
  o('bektemir', 'Bektemir', 'Бектемир'),       o('chilonzor', 'Chilonzor', 'Чиланзар'),
  o('mirobod', 'Mirobod', 'Мирабад'),          o('mirzo', 'Mirzo Ulug\'bek', 'Мирзо-Улугбек'),
  o('olmazor', 'Olmazor', 'Алмазар'),          o('sergeli', 'Sergeli', 'Сергели'),
  o('shayxontohur', 'Shayxontohur', 'Шайхантахур'), o('uchtepa', 'Uchtepa', 'Учтепа'),
  o('yakkasaroy', 'Yakkasaroy', 'Яккасарай'),  o('yashnobod', 'Yashnobod', 'Яшнабад'),
  o('yunusobod', 'Yunusobod', 'Юнусабад'),     o('yangihayot', 'Yangihayot', 'Янгихаёт'),
  o('viloyat', 'Toshkent viloyati', 'Ташкентская область')
];
// Tajriba varianti -> experienceYears (qidiruv filtri son bilan ishlaydi)
const EXP_YEARS = { none: 0, lt1: 0, y1_2: 1, y3_5: 3, y5: 5 };

// ── Boshlang'ich shablon ──
// Tarnovning Verifix'dagi ofitsiant anketasi asosida (2026-10-19 da
// ko'rilgan): filial savoli -> tuman (agentlikda filial yo'q), "qayerdan
// bildingiz" -> havoladagi kanal (aniqroq), qo'shildi: sanitar kitobcha,
// lavozim (umumiy anketa), rozilik.
function template() {
  return [
    { id: 'role', type: 'choice', text: { uz: 'Qaysi lavozimda ishlamoqchisiz?', ru: 'На какую должность вы хотите?' },
      options: ROLES.map(r => o(r.key, I18N.t('uz', 'role.' + r.key), I18N.t('ru', 'role.' + r.key))) },
    { id: 'fullName', type: 'text', text: { uz: 'Ism va familiyangiz', ru: 'Ваше имя и фамилия' },
      hint: { uz: 'Masalan: Aziza Karimova', ru: 'Например: Азиза Каримова' } },
    { id: 'birthDate', type: 'date', text: { uz: 'Tug\'ilgan sanangiz', ru: 'Дата рождения' } },
    { id: 'gender', type: 'choice', text: { uz: 'Jinsingiz', ru: 'Пол' },
      options: [o('female', 'Ayol', 'Женский'), o('male', 'Erkak', 'Мужской')] },
    { id: 'phone', type: 'contact', text: { uz: 'Telefon raqamingiz', ru: 'Ваш номер телефона' },
      hint: { uz: 'Tugmani bosing — Telegram raqamingizni o\'zi yuboradi, xato bo\'lmaydi.',
              ru: 'Нажмите кнопку — Telegram сам отправит ваш номер, без ошибок.' } },
    { id: 'location', type: 'choice', text: { uz: 'Qaysi tumanda yashaysiz?', ru: 'В каком районе вы живёте?' },
      options: DISTRICTS },
    { id: 'experience', type: 'choice', text: { uz: 'Restoranda ish tajribangiz', ru: 'Опыт работы в ресторане' },
      options: [o('none', 'Tajribam yo\'q', 'Нет опыта'), o('lt1', '1 yilgacha', 'До 1 года'),
                o('y1_2', '1–2 yil', '1–2 года'), o('y3_5', '3–5 yil', '3–5 лет'), o('y5', '5 yildan ortiq', 'Более 5 лет')] },
    { id: 'lastJob', type: 'longtext', required: false,
      text: { uz: 'Oxirgi ish joyingiz va lavozimingiz', ru: 'Последнее место работы и должность' },
      hint: { uz: 'Masalan: Rayhon restorani, ofitsiant, 2023–2025', ru: 'Например: ресторан «Райхон», официант, 2023–2025' } },
    { id: 'shift', type: 'choice', text: { uz: 'Qaysi smenada ishlay olasiz?', ru: 'В какую смену можете работать?' },
      options: [o('kunduzgi', 'Kunduzgi', 'Дневная'), o('kechki', 'Kechki', 'Вечерняя'), o('ikkalasi', 'Farqi yo\'q', 'Любая')] },
    { id: 'salary', type: 'choice', text: { uz: 'Qancha maosh kutyapsiz?', ru: 'Какую зарплату ожидаете?' },
      options: [o('s4_6', '4–6 mln so\'m', '4–6 млн сум'), o('s6_9', '6–9 mln so\'m', '6–9 млн сум'),
                o('s9_12', '9–12 mln so\'m', '9–12 млн сум'), o('s12', '12 mln so\'mdan ortiq', 'Более 12 млн сум')] },
    { id: 'russian', type: 'choice', text: { uz: 'Rus tilini qay darajada bilasiz?', ru: 'Насколько хорошо вы знаете русский?' },
      options: [o('fluent', 'Erkin gaplashaman', 'Свободно'), o('medium', 'Tushunaman, gaplasha olaman', 'Понимаю, могу объясниться'),
                o('basic', 'Boshlang\'ich', 'Начальный уровень'), o('none', 'Bilmayman', 'Не знаю')] },
    { id: 'sanitary', type: 'choice', text: { uz: 'Sanitar kitobchangiz bormi?', ru: 'Есть ли санитарная книжка?' },
      options: [o('yes', 'Bor', 'Есть'), o('expired', 'Muddati o\'tgan', 'Просрочена'), o('no', 'Yo\'q', 'Нет')] },
    { id: 'study', type: 'choice', text: { uz: 'Hozir o\'qiysizmi?', ru: 'Вы сейчас учитесь?' },
      options: [o('no', 'Yo\'q', 'Нет'), o('day', 'Ha, kunduzgi', 'Да, очно'),
                o('evening', 'Ha, kechki', 'Да, вечернее'), o('distance', 'Ha, sirtqi', 'Да, заочно')] },
    { id: 'photo', type: 'photo', required: false, text: { uz: 'Rasmingizni yuboring', ru: 'Отправьте ваше фото' },
      hint: { uz: 'Selfi ham bo\'ladi — rasmli anketani ish beruvchilar ko\'proq ko\'radi.',
              ru: 'Подойдёт и селфи — анкеты с фото работодатели смотрят чаще.' } },
    { id: 'consent', type: 'consent', text: { uz: 'Rozilik', ru: 'Согласие' },
      hint: { uz: 'Ma\'lumotlarim TalentHub tomonidan saqlanishi va mos ish beruvchilarga ko\'rsatilishiga roziman. ' +
                  'Ism va telefonim ish beruvchiga faqat men bilan bog\'lanish uchun beriladi.',
              ru: 'Я согласен(на), чтобы TalentHub хранил мои данные и показывал их подходящим работодателям. ' +
                  'Имя и телефон передаются работодателю только для связи со мной.' } }
  ].map(q => Object.assign({ required: true, hint: { uz: '', ru: '' }, options: [] }, q));
}

// ── Konstruktor qoidalari ──
// Standart savollar nomzod maydoniga bog'langan (toFields id va kalit
// bo'yicha o'qiydi). Konstruktor ularning MATNINI, tartibini, majburiyligini
// o'zgartira oladi va (qulflanganidan boshqasini) olib tashlay oladi;
// TURINI o'zgartira olmaydi.
//   locked      — o'chirib bo'lmaydi, doim majburiy (ularsiz nomzod yo'q)
//   keys:'fixed'— variant kalitlari kodda ma'noli (smena, tajriba yili...):
//                 nomini o'zgartirish va yashirish mumkin, yangisi qo'shilmaydi
//   keys:'open' — bazaga variant YOZUVI tushadi (tuman, maosh): qo'shish mumkin
//   field       — panelda ko'rinadigan "qaysi maydonga tushadi"
const CATALOG = {
  role:       { keys: 'fixed', field: 'Lavozim' },
  fullName:   { locked: true,  field: 'Ism' },
  birthDate:  {                field: 'Yosh' },
  gender:     { keys: 'fixed', field: 'Jins' },
  phone:      { locked: true,  field: 'Telefon' },
  location:   { keys: 'open',  field: 'Hudud' },
  experience: { keys: 'fixed', field: 'Tajriba (yil)' },
  lastJob:    {                field: 'Tajriba haqida' },
  shift:      { keys: 'fixed', field: 'Smena' },
  salary:     { keys: 'open',  field: 'Kutilgan maosh' },
  russian:    { keys: 'fixed', field: 'Tillar' },
  sanitary:   { keys: 'fixed', field: 'Sanitar kitobcha' },
  study:      { keys: 'open',  field: 'Ta\'lim' },
  photo:      {                field: 'Foto' },
  consent:    { locked: true,  field: 'Rozilik' }
};
// O'z savoli — faqat shu turlar (sana, telefon, rasm, rozilik standart savolda)
const CUSTOM_TYPES = ['text', 'longtext', 'choice'];

/** Panel uchun: standart savollar (shablon matni bilan) va ularning qoidalari. */
function catalogInfo() {
  return template().map(q => Object.assign({}, q, CATALOG[q.id] || {}));
}

const shortId = () => [...crypto.randomBytes(4)].map(x => CODE_ABC[x % CODE_ABC.length]).join('').toLowerCase();

/**
 * Konstruktordan kelgan savollarni tekshiradi va tozalaydi.
 * Xato bo'lsa throw (matn — panel uchun, o'zbekcha).
 */
function cleanQuestions(input) {
  const fail = m => { throw Object.assign(new Error(m), { status: 400 }); };
  if (!Array.isArray(input) || !input.length) fail('Savollar ro\'yxati bo\'sh');
  if (input.length > 40) fail('Ko\'pi bilan 40 ta savol');
  const tpl = Object.fromEntries(template().map(q => [q.id, q]));
  const str = (s, max) => String(s == null ? '' : s).trim().slice(0, max);
  const seen = new Set();

  const out = input.map((raw, i) => {
    const r = raw || {};
    let id = str(r.id, 40);
    const std = CATALOG[id] ? tpl[id] : null;
    if (!std && !/^c_[a-z0-9]{3,12}$/.test(id)) id = 'c_' + shortId();   // yangi o'z savoli
    if (seen.has(id)) fail(`Savol takrorlangan: ${id}`);
    seen.add(id);

    const type = std ? std.type : (CUSTOM_TYPES.includes(r.type) ? r.type : fail(`${i + 1}-savol: turi noto'g'ri`));
    const rule = std ? CATALOG[id] : {};
    const text = { uz: str(r.text && r.text.uz, 200), ru: str(r.text && r.text.ru, 200) };
    if (!text.uz) fail(`${i + 1}-savol: o'zbekcha matn bo'sh`);
    const q = {
      id, type,
      required: rule.locked || type === 'consent' ? true : !!r.required,
      text,
      hint: { uz: str(r.hint && r.hint.uz, 600), ru: str(r.hint && r.hint.ru, 600) },
      options: []
    };
    if (type === 'consent' && !q.hint.uz) fail('Rozilik matni bo\'sh bo\'lmasin');

    if (type === 'choice') {
      const allowed = std && rule.keys === 'fixed' ? new Set(std.options.map(o => o.key)) : null;
      const keys = new Set();
      for (const o of (Array.isArray(r.options) ? r.options : [])) {
        let key = str(o && o.key, 30);
        if (allowed) { if (!allowed.has(key)) continue; }        // kodda ma'noli kalit — yangisi yo'q
        else if (!/^[a-z0-9_]{1,30}$/.test(key) || keys.has(key)) key = 'o_' + shortId();
        if (keys.has(key)) continue;
        const uz = str(o.uz, 80);
        if (!uz) fail(`${i + 1}-savol: variant matni bo'sh`);
        keys.add(key);
        q.options.push({ key, uz, ru: str(o.ru, 80) });
      }
      if (q.options.length < 2) fail(`${i + 1}-savol: kamida 2 ta variant kerak`);
      if (q.options.length > 30) fail(`${i + 1}-savol: ko'pi bilan 30 ta variant`);
    }
    return q;
  });

  for (const id of Object.keys(CATALOG).filter(k => CATALOG[k].locked)) {
    if (!seen.has(id)) fail('Ism, telefon va rozilik savollarini olib tashlab bo\'lmaydi');
  }
  // Rozilik — oxirida: anketa oxirgi savolda yuboriladi
  const ci = out.findIndex(q => q.id === 'consent');
  out.push(out.splice(ci, 1)[0]);
  return out;
}

// Vakansiya havolasi qaysi anketani ochadi: shu lavozim anketasi, bo'lmasa umumiy
async function surveyForVacancy(v) {
  if (isValidRole(v.role)) {
    const s = await Survey.findOne({ agencyId: v.agencyId, role: v.role, active: true, isDefault: false }).lean();
    if (s) return s;
  }
  return ensureDefault(v.agencyId);
}

// ── Havola kodi ──
const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';     // I, O, 0, 1 yo'q — o'qishda adashmasin
function makeCode() {
  const b = crypto.randomBytes(6);
  return [...b].map(x => CODE_ABC[x % CODE_ABC.length]).join('');
}

// Agentlikning umumiy anketasi (lavozimni nomzod tanlaydi). Yo'q bo'lsa
// shablondan yasaladi — konstruktor paydo bo'lguncha yagona anketa shu.
async function ensureDefault(agencyId) {
  const all = await Survey.find({ agencyId, isDefault: true }).sort({ createdAt: 1 });
  // Ikkinchi nusxa — unikal indeks paydo bo'lishidan oldingi parallel
  // so'rovlar izi (2026-10-19: HMXT37 va XYAFYP 0,2 s farq bilan).
  // Eng eskisi qoladi (havolalar uning kodida), qolgani o'chiriladi;
  // indeks takror bor paytda qurilmagan — endi quriladi.
  if (all.length > 1) {
    await Survey.updateMany({ agencyId, isDefault: true, id: { $ne: all[0].id } },
      { $set: { isDefault: false, active: false, updatedAt: new Date() } });
    Survey.createIndexes().catch(e => console.error('[SURVEY] indeks qurilmadi:', e.message));
  }
  const s = all[0];
  if (s) { if (!s.active) { s.active = true; await s.save(); } return s; }
  for (let i = 0; i < 5; i++) {
    try {
      return await Survey.create({
        id: uuidv4(), agencyId, code: makeCode(), isDefault: true, active: true, role: '',
        title: { uz: 'Restoran xodimi anketasi', ru: 'Анкета сотрудника ресторана' },
        questions: template()
      });
    } catch (e) {
      if (e.code !== 11000) throw e;
      // Parallel so'rov allaqachon yaratgan bo'lsa — o'shani qaytaramiz
      // (Survey: agentlikka bitta umumiy anketa — unikal indeks); aks holda kod band — qayta
      const ex = await Survey.findOne({ agencyId, isDefault: true, active: true });
      if (ex) return ex;
    }
  }
  throw new Error('Anketa kodi yaratilmadi');
}

// ── Telegram /start payload ──
// a_<kod>_<kanal> — umumiy anketa;  v_<vakansiya uuid>_<kanal> — vakansiya.
// Telegram chegarasi: 64 belgi, [A-Za-z0-9_-]. uuid (36) + 'v_' + '_kanal' sig'adi.
const cleanChannel = ch => (CHANNELS[ch] ? ch : '');
function payloadFor({ code, vacancyId, channel }) {
  const ch = cleanChannel(channel);
  const head = vacancyId ? 'v_' + vacancyId : 'a_' + code;
  return ch ? `${head}_${ch}` : head;
}
function parsePayload(p) {
  let m = /^a_([A-Z2-9]{6})(?:_([a-z]{1,8}))?$/.exec(p || '');
  if (m) return { code: m[1], channel: cleanChannel(m[2]) };
  m = /^v_([0-9a-f-]{36})(?:_([a-z]{1,8}))?$/.exec(p || '');
  if (m) return { vacancyId: m[1], channel: cleanChannel(m[2]) };
  return null;
}

// ── Ko'rinadigan savollar ──
// Lavozim allaqachon ma'lum (vakansiya yoki lavozimli anketa) — so'ralmaydi.
function visibleQuestions(survey, presetRole) {
  return (survey.questions || []).filter(q => !(q.id === 'role' && presetRole));
}

// ── Javobni tekshirish ──
// Qaytaradi: saqlanadigan qiymat. Xato bo'lsa throw (matn o'zbekcha —
// route uni mijoz tilida qaytarmaydi, anketa o'z matnini ko'rsatadi).
function checkAnswer(q, value) {
  const err = code => { const e = new Error(code); e.code = code; throw e; };
  if (value == null || value === '') {
    if (q.required) err('required');
    return '';
  }
  switch (q.type) {
    case 'text': {
      const s = String(value).trim().replace(/\s+/g, ' ');
      if (s.length < 2 || s.length > 80) err('length');
      return s;
    }
    case 'longtext': {
      const s = String(value).trim();
      if (s.length > 600) err('length');
      return s;
    }
    case 'date': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) err('date');
      const d = new Date(value + 'T00:00:00+05:00');
      const age = ageOf(d);
      if (isNaN(d.getTime()) || age < 14 || age > 70) err('age');
      return String(value);
    }
    case 'choice':
      if (!(q.options || []).some(x => x.key === value)) err('option');
      return value;
    case 'contact':
      // Qo'lda kiritish (Telegram tugmasi ishlamagan holat) — format tekshiriladi
      if (!applyReveal.validPhone(value)) err('phone');
      return normPhone(value);
    case 'photo':
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(String(value)) || String(value).length > 1500000) err('photo');
      return value;
    case 'consent':
      if (value !== true) err('consent');
      return true;
    default:
      err('type');
  }
}

function ageOf(d) {
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}
// "+998 90 123 45 67" ko'rinishi; 9 raqam bo'lsa 998 qo'shiladi
function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 9) d = '998' + d;
  return d.length === 12
    ? `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`
    : String(p || '').trim();
}

// ── Javoblar -> nomzod maydonlari (SHABLON) ──
// Bazaga o'zbekcha yoziladi (qidiruv va panel shu yozuvni biladi);
// Mini App ko'rsatishda o'z tiliga keltiradi.
function toFields(answers, survey, presetRole) {
  const a = answers || {};
  const opt = (qid, key) => {
    const q = (survey.questions || []).find(x => x.id === qid);
    const x = q && (q.options || []).find(y => y.key === key);
    return x ? x.uz : '';
  };
  const f = {};
  const role = isValidRole(presetRole) ? presetRole : (isValidRole(a.role) ? a.role : '');
  if (role) { f.role = role; f.desiredPosition = I18N.t('uz', 'role.' + role); }
  if (a.fullName) f.fullName = a.fullName;
  if (a.birthDate) {
    const d = new Date(a.birthDate + 'T00:00:00+05:00');
    f.birthDate = d;
    f.age = ageOf(d);
  }
  if (a.gender) f.gender = a.gender;
  if (a.location) f.location = a.location === 'viloyat' ? opt('location', 'viloyat') : 'Toshkent, ' + opt('location', a.location);
  if (a.experience) f.experienceYears = EXP_YEARS[a.experience] || 0;
  if (a.lastJob) f.experienceSummary = a.lastJob;
  if (a.shift) f.shift = a.shift;
  if (a.salary) f.salaryExpectation = opt('salary', a.salary);
  // Rus tili: erkin/o'rta — tilni biladi (qidiruv filtri); daraja rawText'da
  if (a.russian) f.languages = ['fluent', 'medium'].includes(a.russian) ? ['Rus'] : [];
  if (a.sanitary) f.sanitaryBook = a.sanitary;
  if (a.study) f.education = a.study === 'no' ? 'O\'qimaydi' : 'O\'qiydi (' + opt('study', a.study).replace(/^Ha, /, '') + ')';

  // Konstruktorda qo'shilgan o'z savollari — maydoni yo'q: kartadagi
  // "Anketa javoblari" bo'limiga (savol matni o'zbekcha, panel uchun)
  f.extraAnswers = (survey.questions || [])
    .filter(q => !CATALOG[q.id] && a[q.id] != null && a[q.id] !== '')
    .map(q => ({ q: q.text.uz, a: q.type === 'choice' ? opt(q.id, a[q.id]) : String(a[q.id]) }));

  // Kalit so'z qidiruvi uchun to'liq matn (rezyumedagi rawText o'rnida)
  f.rawText = (survey.questions || [])
    .filter(q => a[q.id] != null && a[q.id] !== '' && !['photo', 'consent'].includes(q.type))
    .map(q => `${q.text.uz}: ${q.type === 'choice' ? opt(q.id, a[q.id]) : a[q.id]}`)
    .join('\n');
  return f;
}

/**
 * Anketani yakunlaydi: nomzod yaratiladi yoki mavjudi yangilanadi,
 * vakansiya havolasi bo'lsa — ariza.
 * @returns {{candidate, created:boolean, applied:boolean}}
 */
async function finalize(r, { appBase } = {}) {
  const survey = await Survey.findOne({ agencyId: r.agencyId, id: r.surveyId }).lean();
  if (!survey) throw new Error('Anketa topilmadi');
  const vacancy = r.vacancyId
    ? await Vacancy.findOne({ agencyId: r.agencyId, id: r.vacancyId }).lean() : null;
  const presetRole = (vacancy && isValidRole(vacancy.role) && vacancy.role) || survey.role || '';

  const a = r.answers || {};
  const phone = r.phoneVerifiedAt ? r.phone : a.phone;
  const pk = phoneKey(phone);

  // Kim? 1) shu Telegram akkaunti bog'langan nomzod  2) shu telefon
  let cand = await Candidate.findOne({ restaurantId: r.agencyId, tgChatId: r.tgUserId });
  if (!cand && pk) {
    const byPhone = await Candidate.findOne({ restaurantId: r.agencyId, phoneKey: pk });
    // Telefon boshqa Telegram akkauntiga bog'langan bo'lsa — faqat Telegram
    // tasdiqlagan raqamga ishonamiz (o'sha odam, yangi akkaunt). Qo'lda
    // yozilgan raqam bilan birovning profilini egallab bo'lmasin.
    if (byPhone && (!byPhone.tgChatId || r.phoneVerifiedAt)) cand = byPhone;
  }
  const created = !cand;
  if (!cand) {
    cand = new Candidate({ id: uuidv4(), restaurantId: r.agencyId, source: 'anketa', status: 'new' });
  }

  // Anketa — odamning o'z so'zi, eng yangi ma'lumot: bo'sh bo'lmagani yoziladi
  const f = toFields(a, survey, presetRole);
  for (const [k, v] of Object.entries(f)) {
    if (v === '' || v == null) continue;
    if (k === 'extraAnswers' && !v.length && !created) continue;   // eski javoblar o'chmasin
    if (k === 'rawText' && cand.rawText && !created) continue;   // rezyume matni saqlansin
    cand[k] = v;
  }
  if (phone) cand.phone = normPhone(phone);
  if (r.phoneVerifiedAt) cand.phoneVerifiedAt = r.phoneVerifiedAt;
  if (r.photo) { cand.photo = r.photo; cand.hasPhoto = true; }

  // Boshqa nomzodga shu chat bog'langan bo'lsa — uzamiz (/start'dagi qoida)
  await Candidate.updateMany(
    { tgChatId: r.tgUserId, id: { $ne: cand.id } },
    { $set: { tgChatId: '', tgUsername: '', tgState: 'none' } }
  );
  cand.tgChatId = r.tgUserId;
  if (cand.tgState !== 'linked') { cand.tgState = 'linked'; cand.tgLinkedAt = new Date(); }
  cand.tgInviteToken = '';
  cand.lang = r.lang || cand.lang;
  cand.channel = r.channel || cand.channel;
  cand.consentAt = new Date();
  cand.jobStatus = 'active';
  cand.jobStatusAt = new Date();
  cand.aiParsed = true;                // shablon bo'yicha tuzilgan — qayta tahlil kerak emas
  cand.updatedAt = new Date();
  await cand.save();

  let applied = false;
  if (vacancy && vacancy.status === 'open') {
    try {
      await applications.submit({ cand, vacancy, appBase, via: 'anketa' });
      applied = true;
    } catch (e) {
      if (e.code !== 11000) console.error('[SURVEY] ariza berilmadi:', e.message);   // 11000 — allaqachon bergan
    }
  }

  await SurveyResponse.updateOne({ agencyId: r.agencyId, id: r.id },
    { $set: { status: 'done', candidateId: cand.id, completedAt: new Date(), updatedAt: new Date() } });
  return { candidate: cand, created, applied, vacancy };
}

module.exports = {
  CHANNELS, DISTRICTS, CATALOG, CUSTOM_TYPES, catalogInfo, cleanQuestions, surveyForVacancy,
  template, makeCode, ensureDefault,
  payloadFor, parsePayload, visibleQuestions, checkAnswer, toFields, finalize, normPhone, ageOf
};
