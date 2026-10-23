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
  vakuz: 'vakansiya.uz kanali',     // agentlikning o'z Telegram kanali — havola oynasida birinchi
  tg:    'Telegram',
  ig:    'Instagram',
  fb:    'Facebook',
  olx:   'OLX',
  hh:    'hh.uz',
  qr:    'QR kod',
  ref:   'Tanish orqali',
  site:  'Sayt',
  bot:   'Botni o\'zi topgan',      // havolasiz /start (routes/telegram plainStart)
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
// "Qachondan" varianti -> necha kundan keyin chiqa oladi (availableFrom)
const START_DAYS = { now: 0, w1: 7, w2: 14, m1: 30 };
// "Talabamisiz?" -> smena (smena savoli o'rniga keldi, qidiruv filtri shift'ni o'qiydi)
const STUDY_SHIFT = { day: 'kechki', evening: 'kunduzgi', distance: 'ikkalasi', no: 'ikkalasi' };

// ── Boshlang'ich shablon ──
// 1-versiya Tarnovning Verifix'dagi ofitsiant anketasidan olingan edi.
// 2-versiya (2026-10-20, Anas bilan): agentlik uchun professional tartib —
//   1) ISH haqida (oson, bir bosishli savollar — odam qiziqib qolsin)
//   2) SIZ haqingizda (shaxsiy ma'lumot — qiziqish paydo bo'lgandan keyin)
//   3) QO'SHIMCHA
// Har izoh savol NEGA berilayotganini aytadi — javob halolroq bo'ladi.
// Qo'shildi: "qachondan ish boshlay olasiz", ingliz tili, smenada "faqat
// dam olish kunlari", maoshda "kelishamiz". Jins — ixtiyoriy (2023 Mehnat
// kodeksi ishga olishda jins/yosh bo'yicha kamsitishni taqiqlaydi).
function template() {
  const yesNo = () => [o('ha', 'Ha', 'Да'), o('yoq', 'Yo\'q', 'Нет')];
  return [
    // ── Ish haqida ──
    { id: 'role', type: 'choice', text: { uz: 'Qaysi lavozimda ishlamoqchisiz?', ru: 'На какую должность вы претендуете?' },
      hint: { uz: 'Bir nechtasi qiziq bo\'lsa — asosiysini tanlang.', ru: 'Если интересно несколько — выберите основную.' },
      options: ROLES.map(r => o(r.key, I18N.t('uz', 'role.' + r.key), I18N.t('ru', 'role.' + r.key))) },
    // Ish tajribasi — har ish joyi: joy, lavozim, muddat oralig'i; tepada
    // "Tajribam yo'q". Erkin matn emas: ish beruvchi "qayerda, kim bo'lib,
    // qancha" ni ko'rishi, panel tajriba bo'yicha saralashi kerak (2026-10-23,
    // Anas: "rezyumeda hech narsa yo'q, filtr qilib bo'lmaydi"). Alohida
    // "Qancha tajribangiz bor?" savoli o'rnini bosadi (jami yil muddatlardan).
    // Javob -> Candidate.workHistory, experienceYears.
    { id: 'lastJob', type: 'work',
      text: { uz: 'Qayerda ishlagansiz?', ru: 'Где вы работали?' },
      hint: { uz: 'Oxirgi ish joyingizdan boshlang. Ish beruvchi tajribangizni aynan shu yerdan ko\'radi.',
              ru: 'Начните с последнего места работы. Работодатель смотрит опыт именно здесь.' } },

    // Lavozimga xos — faqat shu lavozimni tanlaganga (shart: role). Vakansiya
    // havolasida lavozim ma'lum — shart o'sha lavozim bo'yicha hisoblanadi.
    { id: 'c_bron', type: 'choice', showIf: { q: 'role', in: ['xostess'] },
      text: { uz: 'Telefon orqali stol bron qilish bilan ishlaganmisiz?', ru: 'Работали ли вы с бронированием столов по телефону?' },
      hint: { uz: 'Xostessning asosiy vazifalaridan biri.', ru: 'Одна из основных задач хостес.' }, options: yesNo() },
    { id: 'c_kuxnya', type: 'choice', showIf: { q: 'role', in: ['oshpaz'] },
      text: { uz: 'Qaysi oshxonada tajribangiz bor?', ru: 'В какой кухне у вас опыт?' },
      hint: { uz: 'Bir nechta bo\'lsa — asosiysini tanlang.', ru: 'Если несколько — выберите основную.' },
      options: [o('milliy', 'Milliy (o\'zbek)', 'Национальная (узбекская)'), o('yevropa', 'Yevropa', 'Европейская'),
                o('osiyo', 'Osiyo (yapon, xitoy, koreys)', 'Азиатская (японская, китайская, корейская)'),
                o('fastfud', 'Fast-fud', 'Фастфуд'), o('qandolat', 'Qandolat', 'Кондитерская')] },
    { id: 'c_sex', type: 'choice', showIf: { q: 'role', in: ['oshpaz'] },
      text: { uz: 'Qaysi sexda ishlagansiz?', ru: 'В каком цехе вы работали?' },
      hint: { uz: 'Bir nechta bo\'lsa — asosiysini tanlang.', ru: 'Если несколько — выберите основной.' },
      options: [o('issiq', 'Issiq sex', 'Горячий цех'), o('sovuq', 'Sovuq sex', 'Холодный цех'),
                o('mangal', 'Mangal, shashlik', 'Мангал, шашлык'), o('tandir', 'Tandir, non', 'Тандыр, выпечка'),
                o('qandolat', 'Qandolat', 'Кондитерский цех')] },
    { id: 'c_stol', type: 'choice', showIf: { q: 'role', in: ['ofitsiant'] },
      text: { uz: 'Bir vaqtda nechta stolga xizmat qilgansiz?', ru: 'Сколько столов вы обслуживали одновременно?' },
      hint: { uz: 'Ish tezligi va tajribangizni tushunish uchun.', ru: 'Чтобы понять ваш темп и опыт.' },
      options: [o('s5', '5 tagacha', 'До 5'), o('s6_10', '6–10', '6–10'), o('s10', '10 dan ortiq', 'Более 10'),
                o('none', 'Tajribam yo\'q', 'Нет опыта')] },
    { id: 'c_kassa', type: 'choice', showIf: { q: 'role', in: ['ofitsiant'] },
      text: { uz: 'Restoran kassa dasturida ishlaganmisiz (iiko, R-Keeper)?', ru: 'Работали ли вы с кассовой программой (iiko, R-Keeper)?' },
      options: yesNo() },
    { id: 'startWhen', type: 'choice', text: { uz: 'Qachondan ish boshlay olasiz?', ru: 'Когда вы можете приступить к работе?' },
      hint: { uz: 'Ish beruvchilar avval tez chiqa oladigan nomzodlarni ko\'radi.',
              ru: 'Работодатели в первую очередь смотрят тех, кто может выйти быстрее.' },
      options: [o('now', 'Darhol', 'Сразу'), o('w1', '1 hafta ichida', 'В течение недели'),
                o('w2', '2 hafta ichida', 'В течение 2 недель'), o('m1', '1 oydan keyin', 'Через месяц и позже')] },
    // "Talabamisiz?" smena savoli o'rniga (Anas, 2026-10-23): restoran
    // xodimlarining ko'pi talaba, jadvalni shu belgilaydi. Smena javobdan
    // yoziladi (toFields: kunduzgi ta'lim -> kechki smena va h.k.).
    { id: 'study', type: 'choice', text: { uz: 'Talabamisiz?', ru: 'Вы студент?' },
      hint: { uz: 'Ish jadvalini o\'qishingizga moslaymiz.', ru: 'Подберём график под вашу учёбу.' },
      options: [o('day', 'Kunduzgi ta\'lim', 'Дневное обучение'), o('evening', 'Kechki ta\'lim', 'Вечернее обучение'),
                o('distance', 'Masofaviy (sirtqi)', 'Заочное / дистанционное'), o('no', 'Yo\'q, talaba emasman', 'Нет, не студент')] },
    { id: 'salary', type: 'choice', text: { uz: 'Qancha oylik maosh kutyapsiz?', ru: 'Какую зарплату в месяц вы ожидаете?' },
      hint: { uz: 'Qo\'lga tegadigan summa. Aniq bo\'lsa, mos takliflar tezroq keladi.',
              ru: 'Сумма на руки. Чем точнее, тем быстрее придут подходящие предложения.' },
      options: [o('s4_6', '4–6 mln so\'m', '4–6 млн сум'), o('s6_9', '6–9 mln so\'m', '6–9 млн сум'),
                o('s9_12', '9–12 mln so\'m', '9–12 млн сум'), o('s12', '12 mln so\'mdan ortiq', 'Более 12 млн сум'),
                o('agree', 'Kelishamiz', 'Договоримся')] },

    // ── Siz haqingizda ──
    { id: 'fullName', type: 'text', text: { uz: 'Ism va familiyangiz', ru: 'Ваши имя и фамилия' },
      hint: { uz: 'Pasportdagidek yozing: Aziza Karimova', ru: 'Как в паспорте: Азиза Каримова' } },
    { id: 'birthDate', type: 'date', text: { uz: 'Tug\'ilgan sanangiz', ru: 'Дата рождения' },
      hint: { uz: 'Ba\'zi lavozimlarda yosh talabi bor — shuni hisobga olamiz.', ru: 'Для некоторых должностей есть требования по возрасту.' } },
    { id: 'phone', type: 'contact', text: { uz: 'Telefon raqamingiz', ru: 'Ваш номер телефона' },
      hint: { uz: 'Tugmani bosing — Telegram raqamingizni o\'zi yuboradi. Ish beruvchi shu raqamga qo\'ng\'iroq qiladi.',
              ru: 'Нажмите кнопку — Telegram сам отправит ваш номер. Работодатель позвонит на него.' } },
    { id: 'location', type: 'choice', text: { uz: 'Qaysi tumanda yashaysiz?', ru: 'В каком районе вы живёте?' },
      hint: { uz: 'Uyingizga yaqin ish joylarini birinchi taklif qilamiz.', ru: 'В первую очередь предложим работу рядом с домом.' },
      options: DISTRICTS },
    { id: 'gender', type: 'choice', required: false, text: { uz: 'Jinsingiz', ru: 'Ваш пол' },
      hint: { uz: 'Ixtiyoriy.', ru: 'Необязательно.' },
      options: [o('female', 'Ayol', 'Женский'), o('male', 'Erkak', 'Мужской')] },

    // ── Qo'shimcha ──
    { id: 'russian', type: 'choice', text: { uz: 'Rus tilini qanchalik bilasiz?', ru: 'Насколько хорошо вы говорите по-русски?' },
      hint: { uz: 'Mehmonlarning ko\'pchiligi rus tilida gaplashadi.', ru: 'Многие гости говорят по-русски.' },
      options: [o('fluent', 'Erkin gaplashaman', 'Свободно'), o('medium', 'Tushunaman, gaplasha olaman', 'Понимаю, могу объясниться'),
                o('basic', 'Boshlang\'ich', 'Начальный уровень'), o('none', 'Bilmayman', 'Не знаю')] },
    { id: 'english', type: 'choice', text: { uz: 'Ingliz tilini bilasizmi?', ru: 'Говорите ли вы по-английски?' },
      hint: { uz: 'Xorijlik mehmonlar keladigan joylarda muhim.', ru: 'Важно в заведениях с иностранными гостями.' },
      options: [o('fluent', 'Erkin', 'Свободно'), o('medium', 'O\'rta — gaplasha olaman', 'Средне — могу объясниться'),
                o('basic', 'Boshlang\'ich', 'Начальный уровень'), o('none', 'Bilmayman', 'Не знаю')] },
    { id: 'sanitary', type: 'choice', text: { uz: 'Sanitar kitobchangiz bormi?', ru: 'Есть ли у вас санитарная книжка?' },
      hint: { uz: 'Bo\'lmasa ham ariza beravering — ishga kirishda rasmiylashtirish mumkin.',
              ru: 'Если нет — всё равно откликайтесь: её можно оформить при трудоустройстве.' },
      options: [o('yes', 'Bor', 'Есть'), o('expired', 'Muddati o\'tgan', 'Просрочена'), o('no', 'Yo\'q', 'Нет')] },
    { id: 'c_sanit', type: 'choice', showIf: { q: 'sanitary', in: ['no', 'expired'] },
      text: { uz: 'Sanitar kitobchani olishga (yangilashga) tayyormisiz?', ru: 'Готовы ли вы оформить (обновить) санитарную книжку?' },
      hint: { uz: 'Ko\'pchilik restoranlar ishga kirgach bir necha kun ichida so\'raydi.',
              ru: 'Большинство ресторанов просят её в первые дни работы.' }, options: yesNo() },
    { id: 'c_vaqt', type: 'text', showIf: { q: 'study', in: ['day', 'evening', 'distance'] },
      text: { uz: 'Qaysi kunlari va soatlarda ishlay olasiz?', ru: 'В какие дни и часы вы можете работать?' },
      hint: { uz: 'Masalan: dushanba–juma 17:00 dan keyin, shanba–yakshanba kun bo\'yi',
              ru: 'Например: пн–пт после 17:00, сб–вс весь день' } },
    // Barcha savollar majburiy — o'tkazib yuborish yo'q (Anas, 2026-10-23)
    { id: 'photo', type: 'photo', text: { uz: 'Rasmingiz', ru: 'Ваше фото' },
      hint: { uz: 'Yuzingiz aniq ko\'rinadigan rasm, selfi ham bo\'ladi. Rasmli anketani ish beruvchilar ko\'proq ochadi.',
              ru: 'Фото, где хорошо видно лицо, подойдёт и селфи. Анкеты с фото работодатели открывают чаще.' } },
    { id: 'consent', type: 'consent', text: { uz: 'Rozilik', ru: 'Согласие' },
      hint: { uz: 'Ma\'lumotlarim TalentHub tomonidan saqlanishi va mos ish beruvchilarga ko\'rsatilishiga roziman. ' +
                  'Ism va telefonim ish beruvchiga faqat men bilan bog\'lanish uchun beriladi.',
              ru: 'Я согласен(на), чтобы TalentHub хранил мои данные и показывал их подходящим работодателям. ' +
                  'Имя и телефон передаются работодателю только для связи со мной.' } }
  ].map(q => Object.assign({ required: true, hint: { uz: '', ru: '' }, options: [], showIf: { q: '', in: [] } }, q));
}

