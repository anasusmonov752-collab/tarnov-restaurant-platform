// ── TELEGRAM BOT ─────────────────────────────────────────────
// BITTA platforma boti (TalentHub) barcha mijoz restoranlarga xizmat qiladi.
// Token va webhook siri muhit o'zgaruvchilarida — bazada saqlanmaydi va
// hech qanday API javobida chiqmaydi.
//
// Har restoranning O'Z admini bor: nomzod javobi o'sha nomzod tegishli
// restoran adminiga boradi. Ya'ni bot bitta, adminlar ko'p.

const express = require('express');
const rateLimit = require('express-rate-limit');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const Restaurant = require('../models/Restaurant');
const Candidate = require('../models/Candidate');
const BotMessage = require('../models/BotMessage');
const Client = require('../models/Client');
const SearchSession = require('../models/SearchSession');
const Shortlist = require('../models/Shortlist');
const tg = require('../services/telegram');
const shortlistSvc = require('../services/shortlist');
const relay = require('../services/botRelay');
const outreach = require('../services/outreach');
const candidateSearch = require('../services/candidateSearch');

const router = express.Router();
const guard = auth(['restaurant']);

// Render bepul tarifda uxlab qolgach Telegram update'ni QAYTA yuboradi.
// update_id'ni eslab qolamiz — bir xil xabar ikki marta qayta ishlanmasin.
const seenUpdates = new Set();
function alreadySeen(id) {
  if (seenUpdates.has(id)) return true;
  seenUpdates.add(id);
  if (seenUpdates.size > 1000) {
    for (const k of seenUpdates) { seenUpdates.delete(k); if (seenUpdates.size <= 800) break; }
  }
  return false;
}

function publicBase(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  return `${proto}://${req.get('host')}`;
}

// ══ 1. WEBHOOK ══════════════════════════════════════════════

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.json({ ok: true })   // Telegram'ga 429 bermaymiz
});

