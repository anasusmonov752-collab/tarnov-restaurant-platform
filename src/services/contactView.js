// ── KONTAKTDAN KEYINGI KO'RINISH ─────────────────────────────
// Qoida: kontakt ochilguncha ikki tomon anonim, ochilgandan keyin
// ikki tomon bir-birini TO'LIQ ko'radi. Mijoz kredit to'lagan, nomzod
// agentlikka rozilik bergan — bundan keyin kod ko'rsatish hech kimni
// himoya qilmaydi, faqat noqulaylik.
//
// "Ochilgan" ning yagona ta'rifi shu yerda: revealedAt bor va kredit
// qaytarilmagan (3c6caca dagi mantiq). Ikkala kabinet ham shu
// funksiyadan o'tadi — biri kengroq, biri torroq ochib qo'ymasin.

const Shortlist = require('../models/Shortlist');

const isOpen = it => !!it.revealedAt && it.state !== 'refunded';

/**
 * Ochilgan juftliklar: [{ clientId, candidateId, shortlistId, vacancyId }]
 * clientId yoki candidateId (yoki ikkalasi) bilan toraytiriladi.
 */
async function openPairs({ agencyId, clientId = '', candidateId = '', candidateIds = null }) {
  const q = { agencyId };
  if (clientId) q.clientId = clientId;
  if (candidateId) q['items.candidateId'] = candidateId;
  else if (Array.isArray(candidateIds)) q['items.candidateId'] = { $in: candidateIds };

  const rows = await Shortlist.find(q, 'id clientId vacancyId items').lean();
  const out = [];
  for (const s of rows) {
    for (const it of (s.items || [])) {
      if (!isOpen(it)) continue;
      if (candidateId && it.candidateId !== candidateId) continue;
      if (Array.isArray(candidateIds) && !candidateIds.includes(it.candidateId)) continue;
      out.push({ clientId: s.clientId, candidateId: it.candidateId,
                 shortlistId: s.id, vacancyId: s.vacancyId || '' });
    }
  }
  return out;
}

async function isOpenPair({ agencyId, clientId, candidateId }) {
  return (await openPairs({ agencyId, clientId, candidateId })).length > 0;
}

// ── Mijozga: nomzod rezyumesi ────────────────────────────────
// Agentlikning ichki ishchi ma'lumoti CHIQMAYDI: fitScore/fitReason
// (AI bahosi), notes, rating, tags, status, shownToClients, rawText,
// asl PDF. Rezyume nomzodning o'z profili — u tahrirlasa mijoz
// yangisini ko'radi.
function resumeOf(c) {
  return {
    id: c.id,
    fullName: c.fullName, phone: c.phone, email: c.email,
    hasPhoto: !!c.hasPhoto,
    desiredPosition: c.desiredPosition, role: c.role,
    age: c.age, location: c.location, shift: c.shift,
    experienceYears: c.experienceYears,
    experienceSummary: c.experienceSummary,
    summary: c.summary,
    education: c.education,
    salaryExpectation: c.salaryExpectation,
    languages: c.languages || [], skills: c.skills || [],
    workHistory: (c.workHistory || []).filter(w => w.company || w.position).map(w => ({
      company: w.company, position: w.position, period: w.period, description: w.description
    })),
    sanitaryBook: c.sanitaryBook, sanitaryBookUntil: c.sanitaryBookUntil,
    jobStatus: c.jobStatus,
    publicCode: c.publicCode
  };
}

// ── Nomzodga: kompaniya kartasi ──────────────────────────────
// Kontaktdan OLDIN nomzod faqat tumanni ko'radi ("Chilonzorda restoran").
// Kontaktdan keyin — nom, manzil va ta'rif. Menejer telefoni bu yerda
// YO'Q: mijoz nomzodga o'zi qo'ng'iroq qiladi yoki chatda yozadi.
function companyOf(cl) {
  return {
    id: cl.id, name: cl.name,
    location: cl.location || '', address: cl.address || '', about: cl.about || ''
  };
}

module.exports = { isOpen, openPairs, isOpenPair, resumeOf, companyOf };