// Shablondan chiqqan, lekin eski anketalarda turgan standart savollar —
// katalog (tur, kalitlar) shulardan ham olinadi; konstruktorda qaytarish mumkin.
// experience: "Qayerda ishlagansiz?" (lastJob) uni o'z ichiga oldi (2026-10-23).
function legacyQuestions() {
  return [
    { id: 'experience', type: 'choice', text: { uz: 'Restoran sohasida qancha tajribangiz bor?', ru: 'Какой у вас опыт в ресторанной сфере?' },
      hint: { uz: 'Har qanday lavozim hisobga olinadi: ofitsiant, xostess, oshpaz, kassir va boshqalar.',
              ru: 'Учитывается любая должность: официант, хостес, повар, кассир и другие.' },
      options: [o('none', 'Tajribam yo\'q', 'Нет опыта'), o('lt1', '1 yilgacha', 'До 1 года'),
                o('y1_2', '1–2 yil', '1–2 года'), o('y3_5', '3–5 yil', '3–5 лет'), o('y5', '5 yildan ortiq', 'Более 5 лет')] },
    // shift: "Talabamisiz?" (study) uning o'rniga keldi (2026-10-23)
    { id: 'shift', type: 'choice', text: { uz: 'Qaysi smenada ishlay olasiz?', ru: 'В какую смену вы можете работать?' },
      hint: { uz: 'Ish beruvchi ish jadvalini shunga qarab tuzadi.', ru: 'Работодатель составит график с учётом этого.' },
      options: [o('kunduzgi', 'Kunduzgi', 'Дневная'), o('kechki', 'Kechki', 'Вечерняя'),
                o('ikkalasi', 'Farqi yo\'q', 'Любая'), o('weekend', 'Faqat dam olish kunlari', 'Только выходные')] }
  ].map(q => Object.assign({ required: true, hint: { uz: '', ru: '' }, options: [], showIf: { q: '', in: [] } }, q));
}
const standardQuestions = () => template().concat(legacyQuestions());

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
//   sec         — anketadagi bo'lim (job | me | extra); o'z savoli oldingisinikini oladi
// Ko'rsatish sharti (showIf) savolning o'zida — bazada, konstruktor tahrirlaydi.
const CATALOG = {
  role:       { keys: 'fixed', field: 'Lavozim',          sec: 'job' },
  experience: { keys: 'fixed', field: 'Tajriba (yil)',    sec: 'job' },
  lastJob:    {                field: 'Ish tajribasi',    sec: 'job' },
  startWhen:  { keys: 'fixed', field: 'Ishga chiqish',    sec: 'job' },
  shift:      { keys: 'fixed', field: 'Smena',            sec: 'job' },
  salary:     { keys: 'open',  field: 'Kutilgan maosh',   sec: 'job' },
  fullName:   { locked: true,  field: 'Ism',              sec: 'me' },
  birthDate:  {                field: 'Yosh',             sec: 'me' },
  phone:      { locked: true,  field: 'Telefon',          sec: 'me' },
  location:   { keys: 'open',  field: 'Hudud',            sec: 'me' },
  gender:     { keys: 'fixed', field: 'Jins',             sec: 'me' },
  russian:    { keys: 'fixed', field: 'Tillar',           sec: 'extra' },
  english:    { keys: 'fixed', field: 'Tillar',           sec: 'extra' },
  sanitary:   { keys: 'fixed', field: 'Sanitar kitobcha', sec: 'extra' },
  study:      { keys: 'open',  field: 'Ta\'lim · smena',  sec: 'job' },
  photo:      {                field: 'Foto',             sec: 'extra' },
  consent:    { locked: true,  field: 'Rozilik' }
};
// ── Shartli savollar ──
// Savol faqat OLDINGI tanlov savolining javobi showIf.in ichida bo'lsa
// ko'rsatiladi. Ko'rsatilmagan savol majburiy emas, javobi nomzodga
// tushmaydi (odam orqaga qaytib javobini o'zgartirgan bo'lishi mumkin).
// Anketa (anketa.html) ham, server ham AYNAN shu qoida.
function isShown(q, answers) {
  const s = q.showIf;
  return !s || !s.q || (s.in || []).includes((answers || {})[s.q]);
}
const skipped = (q, answers) => !isShown(q, answers);
// Ko'rsatiladigan savollar tartib bilan. Zanjir: yashirin savolning javobi
// keyingi shartlarga ham hisobga olinmaydi. Lavozim ma'lum bo'lsa
// (vakansiya yoki lavozim anketasi) — shart shu lavozim bo'yicha.
function shownQuestions(questions, answers, presetRole) {
  const a = answers || {};
  const eff = presetRole ? { role: presetRole } : {};
  const out = [];
  for (const q of questions || []) {
    if (!isShown(q, eff)) continue;
    out.push(q);
    if (q.id === 'role' && presetRole) continue;
    if (a[q.id] != null && a[q.id] !== '') eff[q.id] = a[q.id];
  }
  return out;
}
// Lavozim uchun anketa: boshqa lavozimga xos savollar olib tashlanadi,
// shu lavozimnikidan shart olinadi (lavozim anketasida u doim so'raladi)
function forRole(questions, role) {
  return (questions || []).map(q => (q.toObject ? q.toObject() : Object.assign({}, q)))
    .filter(q => !(q.showIf && q.showIf.q === 'role' && !(q.showIf.in || []).includes(role)))
    .map(q => (q.showIf && q.showIf.q === 'role' ? Object.assign(q, { showIf: { q: '', in: [] } }) : q));
}
// Ko'rinadigan savollarga bo'lim qo'shadi (anketa.html uchun); shart savolning o'zida
function withMeta(questions) {
  let sec = 'job';
  return questions.map(q => {
    const c = CATALOG[q.id] || {};
    if (c.sec) sec = c.sec;
    const out = Object.assign({}, q.toObject ? q.toObject() : q, { sec: q.type === 'consent' ? '' : sec });
    if (!out.showIf || !out.showIf.q) delete out.showIf;
    return out;
  });
}
// O'z savoli — faqat shu turlar (sana, telefon, rasm, rozilik standart savolda)
const CUSTOM_TYPES = ['text', 'longtext', 'choice'];

