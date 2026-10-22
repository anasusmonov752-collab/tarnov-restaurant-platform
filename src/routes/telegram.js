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
const { publicBase } = require('../utils/publicBase');
const Shortlist = require('../models/Shortlist');
const Vacancy = require('../models/Vacancy');
const tg = require('../services/telegram');
const shortlistSvc = require('../services/shortlist');
const relay = require('../services/botRelay');
const outreach = require('../services/outreach');
const candidateSearch = require('../services/candidateSearch');
const agent = require('../services/agent');
const I18N = require('../../public/js/th-i18n');
const { v4: uuidv4 } = require('uuid');
const Survey = require('../models/Survey');
const SurveyResponse = require('../models/SurveyResponse');
const surveySvc = require('../services/survey');
const vac = require('../services/vacancy');
const contactLog = require('../services/contactLog');

const router = express.Router();
// Faqat TalentHub agentligi (middleware/agency — o'tish rejimi bilan)
const guard = require('../middleware/agency').agencyAuth;

// ── Mijoz tili ──
// O'zi tanlagan (Client.lang) bo'lsa — o'sha; aks holda Telegram tili.
// Agentlik admini va nomzod xabarlari hozircha o'zbekcha.
const langOf = (client, from) =>
  I18N.resolve(client && client.lang, (from && from.language_code) || (client && client.tgLang));
const T = (lang, key, vars) => I18N.t(lang, key, vars);
// Til tugmalari. prefix: 'lw:' — xush kelibsiz xabari (qayta yoziladi),
// 'lg:' — /til buyrug'i. Har tugma o'z tilida: tilni bilmagan ham topsin.
const langKb = prefix => ({ reply_markup: { inline_keyboard: [[
  { text: '🇺🇿 O\'zbekcha', callback_data: prefix + 'uz' },
  { text: '🇷🇺 Русский',   callback_data: prefix + 'ru' }
]] } });
const welcomeText = (cl, lang) => T(lang, 'bot.welcome', { name: cl.name, n: cl.credits });
const setMenu = (token, chatId, lang, appBase) =>
  tg.setChatMenuButton(token, chatId, T(lang, 'bot.menu'), `${appBase}/miniapp.html`);

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

