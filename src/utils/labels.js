// ── KO'RSATISH UCHUN BIR XIL YOZUV ───────────────────────────
// Rezyumelar hh.uz'dan ruscha keladi ("Ташкент", "Русский"), qo'lda
// kiritilganlari o'zbekcha. Mijozga bir sahifada aralash til chiqmasin —
// ko'rsatishda bir xil yozuvga keltiramiz. Bazadagi qiymat O'ZGARMAYDI:
// qidiruv (candidateSearch) ikkala yozuvni ham taniydi.
//
// lang — o'quvchining tili ('uz' default). Yozuv lug'atdan olinadi
// (public/js/th-i18n.js), shu sababli Mini App bilan bir xil.

const { t } = require('../../public/js/th-i18n');

// "Tashkent", "Ташкент, Чиланзар" -> "Toshkent" / "Ташкент", tuman o'z holicha
const placeLabel = (s, lang = 'uz') => String(s || '').trim()
  .replace(/^(tashkent|ташкент|тошкент|toshkent)/i, () => t(lang, 'place.tashkent'));

// O'zak bo'yicha (candidateSearch.LANG_ALIAS bilan bir xil yondashuv):
// "Английский", "English", "Ingliz tili" -> "Ingliz" / "Английский"
const LANGS = [
  [/zbek|узбек|uzbek/i,              'uz'],
  [/^rus|русск|russian/i,            'ru'],
  [/ngliz|англи|english/i,           'en'],
  [/qozoq|kazax|казах|kazakh/i,      'kk'],
  [/turk|турец/i,                    'tr'],
  [/koreys|корей|korean/i,           'ko'],
  [/tojik|тадж|tajik/i,              'tg'],
  [/arab|араб/i,                     'ar'],
  [/nemis|немец|german|deutsch/i,    'de'],
  [/fransuz|француз|french/i,        'fr'],
  [/xitoy|китай|chinese/i,           'zh'],
  [/ozarbayjon|азербайдж|azerbaij/i, 'az']
];
function langLabel(s, lang = 'uz') {
  const x = String(s || '').trim();
  const hit = LANGS.find(([re]) => re.test(x));
  return hit ? t(lang, 'lang.' + hit[1]) : x;
}
// Takrorlarsiz: "Русский", "Rus tili" -> bitta "Rus"
const langsLabel = (arr, lang = 'uz') =>
  [...new Set((arr || []).map(s => langLabel(s, lang)).filter(Boolean))];

module.exports = { placeLabel, langLabel, langsLabel };