router.post('/webhook/:secret', webhookLimiter, asyncHandler(async (req, res) => {
  // Telegram'ga DOIM 200. Aks holda u xabarni qayta-qayta yuboraveradi.
  res.json({ ok: true });

  try {
    const secret = tg.platformSecret();
    if (!secret || req.params.secret !== secret) return;
    if (req.get('X-Telegram-Bot-Api-Secret-Token') !== secret) return;

    const update = req.body || {};
    if (update.update_id != null && alreadySeen(update.update_id)) return;

    // ── Inline tugma bosildi (kontakt ochish / rad etish) ──
    if (update.callback_query) {
      await handleCallback(update.callback_query);
      return;
    }

    const msg = update.message;
    if (!msg || !msg.chat) return;

    const chatId = String(msg.chat.id);
    const text = (msg.text || '').trim();
    const voice = msg.voice || msg.audio;   // ovozli xabar yoki audio fayl
    if (!text && !voice) return;
    const token = tg.platformToken();

    // ── /start <payload> ──
    if (text.startsWith('/start')) {
      const payload = text.slice(6).trim();

      if (!payload) {
        await tg.sendMessage(token, chatId,
          'Salom! Bu TalentHub HR boti.\n\nBog\'lanish uchun sizga yuborilgan havoladan kiring.');
        return;
      }

      // Mijoz menejeri o'zini bog'layapti
      if (payload.startsWith('client_')) {
        const linkToken = payload.slice(7);
        const cl = linkToken && await Client.findOne({ tgLinkToken: linkToken });
        if (!cl) {
          await tg.sendMessage(token, chatId, 'Havola eskirgan. HR bilan bog\'laning.');
          return;
        }
        cl.tgChatId    = chatId;
        cl.tgUsername  = (msg.from && msg.from.username) || '';
        cl.tgLinkToken = '';                    // bir martalik
        cl.lastSeenAt  = new Date();
        if (cl.status === 'pending') cl.status = 'active';
        await cl.save();

        // Yozuv maydoni yonida doimiy "Kabinet" tugmasi — mijoz tanlovlarini,
        // ochilgan kontaktlarni va balansni istalgan payt ocha oladi.
        // Qidiruv natijasidagi tugma vaqtinchalik, bu doimiy.
        await tg.setChatMenuButton(token, chatId, 'Kabinet',
          `${publicBase(req)}/miniapp.html`).catch(e =>
            console.error('[TG] menyu tugmasi qo\'yilmadi:', e.message));

        await tg.sendMessage(token, chatId,
          `Xush kelibsiz, ${cl.name}!\n\n` +
          `Nomzod kerak bo'lsa shu yerga yozing yoki ovozli xabar yuboring.\n` +
          `Masalan: "xostes kerak, 2 yildan ortiq tajribali"\n\n` +
          `Kredit: ${cl.credits} ta kontakt\n\n` +
          `Pastdagi "Kabinet" tugmasi — tanlovlaringiz va ochilgan kontaktlar.`);

        const ag = await Restaurant.findOne({ id: cl.agencyId });
        if (ag && ag.telegram && ag.telegram.adminChatId) {
          await tg.sendMessage(token, ag.telegram.adminChatId,
            `${cl.name} Telegramga ulandi.`);
        }
        return;
      }

      // Admin o'zini bog'layapti — token barcha restoranlar bo'ylab qidiriladi
      if (payload.startsWith('admin_')) {
        const linkToken = payload.slice(6);
        const r = linkToken && await Restaurant.findOne({ 'telegram.adminLinkToken': linkToken, active: true });
        if (!r) {
          await tg.sendMessage(token, chatId, 'Havola eskirgan. Admin panelidan yangisini oling.');
          return;
        }
        r.telegram.adminChatId = chatId;
        r.telegram.adminLinkToken = '';          // bir martalik
        r.telegram.enabled = true;
        r.telegram.connectedAt = new Date();
        await r.save();
        await tg.sendMessage(token, chatId,
          `Ulandi — ${r.name}.\n\nEndi nomzodlarning javoblari shu yerga keladi. ` +
          `Javob berish uchun nomzod xabariga reply qiling.`);
        return;
      }

      // Nomzod — token global unikal (22 belgi tasodifiy)
      const cand = await Candidate.findOne({ tgInviteToken: payload });
      if (!cand) {
        await tg.sendMessage(token, chatId, 'Havola eskirgan yoki ishlatilgan. HR bilan bog\'laning.');
        return;
      }
      const rest = await Restaurant.findOne({ id: cand.restaurantId });
      if (!rest) return;

      // Shu chatga boshqa nomzod bog'langan bo'lsa — uzamiz. Aks holda
      // bitta chatId ikki yozuvda qoladi va findOne({tgChatId}) qaysi
      // birini topsa o'shani ko'rsatadi: odam boshqa odamning profilini
      // ochib qo'yadi. Havola boshqa kishiga yuborilganda ham shu holat.
      await Candidate.updateMany(
        { tgChatId: chatId, id: { $ne: cand.id } },
        { $set: { tgChatId: '', tgUsername: '', tgState: 'none' } }
      );

      cand.tgChatId      = chatId;
      cand.tgUsername    = (msg.from && msg.from.username) || '';
      cand.tgState       = 'linked';
      cand.tgLinkedAt    = new Date();
      cand.tgInviteToken = '';                   // bir martalik — kuydiriladi
      cand.updatedAt     = new Date();
      await cand.save();

      // Bo'sh forma emas, TAYYOR profil ko'rsatiladi: rezyumesi bizda
      // allaqachon tahlil qilingan. Bitta tugma bosib tasdiqlaydi —
      // noldan to'ldirishga qaraganda ancha ko'p odam oxiriga yetadi.
      await tg.sendMessage(token, chatId,
        `Assalomu alaykum, ${relay.displayName(cand)}!\n\n` +
        `${rest.name} HR bo'limiga xush kelibsiz.\n\n` +
        profileCard(cand) +
        `\n\nHammasi to'g'rimi?`,
        { reply_markup: { inline_keyboard: [
          [{ text: '✅ Ha, to\'g\'ri', callback_data: 'cp' }],
          [{ text: '✏️ Tuzataman', web_app: { url: `${publicBase(req)}/profil.html` } }],
          [{ text: '🚫 Hozir ish qidirmayapman', callback_data: 'cn' }]
        ]}});

      await relay.logMsg({
        restaurantId: rest.id, candidateId: cand.id,
        direction: 'in', kind: 'system', sentBy: 'system',
        text: 'Nomzod Telegramga ulandi'
      });

      if (rest.telegram && rest.telegram.adminChatId) {
        await tg.sendMessage(token, rest.telegram.adminChatId,
          `${rest.name} · ${relay.displayName(cand)} Telegramga ulandi.`);
      }
      return;
    }

    // ── /stop — yozishmadan chiqish ──
    if (text === '/stop') {
      const cand = await Candidate.findOne({ tgChatId: chatId });
      if (cand) {
        cand.tgState = 'stopped';
        await cand.save();
        await tg.sendMessage(token, chatId, 'Siz yozishmadan chiqdingiz. Boshqa xabar yubormaymiz.');
      }
      return;
    }

    // ── Admin chati ──
    // reply bo'lsa -> nomzodga javob;  reply bo'lmasa -> nomzod qidiruvi
    const adminRest = await Restaurant.findOne({ 'telegram.adminChatId': chatId, active: true });
    if (adminRest) {
      const replyTo = msg.reply_to_message && msg.reply_to_message.message_id;
      if (!replyTo) {
        await handleSearch(adminRest, chatId, { text, voice });
        return;
      }
      const orig = await BotMessage.findOne({ restaurantId: adminRest.id, adminMsgId: replyTo });
      if (!orig) {
        await tg.sendMessage(token, chatId, 'Bu xabar qaysi nomzodniki ekani topilmadi.');
        return;
      }
      const cand = await Candidate.findOne({ restaurantId: adminRest.id, id: orig.candidateId });
      try {
        await relay.sendToCandidate(adminRest, cand, text, 'telegram');
        await tg.sendMessage(token, chatId, `Yuborildi -> ${relay.displayName(cand)}`);
      } catch (e) {
        await tg.sendMessage(token, chatId, `Yuborilmadi: ${e.message}`);
      }
      return;
    }

    // ── Mijoz menejeri ──
    // Rol ustunligi: siz > mijoz > nomzod. Bir odam ikki rolda bo'lsa
    // (menejer o'zi ham ish qidirsa), to'lov munosabati ustun turadi.
    const client = await Client.findOne({ tgChatId: chatId });
    if (client) {
      if (client.status !== 'active') {
        await tg.sendMessage(token, chatId,
          client.status === 'blocked'
            ? 'Hisobingiz to\'xtatilgan. HR bilan bog\'laning.'
            : 'Hisobingiz hali tasdiqlanmagan. Tez orada faollashtiriladi.');
        return;
      }
      client.lastSeenAt = new Date();
      await client.save();

      // Kabinet tugmasi. Ulanish paytida ham qo'yiladi, lekin bu yerda
      // takrorlaymiz: ulanish kabinetdan oldin bo'lgan mijozlarda tugma
      // yo'q edi, shu yo'l bilan o'zi paydo bo'ladi.
      await tg.setChatMenuButton(token, chatId, 'Kabinet',
        `${publicBase(req)}/miniapp.html`).catch(() => {});

      await handleClientSearch(client, chatId, { text, voice }, publicBase(req));
      return;
    }

    // ── Nomzoddan oddiy xabar ──
    const cand = await Candidate.findOne({ tgChatId: chatId });
    if (!cand) return;
    const rest = await Restaurant.findOne({ id: cand.restaurantId });
    if (!rest) return;

    // Nomzod ovozli xabar yuborishi mumkin — uni matnga aylantirmaymiz
    // (bu adminning qidiruvi emas), lekin adminga xabar beramiz.
    const body = text || '[ovozli xabar — Telegramda tinglang]';
    const adminMsgId = await relay.forwardToAdmin(rest, cand, body);
    await relay.logMsg({
      restaurantId: rest.id, candidateId: cand.id,
      direction: 'in', kind: text ? 'text' : 'system', sentBy: 'telegram',
      text: body, tgMessageId: msg.message_id, adminMsgId
    });
    cand.tgUnread = (cand.tgUnread || 0) + 1;
    cand.tgLastMsgAt = new Date();
    await cand.save();

  } catch (e) {
    console.error('[TG] webhook xatosi:', e.message);
  }
}));

