// ── ARIZADAN KONTAKTNI MIJOZ O'ZI OCHISHI ────────────────────
// Qidiruvdan tanlangan nomzod bundan bexabar — agentlik unga qo'ng'iroq
// qilib roziligini so'raydi, keyingina kontakt ochiladi.
//
// Ariza esa boshqacha: nomzod vakansiyani O'ZI ko'rib ariza bergan, bu
// allaqachon rozilik. Shuning uchun mijoz kontaktni o'zi ochadi (tasdiq
// bilan, -1 kredit), agentlik tekshiruvisiz. Lekin rozilikning muddati
// bor: bir necha haftadan keyin odam boshqa joyda ishlayotgan bo'lishi
// mumkin va mijoz "o'lik" kontakt uchun to'lagan bo'lardi. Shartlar:
//
//   1. rozilik YANGI — ariza sanasi yoki nomzodning oxirgi tasdig'i
//      ("Ha, ish qidiryapman", jobStatusAt) — qaysi biri yangiroq —
//      FRESH_DAYS kundan oshmagan
//   2. nomzod keyin "Ish qidirmayapman" demagan
//   3. telefon haqiqiy O'zbekiston raqami — aks holda pul bekorga ketadi
//
// Shart bajarilmasa — oddiy yo'l: "Tanlash", agentlik tekshiradi va kredit
// faqat nomzod "ha" desa yechiladi.
//
// Qoida BITTA joyda: arizalar ro'yxati (tugmani ko'rsatish) ham, ochish
// endpointi (serverda qayta tekshirish) ham shundan foydalanadi.

// Biznes raqami. Real ma'lumot to'plangach (qaysi arizalar "allaqachon
// ishlayapman" bilan tugadi) qayta ko'rib chiqiladi.
const FRESH_DAYS = 14;

/**
 * O'zbekiston mobil raqami: +998 XX XXX XX XX yoki 9 xonali mahalliy.
 * Bo'sh joy, tire, qavslar e'tiborga olinmaydi.
 */
function validPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  return (d.length === 12 && d.startsWith('998')) || d.length === 9;
}

/**
 * @param {object} app   Application (createdAt, state)
 * @param {object} cand  Candidate (phone, jobStatus, jobStatusAt)
 * @returns {{ok:boolean, why?:string}}  why — mijozga ko'rsatiladigan sabab
 */
// code — lug'at kaliti (th-i18n 'why.<code>'): Mini App sababni mijoz tilida ko'rsatadi
function eligibility(app, cand) {
  if (!app || !cand) return { ok: false, code: 'not_found', why: 'Nomzod topilmadi' };
  if (app.state === 'rejected') return { ok: false, code: 'rejected', why: 'Ariza rad etilgan' };
  if (cand.jobStatus === 'not_looking') {
    return { ok: false, code: 'not_looking', why: 'Nomzod hozir ish qidirmayapti — HR avval tekshiradi' };
  }
  if (!validPhone(cand.phone)) {
    return { ok: false, code: 'phone', why: 'Telefon raqami tekshirilmagan — HR avval tekshiradi' };
  }
  const consent = Math.max(
    new Date(app.createdAt).getTime() || 0,
    cand.jobStatusAt ? new Date(cand.jobStatusAt).getTime() : 0
  );
  if (Date.now() - consent > FRESH_DAYS * 864e5) {
    return { ok: false, code: 'old', why: `Ariza ${FRESH_DAYS} kundan eski — HR avval tekshiradi` };
  }
  return { ok: true };
}

module.exports = { eligibility, validPhone, FRESH_DAYS };
