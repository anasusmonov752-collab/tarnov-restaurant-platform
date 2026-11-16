// ── Bot profili: nom, qisqa tavsif, tavsif, buyruqlar (Anas, 2026-11-16) ──
// "Rasmiy botligini bildir, ishonchni kuchaytir." SMS havolasini bosgan
// notanish odam birinchi navbatda profilni ko'radi: kimning boti, pul
// so'raladimi. Matn NOMZOD uchun (docs/auditoriya.md): u ish qidiryapti,
// eng katta qo'rquvi — pul so'rashlari.
//
// Server ishga tushganda apply() — faqat FARQ qilganini yozadi (setMyName
// Telegram'da tez-tez chaqirilsa cheklanadi). Til: '' — standart (o'zbekcha),
// 'ru' — Telegram interfeysi ruscha bo'lganlarga.
// Profil RASMINI Bot API o'rnatmaydi — @BotFather -> /setuserpic
// (rasm: docs/talenthub-bot-avatar.png).
const tg = require('./telegram');

const PROFILE = {
  uz: {
    name: 'TalentHub — restoranlarda ish',
    // Qisqa tavsif — FAQAT agentlik kimligi va asosiy vazifasi (Anas, 2026-11-16:
    // "rasmiy" yo'q, faqat restoranlar emas, maosh yo'q)
    short: 'TalentHub — ishga joylash agentligi. Ish beruvchilarga xodim, ish izlovchilarga mos ish topib beramiz.',
    desc: [
      'TalentHub — ishga joylash agentligi.',
      '',
      "💼 Ofitsiant, xostess, oshpaz, kassir, barmen va boshqa ishlar",
      "💰 Maosh va tuman oldindan ko'rinadi",
      "📝 Rezyume shart emas — bir necha savolga javob bering yoki ovozda gapiring",
      "📞 HR o'zi qo'ng'iroq qiladi",
      '',
      "✅ Siz uchun bepul. Biz hech qachon pul yoki karta raqamini so'ramaymiz.",
      '',
      'Boshlash uchun pastdagi tugmani bosing.'
    ].join('\n'),
    cmds: [{ command: 'start', description: "Ishlarni ko'rish" }, { command: 'til', description: 'Tilni almashtirish · Язык' }]
  },
  ru: {
    name: 'TalentHub — работа в ресторанах',
    short: 'TalentHub — кадровое агентство. Подбираем сотрудников для работодателей и работу для соискателей.',
    desc: [
      'TalentHub — кадровое агентство.',
      '',
      '💼 Официант, хостес, повар, кассир, бармен и другая работа',
      '💰 Зарплата и район видны сразу',
      '📝 Резюме не нужно — ответьте на несколько вопросов или расскажите голосом',
      '📞 HR сам вам позвонит',
      '',
      '✅ Для вас бесплатно. Мы никогда не просим деньги или номер карты.',
      '',
      'Нажмите кнопку внизу, чтобы начать.'
    ].join('\n'),
    cmds: [{ command: 'start', description: 'Смотреть работу' }, { command: 'til', description: 'Сменить язык · Til' }]
  }
};
// Telegram chegaralari: nom 64, qisqa tavsif 120, tavsif 512
const LIMITS = { name: 64, short: 120, desc: 512 };

/** Farq qilganini yozadi. @returns {{ changed: string[] }} */
async function apply(token = tg.platformToken()) {
  if (!token) return { changed: [], skipped: true };
  const changed = [];
  for (const [code, lang] of [['', 'uz'], ['ru', 'ru']]) {
    const p = PROFILE[lang];
    const lc = code ? { language_code: code } : {};
    const cur = await Promise.all([
      tg.call(token, 'getMyName', lc).then(r => r.name).catch(() => null),
      tg.call(token, 'getMyShortDescription', lc).then(r => r.short_description).catch(() => null),
      tg.call(token, 'getMyDescription', lc).then(r => r.description).catch(() => null),
      tg.call(token, 'getMyCommands', lc).then(r => JSON.stringify((r || []).map(c => [c.command, c.description]))).catch(() => null)
    ]);
    if (cur[0] !== p.name) { await tg.call(token, 'setMyName', Object.assign({ name: p.name }, lc)); changed.push('name' + (code ? ':' + code : '')); }
    if (cur[1] !== p.short) { await tg.call(token, 'setMyShortDescription', Object.assign({ short_description: p.short }, lc)); changed.push('short' + (code ? ':' + code : '')); }
    if (cur[2] !== p.desc) { await tg.call(token, 'setMyDescription', Object.assign({ description: p.desc }, lc)); changed.push('desc' + (code ? ':' + code : '')); }
    if (cur[3] !== JSON.stringify(p.cmds.map(c => [c.command, c.description]))) {
      await tg.call(token, 'setMyCommands', Object.assign({ commands: p.cmds }, lc)); changed.push('cmds' + (code ? ':' + code : ''));
    }
  }
  return { changed };
}

module.exports = { PROFILE, LIMITS, apply };