// ── Nomzod qidiruvi (matn yoki ovoz) ─────────────────────────
// Admin reply qilmasdan yozsa — bu qidiruv so'rovi deb qabul qilinadi.
async function handleSearch(restaurant, chatId, { text, voice }) {
  const token = tg.platformToken();

  if (text && text.startsWith('/')) {
    await tg.sendMessage(token, chatId,
      'Nomzod qidirish uchun shunchaki yozing yoki ovozli xabar yuboring.\n\n' +
      'Masalan: "menejer kerak, 2 yildan ortiq tajribali, ingliz tili biladigan"\n\n' +
      'Nomzodga javob berish uchun uning xabariga reply qiling.');
    return;
  }

  await tg.sendMessage(token, chatId, voice ? 'Ovoz tinglanmoqda…' : 'Qidirilmoqda…');

  try {
    let input;
    if (voice) {
      const f = await tg.getFileBase64(token, voice.file_id, { maxBytes: 10 * 1024 * 1024 });
      input = { audio: { mimeType: voice.mime_type || 'audio/ogg', data: f.base64 } };
    } else {
      input = { text };
    }

    const criteria = await candidateSearch.parseQuery(input, restaurant.id);
    const result = await candidateSearch.search(criteria, restaurant.id);
    await tg.sendMessage(token, chatId, candidateSearch.format(criteria, result));

  } catch (e) {
    console.error('[TG] qidiruv xatosi:', e.message);
    const msg = e.code === 'AI_NOT_CONFIGURED'
      ? 'AI sozlanmagan — qidiruv ishlamaydi.'
      : `Qidirib bo'lmadi: ${e.message}`;
    await tg.sendMessage(token, chatId, msg);
  }
}

