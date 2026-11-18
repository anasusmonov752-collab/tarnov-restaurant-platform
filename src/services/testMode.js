// ── ADMIN TEST REJIMI ────────────────────────────────────────
// Agentlik admini (Restaurant.telegram.adminChatId) bitta Telegram
// akkauntdan butun zanjirni sinaydi: mijoz -> nomzod -> chat. Ilgari har
// sinov uchun uchinchi akkaunt kerak edi, nomzodni qo'lda Telegramdan
// uzish kerak edi, anketani qayta to'ldirib bo'lmasdi (2026-10-23, Anas).
//
// Qanday: bot, mijoz Mini App'i va nomzod kabineti odamni FAQAT tgChatId
// bo'yicha taniydi. Rejim almashganda sinov yozuvi (isTest) shu akkauntga
// ulanadi, boshqalari uziladi — mavjud kod o'zgarmaydi. Admin rejimida
// hammasi test rejimidan oldingi holatga qaytadi.
//
// Himoya (sinov haqiqiy ma'lumotga tegmasin):
//   • sinov mijozi haqiqiy nomzodning kontaktini ocha olmaydi (shortlist.reveal)
//   • sinov nomzodi haqiqiy mijozlar qidiruvida chiqmaydi (candidateSearch)
//   • sinov mijozining vakansiyasi haqiqiy nomzodlarga ko'rinmaydi (Vacancy hook)
//   • sinov yozuvlari "Bugun", "Anketadan" va anketa statistikasiga kirmaydi
//   • xabarlar faqat shu akkauntga boradi (sinov yozuvlarining tgChatId'i u)

const { v4: uuidv4 } = require('uuid');
const TestMode = require('../models/TestMode');
const Restaurant = require('../models/Restaurant');
const Client = require('../models/Client');
const Candidate = require('../models/Candidate');
const SurveyResponse = require('../models/SurveyResponse');
const credits = require('./credits');

// real — HAQIQIY mijoz sifatida (2026-11-18, Anas: "Tarnovni mijoz sifatida ulab o'taman").
// Bu SINOV EMAS: haqiqiy vakansiyalar, haqiqiy nomzodlar, kontakt ochilsa haqiqiy kredit
// yechiladi. Sinov himoyalari (isTest) bu mijozga qo'llanmaydi — ataylab.
const MODES = ['admin', 'client', 'candidate', 'hh', 'real'];
const TEST_CREDITS = 5;

/** Haqiqiy mijozlar (sinov emas, faol) — /test menyusida tanlash uchun */
async function realClients(agencyId) {
  return Client.find({ agencyId, isTest: { $ne: true }, status: 'active' }, 'id name credits').sort({ createdAt: 1 }).lean();
}

// Qaysi haqiqiy mijoz: aniq tanlangan -> oldin tanlangan -> yagona faol mijoz.
// Bir nechta bo'lsa va tanlanmagan — xato `choose` ro'yxati bilan (bot tugmalar chiqaradi).
async function pickReal(agencyId, st, clientId) {
  const id = clientId || st.realClientId;
  if (id) {
    const c = await Client.findOne({ agencyId, id, isTest: { $ne: true }, status: 'active' });
    if (c) return c;
    if (clientId) throw Object.assign(new Error('Mijoz topilmadi yoki faol emas'), { status: 400 });
  }
  const list = await realClients(agencyId);
  if (list.length === 1) return Client.findOne({ agencyId, id: list[0].id });
  throw Object.assign(new Error(list.length ? 'Qaysi mijoz sifatida kirasiz?' : 'Faol haqiqiy mijoz yo\'q'),
    { status: 400, choose: list });
}

/** Bu akkaunt test rejimidan foydalana oladimi — agentlik admin chati. */
async function testerAgency(tgUserId) {
  if (!tgUserId) return null;
  return Restaurant.findOne({ 'telegram.adminChatId': String(tgUserId), active: true }, 'id name').lean();
}
async function state(tgUserId) {
  return tgUserId ? TestMode.findOne({ tgUserId: String(tgUserId) }).lean() : null;
}
async function modeOf(tgUserId) {
  const s = await state(tgUserId);
  return (s && s.mode) || 'admin';
}