// Webhook allowed_updates'ini bir marta (protsess umri davomida)
// tekshiradi. Natija ko'rinib tursin — bu sozlama jimgina noto'g'ri
// bo'lib, butun inline tugmalarni o'chirib qo'ygan edi.
let webhookChecked = false;
async function ensureWebhookOnce(req) {
  if (webhookChecked) return;
  webhookChecked = true;              // xato bo'lsa ham qayta urinmaymiz
  try {
    const r = await tg.ensureWebhook(publicBase(req));
    console.log('[TG] webhook tekshiruvi:', r.action, r.error || '');
  } catch (e) {
    console.error('[TG] webhook tekshirib bo\'lmadi:', e.message);
  }
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

    // Webhook sozlamasini bir marta tekshiramiz. Server ishga tushganda
    // ham tekshiriladi, lekin u APP_URL ga bog'liq — o'rnatilmagan
    // bo'lsa o'tkazib yuboriladi. Bu yerda esa manzil so'rovning
    // o'zidan olinadi, ya'ni hech qanday sozlamaga bog'liq emas.
    await ensureWebhookOnce(req);

    const update = req.body || {};
    if (update.update_id != null && alreadySeen(update.update_id)) return;

    // ── Inline tugma bosildi (kontakt ochish / rad etish) ──
    if (update.callback_query) {
      await handleCallback(update.callback_query, publicBase(req));
      return;
    }

    const msg = update.message;
    if (!msg || !msg.chat) return;

    const chatId = String(msg.chat.id);
    const text = (msg.text || '').trim();
    const voice = msg.voice || msg.audio;   // ovozli xabar yoki audio fayl

    // ── Kontakt: anketadagi "Raqamni ulashish" (Mini App requestContact) ──
    if (msg.contact) {
      await handleContact(msg, chatId);
      return;
    }
    if (!text && !voice) return;
    const token = tg.platformToken();

    // ── /start <payload> ──
    if (text.startsWith('/start')) {
      const payload = text.slice(6).trim();

      // Kimligi hali noma'lum — Telegram tilida
      const tgLang = I18N.fromTelegram(msg.from && msg.from.language_code);
      if (!payload) {
        await plainStart(msg, chatId, tgLang, publicBase(req));
        return;
      }

      // Mijoz menejeri o'zini bog'layapti
      if (payload.startsWith('client_')) {
        const linkToken = payload.slice(7);
        const cl = linkToken && await Client.findOne({ tgLinkToken: linkToken });
        if (!cl) {
          await tg.sendMessage(token, chatId, T(tgLang, 'bot.linkExpired'));
          return;
        }
        cl.tgChatId    = chatId;
        cl.tgUsername  = (msg.from && msg.from.username) || '';
        cl.tgLang      = (msg.from && msg.from.language_code) || '';
        cl.tgLinkToken = '';                    // bir martalik
        cl.lastSeenAt  = new Date();
        if (cl.status === 'pending') cl.status = 'active';
        await cl.save();
        const lang = langOf(cl, msg.from);

        // Yozuv maydoni yonida doimiy "Kabinet" tugmasi — mijoz tanlovlarini,
        // ochilgan kontaktlarni va balansni istalgan payt ocha oladi.
        // Qidiruv natijasidagi tugma vaqtinchalik, bu doimiy.
        await setMenu(token, chatId, lang, publicBase(req)).catch(e =>
          console.error('[TG] menyu tugmasi qo\'yilmadi:', e.message));

        // Ostida til tugmalari: Telegram tili taxmin, xolos — o'zbek tilli
        // menejerning Telegrami ko'pincha ruscha. Bosilsa shu xabar
        // tanlangan tilda qayta yoziladi.
        await tg.sendMessage(token, chatId, welcomeText(cl, lang), langKb('lw:'));

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

      // E'lon havolasi — anketa (a_<kod>_<kanal> yoki v_<vakansiya>_<kanal>)
      const ank = surveySvc.parsePayload(payload);
      if (ank) {
        await startSurvey(msg, chatId, ank, publicBase(req));
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

      // Bu chat mijoz sifatida ulangan bo'lsa, nomzod qilib bog'lamaymiz.
      // Rol ustunligi mijoz > nomzod, ya'ni ulansa ham bot uni mijoz deb
      // taniyverardi: profil ochilmas, menyu tugmasi mijoz kabinetiga
      // olib borardi. Jim qoldirgandan ko'ra ochiq aytamiz.
      // To'lovchi mijozni o'z-o'zidan uzib yubormaymiz — bu HR qarori.
      const asClient = await Client.findOne({ tgChatId: chatId });
      if (asClient) {
        await tg.sendMessage(token, chatId,
          T(langOf(asClient, msg.from), 'bot.asCandidate', { name: asClient.name }));
        if (rest.telegram && rest.telegram.adminChatId) {
          await tg.sendMessage(token, rest.telegram.adminChatId,
            `${relay.displayName(cand)} nomzod havolasini bosdi, lekin bu chat ` +
            `"${asClient.name}" mijoziga bog'langan. Ulanmadi.`).catch(() => {});
        }
        return;
      }

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

      // Nomzodga O'Z tugmasi. Bu chat ilgari mijoz bo'lgan bo'lsa,
      // unda "Kabinet" tugmasi qolgan bo'ladi va mijoz kabinetini
      // ochadi — rol o'zgarganda tugma ham o'zgarishi shart.
      await tg.setChatMenuButton(token, chatId, 'Profilim',
        `${publicBase(req)}/profil.html`).catch(e =>
          console.error('[TG] nomzod menyu tugmasi qo\'yilmadi:', e.message));

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
        await contactLog.contacted(adminRest.id, cand.id);
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
      const lang = langOf(client, msg.from);
      if (client.status !== 'active') {
        await tg.sendMessage(token, chatId,
          T(lang, client.status === 'blocked' ? 'bot.blocked' : 'bot.pending'));
        return;
      }
      client.lastSeenAt = new Date();
      // Telegram tili — bildirishnomalar uchun (u yerda so'rov yo'q)
      if (msg.from && msg.from.language_code) client.tgLang = msg.from.language_code;
      await client.save();

      // Kabinet tugmasi. Ulanish paytida ham qo'yiladi, lekin bu yerda
      // takrorlaymiz: ulanish kabinetdan oldin bo'lgan mijozlarda tugma
      // yo'q edi, shu yo'l bilan o'zi paydo bo'ladi. Yozuvi mijoz tilida.
      await setMenu(token, chatId, lang, publicBase(req)).catch(() => {});

      // /til — tilni almashtirish (Mini App'dagi Aloqa bo'limi bilan bir xil)
      if (/^\/(til|lang|язык)(@\w+)?$/i.test(text)) {
        await tg.sendMessage(token, chatId, T(lang, 'bot.langAsk'), langKb('lg:'));
        return;
      }

      await handleClientSearch(client, chatId, { text, voice }, publicBase(req), lang);
      return;
    }

    // ── Nomzoddan oddiy xabar ──
    const cand = await Candidate.findOne({ tgChatId: chatId });
    if (!cand) return;
    const rest = await Restaurant.findOne({ id: cand.restaurantId });
    if (!rest) return;

    // Tugmani har xabarda qayta qo'yamiz: kabinet qo'shilishidan oldin
    // ulangan nomzodlarda u yo'q, chat ilgari mijoz bo'lgan bo'lsa esa
    // noto'g'ri kabinetga olib borardi.
    await tg.setChatMenuButton(token, chatId, 'Profilim',
      `${publicBase(req)}/profil.html`).catch(() => {});

    // Nomzod ovozli xabar yuborishi mumkin — uni matnga aylantirmaymiz
    // (bu adminning qidiruvi emas), lekin adminga xabar beramiz.
    const body = text || '[ovozli xabar — Telegramda tinglang]';

    // ── Agent: profil o'zgarishini o'zi qabul qiladi ──
    // Lekin SIZ nomzod bilan yozishayotgan bo'lsangiz aralashmaydi:
    // oxirgi sutkada javob yozgan bo'lsangiz, bu tirik suhbat va
    // bot o'rtaga tushsa chalkashlik bo'ladi.
    let handled = false;
    if (text) {
      // Bot siz bilan nomzod o'rtasidagi TIRIK suhbatga aralashmasligi
      // kerak. Lekin "tirik" — soatlar masalasi, sutka emas: avval 24
      // soat edi va bot deyarli har doim jim qolardi.
      //
      // FAQAT odam yozgan javob hisobga olinadi: taklif yuborilishining
      // o'zi ham 'out' yozuvi qoldiradi ('system'), u suhbat emas.
      const recentReply = await BotMessage.findOne({
        restaurantId: rest.id, candidateId: cand.id,
        direction: 'out', kind: 'text', sentBy: { $in: ['panel', 'telegram'] },
        createdAt: { $gte: new Date(Date.now() - 2 * 60 * 60 * 1000) }
      }).lean();

      // Jim qolgan bo'lsa sababini ko'rsatamiz — aks holda "bot
      // ishlamayapti" deb o'ylab, sababini topib bo'lmaydi.
      if (recentReply && rest.telegram && rest.telegram.adminChatId) {
        await tg.sendMessage(token, rest.telegram.adminChatId,
          `ℹ️ Bot javob bermadi — siz ${relay.displayName(cand)} bilan ` +
          `yozishyapsiz (oxirgi 2 soat ichida javob berilgan).`).catch(() => {});
      }

      if (!recentReply) {
        try {
          await tg.sendChatAction(token, chatId).catch(() => {});
          const out = await agent.handleCandidate({ cand, chatId, text });

          // Javob HAR DOIM ketadi. Avval `if (out.text)` edi — model bo'sh
          // matn qaytarsa nomzod jim qolardi va "bot o'lgan" deb o'ylardi.
          await tg.sendMessage(token, chatId,
            out.text || 'Qabul qildim, HR javob beradi.');
          handled = !out.forward;

          if (out.changed.length && rest.telegram && rest.telegram.adminChatId) {
            await tg.sendMessage(token, rest.telegram.adminChatId,
              `${relay.displayName(cand)} profilini yangiladi: ${out.changed.join(', ')}\n` +
              `"${body}"`).catch(() => {});
          }
        } catch (e) {
          // Xato yuz bersa ham nomzod javobsiz qolmaydi: xabar sizga
          // uzatiladi (pastda), nomzodga esa shuni aytamiz.
          console.error('[TG] nomzod agenti xatosi:', e.message);
          await tg.sendMessage(token, chatId,
            'Xabaringizni HR\'ga uzatdim, tez orada javob beradi.').catch(() => {});
          if (rest.telegram && rest.telegram.adminChatId) {
            await tg.sendMessage(token, rest.telegram.adminChatId,
              `⚠️ AI javob bera olmadi (${relay.displayName(cand)}): ${e.message}`).catch(() => {});
          }
        }
      }
    }
    if (handled) return;

    await relay.receiveFromCandidate(rest, cand, body, {
      kind: text ? 'text' : 'system', tgMessageId: msg.message_id, sentBy: 'telegram'
    });

  } catch (e) {
    console.error('[TG] webhook xatosi:', e.message);
  }
}));

