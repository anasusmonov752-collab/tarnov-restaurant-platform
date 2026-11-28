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
const testMode = require('../services/testMode');
const { track } = require('../services/track');

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
      // Ovozli anketada telefon so'ralayotgan bo'lsa — keyingi savol
      await require('../services/voiceIntake').afterContact(chatId, msg.from, publicBase(req)).catch(e => console.error('[VI] kontakt:', e.message));
      return;
    }
    // Botni bloklagan (yoki /stop degan) nomzod qaytib yozdi — demak unga yozish mumkin.
    // Aks holda "Profilim" 403 berardi va /start uni yangi odamdek qayta anketaga solardi.
    if (text !== '/stop') {
      await Candidate.updateMany({ tgChatId: chatId, tgState: { $in: ['blocked', 'stopped'] } },
        { $set: { tgState: 'linked' } }).catch(e => console.error('[TG] qayta ulash:', e.message));
    }
    // Ovozli anketa ochiq bo'lsa — ovoz, matn va rasm shu yerga (services/voiceIntake).
    // Mijoz va admin chati (test rejimida emas) bu yerga TUSHMAYDI: yarim qolgan sinov ovozli
    // anketasi admin javobini yoki mijoz xabarini "rezyume" deb yutib yuborardi.
    if (!text.startsWith('/') && (voice || text || msg.photo)) {
      const isClient = await Client.exists({ tgChatId: chatId, status: 'active' });
      const isAdmin = !isClient && await Restaurant.exists({ 'telegram.adminChatId': chatId, active: true })
        && (await testMode.modeOf(chatId)) === 'admin';
      const vi = require('../services/voiceIntake');
      if (!isClient && !isAdmin && await vi.onMessage({ msg, chatId, appBase: publicBase(req) })) return;
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
        // Bitta Telegram — bitta mijoz: shu akkaunt boshqa mijozga ulangan bo'lsa u yerdan uziladi
        // (aks holda Mini App tasodifiy birini ochadi; Client.tgChatId noyob indeks)
        await Client.updateMany({ tgChatId: String(chatId), _id: { $ne: cl._id } },
          { $set: { tgChatId: '', tgUsername: '' } });
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

      // Tavsiya havolasi (mijoz kabineti "Do'stni taklif qiling"): ref_<kod>
      if (/^ref_[A-Z0-9]{4,12}$/.test(payload)) {
        await referralStart(msg, chatId, payload.slice(4), tgLang, publicBase(req));
        return;
      }

      // Ish beruvchi havolasi (/maosh.html "Xodim kerakmi?"): emp_<manba>
      if (/^emp(_[a-z]{1,12})?$/.test(payload)) {
        await employerStart(msg, chatId, tgLang, publicBase(req), payload.slice(4) || 'link');
        return;
      }

      // Do'st tavsiyasi (nomzod kabineti "Do'stingni taklif qil"): f_<kod>
      if (/^f_[A-Z0-9]{5,10}$/.test(payload)) {
        const refBy = await Candidate.findOne({ refCode: payload.slice(2) }, 'id restaurantId').lean();
        const def = refBy && await Survey.findOne({ agencyId: refBy.restaurantId, isDefault: true, active: true }, 'code').lean();
        if (def) { await startSurvey(msg, chatId, { code: def.code, channel: 'ref', refBy: refBy.id }, publicBase(req)); return; }
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
        // Token bir martalik. SMS havolasini IKKINCHI marta bosgan o'sha odam —
        // o'z ekranini ko'radi; begona odam — oddiy birinchi ekran. Ilgari bu
        // yerda "Havola eskirgan" deb boshi berk edi.
        const me = await Candidate.findOne({ tgChatId: chatId, tgState: 'linked' });
        if (me) {
          const lang = I18N.resolve(me.lang, me.tgLang || tgLang);
          const scr = await require('../services/firstTouch').candidateInvite({ cand: me, lang, appBase: publicBase(req) });
          await sendScreen(token, chatId, scr);
        } else {
          await plainStart(msg, chatId, tgLang, publicBase(req));
        }
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

      // Havolani BOSHQA odam bosdi (admin tekshiryapti yoki havola uzatilgan) —
      // bog'lanmaydi va token kuymaydi: nomzodning o'z havolasi ishlayveradi.
      const claim = await outreach.inviteClaim(cand, chatId, rest.telegram && rest.telegram.adminChatId);
      if (claim.mode !== 'bind') {
        const ft = require('../services/firstTouch');
        if (claim.mode === 'admin') {
          const scr = await ft.candidateInvite({ cand, lang: I18N.resolve(cand.lang, tgLang), appBase: publicBase(req) });
          await tg.sendMessage(token, chatId,
            `👀 <b>Ko'rinish</b> — bu havola ${escHtml(relay.displayName(cand))} uchun. ` +
            `Siz admin, akkauntingiz ulanmadi; havola nomzodning o'zi uchun ishlayveradi. ` +
            `Nomzod quyidagini ko'radi (tugmalar unda bo'ladi):`, { parse_mode: 'HTML' });
          // Rasm bilan, lekin TUGMASIZ: admin chatidagi tugma nomzodga emas, adminga ta'sir qilardi
          await sendScreen(token, chatId, { ...scr, keyboard: [] });
        } else {
          const me = claim.me;
          const scr = await ft.candidateInvite({ cand: me, lang: I18N.resolve(me.lang, me.tgLang || tgLang), appBase: publicBase(req) });
          await sendScreen(token, chatId, scr);
          if (rest.telegram && rest.telegram.adminChatId) {
            await tg.sendMessage(token, rest.telegram.adminChatId,
              `${relay.displayName(cand)} uchun SMS havolasini boshqa odam bosdi ` +
              `(${relay.displayName(me)}). Ulanmadi — havola nomzodning o'zi uchun saqlandi.`).catch(() => {});
          }
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
      await tg.setChatMenuButton(token, chatId, T(I18N.resolve(cand.lang, cand.tgLang), 'ank.menu'),
        `${publicBase(req)}/profil.html`).catch(e =>
          console.error('[TG] nomzod menyu tugmasi qo\'yilmadi:', e.message));

      // Tayyor rezyume — anketa EMAS: hh rezyumesi bizda bor. Lavozimidagi
      // ochiq ishlar va bitta tugma bilan ariza (services/firstTouch).
      cand.tgLang = (msg.from && msg.from.language_code) || cand.tgLang || '';
      await Candidate.updateOne({ _id: cand._id }, { $set: { tgLang: cand.tgLang } });
      const ilang = I18N.resolve(cand.lang, cand.tgLang || tgLang);
      const scr = await require('../services/firstTouch').candidateInvite({ cand, lang: ilang, appBase: publicBase(req) });
      await sendScreen(token, chatId, scr);
      track('start', { agencyId: cand.restaurantId, tgUserId: chatId, candidateId: cand.id,
        channel: cand.tgInviteChannel || 'sms', name: cand.fullName, username: cand.tgUsername, isTest: cand.isTest });

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
        await tg.sendMessage(token, chatId, T(I18N.resolve(cand.lang, cand.tgLang), 'bot.stopped'));
      }
      return;
    }

    // ── /test — admin test rejimi (faqat agentlik admin chati) ──
    if (/^\/test(@\w+)?$/i.test(text) && await testMode.testerAgency(chatId)) {
      await sendTestMenu(token, chatId, await testMode.modeOf(chatId));
      return;
    }

    // ── Admin chati ──
    // reply bo'lsa -> nomzodga javob;  reply bo'lmasa -> nomzod qidiruvi.
    // Test rejimida (mijoz/nomzod) admin akkaunti o'sha rol bo'lib ishlaydi —
    // xabari pastdagi mijoz yoki nomzod yo'liga tushadi.
    const adminRest = await Restaurant.findOne({ 'telegram.adminChatId': chatId, active: true });
    if (adminRest && (await testMode.modeOf(chatId)) === 'admin') {
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
        // Tasdiqlanmagan mijoz yozgani agentlikka — restoran nomini, ehtiyojni ko'radi
        if (client.status === 'pending' && (text || voice)) {
          const ag = await Restaurant.findOne({ id: client.agencyId }, 'telegram').lean();
          const adm = ag && ag.telegram && ag.telegram.adminChatId;
          if (adm) await tg.sendMessage(token, adm, `📩 Tasdiqlanmagan mijoz «${client.name}»${client.tgUsername ? ' @' + client.tgUsername : ''}:\n\n${voice ? '🎤 ovozli xabar' : String(text).slice(0, 1500)}\n\nPanel → Mijozlar: ma'lumotini to'ldirib, faollashtiring.`).catch(() => {});

          // Jim qolmaymiz: AI qidiruvi NAMOYISH tarzida ishlaydi — natija
          // anonim (ism/telefon yo'q), kontakt ochadigan tugmalar esa faol
          // hisob talab qiladi. Soni cheklangan — raqobatchi restoran
          // niqobida bazani ko'chirib olmasin (services/firstTouch).
          const ft = require('../services/firstTouch');
          if (ft.demoLeft(client) > 0) {
            await ft.noteDemo(client);
            await handleClientSearch(client, chatId, { text, voice }, publicBase(req), lang,
              { demo: ft.demoLeft(client) - 1 });
            return;
          }
          await tg.sendMessage(token, chatId, T(lang, 'ft.eDemoOut'), ft.demoKeyboard(lang));
          return;
        }
        await tg.sendMessage(token, chatId,
          T(lang, client.status === 'blocked' ? 'bot.blocked' : client.referredBy ? 'bot.refPending' : 'bot.pending'));
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
    await tg.setChatMenuButton(token, chatId, T(I18N.resolve(cand.lang, cand.tgLang), 'ank.menu'),
      `${publicBase(req)}/profil.html`).catch(() => {});

    // /til — nomzod ham tilni almashtira oladi (mijozdagi bilan bir xil tugmalar)
    if (/^\/(til|lang|язык)(@\w+)?$/i.test(text || '')) {
      const L = I18N.resolve(cand.lang, cand.tgLang);
      await tg.sendMessage(token, chatId, T(L, 'bot.langAsk'), langKb('lg:'));
      return;
    }

    // Arizadan keyingi tekshiruvning oxirgi savoli — ovozli tanishuv
    // (services/prescreen). Qabul qilinsa — boshqa yo'lga ketmaydi.
    if (voice && !text) {
      const ps = require('../services/prescreen');
      if (await ps.takeVoice({ cand, voice })) {
        const L = I18N.resolve(cand.lang, cand.tgLang);
        await tg.sendMessage(token, chatId, T(L, 'ps.voiceOk'), { reply_markup: { inline_keyboard: [[
          { text: T(L, 'al.bApps'), web_app: { url: `${publicBase(req)}/profil.html#apps` } }]] } }).catch(() => {});
        return;
      }
    }

    // Ovozli xabar — AI rekruter: matnga aylantiriladi va agent javob beradi
    // (services/voiceIntake.transcribe). Nomzod ovozni afzal ko'radi — javob
    // ovoz bilan ham (services/tts, AISHA_API_KEY bo'lsa).
    let said = text;
    if (!said && voice) {
      if (!cand.prefersVoice) Candidate.updateOne({ _id: cand._id }, { $set: { prefersVoice: true } }).catch(() => {});
      cand.prefersVoice = true;
      said = await require('../services/voiceIntake').transcribe(voice, cand.restaurantId).catch(() => '');
    }
    const body = said ? (voice && !text ? '🎤 ' + said : said) : '[ovozli xabar — Telegramda tinglang]';

    // ── Agent: profil o'zgarishini o'zi qabul qiladi ──
    // Lekin SIZ nomzod bilan yozishayotgan bo'lsangiz aralashmaydi:
    // oxirgi sutkada javob yozgan bo'lsangiz, bu tirik suhbat va
    // bot o'rtaga tushsa chalkashlik bo'ladi.
    let handled = false;
    if (said) {
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
          const out = await agent.handleCandidate({ cand, chatId, text: said });

          // Javob HAR DOIM ketadi. Avval `if (out.text)` edi — model bo'sh
          // matn qaytarsa nomzod jim qolardi va "bot o'lgan" deb o'ylardi.
          await tg.sendMessage(token, chatId,
            out.text || T(I18N.resolve(cand.lang, cand.tgLang), 'bot.gotIt'));
          if (cand.prefersVoice && out.text) {
            await require('../services/tts').speak(chatId, out.text, I18N.resolve(cand.lang, cand.tgLang)).catch(() => {});
          }
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
            T(I18N.resolve(cand.lang, cand.tgLang), 'bot.forwarded')).catch(() => {});
          if (rest.telegram && rest.telegram.adminChatId) {
            await tg.sendMessage(token, rest.telegram.adminChatId,
              `⚠️ AI javob bera olmadi (${relay.displayName(cand)}): ${e.message}`).catch(() => {});
          }
        }
      }
    }
    if (handled) return;

    await relay.receiveFromCandidate(rest, cand, body, {
      kind: said ? 'text' : 'system', tgMessageId: msg.message_id, sentBy: 'telegram'
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
// ── Admin test rejimi (services/testMode) ────────────────────
const TEST_LABEL = { admin: '🛠 Admin', client: '🧪 Sinov mijoz', candidate: '👤 Nomzod', hh: '📄 hh nomzod', real: '👔 Haqiqiy mijoz' };
async function sendTestMenu(token, chatId, mode) {
  // Haqiqiy mijoz tugmasi uning nomi bilan (bitta bo'lsa) — "👔 Tarnov"
  const ag = await testMode.testerAgency(chatId);
  const st = await testMode.state(chatId);
  const reals = ag ? await testMode.realClients(ag.id) : [];
  const cur = st && st.mode === 'real' && st.realClientId ? reals.find(c => c.id === st.realClientId) : null;
  const realName = (reals.find(c => st && c.id === st.realClientId) || (reals.length === 1 ? reals[0] : null) || {}).name;
  const realBtn = '👔 ' + (realName || 'Haqiqiy mijoz');
  await tg.sendMessage(token, chatId,
    `🧪 Test rejimi\n\nHozir: ${cur ? '👔 ' + cur.name : (TEST_LABEL[mode] || mode)}\n\n` +
    `${realBtn} — HAQIQIY mijoz kabineti: haqiqiy vakansiyalar va nomzodlar, kontakt ochilsa KREDIT YECHILADI\n` +
    `🧪 Sinov mijoz — «🧪 Sinov restoran»: faqat sinov nomzodining kontakti ochiladi\n` +
    `👤 Nomzod — sinov nomzodi kabineti (anketadan)\n` +
    `📄 hh nomzod — SMS olgan hh nomzodi kabi: SMS matni va shaxsiy havola (har bosishda noldan)\n` +
    `🛠 Admin — hammasi oldingi holatga qaytadi\n` +
    `🔄 Anketani qaytadan — bot sizni yangi odam deb ko'radi`,
    { reply_markup: { inline_keyboard: [
      [{ text: realBtn, callback_data: 'tm:real' }, { text: '🧪 Sinov mijoz', callback_data: 'tm:client' }],
      [{ text: '👤 Nomzod', callback_data: 'tm:candidate' }, { text: '📄 hh nomzod', callback_data: 'tm:hh' }],
      [{ text: '🛠 Admin', callback_data: 'tm:admin' }, { text: '🔄 Anketani qaytadan', callback_data: 'tm:reset' }]
    ] } });
}
// Pastdagi menyu tugmasi rolga mos: mijozga Kabinet, nomzodga Profilim,
// adminga — test rejimidan oldingi holat (mijozga ulangan bo'lsa Kabinet)
async function applyTestMenu(token, chatId, mode, out, appBase) {
  try {
    if (mode === 'client' || mode === 'real') return await setMenu(token, chatId, langOf(out.client, null), appBase);
    if (mode === 'candidate') return await tg.setChatMenuButton(token, chatId, T('uz', 'ank.menu'), `${appBase}/profil.html`);
    const cl = await Client.findOne({ tgChatId: chatId });
    if (cl) return await setMenu(token, chatId, langOf(cl, null), appBase);
    const cand = await Candidate.findOne({ tgChatId: chatId });
    if (cand) return await tg.setChatMenuButton(token, chatId, T(I18N.resolve(cand.lang, cand.tgLang), 'ank.menu'), `${appBase}/profil.html`);
    await tg.resetChatMenuButton(token, chatId);
  } catch (e) { console.error('[TEST] menyu tugmasi:', e.message); }
}
function testModeText(m, out) {
  const reopen = '\n\nMini App ochiq bo\'lsa — yopib, qayta oching.';
  if (m === 'real') {
    return `👔 «${out.client.name}» — HAQIQIY mijoz sifatida ulandingiz, ${out.client.credits || 0} kredit.\n\n` +
      `Bu sinov emas: vakansiyalar, arizalar va nomzodlar haqiqiy. Kontakt ochsangiz — haqiqiy kredit yechiladi, ` +
      `nomzodga xabar boradi. Pastdagi Kabinet tugmasi.\n\n🛠 Admin rejimiga qaytsangiz, bu akkaunt «${out.client.name}»dan uziladi.` + reopen;
  }
  if (m === 'client') {
    return `👔 Mijoz rejimi — «${out.client.name}», ${out.client.credits} kredit.\n\n` +
      `Botga yozing (masalan: "kechki smenaga ofitsiant kerak") yoki pastdagi Kabinet tugmasi.` +
      `\nHaqiqiy nomzodlarni ko'rasiz, lekin kontaktini faqat sinov nomzodiniki ochiladi.` + reopen;
  }
  if (m === 'candidate') {
    return out.candidate
      ? `👤 Nomzod rejimi — sinov nomzodi «${out.candidate.fullName || 'nomsiz'}».\n\nPastdagi Profilim tugmasi.` + reopen
      : `👤 Nomzod rejimi — sinov nomzodi hali yo'q.\n\n/start bosing — anketa noldan boshlanadi.`;
  }
  if (m === 'hh') {
    return out.hh
      ? `📄 hh nomzod rejimi — «${out.hh.fullName || 'nomsiz'}» (sinov rezyumesi).\n\n` +
        `Arizalari o'chirildi, yangi shaxsiy havola yaratildi. Pastda — nomzod oladigan SMS ` +
        `aynan shu ko'rinishda. Havolani bosing: hh nomzodi ko'radigan ekran ochiladi.`
      : `📄 hh nomzod rejimi — sinov rezyumesi hali tanlanmagan.\n\n` +
        `Panel → hh.uz bazasi → rezyumeni yuklang (yoki mavjudini oching) → ⤢ to'liq karta → «🧪 Test rejimida sinash». ` +
        `Keyin /test → 📄 hh nomzod.`;
  }
  if (m === 'reset') {
    return `🔄 Anketa tozalandi (${out.deleted} ta javob o'chdi), rejim — nomzod.\n\n` +
      `/start bosing — bot sizni birinchi marta kelgan odam deb ko'radi.`;
  }
  return '🛠 Admin rejimi — hammasi test rejimidan oldingi holatga qaytdi.';
}

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
    // Qaytib kelgan nomzod — bir bosishda ishlar ro'yxatiga (menyu tugmasini hamma ham topmaydi)
    await tg.sendMessage(token, chatId, T(lang, 'bot.candHello'), { reply_markup: { inline_keyboard: [[
      { text: T(lang, 'ank.botJobs'), web_app: { url: `${appBase}/profil.html#jobs` } },
      { text: T(lang, 'ank.botProfile'), web_app: { url: `${appBase}/profil.html` } }
    ]] } });
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
    // Agentlik admini (test rejimida emas — akkaunti mijozga ulangan): anketani
    // sinamoqchi — "ish beruvchi" deb rad etish o'rniga yo'lni ko'rsatamiz
    // Bir bosishda: nomzod rejimiga o'tadi va SHU havoladagi anketani ochadi (tma:)
    if (await testMode.testerAgency(chatId)) {
      await tg.sendMessage(token, chatId,
        `🧪 Akkauntingiz hozir «${asClient.name}» mijoziga ulangan — anketa nomzod uchun.`,
        { reply_markup: { inline_keyboard: [[
          { text: '👤 Nomzod sifatida to\'ldirish', callback_data: 'tma:' + surveySvc.payloadFor(ank) }
        ]] } });
      return;
    }
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
  // Admin test rejimida (nomzod) to'ldirilgan anketa — sinov: nomzodi isTest
  const isTest = (await testMode.modeOf(tgUserId)) === 'candidate';

  // Profili TAYYOR nomzod (shu agentlikda, Telegram ulangan, ism va to'g'ri raqam bor) kanal
  // postidagi havolani bossa — butun anketani qayta to'ldirmaydi (finalize profilini ustidan
  // yozardi ham): vakansiya + bir bosishda ariza (firstTouch.inviteApply — kabinet qoidasi)
  if (v) {
    const known = await Candidate.findOne({ restaurantId: v.agencyId, tgChatId: chatId, tgState: 'linked' }).lean();
    if (known && String(known.fullName || '').trim() && require('../services/applyReveal').validPhone(known.phone || '')) {
      const L = I18N.resolve(known.lang, known.tgLang || (msg.from && msg.from.language_code));
      const meta = [I18N.place(v.location, L), vac.salaryText(v, L)].filter(Boolean).join(' · ');
      const first = String((msg.from && msg.from.first_name) || '').trim().slice(0, 30);
      await tg.sendMessage(token, chatId, [
        T(L, 'ank.hookHi', { name: first ? ', ' + escHtml(first) : '' }), '',
        T(L, 'ank.hookVac', { v: escHtml(vac.titleFor(v, L)), meta: meta ? '\n' + escHtml(meta) : '' }), '',
        T(L, 'ft.vKnown')
      ].join('\n').replace(/\n{3,}/g, '\n\n'), { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
        [{ text: T(L, 'ft.vApply1'), callback_data: 'ft:ap:' + v.id }],
        [{ text: T(L, 'ank.botProfile'), web_app: { url: `${appBase}/profil.html` } }]
      ] } });
      track('view', { agencyId: v.agencyId, tgUserId, ref: v.id, channel: ank.channel || 'bot', name: msg.from && msg.from.first_name, isTest });
      return;
    }
  }
  let r;
  if (!vacancyId) {
    // Vakansiyasiz: bitta odamga BITTA ochiq yozuv — chala qolgani davom etadi, javobsizi
    // shu anketaga o'tadi; lavozim tanlanganda ham o'sha yozuv (survey.openResponse)
    r = await surveySvc.openResponse({ agencyId: s.agencyId, tgUserId, chatId, surveyId: s.id,
      channel: ank.channel, refBy: ank.refBy || '', isTest, resume: !!s.isDefault });
  } else {
    // Vakansiya havolasi: chala qolgan shu anketa bo'lsa — davom ettiriladi (javoblar saqlangan)
    r = await SurveyResponse.findOne({ agencyId: s.agencyId, tgUserId, surveyId: s.id, vacancyId, status: 'started' })
      .sort({ updatedAt: -1 });
    if (!r) {
      r = await SurveyResponse.create({ id: uuidv4(), agencyId: s.agencyId, surveyId: s.id, vacancyId,
        channel: ank.channel, tgUserId, chatId, status: 'started', isTest, refBy: ank.refBy || '' });
    } else if ((ank.channel && !r.channel) || (isTest && !r.isTest)) {
      if (ank.channel && !r.channel) r.channel = ank.channel;
      if (isTest) r.isTest = true;
      await r.save();
    }
  }

  // Nomzod yo'li (services/track): kirdi; vakansiya havolasi bilan kelgan bo'lsa
  // — o'sha vakansiyani ham ko'rdi (bot kartasi e'lonning o'zi)
  const who = { agencyId: s.agencyId, tgUserId, rid: r.id, channel: r.channel || ank.channel || 'bot',
                name: msg.from && msg.from.first_name, username: msg.from && msg.from.username, isTest: r.isTest };
  track('start', Object.assign({ ref: vacancyId }, who));
  if (v) track('view', Object.assign({ ref: v.id }, who));

  const scr = await firstScreen({ lang, from: msg.from, agencyId: s.agencyId, v, closed, r, appBase });
  // Havolasiz /start — brend rasmi bilan (rasm o'tmasa sendScreen matn yuboradi)
  await sendScreen(token, chatId, { text: scr.text, keyboard: scr.rows, photo: scr.photo });
}