// Sinov mijozi — bitta, agentlik ichida; kredit tugasa to'ldiriladi
async function ensureClient(agencyId, tgUser) {
  let c = await Client.findOne({ agencyId, isTest: true });
  if (!c) {
    c = await Client.create({
      id: uuidv4(), agencyId, name: '🧪 Sinov restoran', status: 'active', isTest: true,
      contactName: 'Test rejimi', tgUsername: (tgUser && tgUser.username) || ''
    });
  }
  if ((c.credits || 0) < 2) {
    await credits.bonus({ agencyId, clientId: c.id, amount: TEST_CREDITS - (c.credits || 0), note: 'Test rejimi' });
  }
  return Client.findOne({ agencyId, id: c.id });
}

const unlinkCand = { tgChatId: '', tgUsername: '', tgState: 'none' };

/**
 * Rejimni almashtiradi.
 * @returns {{mode, client?, candidate?}} — client/candidate: hozir ulangan sinov yozuvi
 */
async function setMode(tgUserId, mode, tgUser, { clientId = '' } = {}) {
  const uid = String(tgUserId);
  if (!MODES.includes(mode)) throw new Error('Rejim noto\'g\'ri');
  const ag = await testerAgency(uid);
  if (!ag) throw Object.assign(new Error('Test rejimi faqat agentlik admini uchun'), { status: 403 });

  let st = await TestMode.findOne({ tgUserId: uid });
  if (!st) st = new TestMode({ tgUserId: uid, agencyId: ag.id });
  // Haqiqiy mijozni uzishdan OLDIN aniqlaymiz: tanlanmagan bo'lsa hech narsa o'zgarmasin
  const real = mode === 'real' ? await pickReal(ag.id, st, clientId) : null;
  // Haqiqiy mijozning o'z Telegrami (boshqa odam) bo'lsa — uni uzib qo'ymaymiz
  if (real && real.tgChatId && real.tgChatId !== uid) {
    throw Object.assign(new Error(`«${real.name}» boshqa Telegram akkauntiga ulangan — avval panelda uzing`), { status: 409 });
  }

  // Birinchi marta test rejimiga kirish: hozirgi (haqiqiy) ulanishlar
  // eslab qolinadi — admin rejimida qaytariladi
  if (st.mode === 'admin' && mode !== 'admin') {
    const [cls, cands] = await Promise.all([
      Client.find({ tgChatId: uid, isTest: { $ne: true } }, 'id').lean(),
      Candidate.find({ tgChatId: uid, isTest: { $ne: true } }, 'id').lean()
    ]);
    st.saved = { clients: cls.map(c => c.id), candidates: cands.map(c => c.id) };
  }

  // Avval hammasidan uzamiz — keyin kerakligini ulaymiz (bitta chat ikki rolda qolmasin)
  await Client.updateMany({ tgChatId: uid }, { $set: { tgChatId: '' } });
  await Candidate.updateMany({ tgChatId: uid }, { $set: unlinkCand });

  const out = { mode };
  if (mode === 'client') {
    const c = await ensureClient(ag.id, tgUser);
    c.tgChatId = uid;
    if (tgUser && tgUser.language_code) c.tgLang = tgUser.language_code;
    await c.save();
    st.clientId = c.id;
    out.client = c;
  } else if (mode === 'real') {
    // Kredit to'ldirilmaydi, isTest qo'yilmaydi — haqiqiy mijozning o'zi
    real.tgChatId = uid;
    if (tgUser && tgUser.language_code) real.tgLang = tgUser.language_code;
    await real.save();
    st.realClientId = real.id;
    out.client = real;
  } else if (mode === 'candidate') {
    const cand = st.candidateId && await Candidate.findOne({ restaurantId: ag.id, id: st.candidateId, isTest: true });
    if (cand) {
      Object.assign(cand, { tgChatId: uid, tgUsername: (tgUser && tgUser.username) || '', tgState: 'linked' });
      await cand.save();
      out.candidate = cand;
    }
  } else if (mode === 'hh') {
    // hh nomzodi: SMS olgan odam kabi — havolani bosguncha botda yo'q.
    // Har kirishda noldan: arizalari o'chadi, yangi shaxsiy havola (o'zgarishlarni
    // har safar boshidan ko'rish uchun — Anas, 2026-11-16)
    const cand = st.hhCandidateId && await Candidate.findOne({ restaurantId: ag.id, id: st.hhCandidateId, isTest: true });
    if (cand) {
      const Application = require('../models/Application');
      const outreach = require('./outreach');
      await Application.deleteMany({ candidateId: cand.id, isTest: true });
      Object.assign(cand, unlinkCand, { tgInviteToken: outreach.newToken(), tgInviteChannel: 'sms', smsSentAt: null,
        jobStatus: 'active', status: 'new', updatedAt: new Date() });
      await cand.save();
      out.hh = cand;
    }
  } else {
    // Admin: test rejimidan oldingi holat
    const sv = st.saved || {};
    if ((sv.clients || []).length) await Client.updateMany({ id: { $in: sv.clients } }, { $set: { tgChatId: uid } });
    if ((sv.candidates || []).length) {
      await Candidate.updateMany({ id: { $in: sv.candidates } }, { $set: { tgChatId: uid, tgState: 'linked' } });
    }
    st.saved = { clients: [], candidates: [] };
  }
  st.mode = mode;
  st.updatedAt = new Date();
  await st.save();
  return out;
}