/** Panel uchun: standart savollar (shablon matni bilan) va ularning qoidalari. */
function catalogInfo() {
  // Shablondagi lavozimga xos savollar (c_...) — o'z savoli, katalogda emas
  return standardQuestions().filter(q => CATALOG[q.id]).map(q => Object.assign({}, q, CATALOG[q.id]));
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
  const tpl = Object.fromEntries(standardQuestions().map(q => [q.id, q]));
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
  // Shart: faqat OLDINGI tanlov savoliga va uning mavjud variantlariga.
  // Ism, telefon, rozilik doim so'raladi — ularga shart yo'q.
  out.forEach((q, i) => {
    const s = (input[i] || {}).showIf || {};
    const src = str(s.q, 40);
    q.showIf = { q: '', in: [] };
    if (!src) return;
    const n = `${i + 1}-savol («${q.text.uz.slice(0, 40)}»)`;
    if (q.type === 'consent' || (CATALOG[q.id] || {}).locked) fail(`${n}: bu savol doim so'raladi, shart qo'yib bo'lmaydi`);
    const j = out.findIndex(x => x.id === src);
    if (j < 0) fail(`${n}: shart qo'yilgan savol anketada yo'q`);
    if (j >= i) fail(`${n}: shart faqat oldingi savolga qo'yiladi — savollar tartibini tekshiring`);
    if (out[j].type !== 'choice') fail(`${n}: shart faqat variantli savolga qo'yiladi`);
    const keys = new Set(out[j].options.map(x => x.key));
    const inn = [...new Set((Array.isArray(s.in) ? s.in : []).map(k => str(k, 30)))].filter(k => keys.has(k));
    if (!inn.length) fail(`${n}: shart uchun kamida bitta javobni belgilang`);
    q.showIf = { q: src, in: inn };
  });
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

// ── Lavozim anketalari (tayyor nusxa) ──
// Umumiy shablonning o'zi, shu lavozim uchun: lavozimga xos savollar
// (shablonda showIf role) qoladi, boshqa lavozimnikilar tushadi
// (forRole). Bu yerda faqat FARQ: sarlavha, olib tashlanadigan va
// o'zgaradigan savollar. Keyin konstruktorda moslanadi.
const ROLE_PRESETS = {
  xostess: {
    title: { uz: 'Xostess anketasi', ru: 'Анкета хостес' },
    patch: {
      photo: { required: true, hint: { uz: 'Xostess — restoranning yuzi. Yuzingiz aniq ko\'rinadigan, tartibli rasm yuboring.',
                                       ru: 'Хостес — лицо ресторана. Отправьте аккуратное фото, где хорошо видно лицо.' } }
    }
  },
  oshpaz: {
    title: { uz: 'Oshpaz anketasi', ru: 'Анкета повара' },
    remove: ['english']
  },
  ofitsiant: {
    title: { uz: 'Ofitsiant anketasi', ru: 'Анкета официанта' }
  }
};
const PRESET_ROLES = Object.keys(ROLE_PRESETS);

/** Lavozim anketasi savollari (shablondan). Nusxa yo'q bo'lsa — null. */
function rolePreset(role) {
  const p = ROLE_PRESETS[role];
  if (!p) return null;
  const qs = forRole(template(), role).filter(q => !(p.remove || []).includes(q.id));
  for (const q of qs) if (p.patch && p.patch[q.id]) Object.assign(q, p.patch[q.id]);
  return { title: p.title, questions: cleanQuestions(qs) };
}

// Mavjud anketani yangi shablonga o'tkazadi, siz qo'shgan o'z savollaringiz
// (c_...) saqlanadi — rozilikdan oldin qo'yiladi.
function upgradeQuestions(oldQs, newQs) {
  const keep = (oldQs || []).filter(q => !CATALOG[q.id] && !newQs.some(n => n.id === q.id))
    .map(q => (q.toObject ? q.toObject() : q));
  const out = newQs.slice(0, -1).concat(keep, newQs.slice(-1));
  return cleanQuestions(out);
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
      // Ism — ism VA familiya: bitta so'z bilan HR qo'ng'iroq qilganda
      // kim ekanini, ish beruvchi esa rasmiylashtirishni bilmaydi
      // (2026-10-20: birinchi haqiqiy anketada faqat "Aziza" yozilgan edi)
      if (q.id === 'fullName' && s.split(' ').filter(w => w.length >= 2).length < 2) err('fullName');
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
    case 'work':
      return checkWork(q, value, err);
    default:
      err('type');
  }
}