// ── Kodsiz /start ────────────────────────────────────────────
// Odam botni qidiruvdan topib "Start" bosgan (yoki havoladagi kod
// yo'qolgan). Ilgari hammaga "havoladan kiring" chiqardi — nomzod boshi
// berk ko'chaga kirardi, mijoz esa o'z botida begonadek qolardi
// (2026-10-20 Anas sinovida topildi).
async function plainStart(msg, chatId, tgLang, appBase) {
  const token = tg.platformToken();

  const cl = await Client.findOne({ tgChatId: chatId });
  if (cl && cl.status === 'active') {
    const lang = langOf(cl, msg.from);
    await setMenu(token, chatId, lang, appBase).catch(() => {});
    await tg.sendMessage(token, chatId, welcomeText(cl, lang), langKb('lw:'));
    return;
  }
  const cand = await Candidate.findOne({ tgChatId: chatId });
  if (cand && cand.tgState === 'linked') {
    const lang = I18N.LANGS.includes(cand.lang) ? cand.lang : tgLang;
    await tg.setChatMenuButton(token, chatId, T(lang, 'ank.menu'), `${appBase}/profil.html`).catch(() => {});
    await tg.sendMessage(token, chatId, T(lang, 'bot.candHello'));
    return;
  }
  // Begona odam — ish izlab botni o'zi topgan: umumiy anketa. Platformada
  // bitta agentlik bo'lsa (bitta umumiy anketa) — qaysi bazaga yozish aniq.
  // Bir nechta bo'lsa taxmin qilmaymiz: havola kerak.
  if (!cl) {
    const defs = await Survey.find({ isDefault: true, active: true }, 'code').limit(2).lean();
    if (defs.length === 1) {
      await startSurvey(msg, chatId, { code: defs[0].code, channel: 'bot' }, appBase);
      return;
    }
  }
  await tg.sendMessage(token, chatId, T(tgLang, 'bot.hello'));
}