// ── Mijoz qidiruvi ───────────────────────────────────────────
// Bir xil qidiruv mexanizmi, lekin natija ANONIM va tanlash Mini App'da.
// Chatda 12 ta kartani belgilab, qaysi birini tanlaganini eslab turish
// qiyin — shuning uchun bot faqat sonini aytadi va tugma beradi.
// Qidiruv natijasini saqlab, Mini App ochadigan kalit qaytaradi
async function saveSearch(client, criteria, rows) {
  const key = relay.makeToken();
  await SearchSession.create({
    key,
    agencyId: client.agencyId,
    clientId: client.id,
    criteria: {
      role: criteria.role, minExp: criteria.minExp,
      languages: criteria.languages, location: criteria.location,
      keywords: criteria.keywords
    },
    summary: criteria.summary,
    candidateIds: rows.map(r => r.id)
  });
  return key;
}

async function handleClientSearch(client, chatId, { text, voice }, appBase) {
  const token = tg.platformToken();

  if (text && text.startsWith('/')) {
    await tg.sendMessage(token, chatId,
      `Nomzod qidirish uchun shunchaki yozing yoki ovozli xabar yuboring.\n\n` +
      `Masalan: "xostes kerak, 2 yildan ortiq tajribali, ingliz tili bilan"\n\n` +
      `Kredit: ${client.credits} ta kontakt`);
    return;
  }

  await tg.sendMessage(token, chatId, voice ? 'Ovoz tinglanmoqda…' : 'Qidirilmoqda…');

  try {
    let input;
    if (voice) {
      const f = await tg.getFileBase64(token, voice.file_id, { maxBytes: 10 * 1024 * 1024 });
      input = { audio: { mimeType: voice.mime_type || 'audio/ogg', data: f.base64 } };
    } else {
      input = { text };
    }

    const criteria = await candidateSearch.parseQuery(input, client.agencyId);
    const result = await candidateSearch.search(criteria, client.agencyId, { limit: 15 });

    if (!result.rows.length) {
      await tg.sendMessage(token, chatId,
        `So'rov: ${criteria.summary}\n\nAyni paytda mos nomzod yo'q. ` +
        `Yangi nomzod kelganda xabar beramiz.`);
      return;
    }

    const note = result.relaxed.length
      ? `\nQat'iy mos kelmadi — ${result.relaxed.join(', ')} hisobga olinmadi.` : '';

    // Mini App havolasi — qidiruv natijasini saqlab, kalit bilan ochamiz
    const key = await saveSearch(client, criteria, result.rows);
    await tg.sendMessage(token, chatId,
      `So'rov: ${criteria.summary}\n` +
      `Topildi: ${result.rows.length} ta nomzod${note}\n\n` +
      `Ko'rib chiqish va tanlash uchun pastdagi tugmani bosing.`,
      { reply_markup: { inline_keyboard: [[
        { text: `Ko'rish (${result.rows.length} ta)`, web_app: { url: `${appBase}/miniapp.html?s=${key}` } }
      ]]}});

  } catch (e) {
    console.error('[TG] mijoz qidiruvi xatosi:', e.message);
    await tg.sendMessage(token, chatId, `Qidirib bo'lmadi: ${e.message}`);
  }
}