// ── Nomzodning birinchi ekrani (matn + tugmalar) ──
// Matn kimga yozilgani: docs/auditoriya.md. Nomzod ish va maosh qidiryapti —
// agentlik tavsifi («xodim tanlash xizmati… biz tavsiya qilamiz») MIJOZ matni,
// u bu yerda yo'q. Ikki yo'l:
//   vakansiya havolasi  -> e'lonning o'zi (maosh, tuman) + darhol ariza
//   havolasiz           -> services/firstTouch.candidatePick (YAGONA joy;
//                          "Orqaga" ham aynan shu ekranni chizadi)
const escHtml = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Ekranni yuborish: rasm bo'lsa — rasm + izoh (brendli birinchi xabar), aks holda matn.
// scr.photo — public/ ichidagi yo'l ('img/bot-welcome-uz.jpg'): faylni o'zimiz yuklaymiz,
// keyin file_id (services/telegram sendLocalPhoto). Rasm o'tmasa — jim qolmasdan matn bilan.
async function sendScreen(token, chatId, scr) {
  const extra = { parse_mode: 'HTML', ...(scr.keyboard && scr.keyboard.length ? { reply_markup: { inline_keyboard: scr.keyboard } } : {}) };
  if (scr.photo) {
    try { return await tg.sendLocalPhoto(token, chatId, scr.photo, scr.text, extra); }
    catch (e) { console.warn('[TG] rasm yuborilmadi:', e.message); }
  }
  return tg.sendMessage(token, chatId, scr.text, extra);
}

