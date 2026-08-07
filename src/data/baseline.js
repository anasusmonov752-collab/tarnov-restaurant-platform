// ── BAZAVIY BILIM DIAGNOSTIKASI ──────────────────────────────
// Ofitsiant platformaga birinchi kirganda shu savollar bilan bilimi
// o'lchanadi va natijaga qarab shaxsiy o'quv kursi tuziladi.
//
// NIMA UCHUN MENYUDAN EMAS: yangi xodim menyuni bilmasligi tabiiy —
// uni menyu savoli bilan sinash hech narsa ko'rsatmaydi. Bu yerdagilar
// SERVIS STANDARTLARI: har restoranda bir xil, xodimning tayyorgarlik
// darajasini ko'rsatadi.
//
// AI SO'ROVI SARFLANMAYDI — savollar oldindan yozilgan, javob darhol
// tekshiriladi. Diagnostika har yangi xodim uchun ishlaydi, kvota yemaydi.

// Har yo'nalishda: nomi, ikonka, va ZAIF chiqqanda beriladigan dars matni.
// Dars matni oldindan yozilgan — AI so'rovi sarflanmaydi va internet
// sekin bo'lsa ham darhol ochiladi. AI faqat restoranga xos qo'shimcha
// kontent yaratishda ishlatiladi.
const AREAS = {
  smena: {
    label: 'Smena va tashqi ko\'rinish',
    icon: '👔',
    hint: 'Ish boshlash tartibi, tashqi ko\'rinish standartlari, intizom',
    keywords: ['smena', 'ko\'rinish', 'forma', 'intizom', 'ish vaqti'],
    lesson: [
      'Smenaga kamida 15 daqiqa oldin keling. Bu vaqt tashqi ko\'rinishni tekshirish, smena topshirig\'ini olish va zalni ko\'zdan kechirish uchun.',
      'Forma toza va dazmollangan bo\'lsin. Dog\', ajin yoki yirtiq — mehmon buni birinchi bo\'lib payqaydi va butun restoran haqida xulosa chiqaradi.',
      'Soch yig\'ilgan, tirnoq qisqa va toza. Kuchli atir ishlatmang — u taom hidini buzadi va allergiyasi bor mehmonga zarar beradi.',
      'Zalda telefon ishlatilmaydi. Telefon faqat tanaffusda, xodimlar xonasida.',
      'Smenani yopganda: ish joyingizni tozalang, hisobotni topshiring, menejerga smena qanday o\'tganini ayting. Muammoni ertaga qoldirmang.'
    ]
  },
  kutib_olish: {
    label: 'Mehmonni kutib olish',
    icon: '🤝',
    hint: 'Birinchi taassurot, salomlashish, joylashtirish',
    keywords: ['kutib olish', 'salomlash', 'mehmon', 'joylash', 'standart 1', 'standart 2', 'standart 3'],
    lesson: [
      'Mehmon kirgan zahoti — 3 soniya ichida — unga e\'tibor qarating. Band bo\'lsangiz ham ko\'z bilan aloqa qilib, bosh irg\'ang. Mehmon ko\'rilganini bilishi kerak.',
      'Salomlashishda eng kuchli vosita — tabassum va ko\'z bilan aloqa. So\'zdan ko\'ra shu ikkisi ko\'proq ta\'sir qiladi.',
      'Mehmonni joylashtirganda uning tanloviga e\'tibor bering: kompaniya deraza yonini, juftlik tinch burchakni afzal ko\'radi.',
      'Joylashgach o\'zingizni tanishtiring: "Men Dilshodman, bugun sizga xizmat ko\'rsataman". Shunda mehmon kimga murojaat qilishni biladi.',
      'Barcha stol band bo\'lsa — ANIQ kutish vaqtini ayting ("10-15 daqiqa") va kutish joyini taklif qiling. Noaniqlik mehmonni ketishga majbur qiladi.'
    ]
  },
  buyurtma: {
    label: 'Buyurtma qabul qilish',
    icon: '📝',
    hint: 'Buyurtmani aniq olish, takrorlash, oshxonaga uzatish',
    keywords: ['buyurtma', 'standart 5', 'standart 6', 'ichimlik'],
    lesson: [
      'Mehmon joylashgach birinchi ichimlik taklif qiling. Mehmon menyuni ko\'rayotganda ichimlik ichadi — kutish qisqa tuyuladi va o\'rtacha chek oshadi.',
      'Mehmon tanlay olmayotgan bo\'lsa, avval nimani yoqtirishini so\'rang, keyin shunga mos 2-3 variant bering. Ko\'p variant tanlovni qiyinlashtiradi.',
      'Buyurtmani olgach OVOZ CHIQARIB takrorlang. Xato buyurtma tayyorlangandan keyin tuzatish restoranga ham, mehmon kayfiyatiga ham qimmatga tushadi.',
      'Katta guruhda stol o\'rinlarini raqamlang va har buyurtmani o\'rin raqamiga yozing. Shunda taomni "kimga?" deb so\'ramasdan qo\'yasiz.',
      'Tayyorlanish vaqti uzun taomlarni oldindan ayting: "Bu taom 25 daqiqada tayyor bo\'ladi, mos keladimi?"'
    ]
  },
  sotuv: {
    label: 'Sotuv va tavsiya',
    icon: '📈',
    hint: 'Qo\'shimcha sotuv, mos tavsiya, bosim o\'tkazmaslik',
    keywords: ['sotuv', 'upsell', 'tavsiya', 'standart 7'],
    lesson: [
      'Upsell — mehmonni majburlash emas, unga foyda keltiradigan MOS taklif. Bu farqni yo\'qotsangiz, sotuv bezovta qilishga aylanadi.',
      'Taklif buyurtmaga bog\'liq bo\'lsin: asosiy taomga mos garnir, sous yoki ichimlik. Bog\'liq bo\'lmagan taklif bosim sifatida qabul qilinadi.',
      '"Ichimlik olasizmi?" emas, "Sizga yangi siqilgan apelsin sharbati yoki ayron keltiraymi?" — aniq variant tanlashni osonlashtiradi.',
      'Shirinlikni asosiy taom tugab, stol yig\'ishtirilgandan keyin taklif qiling. Hisobdan keyin kech, taom bilan birga esa erta.',
      'Mehmon rad etsa — xushmuomalalik bilan qabul qiling va buyurtmani davom ettiring. Takroriy bosim butun taassurotni buzadi.'
    ]
  },
  muammo: {
    label: 'Muammoli vaziyatlar',
    icon: '🛟',
    hint: 'Shikoyat, kutish, xato buyurtma — vaziyatni to\'g\'ri hal qilish',
    keywords: ['shikoyat', 'muammo', 'nazorat', 'fikr', 'standart 8', 'standart 9'],
    lesson: [
      'Shikoyatda birinchi qadam — TINGLASH va uzr so\'rash. Mehmon eshitilganini his qilishi kerak. Bahslashish yoki oshpazni himoya qilish vaziyatni og\'irlashtiradi.',
      'Kutish haqida shikoyat bo\'lsa: uzr so\'rang, oshxonadan ANIQ vaqtni bilib oling va mehmonga qaytib ayting. "Hozir keladi" degan noaniq javob ishonchni yo\'qotadi.',
      'Xato taom keltirsangiz: uzr so\'rang, darhol almashtiring, menejerga xabar bering. Xatoni yashirish keyinchalik kattaroq muammoga aylanadi.',
      'Baland ovozli janjalda ovozingizni ko\'tarmang. Mehmonni alohida joyga taklif qiling — boshqa mehmonlar bezovta bo\'lmasin — va menejerni chaqiring.',
      'Muammo hal bo\'lgach mehmonga qaytib kelib, hammasi joyidami deb so\'rang. Aynan shu qadam shikoyatni sodiq mijozga aylantiradi.'
    ]
  },
  xavfsizlik: {
    label: 'Allergen va xavfsizlik',
    icon: '⚕️',
    hint: 'Allergen savollari, parhez, oziq-ovqat xavfsizligi',
    keywords: ['allergen', 'xavfsizlik', 'parhez', 'gigiyena'],
    lesson: [
      'Allergen masalasida HECH QACHON taxmin qilmang. Bilmasangiz — oshxonadan aniqlang va keyin aniq javob bering. Bu hayot uchun xavfli masala.',
      'Eng keng tarqalgan allergenlar: yong\'oq, sut mahsulotlari, tuxum, gluten (bug\'doy), dengiz mahsulotlari, soya.',
      'Og\'ir allergiyada faqat tarkib emas — sous, bezak va bir idishda tayyorlanish natijasida aralashib ketish ham xavfli. Oshxonani alohida ogohlantiring.',
      '"Men parhezdaman" degan mehmondan qanday parhez ekanini aniqlang: tibbiy, diniy, vegetarian yoki kaloriya. Aniqlanmasa noto\'g\'ri taom taklif qilinadi.',
      'Menyudagi allergen ma'.concat('\'lumotini yod oling — mehmon oldida telefon titkilash ishonchni tushiradi.')
    ]
  }
};

