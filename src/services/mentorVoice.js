// ── MENTOR OVOZI ─────────────────────────────────────────────
// Mentorning YAGONA shaxsi. Platformaning qayerida gapirmasin —
// chatda, test hukmida, xatolar tahlilida — shu moduldan gapiradi.
//
// NEGA BITTA MODUL: xarakter har ekranda alohida yozilsa, sakkiz xil bot
// chiqadi. Ofitsiant "bu bitta odam, u meni biladi" deb his qilishi kerak.
// Shuning uchun xarakter shu yerda BIR MARTA yoziladi, ekranlar faqat
// kontekst qo'shadi.
//
// Bu modul AI CHAQIRMAYDI — u faqat matn quradi. Chaqirish chaqiruvchining
// ishi, chunki har ekranning tier va maxTokens ehtiyoji boshqacha.

// ── QATTIQQO'LLIK DARAJASI ───────────────────────────────────
// Bir xil qattiqlik hamma uchun to'g'ri kelmaydi. Birinchi testida
// xato qilgan yangi ofitsiantga qattiq tursak — u ishdan ketadi.
// Bir xil xatoni beshinchi marta qilayotganga yumshoq tursak — mentor
// jiddiyligini yo'qotadi.
//
// Qoida: mentor BILMASLIKKA qattiq turmaydi, AYTILGANNI BAJARMASLIKKA
// qattiq turadi.

const TONES = {
  // Yangi ofitsiant — hali yo'l ko'rsatilmagan
  qollab: {
    key: 'qollab',
    note: `Bu ofitsiant hali yangi — unga hali deyarli hech narsa o'rgatilmagan.
Talabchan bo'ling, lekin ruhini tushirmang. Xatosi bilmaslikdan, dangasalikdan emas.
Birinchi navbatda nimadan boshlashini aniq ko'rsating.`
  },
  // Odatiy holat — ish ketyapti, daraja ko'tarilishi kerak
  talabchan: {
    key: 'talabchan',
    note: `Odatiy holat. Aniq va bo'sh maqtovsiz gapiring. Natija yaxshi bo'lsa
nega yaxshi ekanini ayting va darajani ko'taring — maqtab qo'yib ketmang.`
  },
  // Aytilgan, bajarilmagan — mentor hisob so'raydigan payt
  qattiq: {
    key: 'qattiq',
    note: `Bu ofitsiantga avval aytilgan va u bajarmagan. Hisob so'rang: nega
bajarilmadi, qachon bajariladi. Yumshatmang, lekin haqorat ham qilmang —
gap odam haqida emas, bajarilmagan ish haqida.`
  }
};

/**
 * Profilga qarab qattiqqo'llik darajasini tanlaydi.
 * @param {object} profile — mentor.buildProfile natijasi
 * @param {object} [opts]  — { overdue: muddati o'tgan topshiriqlar soni }
 */
function toneFor(profile, opts = {}) {
  // Aytilgani bajarilmagan — eng qattiq holat
  if (opts.overdue > 0) return TONES.qattiq;
  // Hali yo'l ko'rsatilmagan
  if (!profile || profile.tests.count <= 1) return TONES.qollab;
  // Bir xil savolda qayta-qayta xato: aytilgan, tushunilmagan
  if (profile.repeatedMistakes.length >= 3) return TONES.qattiq;
  return TONES.talabchan;
}

// ── XARAKTER ─────────────────────────────────────────────────

/**
 * Mentorning asosiy xarakteri. Har AI chaqiruvida shu matn ketadi —
 * shuning uchun u qisqa va zich bo'lishi kerak, har jumla ish bajarsin.
 */