// ── Anketa: e'lon havolasi bosildi ───────────────────────────
// To'ldirilish (SurveyResponse) shu yerda ochiladi va bot Mini App
// tugmasini beradi. Bot orqali kirish ataylab: chat ochiladi — keyin
// nomzodga xabar yoza olamiz (Telegram bot birinchi bo'lib yoza olmaydi).
async function startSurvey(msg, chatId, ank, appBase) {
  const token = tg.platformToken();
  const lang = I18N.fromTelegram(msg.from && msg.from.language_code);

  // Ish beruvchi akkaunti nomzod bo'la olmaydi (nomzod havolasi bilan bir xil qoida)
  const asClient = await Client.findOne({ tgChatId: chatId });
  if (asClient) {
    await tg.sendMessage(token, chatId, T(langOf(asClient, msg.from), 'bot.asCandidate', { name: asClient.name }));
    return;
  }

  let s = null, v = null, closed = false;
  if (ank.vacancyId) {
    v = await Vacancy.findOne({ id: ank.vacancyId }).lean();
    if (!v) { await tg.sendMessage(token, chatId, T(lang, 'ank.botBadLink')); return; }
    // Yopilgan vakansiya — nomzodni yo'qotmaymiz: umumiy anketa.
    // Ochiq — shu lavozim anketasi (konstruktorda yaratilgan bo'lsa), aks holda umumiy.
    if (v.status !== 'open') { closed = true; s = await surveySvc.ensureDefault(v.agencyId); v = null; }
    else s = await surveySvc.surveyForVacancy(v);
  } else {
    s = await Survey.findOne({ code: ank.code, active: true }).lean();
    if (!s) { await tg.sendMessage(token, chatId, T(lang, 'ank.botBadLink')); return; }
  }

  const tgUserId = String((msg.from && msg.from.id) || chatId);
  const vacancyId = v ? v.id : '';
  // Chala qolgan shu anketa bo'lsa — davom ettiriladi (javoblar saqlangan)
  let r = await SurveyResponse.findOne({ agencyId: s.agencyId, tgUserId, surveyId: s.id, vacancyId, status: 'started' })
    .sort({ updatedAt: -1 });
  if (!r) {
    r = await SurveyResponse.create({ id: uuidv4(), agencyId: s.agencyId, surveyId: s.id, vacancyId,
      channel: ank.channel, tgUserId, chatId, status: 'started' });
  } else if (ank.channel && !r.channel) {
    r.channel = ank.channel;
    await r.save();
  }

  const text = closed ? T(lang, 'ank.botClosed')
    : T(lang, 'ank.botInvite') + (v ? T(lang, 'ank.botInviteVac', { v: vac.titleFor(v, lang) }) : '');
  await tg.sendMessage(token, chatId, text, { reply_markup: { inline_keyboard: [[
    { text: T(lang, 'ank.botOpen'), web_app: { url: `${appBase}/anketa.html?r=${r.id}` } }
  ]] } });
}

