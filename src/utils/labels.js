// ── KO'RSATISH UCHUN BIR XIL YOZUV ───────────────────────────
// Rezyumelar hh.uz'dan ruscha keladi ("Ташкент", "Русский"), qo'lda
// kiritilganlari o'zbekcha. Mijozga bir sahifada aralash til chiqmasin —
// ko'rsatishda bir xil yozuvga keltiramiz. Bazadagi qiymat O'ZGARMAYDI:
// qidiruv (candidateSearch) ikkala yozuvni ham taniydi.

// "Tashkent", "Ташкент, Чиланзар" -> "Toshkent", "Toshkent, Чиланзар"
const placeLabel = s => String(s || '').trim()
  .replace(/^(tashkent|ташкент|тошкент|toshkent)/i, 'Toshkent');

// O'zak bo'yicha (candidateSearch.LANG_ALIAS bilan bir xil yondashuv):
// "Английский", "English", "Ingliz tili" -> "Ingliz"
const LANGS = [
  [/zbek|узбек|uzbek/i,            'O\'zbek'],
  [/^rus|русск|russian/i,          'Rus'],
  [/ngliz|англи|english/i,         'Ingliz'],
  [/qozoq|kazax|казах|kazakh/i,    'Qozoq'],
  [/turk|турец/i,                  'Turk'],
  [/koreys|корей|korean/i,         'Koreys'],
  [/tojik|тадж|tajik/i,            'Tojik'],
  [/arab|араб/i,                   'Arab'],
  [/nemis|немец|german|deutsch/i,  'Nemis'],
  [/fransuz|француз|french/i,      'Fransuz'],
  [/xitoy|китай|chinese/i,         'Xitoy'],
  [/ozarbayjon|азербайдж|azerbaij/i, 'Ozarbayjon']
];
function langLabel(s) {
  const t = String(s || '').trim();
  const hit = LANGS.find(([re]) => re.test(t));
  return hit ? hit[1] : t;
}
// Takrorlarsiz: "Русский", "Rus tili" -> bitta "Rus"
const langsLabel = arr => [...new Set((arr || []).map(langLabel).filter(Boolean))];

module.exports = { placeLabel, langLabel, langsLabel };