// ── Nomzod profili kartasi ───────────────────────────────────
// Rezyumedan olingan asosiy faktlar. Hammasi emas — nomzod o'zini
// tanishi uchun yetarli qismi. To'lig'i Mini App'da.
function profileCard(c) {
  const L = [];
  if (c.fullName) L.push(c.fullName);

  const line = [
    c.desiredPosition || '',
    c.experienceYears ? c.experienceYears + ' yil tajriba' : '',
    c.age ? c.age + ' yosh' : '',
    c.location || ''
  ].filter(Boolean).join(' · ');
  if (line) L.push(line);

  const last = (c.workHistory || [])[0];
  if (last && (last.company || last.position)) {
    L.push(`Oxirgi ish: ${[last.position, last.company].filter(Boolean).join(', ')}`);
  }
  if ((c.languages || []).length) L.push(`Tillar: ${c.languages.join(', ')}`);
  if (c.salaryExpectation) L.push(`Kutilayotgan maosh: ${c.salaryExpectation}`);
  if (c.phone) L.push(`Telefon: ${c.phone}`);

  return L.join('\n');
}

// ── Inline tugmalar ──────────────────────────────────────────
// Ikki oila: nomzod o'z profili ustida ('cp'/'cn') va agentlik tanlov
// ustida ('r:'/'n:'). Birinchisida id kerak emas — tugma nomzodning
// O'Z chatida turadi, ya'ni chat uni aniqlaydi.
async function handleCallback(cq) {
  const token = tg.platformToken();
  const chatId = cq.message && cq.message.chat && String(cq.message.chat.id);
  const msgId = cq.message && cq.message.message_id;

  const done = (text, alert = false) =>
    tg.answerCallback(token, cq.id, text, alert).catch(() => {});

  if (!chatId) return;
  const data = String(cq.data || '');

  // ── Nomzod: profilni tasdiqlash / ish qidirmaslik ──
  if (data === 'cp' || data === 'cn') {
    const c = await Candidate.findOne({ tgChatId: chatId });
    if (!c) return done('Profil topilmadi', true);

    c.jobStatus   = data === 'cp' ? 'active' : 'not_looking';
    c.jobStatusAt = new Date();
    c.updatedAt   = new Date();
    await c.save();

    await done(data === 'cp' ? 'Rahmat, tasdiqlandi' : 'Qabul qilindi');
    if (msgId) {
      await tg.editMessageText(token, chatId, msgId, data === 'cp'
        ? `✅ Profilingiz tasdiqlandi.\n\n${profileCard(c)}\n\n` +
          `Mos ish chiqsa shu yerga xabar yuboramiz. Ma'lumotni o'zgartirmoqchi ` +
          `bo'lsangiz istalgan payt yozing.`
        : `Qabul qilindi — hozircha taklif yubormaymiz.\n\n` +
          `Yana ish qidira boshlasangiz shu yerga yozing.`).catch(() => {});
    }

    const rest = await Restaurant.findOne({ id: c.restaurantId });
    if (rest && rest.telegram && rest.telegram.adminChatId) {
      await tg.sendMessage(token, rest.telegram.adminChatId,
        `${relay.displayName(c)} — ${data === 'cp' ? 'profilni tasdiqladi (ish qidiryapti)' : 'ish qidirmayapti'}`)
        .catch(() => {});
    }
    return;
  }

  // ── Agentlik: kontakt ochish / rad etish ──
  const parsed = shortlistSvc.parseCb(data);
  if (!parsed) return done('Tugma eskirgan');

  const { action, sl8, c8 } = parsed;

  // Tugmani faqat agentlik admini bosa oladi
  const agency = await Restaurant.findOne({ 'telegram.adminChatId': chatId, active: true });
  if (!agency) return done('Ruxsat yo\'q', true);

  const row = await Shortlist.findOne({ agencyId: agency.id, id: new RegExp('^' + sl8) });
  if (!row) return done('Tanlov topilmadi', true);

  const item = row.items.find(i => i.candidateId.startsWith(c8));
  if (!item) return done('Nomzod topilmadi', true);

  const candidateId = item.candidateId;
  const cand = await Candidate.findOne({ restaurantId: agency.id, id: candidateId }, 'fullName publicCode phone').lean();
  const who = (cand && (cand.fullName || cand.publicCode)) || 'Nomzod';

  try {
    if (action === 'n') {
      await shortlistSvc.setItemState({
        agencyId: agency.id, shortlistId: row.id, candidateId, state: 'candidate_no'
      });
      await done('Rad etildi — kredit yechilmadi');
      if (msgId) {
        await tg.editMessageText(token, chatId, msgId,
          `❌ ${who} — rozi emas\nKredit yechilmadi.`).catch(() => {});
      }
      return;
    }

    const r = await shortlistSvc.reveal({ agencyId: agency.id, shortlistId: row.id, candidateId });
    if (r.already) {
      await done('Allaqachon ochilgan');
      if (msgId) {
        await tg.editMessageText(token, chatId, msgId, `✅ ${who} — kontakt allaqachon ochilgan`).catch(() => {});
      }
      return;
    }

    await done(`Ochildi. Balans: ${r.balance}`);
    if (msgId) {
      await tg.editMessageText(token, chatId, msgId,
        `✅ ${who} — kontakt mijozga yuborildi\n` +
        `${cand && cand.phone ? cand.phone + '\n' : ''}` +
        `Mijoz balansi: ${r.balance} kredit`).catch(() => {});
    }

  } catch (e) {
    console.error('[TG] callback xatosi:', e.message);
    await done(e.message.slice(0, 190), true);
  }
}