function personaBlock(restaurantName, tone) {
  return `Siz — zalning tajribali murabbiysisiz. O'zingiz ofitsiantlikdan boshlab
administratorgacha yetgansiz, endi yoshlarni tayyorlaysiz. Hozir oldingizda
"${restaurantName}" restoranining ofitsianti turibdi va siz uning har bir test
natijasini, har bir xatosini bilasiz.

SIZ QANDAY ODAMSIZ:
- Bilasiz. Umumiy gap emas, hunar detali bilan gapirasiz: mehmon aynan nima
  deydi, siz aynan nima javob berasiz, qaysi payt qaysi qadam qo'yiladi.
- Talabchansiz. "Yaxshi" deb qo'yish — ofitsiantni aldash. Yaxshi bo'lsa nega
  yaxshi ekanini aytasiz, keyin darajani ko'tarasiz.
- Hurmat qilasiz. Qattiqqo'llik haqorat emas. Odamni emas, ishni tanqid qilasiz.
- Jonli gapirasiz. Har safar boshqacha: ba'zan savol berasiz, ba'zan zaldan
  misol keltirasiz, ba'zan bitta jumla bilan tugatasiz.

${tone.note}

QAT'IY QOIDALAR:
1. Bitta javobda BITTA amaliy narsa. Ro'yxat yozmang — besh maslahatning
   bittasi ham bajarilmaydi, bittasi bajariladi.
2. Ballni faqat kerak bo'lganda va faqat bir marta ayting. Har javobda raqam
   takrorlansa, u ma'nosini yo'qotadi.
3. Har javobni boshqacha boshlang. "Yaxshi savol", "Albatta", "Tushunarli"
   kabi shablon kirishlarni ishlatmang.
4. Maslahat AYNAN shu ofitsiantga tegishli bo'lsin. "Ko'proq mashq qiling" —
   bu hech kimga aytilmagan gap.
5. Talabni aniq qo'ying: nima, qancha, qachon. "Menyuni o'rganing" emas —
   "Ertaga salatlardan sakkiztasining tarkibini aytib berasiz".

CHEGARA:
- Faqat restoran, menyu, xizmat standartlari va shu ofitsiantning natijalari.
- Boshqa mavzuda qisqa qaytaring: "Bu mening ishim emas. Men sizga zal ishini
  o'rgataman."
- Menyuda YO'Q narsani o'ylab topmang. Bilmasangiz "bu ma'lumot menyuda yo'q"
  deng. O'ylab topilgan tarkib mehmonni allergiyaga olib borishi mumkin.`;
}

// ── KONTEKST BLOKLARI ────────────────────────────────────────
// Har ekran o'ziga keragini oladi: chatga menyu kerak, test hukmiga kerak emas.

/** Ofitsiantning bilim profili — raqamlar, ism yo'q (maxfiylik). */
function profileBlock(profile, extra = {}) {
  const { assessment, course } = extra;
  const d = profile.byDifficulty;

  return [
    `Daraja: ${profile.level.label}`,
    profile.tests.avg !== null
      ? `Testlar o'rtachasi: ${profile.tests.avg}% (${profile.tests.count} ta test)`
      : 'Hali test topshirmagan',
    `Qiyinlik kesimi: oson ${d.easy.score ?? '—'}%, o'rta ${d.medium.score ?? '—'}%, qiyin ${d.hard.score ?? '—'}%`,
    profile.weakCategories.length
      ? `Zaif menyu bo'limlari: ${profile.weakCategories.slice(0, 3).map(c => `${c.category} (${c.score}%)`).join(', ')}`
      : null,
    profile.repeatedMistakes.length
      ? `Qayta-qayta xato qilgan savollari: ${profile.repeatedMistakes.slice(0, 3).map(m => `"${m.question.slice(0, 60)}"`).join('; ')}`
      : null,
    `Menyu qamrovi: ${profile.menu.known}/${profile.menu.total} taom`,
    assessment
      ? `Bazaviy diagnostika: ${assessment.score}% — ${assessment.areaScores.slice(0, 3).map(a => `${a.label} ${a.score}%`).join(', ')}`
      : 'Bazaviy diagnostikani hali topshirmagan',
    course
      ? `Kurs progressi: ${course.steps.filter(s => s.done).length}/${course.steps.length} qadam. Keyingi qadam: ${course.steps.find(s => !s.done)?.title || 'hammasi bajarilgan'}`
      : null
  ].filter(Boolean).join('\n');
}

// Hukmda ko'rsatiladigan xatolar soni. Hammasini yuborish shart emas —
// 20 ta xatoning ro'yxati mentorga ham, ofitsiantga ham hech narsa bermaydi.
const MAX_WRONG_SHOWN = 8;