// ── Kontakt xabari ───────────────────────────────────────────
// Telegram faqat odamning O'Z raqamini user_id bilan yuboradi — bu
// raqam haqiqiy va shu odamniki. Mini App'ning javobiga emas, shunga
// ishonamiz. Ochiq anketaga va (bo'lsa) bog'langan nomzodga yoziladi.
async function handleContact(msg, chatId) {
  const token = tg.platformToken();
  const c = msg.contact;
  const fromId = String((msg.from && msg.from.id) || '');
  const lang0 = I18N.fromTelegram(msg.from && msg.from.language_code);

  // Mijoz (ish beruvchi) chati — bu oqim uniki emas
  if (await Client.exists({ tgChatId: chatId })) return;

  if (!c || !c.phone_number || String(c.user_id || '') !== fromId) {
    await tg.sendMessage(token, chatId, T(lang0, 'ank.contactOwn')).catch(() => {});
    return;
  }
  const phone = surveySvc.normPhone(c.phone_number);
  const now = new Date();

  const r = await SurveyResponse.findOne({ tgUserId: fromId, status: 'started' }).sort({ updatedAt: -1 });
  if (r) {
    r.phone = phone; r.phoneVerifiedAt = now; r.updatedAt = now;
    await r.save();
  }
  const cand = await Candidate.findOne({ tgChatId: chatId });
  if (cand) {
    cand.phone = phone; cand.phoneVerifiedAt = now; cand.updatedAt = now;
    await cand.save();
  }
  if (r || cand) {
    const lang = (r && I18N.LANGS.includes(r.lang) && r.lang) || (cand && I18N.LANGS.includes(cand.lang) && cand.lang) || lang0;
    await tg.sendMessage(token, chatId, T(lang, 'ank.contactOk', { p: phone })).catch(() => {});
  }
}

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