// Ish tajribasi: 'none' (tajribasi yo'q) yoki 1–3 ish joyi { place, role, dur }.
// Ataylab sodda (Anas, 2026-10-23): ko'k yoqa nomzodi oy/yil va vazifalarni
// to'ldirmaydi — joy, lavozim va muddat oralig'i ish beruvchiga yetarli.
const MAX_JOBS = 3;
function checkWork(q, value, err) {
  if (value === 'none') return 'none';
  const list = Array.isArray(value) ? value : [];
  if (!list.length) { if (q.required) err('required'); return ''; }
  if (list.length > MAX_JOBS) err('work');
  return list.map(raw => {
    const w = raw || {};
    const place = String(w.place || '').trim().replace(/\s+/g, ' ');
    const role = String(w.role || '');
    const dur = String(w.dur || '');
    // "Boshqa" lavozim — nomini nomzod yozadi
    const other = role === 'boshqa' ? String(w.other || '').trim().replace(/\s+/g, ' ').slice(0, 60) : '';
    if (place.length < 2 || place.length > 80 || !I18N.WORK_ROLES.includes(role) || !I18N.WORK_DURS.includes(dur)
        || (role === 'boshqa' && other.length < 2)) err('work');
    return { place, role, other, dur };
  });
}
// Ish joylari -> Candidate.workHistory (panel, Mini App rezyumesi, kanban
// shu maydonni ko'rsatadi; hh rezyumesidagi kabi o'zbekcha matn)
function workToHistory(list) {
  return list.map(w => ({
    company: w.place,
    position: w.role === 'boshqa' ? w.other : I18N.t('uz', 'role.' + w.role),
    period: I18N.t('uz', 'ank.w.dur.' + w.dur),
    description: ''
  }));
}
function workText(list) {
  if (list === 'none') return I18N.t('uz', 'ank.w.none');
  return workToHistory(list).map(h => `${h.position}, ${h.company}, ${h.period}`).join('; ');
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
  // Faqat nomzodga KO'RSATILGAN savollar javobi (orqaga qaytib javobni
  // o'zgartirsa, yashirin bo'lib qolgan eski javob kartaga tushmasin)
  const shown = shownQuestions(survey.questions, answers, presetRole);
  const a = {};
  for (const q of shown) if ((answers || {})[q.id] != null) a[q.id] = answers[q.id];
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
  if (a.lastJob === 'none') {
    f.experienceYears = 0;
    f.experienceMonths = 0;
    f.experienceSummary = 'Tajribasiz';
  } else if (Array.isArray(a.lastJob) && a.lastJob.length) {
    // Jami yil — muddatlar oralig'ining pastki chegarasi yig'indisi
    // (oshirib ko'rsatilmasin); eski tajriba savoli ham bo'lsa — kattasi
    const months = a.lastJob.reduce((s, w) => s + (I18N.DUR_MONTHS[w.dur] || 0), 0);
    f.experienceYears = Math.max(f.experienceYears || 0, Math.floor(months / 12));
    f.experienceMonths = a.lastJob.reduce((s, w) => s + Math.max(1, I18N.DUR_MONTHS[w.dur] || 0), 0);
    f.workHistory = workToHistory(a.lastJob);
    const h = f.workHistory[0];
    f.experienceSummary = `${h.position} — ${h.company}, ${h.period}` +
      (f.workHistory.length > 1 ? `; yana ${f.workHistory.length - 1} ta ish joyi` : '');
  } else if (typeof a.lastJob === 'string' && a.lastJob) f.experienceSummary = a.lastJob;   // eski matnli savol
  // Ish joyi yozilmagan — tanlangan javob ("1 yilgacha" 0 yil, lekin tajribasiz emas)
  else if (a.experience) f.experienceSummary = opt('experience', a.experience);
  if (a.shift) f.shift = a.shift;
  if (a.salary) f.salaryExpectation = opt('salary', a.salary);
  // Tillar: erkin/o'rta — biladi (qidiruv filtri shu ro'yxat bo'yicha); daraja rawText'da
  if (a.russian || a.english) {
    const knows = k => ['fluent', 'medium'].includes(k);
    f.languages = [knows(a.russian) && 'Rus', knows(a.english) && 'Ingliz'].filter(Boolean);
  }
  if (a.startWhen && START_DAYS[a.startWhen] != null) {
    f.startWhen = a.startWhen;
    f.availableFrom = new Date(Date.now() + START_DAYS[a.startWhen] * 864e5);
  }
  if (a.sanitary) f.sanitaryBook = a.sanitary;
  if (a.study) f.education = a.study === 'no' ? 'O\'qimaydi' : 'O\'qiydi (' + opt('study', a.study).replace(/^Ha, /, '') + ')';
  // Smena savoli yo'q bo'lsa — o'qishdan: kunduzi o'qiydigan kechqurun ishlaydi
  if (a.study && !a.shift && STUDY_SHIFT[a.study]) f.shift = STUDY_SHIFT[a.study];

  // Konstruktorda qo'shilgan o'z savollari — maydoni yo'q: kartadagi
  // "Anketa javoblari" bo'limiga (savol matni o'zbekcha, panel uchun)
  f.extraAnswers = shown
    .filter(q => !CATALOG[q.id] && a[q.id] != null && a[q.id] !== '')
    .map(q => ({ q: q.text.uz, a: q.type === 'choice' ? opt(q.id, a[q.id]) : String(a[q.id]) }));

  // Kalit so'z qidiruvi uchun to'liq matn (rezyumedagi rawText o'rnida)
  f.rawText = shown
    .filter(q => a[q.id] != null && a[q.id] !== '' && !['photo', 'consent'].includes(q.type))
    .map(q => `${q.text.uz}: ${q.type === 'choice' ? opt(q.id, a[q.id]) : q.type === 'work' && (Array.isArray(a[q.id]) || a[q.id] === 'none') ? workText(a[q.id]) : a[q.id]}`)
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

  // Kim? 1) shu Telegram akkaunti bog'langan nomzod  2) shu telefon —
  // FAQAT Telegram tasdiqlagan raqam bilan. Qo'lda yozilgan raqam bilan
  // mavjud profilga ulanib bo'lmaydi: bazadagi 700+ hh nomzodi Telegramga
  // ulanmagan, birovning raqamini yozgan odam uning profilini (ish tarixi,
  // email) ochib olardi (2026-10-20 auditda topildi). Qo'lda raqamli
  // anketa — yangi yozuv; takror bo'lsa panelda birlashtiriladi.
  let cand = await Candidate.findOne({ restaurantId: r.agencyId, tgChatId: r.tgUserId });
  // Sinov anketasi (admin test rejimi) telefon bo'yicha haqiqiy profilga ulanmaydi
  if (!cand && pk && r.phoneVerifiedAt && !r.isTest) {
    cand = await Candidate.findOne({ restaurantId: r.agencyId, phoneKey: pk });
  }
  const created = !cand;
  if (!cand) {
    cand = new Candidate({ id: uuidv4(), restaurantId: r.agencyId, source: 'anketa', status: 'new' });
  }

  // Anketa — odamning o'z so'zi, eng yangi ma'lumot: bo'sh bo'lmagani yoziladi
  const f = toFields(a, survey, presetRole);
  for (const [k, v] of Object.entries(f)) {
    if (v === '' || v == null) continue;
    if (Array.isArray(v) && !v.length && !created) continue;   // bo'sh ro'yxat eskisini (tillar, javoblar) o'chirmasin
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
  if (r.isTest) cand.isTest = true;    // sinov nomzodi: qidiruv va sanoqlarga kirmaydi
  cand.updatedAt = new Date();
  await cand.save();
  if (r.isTest) await require('./testMode').noteCandidate(r.tgUserId, cand.id);

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
  CHANNELS, DISTRICTS, CATALOG, CUSTOM_TYPES, START_DAYS, catalogInfo, cleanQuestions, surveyForVacancy,
  isShown, skipped, shownQuestions, forRole, withMeta, rolePreset, upgradeQuestions, PRESET_ROLES,
  template, makeCode, ensureDefault,
  payloadFor, parsePayload, visibleQuestions, checkAnswer, toFields, finalize, normPhone, ageOf, workToHistory
};