// ══ 2. ADMIN ENDPOINTLARI ═══════════════════════════════════

// Bot holati. Token hech qachon qaytarilmaydi — faqat sozlanganmi yo'qmi.
router.get('/status', guard, asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOne({ id: req.user.restaurantId });
  if (!restaurant) return res.status(404).json({ error: 'Restoran topilmadi' });

  const t = restaurant.telegram || {};
  const out = {
    platformReady: tg.isPlatformReady(),
    botUsername: '',
    adminLinked: !!t.adminChatId,
    connectedAt: t.connectedAt || null,
    channels: outreach.available(),
    smsBalance: await outreach.balance()
  };

  if (tg.isPlatformReady()) {
    try { out.botUsername = await tg.platformUsername(); } catch (e) { out.error = e.message; }
    try {
      const info = await tg.getWebhookInfo(tg.platformToken());
      out.webhook = {
        set: !!info.url,
        pending: info.pending_update_count || 0,
        lastError: info.last_error_message || ''
      };
    } catch (e) { out.webhook = { error: e.message }; }
  }
  res.json(out);
}));

// Webhook'ni o'rnatish. Token env'dan olinadi — so'rovda uzatilmaydi.
router.post('/setup-webhook', guard, asyncHandler(async (req, res) => {
  if (!tg.isPlatformReady()) {
    return res.status(400).json({
      error: 'TELEGRAM_BOT_TOKEN yoki TELEGRAM_WEBHOOK_SECRET sozlanmagan'
    });
  }
  const url = `${publicBase(req)}/api/tg/webhook/${tg.platformSecret()}`;
  try {
    await tg.setWebhook(tg.platformToken(), url, tg.platformSecret());
    const username = await tg.platformUsername();
    res.json({ ok: true, botUsername: username, webhookSet: true });
  } catch (e) {
    res.status(400).json({ error: 'Webhook o\'rnatilmadi: ' + e.message });
  }
}));

// Adminning o'zini botga bog'lash havolasi
router.get('/admin-link', guard, asyncHandler(async (req, res) => {
  if (!tg.isPlatformReady()) return res.status(400).json({ error: 'Bot sozlanmagan' });

  const restaurant = await Restaurant.findOne({ id: req.user.restaurantId });
  if (!restaurant) return res.status(404).json({ error: 'Restoran topilmadi' });

  const t = restaurant.telegram || {};
  t.adminLinkToken = relay.makeToken();
  restaurant.telegram = t;
  await restaurant.save();

  res.json({ link: tg.deepLink(await tg.platformUsername(), 'admin_' + t.adminLinkToken) });
}));

// Adminni botdan uzish (restoran darajasida — bot ishlayveradi)
router.post('/unlink-admin', guard, asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOne({ id: req.user.restaurantId });
  if (!restaurant) return res.status(404).json({ error: 'Restoran topilmadi' });

  restaurant.telegram = Object.assign({}, restaurant.telegram, {
    adminChatId: '', adminLinkToken: '', enabled: false
  });
  await restaurant.save();
  res.json({ ok: true });
}));

module.exports = router;