/**
 * Anketani qaytadan: sinov nomzodi uziladi (yozuvi panelda "SINOV" bo'lib
 * qoladi), shu akkauntning anketa javoblari o'chiriladi, rejim — nomzod.
 * Keyingi /start akkauntni YANGI odam deb ko'radi.
 */
async function resetSurvey(tgUserId, tgUser) {
  const uid = String(tgUserId);
  const ag = await testerAgency(uid);
  if (!ag) throw Object.assign(new Error('Test rejimi faqat agentlik admini uchun'), { status: 403 });
  await setMode(uid, 'candidate', tgUser);
  await Candidate.updateMany({ tgChatId: uid }, { $set: unlinkCand });
  const del = await SurveyResponse.deleteMany({ tgUserId: uid });
  await TestMode.updateOne({ tgUserId: uid }, { $set: { candidateId: '', updatedAt: new Date() } });
  return { deleted: del.deletedCount || 0 };
}

/** Anketa yakunlanganda: sinov nomzodini eslab qolish (nomzod rejimida qayta ulanadi). */
async function noteCandidate(tgUserId, candidateId) {
  await TestMode.updateOne({ tgUserId: String(tgUserId) }, { $set: { candidateId, updatedAt: new Date() } });
}

/**
 * Paneldan: shu rezyume test rejimidagi "hh nomzod" bo'ladi. Yozuv isTest
 * bo'ladi — SMS navbatiga, haqiqiy mijozlar qidiruviga va sanoqlarga kirmaydi.
 */
async function setHhCandidate(agencyId, candidateId) {
  const ag = await Restaurant.findOne({ id: agencyId }, 'telegram').lean();
  const uid = ag && ag.telegram && ag.telegram.adminChatId;
  if (!uid) throw Object.assign(new Error('Agentlik admin chati ulanmagan (bot /start)'), { status: 400 });
  const c = await Candidate.findOne({ restaurantId: agencyId, id: candidateId });
  if (!c) throw Object.assign(new Error('Nomzod topilmadi'), { status: 404 });
  if (c.source === 'anketa') throw Object.assign(new Error('Faqat hh/yuklangan rezyume'), { status: 400 });
  c.isTest = true;
  await c.save();
  await TestMode.updateOne({ tgUserId: String(uid) },
    { $set: { hhCandidateId: c.id, updatedAt: new Date() }, $setOnInsert: { agencyId, mode: 'admin' } }, { upsert: true });
  return c;
}

module.exports = { MODES, testerAgency, state, modeOf, setMode, resetSurvey, noteCandidate, setHhCandidate, realClients,
  TEST_CREDITS };