async function firstScreen({ lang, from, agencyId, v, closed, r, appBase }) {
  const ft = require('../services/firstTouch');
  const first = String((from && from.first_name) || '').trim().slice(0, 30);

  if (v) {
    const meta = [I18N.place(v.location, lang), vac.salaryText(v, lang)].filter(Boolean).join(' · ');
    const text = [
      T(lang, 'ank.hookHi', { name: first ? ', ' + escHtml(first) : '' }),
      T(lang, 'ft.cIntro'), '',
      T(lang, 'ank.hookVac', { v: escHtml(vac.titleFor(v, lang)), meta: meta ? '\n' + escHtml(meta) : '' }), '',
      // Havola bilan kelganda anketa tugagach ariza AVTOMATIK yuboriladi —
      // shuning uchun tugma ham, matn ham aynan shuni va'da qiladi
      T(lang, 'ft.cAskVac'), '',
      T(lang, 'ft.cVoiceHint')
    ].join('\n').replace(/\n{3,}/g, '\n\n');
    return { text, rows: [
      [{ text: T(lang, 'ft.cApply'), web_app: { url: `${appBase}/anketa.html?r=${r.id}` } }],
      [require('../services/voiceIntake').entryButton(r, lang)],
      [ft.langSwitchBtn(lang, r.id)]
    ] };
  }

  const pick = await ft.candidatePick({ agencyId, lang, name: first, rid: r.id, appBase, closed });
  return { text: pick.text, rows: pick.keyboard, photo: pick.photo };
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

async function handleClientSearch(client, chatId, { text, voice }, appBase, lang, opts = {}) {
  const token = tg.platformToken();
  // demo: tasdiqlanmagan restoranga namoyish — natija ko'rinadi, lekin
  // kontakt ochadigan tugmalar berilmaydi (services/firstTouch)
  const demo = opts.demo != null;

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

    if (demo) {
      const ft = require('../services/firstTouch');
      await tg.sendMessage(token, chatId, out.text + '\n\n' + T(L, 'ft.eDemo', { n: opts.demo }), ft.demoKeyboard(L));
      return;
    }
    await tg.sendMessage(token, chatId, out.text, searchKeyboard(out, appBase, L));
    // Til shu xabardan aniqlangan bo'lsa — menyu tugmasi ham o'sha tilda
    if (L !== lang) await setMenu(token, chatId, L, appBase).catch(() => {});

  } catch (e) {
    console.error('[TG] mijoz suhbati xatosi:', e.message);
    if (require('../services/ai').isBusy(e)) {
      // Google band / kvota / timeout — "45 s ichida javob bermadi" degan xom matn emas
      await tg.sendMessage(token, chatId, T(lang, 'bot.aiBusy'), appBase ? { reply_markup: { inline_keyboard: [[
        { text: T(lang, 'bot.aiBusyBtn'), web_app: { url: `${appBase}/miniapp.html?sx=1` } }]] } } : undefined);
      return;
    }
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
// Qobiq: ichida biror DB chaqiruvi yiqilsa, answerCallbackQuery chaqirilmay tugma Telegramda
// cheksiz aylanib qolardi. Javob berilmagan bo'lsa — xato matni (foydalanuvchi tilida).
async function handleCallback(cq, appBase) {
  const st = { answered: false };
  try { await handleCallbackInner(cq, appBase, st); }
  catch (e) {
    console.error('[TG] callback:', (cq && cq.data) || '', e.message);
    if (!st.answered) {
      const L = I18N.fromTelegram(cq.from && cq.from.language_code);
      await tg.answerCallback(tg.platformToken(), cq.id, I18N.errText ? I18N.errText(L, e.message) : T(L, 'common.error'), true).catch(() => {});
    }
    throw e;            // tashqi catch (alert) ham ko'rsin
  }
}

async function handleCallbackInner(cq, appBase, st) {
  const token = tg.platformToken();
  const chatId = cq.message && cq.message.chat && String(cq.message.chat.id);
  const msgId = cq.message && cq.message.message_id;

  const done = (text, alert = false) => {
    st.answered = true;
    return tg.answerCallback(token, cq.id, text, alert).catch(() => {});
  };

  if (!chatId) return;
  const data = String(cq.data || '');

  // Mijoz hali topilmagan joyda — Telegram tili
  const cqLang = I18N.fromTelegram(cq.from && cq.from.language_code);

  // ── "Sizga mos ish" xabarlarini o'chirish (services/jobPost) ──
  if (data === 'ja:off') {
    await require('../services/jobPost').alertsOff(chatId);
    const cand = await Candidate.findOne({ tgChatId: chatId }, 'lang tgLang').lean();
    const L = I18N.resolve(cand && cand.lang, (cand && cand.tgLang) || (cq.from && cq.from.language_code));
    await done(T(L, 'jp.offOk'));
    await tg.editMessageText(token, chatId, msgId, (cq.message.text || '') + '\n\n' + T(L, 'jp.offOk')).catch(() => {});
    return;
  }

  // ── Nomzod: birinchi ekrandagi til tugmasi ──
  // Telegram interfeysi tili faqat TAXMIN: O'zbekistonda ko'p telefon ruscha
  // sozlangan, egasi o'zbekcha gapiradi. Bir bosishda to'g'rilanadi va tanlov
  // ANKETAGA ham o'tadi (SurveyResponse.lang) — forma qayta so'ramaydi.
  if (/^ft:lang:(uz|ru):/.test(data)) {
    const [, , lang, rid] = data.split(':');
    const fromId = String((cq.from && cq.from.id) || chatId);
    const r = await SurveyResponse.findOne({ id: rid, tgUserId: fromId });
    if (!r) { console.warn('[CB] ft:lang — yozuv yo\'q'); return done(T(lang, 'bot.stale'), true); }   // jim qolmasin
    r.lang = lang;
    await r.save();
    track('lang', { agencyId: r.agencyId, tgUserId: fromId, ref: lang, rid: r.id, isTest: r.isTest,
                    name: cq.from && cq.from.first_name, username: cq.from && cq.from.username });
    // Allaqachon nomzod bo'lsa — bot xabarlari va kabinet ham shu tilda
    await Candidate.updateOne({ tgChatId: chatId }, { $set: { lang } }).catch(() => {});
    await done(T(lang, 'bot.langToast'));
    let v = null, closed = false;
    if (r.vacancyId) {
      v = await Vacancy.findOne({ id: r.vacancyId }).lean();
      if (!v || v.status !== 'open') { closed = !!v; v = null; }
    }
    const scr = await firstScreen({ lang, from: cq.from, agencyId: r.agencyId, v, closed, r, appBase });
    const opt = { parse_mode: 'HTML', reply_markup: { inline_keyboard: scr.rows } };
    // Rasmli birinchi xabar: rasm ham tanlangan tilga almashadi (editMessageText rasmda ishlamaydi)
    if (cq.message && cq.message.photo) {
      await (scr.photo ? tg.editLocalPhoto(token, chatId, msgId, scr.photo, scr.text, opt)
        : tg.editMessageCaption(token, chatId, msgId, scr.text, opt))
        .catch(e => console.warn('[CB] ft:lang rasm:', e.message));
    } else {
      await tg.editMessageText(token, chatId, msgId, scr.text, opt).catch(() => {});
    }
    return;
  }

  // ── Suhbat (services/interviews) va arizadan keyingi tekshiruv (services/prescreen) ──
  // Ikkalasi bir xil javob shaklini qaytaradi: {text, alert, edit, keyboard}
  if (/^(iv|ps|pl|vi|ob|sh|ft):/.test(data)) {
    try {
      const SVC = { 'iv:': 'interviews', 'ps:': 'prescreen', 'pl:': 'placements', 'vi:': 'voiceIntake', 'ob:': 'onboard',
        'sh:': 'shifts', 'ft:': 'firstTouch' };
      const t0 = Date.now();
      const svc = require('../services/' + SVC[data.slice(0, 3)]);
      const r = await svc.handleCallback({ data, chatId, appBase, from: cq.from });
      const tag = data.split(':').slice(0, 2).join(':');
      // Tugma JIM qolmasin (Anas, 2026-11-17: "buttonlar ba'zida ishlamay qolyapti"):
      // servis hech narsa qaytarmasa (yozuv topilmadi, eski xabar) — tushuntirib aytamiz
      if (!r.text && !r.edit && !r.keyboard) {
        console.warn('[CB] bo\'sh javob:', tag);
        await done(I18N.t(cqLang, 'bot.stale'), true);
        return;
      }
      await done(r.text || '', !!r.alert);
      if (r.edit) {
        // r.html — matnda <b> bor (services/firstTouch). parse_mode bo'lmasa
        // teglar MATN bo'lib chiqadi (2026-11-14 jonli topildi).
        const opt = r.keyboard ? { reply_markup: { inline_keyboard: r.keyboard } } : {};
        if (r.html) opt.parse_mode = 'HTML';
        // Rasmli xabar (brendli birinchi xabar): matn emas — izoh; til almashsa rasm ham.
        // Navbat bilan: rasm+izoh -> faqat izoh (rasm o'tmasa ham xabar BITTA qoladi).
        const isPhoto = !!(cq.message && cq.message.photo);
        const tries = isPhoto
          ? [r.photo && (() => tg.editLocalPhoto(token, chatId, msgId, r.photo, r.edit, opt)),
             () => tg.editMessageCaption(token, chatId, msgId, r.edit, opt)].filter(Boolean)
          : [() => tg.editMessageText(token, chatId, msgId, r.edit, opt)];
        let edited = false;
        for (const f of tries) {
          try { await f(); edited = true; break; }
          catch (e) {
            // "not modified" — o'sha ekran; "canceled by new edit" — odam tugmani tez-tez
            // bosdi, keyingi so'rov o'zi tahrirlaydi. Ikkalasi xato EMAS (yangi xabar kerak emas —
            // 2026-11-17 jonli: shu sababli chatga ketma-ket nusxalar tushdi)
            if (/not modified|canceled by new edit/i.test(e.message)) { edited = true; break; }
            console.warn('[CB] edit:', tag, e.message);
          }
        }
        if (!edited) {
          // Tahrirlab bo'lmadi (xabar o'chirilgan, juda eski) — jim qolmasdan yangi xabar
          const send = isPhoto && r.photo ? sendScreen(token, chatId, { photo: r.photo, text: r.edit, keyboard: r.keyboard })
            : tg.sendMessage(token, chatId, r.edit, opt);
          await send.catch(err => console.error('[CB] send:', tag, err.message));
        }
      }
      console.log('[CB]', tag, (Date.now() - t0) + 'ms');
    } catch (e) {
      console.error('[CB] tugma xatosi:', data.split(':').slice(0, 2).join(':'), e.message);
      await done(I18N.errText(cqLang, e.message), true);
    }
    return;
  }

  // ── Agentlik: tarif to'lovini qo'lda tasdiqlash (billing.createOrder 'manual' xabari) ──
  if (data.startsWith('bo:')) {
    const ag = await Restaurant.findOne({ 'telegram.adminChatId': chatId, active: true }, 'id').lean();
    const Order = require('../models/Order');
    const o = ag && await Order.findOne({ agencyId: ag.id, id: data.slice(3) }).lean();
    if (!o) { await done('Buyurtma topilmadi', true); return; }
    try {
      const r = await require('../services/billing').activate(o.id, { by: 'admin' });
      await done(r.already ? 'Allaqachon yoqilgan' : 'Tarif yoqildi');
      await tg.editMessageText(token, chatId, msgId, (cq.message.text || '') + (r.already ? '\n\n✅ Allaqachon yoqilgan' : '\n\n✅ To\'landi — tarif yoqildi')).catch(() => {});
    } catch (e) { await done(e.message, true); }
    return;
  }

  // ── Agentlik: kartaga o'tkazma kelmadi — mijozga xabar, buyurtma ochiq qoladi ──
  if (data.startsWith('bx:')) {
    const ag = await Restaurant.findOne({ 'telegram.adminChatId': chatId, active: true }, 'id').lean();
    if (!ag) { await done('Faqat agentlik admini uchun', true); return; }
    try {
      await require('../services/cardPay').reject(ag.id, data.slice(3));
      await done('Mijozga xabar yuborildi');
      await tg.editMessageText(token, chatId, msgId, (cq.message.text || '') + '\n\n❌ Pul tushmadi — mijozga xabar berildi').catch(() => {});
    } catch (e) { await done(e.message, true); }
    return;
  }

  // ── Mijoz: "✅ To'ladim" (kartaga o'tkazma xabari, eslatma) ──
  if (data.startsWith('pc:')) {
    const cl = await Client.findOne({ tgChatId: chatId }).lean();
    if (!cl) { await done('Hisob topilmadi', true); return; }
    const L = langOf(cl, cq.from);
    try {
      const v = await require('../services/cardPay').claim(cl, data.slice(3));
      const key = v.status === 'paid' ? 'bill.cardAlready' : v.status === 'canceled' ? 'bill.cardClosed' : 'bill.cardClaimed';
      await done(T(L, key), v.status !== 'checking');
      await tg.editMessageText(token, chatId, msgId, (cq.message.text || '') + '\n\n' + T(L, key)).catch(() => {});
    } catch (e) { await done(I18N.errText(L, e.message), true); }
    return;
  }

  // ── Admin test rejimi: anketa havolasidan nomzod rejimiga o'tib, anketani ochish ──
  if (data.startsWith('tma:')) {
    if (!(await testMode.testerAgency(chatId))) { await done('Faqat agentlik admini uchun', true); return; }
    const ank = surveySvc.parsePayload(data.slice(4));
    if (!ank) { await done('Havola eskirgan', true); return; }
    try {
      const out = await testMode.setMode(chatId, 'candidate', cq.from);
      await applyTestMenu(token, chatId, 'candidate', out, appBase);
      await done('Nomzod rejimi');
      await startSurvey({ from: cq.from }, chatId, ank, appBase);
    } catch (e) { await done(e.message, true); }
    return;
  }

  // ── Admin test rejimi: rejim tugmalari (/test) ──
  // tm:rc:<clientId> — bir nechta haqiqiy mijozdan tanlangani
  if (/^tm:(admin|client|candidate|reset|hh|real)$/.test(data) || /^tm:rc:[\w-]{1,60}$/.test(data)) {
    if (!(await testMode.testerAgency(chatId))) { await done('Faqat agentlik admini uchun', true); return; }
    const rc = data.startsWith('tm:rc:') ? data.slice(6) : '';
    const m = rc ? 'real' : data.slice(3);
    try {
      const out = m === 'reset' ? await testMode.resetSurvey(chatId, cq.from)
        : await testMode.setMode(chatId, m, cq.from, { clientId: rc });
      await applyTestMenu(token, chatId, m === 'reset' ? 'candidate' : m, out, appBase);
      await done('Tayyor');
      await tg.sendMessage(token, chatId, testModeText(m, out));
      // hh nomzod: Taklif navbatidagi SMS matni — shaxsiy havola bilan, aynan nomzod oladigandek
      if (m === 'hh' && out.hh) {
        const uname = await tg.platformUsername();
        await tg.sendMessage(token, chatId, outreach.render(outreach.DEFAULT_TPL, out.hh, `t.me/${uname}?start=${out.hh.tgInviteToken}`));
      }
    } catch (e) {
      // Bir nechta haqiqiy mijoz — qaysi biri sifatida kirishni so'raymiz
      if (e.choose && e.choose.length) {
        await done('');
        await tg.sendMessage(token, chatId, '👔 ' + e.message, { reply_markup: { inline_keyboard:
          e.choose.slice(0, 20).map(c => [{ text: `${c.name} · ${c.credits || 0} kredit`, callback_data: 'tm:rc:' + c.id }]) } });
      } else await done(e.message, true);
    }
    return;
  }

  // ── Mijoz: til tanlash ('lw:' xush kelibsiz ostida, 'lg:' /til) ──
  // Tanlov mijozga yoziladi — Mini App va bildirishnomalar ham shu tilda.
  if (/^l[wg]:(uz|ru)$/.test(data)) {
    const client = await Client.findOne({ tgChatId: chatId });
    if (!client) {
      // Nomzodning /til buyrug'i — tanlov nomzodga va ochiq anketasiga yoziladi
      const cand = await Candidate.findOne({ tgChatId: chatId });
      if (!cand) return done(I18N.errText(cqLang, 'Mijoz topilmadi'), true);
      const lang = data.slice(3);
      await Candidate.updateOne({ _id: cand._id }, { $set: { lang } });
      await SurveyResponse.updateMany({ tgUserId: chatId, status: 'started' }, { $set: { lang } }).catch(() => {});
      await done(T(lang, 'bot.langToast'));
      if (msgId) await tg.editMessageText(token, chatId, msgId, T(lang, 'bot.langSet')).catch(() => {});
      await tg.setChatMenuButton(token, chatId, T(lang, 'ank.botProfile').replace(/^\S+\s*/, ''),
        `${appBase}/profil.html`).catch(() => {});
      return;
    }
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

  // ── Nomzod: "Hali ish qidiryapsizmi?" (services/lookCheck) — Ha / Yo'q ──
  // Javoblar admin chatiga birma-bir yuborilmaydi (14 kunlik so'rovda o'nlab bo'ladi) —
  // haftalik hisobotda sanaladi (services/weekly).
  if (data === 'cp' || data === 'cn') {
    const c = await Candidate.findOne({ tgChatId: chatId });
    const L = I18N.resolve(c && c.lang, (c && c.tgLang) || (cq.from && cq.from.language_code));
    if (!c) return done(T(L, 'bot.stale'), true);

    c.jobStatus   = data === 'cp' ? 'active' : 'not_looking';
    c.jobStatusAt = new Date();
    c.updatedAt   = new Date();
    await c.save();

    await done(T(L, data === 'cp' ? 'lk.yesDone' : 'lk.noDone').split('\n')[0]);
    if (msgId) {
      let text = T(L, data === 'cp' ? 'lk.yesDone' : 'lk.noDone'), markup;
      if (data === 'cp' && appBase) {
        const n = await require('../services/appLife').openJobsCount(c.restaurantId).catch(() => 0);
        if (n) {
          text += '\n\n' + T(L, 'lk.jobsNow', { n });
          markup = { inline_keyboard: [[{ text: T(L, 'lk.jobsBtn'), web_app: { url: `${appBase}/profil.html#jobs` } }]] };
        }
      }
      await tg.editMessageText(token, chatId, msgId, text, markup ? { reply_markup: markup } : undefined).catch(() => {});
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
    // SMS server orqali yuborilmaydi (services/outreach — faqat qo'lda, o'z
    // raqamidan). available()/balance() 2e51ec9 da olib tashlangan — bu yerda
    // qolib, sahifa 500 berardi.
    channels: [],
    smsBalance: null
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
module.exports.firstScreen = firstScreen;   // test uchun (test/applications.test.js)
module.exports.handleCallback = handleCallback;   // test uchun (test/calls.test.js — 'cp'/'cn')