// Har savol: area, difficulty, question, options, correctAnswer, explanation
const QUESTIONS = [
  // ── SMENA VA TASHQI KO'RINISH ──
  { id: 'b01', area: 'smena', difficulty: 'easy',
    question: 'Smena boshlanishidan qancha vaqt oldin ish joyida bo\'lish kerak?',
    options: ['Aynan smena boshlanganda', 'Kamida 15 daqiqa oldin', 'Bir soat oldin', 'Farqi yo\'q, asosiysi kelish'],
    correctAnswer: 1,
    explanation: 'Kamida 15 daqiqa oldin kelib, tashqi ko\'rinishni tekshirish, smena topshirig\'ini olish va zalni ko\'zdan kechirish kerak.' },

  { id: 'b02', area: 'smena', difficulty: 'easy',
    question: 'Ofitsiantning tashqi ko\'rinishida quyidagilardan qaysi biri MUMKIN EMAS?',
    options: ['Toza, dazmollangan forma', 'Yig\'ilgan soch', 'Kuchli hidli atir', 'Qisqa kesilgan tirnoq'],
    correctAnswer: 2,
    explanation: 'Kuchli atir taom hidini buzadi va mehmonlarda allergiya chaqirishi mumkin. Atir yengil yoki umuman bo\'lmasligi kerak.' },

  { id: 'b03', area: 'smena', difficulty: 'medium',
    question: 'Smenani yopishda birinchi navbatda nima qilinadi?',
    options: ['Darhol uyga ketiladi', 'Ish joyi va stollar tozalanadi, hisobot topshiriladi', 'Faqat kassani yopish yetarli', 'Ertangi smenaga yozib qoldiriladi'],
    correctAnswer: 1,
    explanation: 'Smena yopilganda ish joyi tozalanadi, hisobot topshiriladi va menejerga smena natijasi haqida xabar beriladi.' },

  { id: 'b04', area: 'smena', difficulty: 'medium',
    question: 'Ish vaqtida shaxsiy telefondan foydalanish qoidasi qanday?',
    options: ['Zalda bemalol ishlatish mumkin', 'Faqat mehmon yo\'q paytda zalda', 'Zalda umuman ishlatilmaydi, faqat tanaffusda', 'Menejer ko\'rmasa bo\'ladi'],
    correctAnswer: 2,
    explanation: 'Zalda telefon ishlatish mehmonga hurmatsizlik sifatida ko\'riladi. Telefon faqat tanaffusda, xodimlar xonasida ishlatiladi.' },

  // ── MEHMONNI KUTIB OLISH ──
  { id: 'b05', area: 'kutib_olish', difficulty: 'easy',
    question: 'Mehmon restoranga kirganda qancha vaqt ichida e\'tibor qaratish kerak?',
    options: ['3 soniya ichida', 'Bir daqiqa ichida', 'Bo\'sh bo\'lganda', 'Mehmon o\'zi chaqirganda'],
    correctAnswer: 0,
    explanation: 'Mehmon kirgan zahoti — 3 soniya ichida — ko\'z bilan aloqa qilib, bosh irg\'ab yoki salomlashib e\'tibor qaratiladi. Bu birinchi taassurotni belgilaydi.' },

  { id: 'b06', area: 'kutib_olish', difficulty: 'easy',
    question: 'Mehmon bilan salomlashishda eng muhim element nima?',
    options: ['Baland ovoz', 'Tabassum va ko\'z bilan aloqa', 'Tez gapirish', 'Menyuni darhol berish'],
    correctAnswer: 1,
    explanation: 'Tabassum va ko\'z bilan aloqa — mehmon o\'zini kutilgan his qiladi. So\'zdan ko\'ra shu ikkisi ko\'proq ta\'sir qiladi.' },

  { id: 'b07', area: 'kutib_olish', difficulty: 'medium',
    question: 'Barcha stollar band, mehmon kelib qoldi. To\'g\'ri harakat qaysi?',
    options: [
      'Joy yo\'q deb qaytarish',
      'Kutish vaqtini aniq aytib, kutish joyini taklif qilish',
      'Hech narsa demay kutishini kutish',
      'Boshqa restoranga yuborish'
    ],
    correctAnswer: 1,
    explanation: 'Aniq kutish vaqti (masalan "10-15 daqiqa") aytilib, kutish joyi taklif qilinadi. Noaniqlik mehmonni ketishga majbur qiladi.' },

  { id: 'b08', area: 'kutib_olish', difficulty: 'medium',
    question: 'Ofitsiant o\'zini mehmonga qachon tanishtiradi?',
    options: [
      'Hech qachon, kerak emas',
      'Hisob berayotganda',
      'Mehmon joylashgach, menyu berish paytida',
      'Mehmon so\'raganda'
    ],
    correctAnswer: 2,
    explanation: 'Mehmon joylashgach, menyu berish paytida ism aytiladi. Shunda mehmon kimga murojaat qilishni biladi va aloqa shaxsiy bo\'ladi.' },

  // ── BUYURTMA QABUL QILISH ──
  { id: 'b09', area: 'buyurtma', difficulty: 'easy',
    question: 'Buyurtmani olgach nima qilish shart?',
    options: [
      'Darhol oshxonaga yugurish',
      'Buyurtmani mehmonga ovoz chiqarib takrorlash',
      'Yozib qo\'yish yetarli',
      'Mehmondan yana bir bor so\'rash'
    ],
    correctAnswer: 1,
    explanation: 'Buyurtma takrorlanadi — bu xatoni oldini oladi. Xato buyurtma tayyorlangach tuzatish qimmatga tushadi.' },

  { id: 'b10', area: 'buyurtma', difficulty: 'easy',
    question: 'Mehmon joylashgandan keyin birinchi navbatda nima taklif qilinadi?',
    options: ['Shirinlik', 'Ichimlik', 'Hisob', 'Hech narsa, kutiladi'],
    correctAnswer: 1,
    explanation: 'Ichimlik birinchi taklif qilinadi — mehmon menyuni ko\'rayotganda ichimlik ichadi, kutish qisqa tuyuladi va o\'rtacha chek oshadi.' },

  { id: 'b11', area: 'buyurtma', difficulty: 'medium',
    question: 'Mehmon menyudan tanlay olmayapti. Eng to\'g\'ri yo\'l qaysi?',
    options: [
      'Eng qimmat taomni taklif qilish',
      'Nimani yoqtirishini so\'rab, shunga mos 2-3 variant taklif qilish',
      'Vaqt berib, keyinroq qaytish',
      'Menyudagi hamma taomni sanab chiqish'
    ],
    correctAnswer: 1,
    explanation: 'Avval mehmon nimani yoqtirishini bilib olinadi, keyin shunga mos ozgina variant beriladi. Ko\'p variant tanlovni qiyinlashtiradi.' },

  { id: 'b12', area: 'buyurtma', difficulty: 'hard',
    question: 'Katta guruh buyurtma beryapti. Buyurtmani chalkashtirmaslik uchun nima qilinadi?',
    options: [
      'Hammasini yoddan yozib olish',
      'Har mehmonning o\'rnini belgilab, buyurtmani shunga qarab yozish',
      'Guruh boshlig\'idan bitta buyurtma olish',
      'Har birini alohida chaqirib so\'rash'
    ],
    correctAnswer: 1,
    explanation: 'Stol o\'rinlari raqamlanadi va har buyurtma o\'rin raqamiga yoziladi. Shunda taomni "kimga?" deb so\'ramasdan qo\'yiladi.' },

  // ── SOTUV VA TAVSIYA ──
  { id: 'b13', area: 'sotuv', difficulty: 'easy',
    question: 'Qo\'shimcha sotuv (upsell) nima?',
    options: [
      'Mehmonni ko\'proq pul sarflashga majburlash',
      'Mehmon ehtiyojiga mos qo\'shimcha yoki yaxshiroq variant taklif qilish',
      'Eng qimmat taomni taklif qilish',
      'Chegirma berish'
    ],
    correctAnswer: 1,
    explanation: 'Upsell — mehmonga foyda keltiradigan mos taklif. Majburlash emas: mehmon rozi bo\'lmasa bir marta taklif qilinib, orqaga chekiniladi.' },

  { id: 'b14', area: 'sotuv', difficulty: 'medium',
    question: 'Mehmon asosiy taom buyurtma qildi. Eng mos qo\'shimcha taklif qaysi?',
    options: [
      'Yana bitta asosiy taom',
      'Shu taomga mos garnir yoki ichimlik',
      'Eng qimmat shirinlik',
      'Hech narsa taklif qilmaslik'
    ],
    correctAnswer: 1,
    explanation: 'Taklif buyurtmaga MOS bo\'lishi kerak — garnir, sous, mos ichimlik. Bog\'liq bo\'lmagan taklif bosim sifatida qabul qilinadi.' },

  { id: 'b15', area: 'sotuv', difficulty: 'medium',
    question: 'Mehmon taklifingizni rad etdi. Nima qilasiz?',
    options: [
      'Yana bir bor qattiqroq taklif qilaman',
      'Xafa bo\'lib jim qolaman',
      'Xushmuomalalik bilan qabul qilib, buyurtmani davom ettiraman',
      'Boshqa qimmatroq variantni taklif qilaman'
    ],
    correctAnswer: 2,
    explanation: 'Rad javobi xushmuomalalik bilan qabul qilinadi. Takroriy bosim mehmonni bezovta qiladi va umumiy taassurotni buzadi.' },

  { id: 'b16', area: 'sotuv', difficulty: 'hard',
    question: 'Shirinlikni qachon taklif qilish eng samarali?',
    options: [
      'Mehmon kirgan zahoti',
      'Asosiy taom bilan bir vaqtda',
      'Asosiy taom tugagach, stol yig\'ishtirilgandan keyin',
      'Hisob berilgandan keyin'
    ],
    correctAnswer: 2,
    explanation: 'Asosiy taom tugab, stol yig\'ishtirilgach taklif qilinadi — mehmonda "yana nimadir" hissi paydo bo\'ladi. Hisobdan keyin kech.' },

  // ── MUAMMOLI VAZIYATLAR ──
  { id: 'b17', area: 'muammo', difficulty: 'easy',
    question: 'Mehmon taom sifatidan shikoyat qildi. Birinchi harakatingiz?',
    options: [
      'Oshpazni himoya qilish',
      'Diqqat bilan tinglash va uzr so\'rash',
      'Darhol menejerni chaqirish',
      'Taom yaxshi ekanini tushuntirish'
    ],
    correctAnswer: 1,
    explanation: 'Avval tinglanadi va uzr so\'raladi — mehmon eshitilganini his qilishi kerak. Bahslashish vaziyatni og\'irlashtiradi.' },

  { id: 'b18', area: 'muammo', difficulty: 'medium',
    question: 'Mehmon taomni uzoq kutayotganini aytdi. To\'g\'ri javob qaysi?',
    options: [
      '"Oshxona band, kuting"',
      'Uzr so\'rab, oshxonadan aniq vaqtni bilib, mehmonga xabar berish',
      '"Hozir keladi" deb ketish',
      'Boshqa ofitsiantga yuborish'
    ],
    correctAnswer: 1,
    explanation: 'Uzr so\'raladi, oshxonadan ANIQ vaqt bilib olinadi va mehmonga qaytib aytiladi. Noaniq "hozir" javobi ishonchni yo\'qotadi.' },

  { id: 'b19', area: 'muammo', difficulty: 'medium',
    question: 'Xato taom keltirdingiz. Nima qilasiz?',
    options: [
      'Mehmonni yeyishga ko\'ndirish',
      'Uzr so\'rab, darhol almashtirish va menejerga xabar berish',
      'Xatoni yashirish',
      'Hisobdan chegirib qo\'yish yetarli'
    ],
    correctAnswer: 1,
    explanation: 'Uzr so\'ralib, taom darhol almashtiriladi va menejer xabardor qilinadi. Xatoni yashirish keyinchalik kattaroq muammoga aylanadi.' },

  { id: 'b20', area: 'muammo', difficulty: 'hard',
    question: 'Mehmon baland ovozda janjal qilyapti, atrofdagilar bezovta. Eng to\'g\'ri yo\'l?',
    options: [
      'Baland ovozda javob qaytarish',
      'E\'tibor bermay ketish',
      'Xotirjam ohangda tinglab, alohida joyga taklif qilib, menejerni chaqirish',
      'Mehmondan chiqib ketishni so\'rash'
    ],
    correctAnswer: 2,
    explanation: 'Ovoz ko\'tarilmaydi. Mehmon alohida joyga taklif qilinib, boshqa mehmonlar bezovta bo\'lmasligi ta\'minlanadi va menejer chaqiriladi.' },

  // ── ALLERGEN VA XAVFSIZLIK ──
  { id: 'b21', area: 'xavfsizlik', difficulty: 'easy',
    question: 'Mehmon taomda allergen bor-yo\'qligini so\'radi, siz aniq bilmaysiz. Nima qilasiz?',
    options: [
      'Taxminan javob beraman',
      '"Yo\'q" deb aytaman',
      'Oshxonadan aniqlab, keyin aniq javob beraman',
      'Menyuga qarashni aytaman'
    ],
    correctAnswer: 2,
    explanation: 'Allergen masalasida TAXMIN QILINMAYDI — bu hayot uchun xavfli. Oshxonadan aniqlanib, keyin aniq javob beriladi.' },

  { id: 'b22', area: 'xavfsizlik', difficulty: 'medium',
    question: 'Quyidagilardan qaysi biri eng keng tarqalgan allergenlar guruhiga KIRMAYDI?',
    options: ['Yong\'oq', 'Sut mahsulotlari', 'Guruch', 'Dengiz mahsulotlari'],
    correctAnswer: 2,
    explanation: 'Guruch kam allergen hisoblanadi. Yong\'oq, sut, tuxum, gluten, dengiz mahsulotlari — eng keng tarqalgan allergenlar.' },

  { id: 'b23', area: 'xavfsizlik', difficulty: 'medium',
    question: 'Mehmon "men parhezdaman" dedi. To\'g\'ri harakat qaysi?',
    options: [
      'Eng arzon taomni taklif qilish',
      'Qanday parhez ekanini aniqlab, mos taomlarni taklif qilish',
      'Salat taklif qilish yetarli',
      'Parhez taomlar yo\'q deyish'
    ],
    correctAnswer: 1,
    explanation: '"Parhez" turlicha bo\'ladi — tibbiy, diniy, vegetarian, kaloriya. Aniqlanmasa noto\'g\'ri taom taklif qilinadi.' },

  { id: 'b24', area: 'xavfsizlik', difficulty: 'hard',
    question: 'Mehmon yong\'oqqa og\'ir allergiyasi borligini aytdi. Buyurtmada nimaga alohida e\'tibor beriladi?',
    options: [
      'Faqat taom tarkibiga',
      'Tarkib, sous, bezak va tayyorlanish jarayonida aralashib ketish ehtimoliga',
      'Faqat shirinliklarga',
      'Hech narsaga, oshpaz biladi'
    ],
    correctAnswer: 1,
    explanation: 'Yong\'oq sousda, bezakda yoki bir xil idishda tayyorlanganda aralashib ketishi mumkin. Oshxona alohida ogohlantiriladi.' }
];