/** Bitta savoldan olingan ball, 0-1 (mentor.js dagi pointsOf bilan bir xil qoida). */
function scoreOf(b) {
  if (b.type === 'written') {
    const s = b.manualScore ?? b.aiScore;
    return s == null ? null : s / 100;
  }
  return b.isCorrect ? 1 : 0;
}

/**
 * Hozirgi test natijasi — hukm chiqarish uchun.
 *
 * Umumiy ballning o'zi hech narsa aytmaydi: 75% "qiyin savollarda yiqildim"
 * ham, "e'tiborsizlikdan oson savolni boy berdim" ham bo'lishi mumkin.
 * Shuning uchun mentorga kesim, o'zgarish va aynan qaysi savol ketgani beriladi.
 *
 * @param {object} result   — testResult hujjati
 * @param {object} profile  — mentor.buildProfile natijasi
 * @param {object} [prev]   — oldingi test natijasi (solishtirish uchun)
 */
function testBlock(result, profile, prev) {
  const lines = [
    `Ball: ${result.score}% (${result.totalCorrect}/${result.totalQuestions})`,
    `Kesim: oson ${result.easyScore}/${result.easyTotal}, o'rta ${result.mediumScore}/${result.mediumTotal}, qiyin ${result.hardScore}/${result.hardTotal}`
  ];

  if (prev) {
    const diff = result.score - (prev.score || 0);
    lines.push(diff === 0
      ? `Oldingi test ham ${prev.score}% edi — joyidan qimirlamadi.`
      : `Oldingi test: ${prev.score}% (${diff > 0 ? '+' : ''}${diff} ball).`);
  } else {
    lines.push('Bu uning BIRINCHI testi — solishtirish uchun avvalgi natija yo\'q.');
  }

  if (result.hasCertificate) lines.push('Sertifikat oldi (90% dan yuqori).');

  // Xato qilingan savollar
  const repeated = new Set((profile?.repeatedMistakes || []).map(m => m.questionId));
  const wrong = (result.breakdown || []).filter(b => {
    const p = scoreOf(b);
    return p !== null && p < 0.6;
  });

  if (wrong.length) {
    const shown = wrong.slice(0, MAX_WRONG_SHOWN).map(b => {
      const head = `• [${b.difficulty}] ${b.question}`;
      const mark = repeated.has(b.questionId) ? '  ← BUNDA AVVAL HAM XATO QILGAN' : '';
      if (b.type === 'written') {
        const s = b.manualScore ?? b.aiScore;
        return `${head}\n  Yozgani: "${String(b.writtenAnswer || '').slice(0, 120)}" (${s ?? '—'} ball)${mark}`;
      }
      const opts = b.options || [];
      return `${head}\n  Tanlagani: "${opts[b.selectedAnswer] ?? '—'}" · To'g'risi: "${opts[b.correctAnswer] ?? '—'}"${mark}`;
    });

    lines.push(`\nXato qilgan savollari (${wrong.length} ta${wrong.length > MAX_WRONG_SHOWN ? `, shundan ${MAX_WRONG_SHOWN} tasi ko'rsatilgan` : ''}):\n${shown.join('\n')}`);

    const rep = wrong.filter(b => repeated.has(b.questionId)).length;
    if (rep) lines.push(`\nShu xatolarning ${rep} tasi TAKRORIY — bu savol unga avval ham berilgan va o'shanda ham bilmagan.`);
  } else {
    lines.push('\nBirorta ham xato yo\'q.');
  }

  return lines.join('\n');
}

/** Menyu — chatda kerak, chunki mentor taom haqidagi savolga javob beradi. */
function menuBlock(menu) {
  return (menu || []).map(item => {
    const parts = [`• ${item.name} (${item.category}) — ${Number(item.price || 0).toLocaleString()} so'm`];
    if (item.description)         parts.push(`  Tavsif: ${item.description}`);
    if (item.ingredients?.length) parts.push(`  Tarkib: ${item.ingredients.join(', ')}`);
    if (item.allergens?.length)   parts.push(`  Allergenlar: ${item.allergens.join(', ')}`);
    if (item.servingSuggestion)   parts.push(`  Tavsiya: ${item.servingSuggestion}`);
    return parts.join('\n');
  }).join('\n');
}

/** Restoran hujjatlari (adaptatsiya materiallari). */
function docsBlock(restaurant) {
  return (restaurant.adaptation?.documents || [])
    .map(d => `### ${d.title}\n${d.content}`)
    .join('\n\n');
}

/** So'nggi e'lonlar — mentor bugungi yangilikdan xabardor bo'lsin. */
function annBlock(restaurant) {
  return (restaurant.announcements || []).slice(0, 5)
    .map(a => `• ${a.title}: ${a.content}`)
    .join('\n');
}

/**
 * To'liq system prompt quradi.
 *
 * Bloklar tartibi ataylab shunday: avval KIM ekani, keyin KIM BILAN
 * gaplashayotgani, keyin NIMA ESLAYOTGANI, oxirida ma'lumotnoma.
 * Model uchun eng muhimi boshida turadi.
 *
 * @param {object} o
 * @param {string} o.restaurantName
 * @param {object} o.tone      — TONES dan biri
 * @param {string} o.profile   — profileBlock natijasi
 * @param {string} [o.memory]  — eski suhbatlar qisqachasi
 * @param {string} [o.assignments] — assignments.contextBlock natijasi
 * @param {string} [o.menu]    — menuBlock natijasi
 * @param {string} [o.docs]
 * @param {string} [o.announcements]
 * @param {string} [o.task]    — shu ekranga xos qo'shimcha topshiriq
 */
function buildSystem(o) {
  const parts = [personaBlock(o.restaurantName, o.tone)];

  if (o.task) parts.push(o.task);

  parts.push(`=== SHU OFITSIANT PROFILI ===\n${o.profile}`);

  if (o.assignments) {
    parts.push(`=== SIZ BERGAN TOPSHIRIQLAR ===
Bularni SIZ bergansiz. Bajarilmagani bo'lsa — o'tkazib yubormang, so'rang.
Bajarilganini bir og'iz tan oling va darhol keyingisiga o'ting.

${o.assignments}`);
  }

  if (o.memory) {
    parts.push(`=== AVVALGI SUHBATLARINGIZ (qisqacha) ===
Quyida shu ofitsiant bilan oldin nima gaplashganingiz yozilgan. Bunga tayanib
javob bering: bergan topshiriqlaringizni eslang, o'zingizni takrorlamang, agar
avval kelishilgan narsa bo'lsa uni so'rang.

${o.memory}`);
  }

  if (o.menu)          parts.push(`=== MENYU ===\n${o.menu}`);
  if (o.docs)          parts.push(`=== RESTORAN HAQIDA ===\n${o.docs}`);
  if (o.announcements) parts.push(`=== SO'NGGI E'LONLAR ===\n${o.announcements}`);

  return parts.join('\n\n');
}

// ── EKRANGA XOS TOPSHIRIQLAR ─────────────────────────────────
// personaBlock "kim ekanini" aytadi, bu yerdagi matnlar "hozir nima
// qilishini" aytadi. Ikkalasi qo'shilib to'liq system prompt bo'ladi.

const TASKS = {
  chat: `HOZIR: ofitsiant siz bilan gaplashyapti. Savoliga to'g'ridan-to'g'ri javob
bering. Savol profiliga aloqador bo'lmasa, natijalarini umuman eslatmang.
Javob 4 jumladan oshmasin (savol murakkab bo'lmasa).`,

  verdict: `HOZIR: ofitsiant hozirgina test topshirdi va natijasini ko'rib turibdi.
Sizning vazifangiz — hukm chiqarish. Uch qismdan iborat, jami 4 jumla:
1. Natijaning ASL ma'nosi. Umumiy ball emas, ichidagi eng muhim fakt —
   qaysi kesimda yiqildi yoki qaysi kesimda o'sdi.
2. Sabab. Nima uchun aynan shu yerda xato bo'lgan degan taxminingiz.
3. Bitta aniq talab: nima, qancha, qachongacha.
Tabriklab ham, achinib ham o'tirmang. Ball 100% bo'lsa ham keyingi darajani
qo'ying.`
};

// ── ZAXIRA HUKM (AI'siz) ─────────────────────────────────────
// AI ishlamasa yoki kunlik kvota tugasa mentor JIM QOLMASLIGI kerak —
// jim mentor "buzuq tugma" bo'lib ko'rinadi. Bu yerdagi matn shablonroq,
// lekin baribir aynan shu testning raqamlariga tayanadi.

/** Kesimlarni foizga aylantirib, eng zaifini topadi. */
function buckets(result) {
  return [
    { key: 'oson',   got: result.easyScore   || 0, of: result.easyTotal   || 0 },
    { key: "o'rta",  got: result.mediumScore || 0, of: result.mediumTotal || 0 },
    { key: 'qiyin',  got: result.hardScore   || 0, of: result.hardTotal   || 0 }
  ].filter(b => b.of > 0).map(b => ({ ...b, pct: Math.round(b.got / b.of * 100) }));
}

/**
 * @param {object} [proposal] — assignments.proposeFromTest natijasi. Berilsa,
 *   talab AYNAN shundan olinadi: tizim tekshiradigan topshiriq bilan mentor
 *   aytgan gap bir xil bo'lishi shart, aks holda mentor bir narsa deb,
 *   tizim boshqa narsani so'rab yuradi.
 */
function fallbackVerdict(result, profile, prev, proposal) {
  const bs = buckets(result);
  const worst = bs.length ? bs.reduce((a, b) => (b.pct < a.pct ? b : a)) : null;
  const parts = [];

  // 1. Natijaning asl ma'nosi — umumiy ball emas, ichidagi eng muhim fakt
  if (result.score >= 90) {
    parts.push(`${result.score}% — talab darajasida.`);
  } else if (worst && worst.pct < 60) {
    parts.push(`${result.score}% chiqdi, lekin gap umumiy ballda emas: ${worst.key} savollarda ${worst.got}/${worst.of}.`);
  } else {
    parts.push(worst
      ? `${result.score}%. Eng past joyingiz — ${worst.key} savollar (${worst.got}/${worst.of}).`
      : `${result.score}%.`);
  }

  // 2. O'zgarish — faqat sezilarli bo'lsa aytamiz
  if (prev) {
    const d = result.score - (prev.score || 0);
    if (d <= -10)     parts.push(`Oldingi testdan ${Math.abs(d)} ball tushdingiz. Bu tasodif emas.`);
    else if (d >= 10) parts.push(`Oldingi testdan ${d} ball ko'tarildingiz — shu yo'nalishni ushlab turing.`);
  }

  // 3. Bitta aniq talab. Topshiriq berilgan bo'lsa — aynan o'sha.
  if (proposal) {
    parts.push(`Talabim: ${proposal.title}, ${proposal.due}.`);
    return parts.join(' ');
  }

  const rep = (profile?.repeatedMistakes || []).length;
  const weak = profile?.weakCategories?.[0];

  if (rep >= 2) {
    parts.push(`Bugun ${rep} ta takroriy xatoyingizni mashq qilib chiqasiz — ular bir marta emas, qayta-qayta ketyapti.`);
  } else if (weak) {
    parts.push(`Bugun "${weak.category}" bo'limidan 5 ta taomni tarkibi bilan yodlaysiz.`);
  } else if (profile && profile.menu.total && profile.menu.pct < 70) {
    parts.push(`Bugun menyudan 5 ta yangi taomni yodlaysiz — ${profile.menu.total - profile.menu.known} tasi qoldi.`);
  } else if (worst && worst.pct < 100) {
    parts.push(`Keyingi testda ${worst.key} savollarni 80% dan past qilmaysiz.`);
  } else {
    parts.push('Darajani ushlab turing — keyingi test osonroq bo\'lmaydi.');
  }

  return parts.join(' ');
}

module.exports = {
  TONES, TASKS, toneFor,
  personaBlock, profileBlock, testBlock, menuBlock, docsBlock, annBlock,
  buildSystem, scoreOf, fallbackVerdict, buckets
};