async function handleClientSearch(client, chatId, { text, voice }, appBase, lang) {
  const token = tg.platformToken();

  if (text && text.startsWith('/')) {
    await tg.sendMessage(token, chatId, T(lang, 'bot.help', { n: client.credits }));
    return;
  }

  // "Yozmoqda…" — AI javobi 2-4 soniya oladi, shu oraliqda bot
  // o'lgandek tuyulmasin
  await tg.sendChatAction(token, chatId).catch(() => {});

  try {
    let input;
    if (voice) {
      const f = await tg.getFileBase64(token, voice.file_id, { maxBytes: 10 * 1024 * 1024 });
      input = { audio: { mimeType: voice.mime_type || 'audio/ogg', data: f.base64 } };
    } else {
      input = { text };
    }

    // Bir martalik qidiruv emas, suhbat: oldingi mezonlar eslab qolinadi
    // va yangi gap ularga qo'shiladi. Agent javob tilini qaytaradi: mijoz
    // tanlamagan bo'lsa — u yozgan til (o'zi saqlaydi, agent.js).
    const out = await agent.handleClient({ client, chatId, input, lang });
    const L = out.lang || lang;

    await tg.sendMessage(token, chatId, out.text, searchKeyboard(out, appBase, L));
    // Til shu xabardan aniqlangan bo'lsa — menyu tugmasi ham o'sha tilda
    if (L !== lang) await setMenu(token, chatId, L, appBase).catch(() => {});

  } catch (e) {
    console.error('[TG] mijoz suhbati xatosi:', e.message);
    await tg.sendMessage(token, chatId, e.code === 'AI_NOT_CONFIGURED'
      ? T(lang, 'bot.aiOff')
      : T(lang, 'bot.replyFail', { e: I18N.errText(lang, e.message) }));
  }
}

