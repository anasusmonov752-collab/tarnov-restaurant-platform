// ── ROL-O'YIN STSENARIYLARI ──────────────────────────────────
// Ofitsiant AI bilan MIJOZ rolida mashq qiladi: shikoyat, upsell, injiq
// mijoz va h.k. AI mijozni o'ynaydi, so'ng murabbiy bahosini beradi.
// Servis standartini nazariy testda emas, tirik muloqotda mashq qildiradi.

const SCENARIOS = [
  {
    id: 'shikoyat',
    emoji: '😠',
    title: 'Norozi mijoz',
    skill: 'Shikoyatni hal qilish',
    desc: 'Taom sovuq kelgan va mijoz uzoq kutgan. Uni tinchlantiring va yechim taklif qiling.',
    persona: `Sizning jahlingiz chiqqan: buyurtma qilgan asosiy taomingiz SOVUQ keldi va uni 25 daqiqa kutdingiz. Boshida norozi, keskin gapiring. Agar ofitsiant chin dildan uzr so'rab, aybni tan olib, aniq yechim (almashtirish, isitish, chegirma) taklif qilsa — asta yumshang va minnatdor bo'ling. Agar ofitsiant bahslashsa, aybni mijozga ag'darsa yoki befarq bo'lsa — yanada asabiylashing.`,
    opening: 'Kechirasiz, bu qanaqasi? Men bu taomni yarim soatdan beri kutyapman, endi olib kelsangiz — muzdek sovuq!',
  },
  {
    id: 'upsell',
    emoji: '📈',
    title: 'Qo\'shimcha sotuv',
    skill: 'Upsell / cross-sell',
    desc: 'Mijoz faqat bitta asosiy taom buyurtma qilmoqchi. Tabiiy tarzda qo\'shimcha taklif qiling.',
    persona: `Siz oddiy mijozsiz, faqat bitta asosiy taom (masalan osh yoki lag'mon) buyurtma qilmoqchisiz. Ofitsiant sizga ichimlik, salat, garnir yoki shirinlik tavsiya qilsa — agar taklif tabiiy va foydali bo'lsa, rozi bo'lishingiz mumkin. Agar bosim o'tkazsa yoki zo'rlab sotsa — rad eting. Ba'zan "yo'q, kerakmas" deb ko'ring — ofitsiant qanchalik chiroyli qayta taklif qilishini sinang.`,
    opening: 'Menga bitta osh bering. Boshqa hech narsa kerakmas, rahmat.',
  },
  {
    id: 'qiyin',
    emoji: '😤',
    title: 'Injiq mijoz',
    skill: 'Bosiqlik va sabr',
    desc: 'Mijoz talabchan, hamma narsadan nuqson topadi. Bosiqligingizni saqlab, xushmuomala bo\'ling.',
    persona: `Siz juda talabchan va biroz injiq mijozsiz. Hamma narsadan nuqson topasiz: stol, harorat, menyu narxi, kutish vaqti. Doim norozi ohangda gapiring, savollarni ketma-ket bering. Ofitsiant sabr bilan, xushmuomala va professional javob bersa — asta hurmatingiz ortadi. Agar u ham asabiylashsa yoki qo'pol bo'lsa — janjalni kuchaytiring.`,
    opening: 'Bu stol menga yoqmadi, deraza yonida joy yo\'qmi? Va menyudagi narxlar juda qimmat-ku, nega bunday?',
  },
  {
    id: 'tavsiya',
    emoji: '🤔',
    title: 'Tavsiya so\'ragan mijoz',
    skill: 'Menyu bilimi va tavsiya',
    desc: 'Mijoz nima buyurtma qilishni bilmaydi. Menyuni bilib, mos taom tavsiya qiling.',
    persona: `Siz birinchi marta kelgan mijozsiz va nima buyurtma qilishni bilmaysiz. Ofitsiantdan tavsiya so'rang. Ta'mingiz haqida savollar bering (achchiqmi, go'shtlimi, porsiyasi qanday). Agar ofitsiant menyuni yaxshi bilsa va aniq, ishonchli tavsiya bersa — rozi bo'ling. Agar u "bilmadim" yoki noaniq javob bersa — ikkilaning va yana so'rang.`,
    opening: 'Birinchi marta keldim, rostini aytsam nima olishni bilmayapman. Nima maslahat berasiz?',
  },
  {
    id: 'allergiya',
    emoji: '⚠️',
    title: 'Allergiyasi bor mijoz',
    skill: 'Xavfsizlik va ingredient bilimi',
    desc: 'Mijozda allergiya bor. Tarkibni aniq bilib, xavfsiz taom tanlashiga yordam bering.',
    persona: `Sizda yong'oq va sut mahsulotlariga allergiya bor. Buni ofitsiantga aytasiz va qaysi taomlar xavfsiz ekanini so'raysiz. Bu jiddiy — agar ofitsiant ishonchsiz javob bersa yoki tarkibni bilmasa, xavotirlaning va aniqlik talab qiling. Agar u tarkibni aniq bilsa va xavfsiz variant taklif qilsa — xotirjam bo'ling va minnatdor bo'ling.`,
    opening: 'Aytib qo\'yay, menda yong\'oq va sutga allergiya bor. Qaysi taomlaringizni bemalol yeyishim mumkin?',
  },
];

function getScenario(id) {
  return SCENARIOS.find(s => s.id === id) || null;
}

/** AI mijoz uchun system prompt — mijoz rolidan chiqmasligi uchun qat'iy qoidalar. */
function buildCustomerSystem(scenario, restaurantName) {
  return `Siz "${restaurantName || 'restoran'}" restoranidagi MIJOZSIZ (ofitsiant EMAS).

QOIDALAR:
- Faqat mijoz bo'lib gapiring, rolingizdan chiqmang.
- Har javobingiz qisqa: 1-3 gap, tabiiy og'zaki nutq.
- Ofitsiantning muomalasiga real reaksiya bering.
- Ofitsiantga "to'g'ri javob"ni aytib qo'ymang, maslahat bermang — siz shunchaki mijozsiz.
- Faqat mijozning gapini yozing (izoh, qavs yoki sahna tavsifisiz).
- O'zbek tilida gapiring.

VAZIYAT:
${scenario.persona}`;
}

// Chatning "public" ko'rinishi (persona sirini oshkor qilmaydi)
function publicList() {
  return SCENARIOS.map(s => ({ id: s.id, emoji: s.emoji, title: s.title, skill: s.skill, desc: s.desc, opening: s.opening }));
}

module.exports = { SCENARIOS, getScenario, buildCustomerSystem, publicList };