// ── POZITSIYA BIAS'INI YO'Q QILISH ───────────────────────────
// Savol yozilganda to'g'ri javob odatda 2-o'ringa tushib qoladi — yuqoridagi
// 24 savoldan 15 tasi shunday chiqdi. Bunday bazada hech narsa bilmagan xodim
// doim "B" bosib 60% oladi va diagnostika ma'nosini yo'qotadi.
//
// Yechim: variantlar savol id'si asosida DETERMINISTIK aralashtiriladi.
// Deterministik — chunki ball izchil bo'lishi kerak (bir xil javob har doim
// bir xil natija beradi), lekin to'g'ri javob endi barcha o'rinlarga taqsimlanadi.
// Yangi savol qo'shilganda ham avtomatik ishlaydi — qo'lda tartiblash shart emas.

/** Satrdan barqaror son (FNV-1a) — har ishga tushirishda bir xil natija. */
function seedOf(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function shuffleOptions(q) {
  const idx = q.options.map((_, i) => i);
  let s = seedOf(q.id);
  // Fisher-Yates, seeded PRNG bilan
  for (let i = idx.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const j = s % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return {
    ...q,
    options: idx.map(i => q.options[i]),
    correctAnswer: idx.indexOf(q.correctAnswer)
  };
}

// Modul yuklanganda bir marta aralashtiriladi — keyin hamma joyda shu tartib ishlatiladi.
const SHUFFLED = QUESTIONS.map(shuffleOptions);

/** Diagnostikaga beriladigan savollar (to'g'ri javobsiz — frontendga ketadi). */
function publicQuestions() {
  return SHUFFLED.map(q => ({
    id: q.id, area: q.area, difficulty: q.difficulty,
    question: q.question, options: q.options
  }));
}

/** Javoblarni tekshirib, yo'nalishlar bo'yicha ball qaytaradi. */
function score(answers) {
  const byArea = {};
  const breakdown = [];

  for (const q of SHUFFLED) {
    const given = answers?.[q.id];
    const selected = Number.isInteger(given) ? given : parseInt(given);
    const answered = Number.isInteger(selected) && selected >= 0;
    const isCorrect = answered && selected === q.correctAnswer;

    const a = byArea[q.area] || (byArea[q.area] = { correct: 0, total: 0 });
    a.total += 1;
    if (isCorrect) a.correct += 1;

    breakdown.push({
      questionId: q.id, area: q.area, question: q.question,
      options: q.options, selectedAnswer: answered ? selected : -1,
      correctAnswer: q.correctAnswer, isCorrect,
      difficulty: q.difficulty, explanation: q.explanation
    });
  }

  const areaScores = Object.entries(byArea).map(([area, v]) => ({
    area,
    label: AREAS[area].label,
    icon: AREAS[area].icon,
    correct: v.correct,
    total: v.total,
    score: Math.round((v.correct / v.total) * 100)
  })).sort((a, b) => a.score - b.score);   // zaifi birinchi

  const totalCorrect = areaScores.reduce((s, a) => s + a.correct, 0);
  const totalQuestions = areaScores.reduce((s, a) => s + a.total, 0);

  return {
    score: Math.round((totalCorrect / totalQuestions) * 100),
    totalCorrect, totalQuestions,
    areaScores, breakdown
  };
}

module.exports = { AREAS, QUESTIONS: SHUFFLED, publicQuestions, score, COUNT: QUESTIONS.length };