// Qidiruv natijasi tugmalari: ko'rish + (bo'lsa) keyingi sahifa.
// Mijozga birinchi 20 ta ko'rsatiladi, qolgani "Yana" orqali —
// hammasini bitta ro'yxatga tiqib tashlash foydasiz, odam baribir
// birinchi o'ntasidan nariga qaramaydi.
function searchKeyboard(out, appBase, lang) {
  const rows = [];
  if (out.searchKey) {
    rows.push([{ text: out.count ? T(lang, 'bot.viewN', { n: out.count }) : T(lang, 'bot.view'),
      web_app: { url: `${appBase}/miniapp.html?s=${out.searchKey}` } }]);
    if (out.more) rows.push([{ text: T(lang, 'bot.more'), callback_data: 'more' }]);
  }
  // Taklif yozib olingach — yopiq vakansiyani bitta bosishda e'lon qilish.
  // "vp:" + uuid = 39 bayt, Telegram chegarasi 64.
  if (out.publishVacancyId) {
    rows.push([{ text: T(lang, 'bot.publish'), callback_data: 'vp:' + out.publishVacancyId }]);
  }
  return rows.length ? { reply_markup: { inline_keyboard: rows } } : {};
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
async function handleCallback(cq, appBase) {
  const token = tg.platformToken();
  const chatId = cq.message && cq.message.chat && String(cq.message.chat.id);
  const msgId = cq.message && cq.message.message_id;

  const done = (text, alert = false) =>
    tg.answerCallback(token, cq.id, text, alert).catch(() => {});

  if (!chatId) return;
  const data = String(cq.data || '');

  // Mijoz hali topilmagan joyda — Telegram tili
  const cqLang = I18N.fromTelegram(cq.from && cq.from.language_code);

  // ── Mijoz: til tanlash ('lw:' xush kelibsiz ostida, 'lg:' /til) ──
  // Tanlov mijozga yoziladi — Mini App va bildirishnomalar ham shu tilda.
  if (/^l[wg]:(uz|ru)$/.test(data)) {
    const client = await Client.findOne({ tgChatId: chatId });
    if (!client) return done(I18N.errText(cqLang, 'Mijoz topilmadi'), true);
    const lang = data.slice(3);
    await Client.updateOne({ agencyId: client.agencyId, id: client.id }, { $set: { lang } });
    client.lang = lang;
    await done(T(lang, 'bot.langToast'));
    // Xush kelibsiz xabari tanlangan tilda qayta yoziladi; /til xabari — tasdiq
    if (msgId) {
      await tg.editMessageText(token, chatId, msgId,
        data.startsWith('lw:') ? welcomeText(client, lang) : T(lang, 'bot.langSet')).catch(() => {});
    }
    await setMenu(token, chatId, lang, appBase).catch(() => {});
    return;
  }

  // ── Mijoz: "Yana nomzodlar" ──
  if (data === 'more') {
    const client = await Client.findOne({ tgChatId: chatId, status: 'active' });
    if (!client) return done(I18N.errText(cqLang, 'Mijoz topilmadi'), true);
    const lang = langOf(client, cq.from);
    await done(T(lang, 'bot.searching'));
    try {
      await tg.sendChatAction(token, chatId).catch(() => {});
      const out = await agent.morePage({ client, chatId, lang });
      await tg.sendMessage(token, chatId, out.text, searchKeyboard(out, appBase, lang));
    } catch (e) {
      console.error('[TG] keyingi sahifa xatosi:', e.message);
      await tg.sendMessage(token, chatId, T(lang, 'bot.moreFail', { e: I18N.errText(lang, e.message) }));
    }
    return;
  }

  // ── Mijoz: yopiq vakansiyani e'lon qilish ──
  // clientId sharti: tugma boshqa chatga forward qilinsa ham faqat
  // vakansiya egasi e'lon qila oladi.
  if (data.startsWith('vp:')) {
    const client = await Client.findOne({ tgChatId: chatId, status: 'active' });
    if (!client) return done(I18N.errText(cqLang, 'Mijoz topilmadi'), true);
    const lang = langOf(client, cq.from);
    const v = await Vacancy.findOneAndUpdate(
      { agencyId: client.agencyId, clientId: client.id, id: data.slice(3), status: { $ne: 'closed' } },
      // confirmedAt ham: e'lon "hozir ochiq" degani, aks holda eski
      // vakansiya darhol "eskirgan" bo'lib ro'yxatga tushmasdi
      { $set: { listed: true, confirmedAt: new Date(), updatedAt: new Date() } },
      { new: true }
    );
    if (!v) return done(T(lang, 'bot.vacGone'), true);
    await done(T(lang, 'bot.published'));

    // Tugmani olib tashlaymiz (reply_markup'siz tahrir klaviaturani o'chiradi),
    // matn o'sha-o'sha qoladi — ostiga natija qo'shiladi
    const was = (cq.message && cq.message.text) || '';
    await tg.editMessageText(token, chatId, msgId,
      `${was}\n\n${T(lang, 'bot.publishedLine')}`).catch(() => {});

    try {
      const agency = await Restaurant.findOne({ id: client.agencyId });
      const adminChat = agency && agency.telegram && agency.telegram.adminChatId;
      if (adminChat) {
        await tg.sendMessage(token, adminChat, `📢 ${client.name} vakansiyani e'lon qildi: ${v.title}`);
      }
    } catch (e) { console.error('[TG] e\'lon xabari ketmadi:', e.message); }
    return;
  }

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

    const r = await shortlistSvc.reveal({ agencyId: agency.id, shortlistId: row.id, candidateId, appBase });
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
      const allowed = info.allowed_updates || [];
      out.webhook = {
        set: !!info.url,
        pending: info.pending_update_count || 0,
        lastError: info.last_error_message || '',
        // Bo'sh ro'yxat = Telegram standart to'plami (callback ham kiradi)
        buttonsWork: !allowed.length || allowed.includes('callback_query'),
        allowedUpdates: allowed
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
