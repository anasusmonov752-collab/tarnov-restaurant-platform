# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qanday ishlash kerak (Anas bilan)

1. **Xato variantni to'g'irla.** Agar Anas texnik yoki biznes jihatdan
   noto'g'ri yo'l taklif qilsa — "maqul" demang. Nega xato ekanini
   1-2 gapda ayting va maqbul variantni bering. Anas qayta
   tasdiqlasa — uning qarori, bajaring.
2. **"Tayyor" demasdan oldin o'lchang.** Jonli deploy'da tekshirilmagan
   narsa tayyor emas. Push ≠ ishlayapti.
3. **Bir nechta narsa birdan buzilsa — bitta sabab izla.** Har birini
   alohida yamoqlamang.
4. **Ma'lumotni kodni ayblashdan oldin tekshir.** "Filtr xato" deyishdan
   oldin bazaga qarang.
5. **Chala ish yo'q.** Vazifaning bir qismi bloklangan bo'lsa —
   qolganini oxirigacha bajaring va nima qolganini aniq ayting.
6. **`sed`/`awk` bilan tahrirlagandan keyin natijani O'QI.** "Qator
   qo'shildimi?" deb `grep` qilish yetarli emas — qo'shilgani rost,
   mazmuni buzuq bo'lishi mumkin. Tahrirlangan joyni `sed -n` bilan
   chiqarib, ko'z bilan ko'ring. 2026-10-18 da shu sababdan `\n`
   literal `n` ga aylanib, butun Mini App oq ekran bo'lib qoldi.
   Katta HTML/JS uchun shell emas, `Write` ishlating.

## Qolgan ishlar (2026-10-18 holatiga)

**MINIAPP-2 — bloklovchilar tuzatildi va JONLI TEKSHIRILDI (2026-10-18).**
Audit: `docs/miniapp2-audit-2026-10-18.md` (58 da'vo → 35 tasdiqlangan).
To'rtala bloklovchi `9f2a6b8` da tuzatilib, jonli deploy'da isbotlandi:
- `reveal()` oq ro'yxati — `interview` holatidan ochib bo'lmadi, mijoz
  qarori saqlandi, ikkinchi kredit yechilmadi
- `candidate_no` dan ochish 400 qaytardi, kredit yechilmadi
- Ism redaksiyasi ishladi: mijoz kartasida tavsif matni ichida ism
  o'rnida `A-XC7L` kodi turdi (xom ma'lumotda u yerda ism bor edi).
  Bazadagi 798 nomzoddan 60 tasida (7.5%) summary/fitReason ichida ism
  bor — demak nuqson haqiqiy edi
- Toast CSS: 191×42px, z-index 9999, modal (200) ustida

**Hali tekshirilmagan:** nomzod tomoni (ariza berish, nomzod kabineti) —
Eskizga bog'liq. Qolgan 14 major + 17 minor topilma ham ochiq.

**Mini App ichidagi chat — QURILDI** (2026-10-18, `919ca4e`..`7a0ccb4`).
Mijoz ↔ nomzod suhbati kontakt ochilganda avtomatik ochiladi; kontakt
ham, chat ham beriladi (chat kontakt o'rnini bosmaydi). Ikkala
kabinetda inbox: tepada qadalgan "TalentHub ✓", ostida suhbatlar.
Har xabar bot orqali Telegramga push bo'ladi — Mini App'ning o'z
push'i yo'q, usiz chat o'lik bo'lardi. Agentlik `/suhbatlar.html`
dan hammasini ko'radi va istalganiga yozadi.

Qolgani: nomzod tomonini haqiqiy nomzod bilan sinash. Eskiz SHART
EMAS: kalitlar yo'q bo'lsa panel deep-link'ni "qo'lda" rejimda beradi,
uni uchinchi Telegram akkauntga (admin ham, mijoz ham emas) tashlash
kifoya. Ma'lum kichik kamchilik: `'ca'` turidagi suhbat uchun unikal
indeks yo'q, ikkita bir vaqtdagi inbox yuklanishi dublikat yaratishi
mumkin (oyna juda tor).

**Nomzod tomoni tuzatishlari** (`387cf50`, kod auditi): Mini App'dan
"TalentHub"ga yozilgan xabar BotMessage'ga yozilmasdi — nomzod
suhbatidan yo'qolardi, admin reply'i nomzodga yetmasdi. Endi webhook
va Mini App bitta yo'l: `botRelay.receiveFromCandidate()`.

**Avtomatik vakansiya — JONLI TEKSHIRILDI** (2026-10-18, `4331240`..):
mijoz botda qidirib nomzod tanlasa vakansiya o'zi yaratiladi
(`services/vacancyAuto.js`), taklif AI orqali QAT'IY SHABLONGA
ajratiladi (satrlarni server yig'adi). Yopiq (`listed:false`) tug'iladi,
botdagi "📢 E'lon qilish" tugmasi yoki kabinet orqali ochiladi. Shu
lavozimga ochiq vakansiya bo'lsa yangisi ochilmaydi — formalarda
lavozim majburiy, eski 'boshqa' yozuvlar sarlavhadan taniladi.
Jonli isbot: ikkinchi qidiruv yangi vakansiya ochmadi (2 tanlov),
E'lon qilish ishladi. `/ping` endi deploy qilingan commit'ni qaytaradi.

**Kontaktdan keyingi to'liq profil — QURILDI** (`e862479`, Anas
2026-10-19 da Telegramda sinab "hammasi ishladi" dedi): kontaktgacha
ikki tomon anonim, ochilgach to'liq. "Ochilgan" ning yagona ta'rifi —
`services/contactView.js` (revealedAt bor, refunded emas). Mijoz:
chatda ism+foto, sarlavha/"Rezyumeni ochish" → rezyume (ichki maydonlar
chiqmaydi). Nomzod: mijoz nomini bossa kompaniya kartasi (Client
`address`/`about` dan — panelda to'ldirilishi kerak) va taklif qilingan
vakansiya; ish o'rnini bossa hh kabi sahifa (kontaktgacha nomsiz).

**Vakansiyadan "Mos nomzodlar" — QURILDI va sinaldi** (`5f61fb0`,
Anas 2026-10-19): Mini App'da vakansiya → anonim kartalar → tanlov shu
vakansiyaga bog'lanadi (`SearchSession.vacancyId`). Shu vakansiyaga
tanlanganlar qayta chiqmaydi (`candidateSearch` `excludeIds`). Eslatma:
`Candidate.shownToClients` yoziladi, lekin hech qayerda filtr sifatida
ishlatilmaydi.

**Pastki navigatsiya — JONLI TEKSHIRILDI** (2026-10-19, `610c85b` gacha):
ikkala kabinetda "suyuq shisha" kapsula (iOS Liquid Glass taqlidi —
haqiqiy sinish veb'da mumkin emas), Lucide ikonkalari, yozuvlar qoladi,
faol bo'limda kamalak chetli linza; linzani barmoq bilan surib bo'lim
tanlanadi. Surishda `disableVerticalSwipes()` + touchmove preventDefault
— aks holda iOS'da butun Mini App qimirlardi. O'qilmagan xabarga qizil
nuqta (`/api/ma/unread`, `/api/cand/unread`); nomzodning "TalentHub"
yozishmasi nuqtaga kirmaydi — BotMessage'da o'qilganlik yo'q.

**Tanlov va vakansiya ekranlari** (2026-10-19, `530a673`, `a1d33f9`):
nomzod kartasi bitta (`candHtml`) — Tanlovlar va vakansiya sahifasida;
bosqichlar chizig'i Kontakt → Suhbat → Ishga olindi; vakansiyada voronka
(mos · tanlangan · kontakt · ishga olindi, "mos" = `countRelaxed`).
Rezyume kontaktgacha ham ochiladi — ANONIM (`anonymize.forClient`), faqat
mijoz tanlovidagi yoki unga ariza bergan nomzod (`clientKnows`). Yangi
ariza: mijozga Telegram xabari (`?apps=<vakansiya>`, hash emas — Telegram
launch parametrlarini hash'ga qo'yadi), Vakansiya tabida nuqta.

**Mijoz kabineti tuzilmasi** (`e9a78b0`): tablar Tanlovlar · Arizalar ·
Vakansiya · Aloqa (Balans tab emas — tepadagi kredit raqamini bosganda
oyna). Pastki oyna ZANJIR: har oyna boshida `sheetEnter(kalit, chizish)`,
"‹" va Telegram BackButton bir qadam orqaga — yangi oyna qo'shilsa shu
qoidaga rioya qiling. Ko'rsatishda bir xil yozuv — `utils/labels.js`
(Toshkent, tillar o'zbekcha); rol 'boshqa' bo'lsa `guessRole(desiredPosition)`.
Arizadan kontakt ochish JONLI ISHLADI (Anas, 2026-10-19: balans 2→1).

**ARIZADAN KONTAKTNI MIJOZ O'ZI OCHADI** (`af12e84`, Anas qarori
2026-10-19): ariza — nomzodning o'z roziligi, agentlik tekshiruvi shart
emas. Qoida YAGONA joyda — `services/applyReveal.js`: rozilik 14 kundan
yangi (ariza sanasi yoki `jobStatusAt` — yangirog'i), nomzod "not_looking"
emas, telefon haqiqiy UZ formatida. Server qayta tekshiradi, kredit
oldindan tekshiriladi, keyin MAVJUD `shortlistSvc.reveal({viaApplication})`
— alohida kredit yechish yozilmasin. Qidiruvdan tanlangan nomzod esa
avvalgidek faqat agentlik orqali ochiladi (u rozilik bermagan).
Haqiqiy kredit bilan sinaldi (yuqoriga qarang).

**Rollar tozalandi — BAZADA BAJARILDI** (2026-10-19, `dae82a7`, `de2e4f2`):
162 ta `boshqa`dan 130 tasi rolga o'tdi (menejer 89→166, xostess 138→172,
ofitsiant +11, kassir +5, operator +3). Ildiz sabab: resumeParser AI
rolini kalitga AYNAN solishtirib 'boshqa' qo'yardi; qidiruvda esa alohida
ROLE_ALIAS bor edi. Endi YAGONA jadval — `data/roles.js guessRole()`
(tahlilchi, vakansiya, qidiruv). Zavod "operator"i va savdo menejeri
restoran roli emas. 23 administrator Anas qarori bilan ish tarixiga
qarab ajratildi (supervayzer/restoran menejeri -> menejer). Qayta
ishlatish: `POST /api/recruitment/roles/reclassify` (apply:false — ko'rish).

Shuningdek 32 ta tahlil qilinmagan rezyume (2026-10-05 dagi `xo1xx.pdf`
partiyasi — o'sha kuni AI kvotasi tugagan) AI bilan qayta tahlil qilindi:
deyarli hammasi xostess. **Endi `boshqa` = 0.** (2026-10-19)

**DUBLIKATLAR — TOZALANDI va JONLI O'LCHANDI** (2026-10-19, `b21c824`):
50 odam bazada 2-4 martadan edi (3-6 oktabr hh partiyalari). Sabab:
yuklash telefonni MATN sifatida aynan solishtirardi ("+998 90 135 93 94"
≠ "+998901359394"), AI yiqilsa telefon ajratilmay tekshiruv o'tib ketardi.
Tuzatish: `utils/candidateKeys.js` — `textHash` (AI'dan OLDIN, kvota
tejaladi), `phoneKey` (oxirgi 9 raqam), email. Anas tasdig'i bilan
birlashtirildi: 57 yozuv o'chdi, 799 → 742, qayta tekshiruv 0 guruh,
8 tanlovdagi 12 yozuvning hech biri yetim qolmadi (Kasimova Sabrina'ning
tanlovdagi yozuvi qoldi), 742 tasiga kalit yozildi. Jonli isbot: bazadagi
PDF qayta yuklandi → `duplicates:1, created:0`. Telefon formati yo'li
(boshqa PDF, shu raqam) jonli sinalmagan. Qayta ishlatish:
`POST /api/recruitment/duplicates` (apply:false — ko'rish; Telegramga
ulangan yoki tanlovdagi ikki yozuvli guruh `conflicts`ga tushadi, tegilmaydi).
8 guruhda nusxalar roli har xil edi — qoladigan yozuv roli qoldi.

**TIL TIZIMI (o'zbek/rus) — mijoz Mini App'i DEPLOY QILINDI** (2026-10-19,
`c951e5c`): lug'at BITTA fayl — `public/js/th-i18n.js` (brauzer va server
`require` qiladi), matn KALIT bo'yicha (RestoOne'dagi `i18n.js` kabi matn
qidirish EMAS). Rus ko'plik shakllari massiv bilan. Til odamga yoziladi:
`Client.lang` / `Candidate.lang` (bo'sh — Telegram `language_code`dan).
`/api/ma` javoblari (holat, rol, maosh, Toshkent, tillar, sabab, xatolar)
`req.lang` da; servis xatolari `ERR_RU` jadvali bilan res.json ichida
tarjima. Avtomatik vakansiya sarlavhasi bazaga O'ZBEKCHA yoziladi,
`vac.full(v, extra, lang)` / `titleFor` o'quvchi tilida ko'rsatadi; panel
(lang'siz) o'zgarmaydi. Mini App: `data-t`, `t()`, Aloqa'da UZ | RU.
Anas Telegramda sinadi (2026-10-20).

**Bot ham mijoz tilida** (2026-10-20, `065364f`, jonli deploy): qoida
`th-i18n.resolve(Client.lang, Client.tgLang)` — `tgLang` Telegram tili,
webhook va Mini App guard'da yangilanadi (bildirishnomalar shundan til
oladi). Xush kelibsiz ostida UZ/RU tugmalari (`lw:`), `/til` (`lg:`).
AI agent: til tanlangan bo'lsa faqat o'sha tilda; tanlanmagan bo'lsa
mijoz YOZGAN tildan aniqlab BIR MARTA saqlaydi (3+ so'z yoki ovoz) —
Anas roziligi bilan: ko'p menejerning Telegrami ruscha, o'zi o'zbekcha
yozadi. Tizim qatorlari, vakansiya kartasi, sharoitlar (`perksText`),
kontakt/ariza/chat bildirishnomalari lug'atdan. Mini App kirish xatosi:
"Sessiya eskirgan — ilovani yopib, qayta oching". Jonli: lug'at, xatolar,
webhook holati tekshirildi; haqiqiy mijoz chatida HALI SINALMAGAN.
O'zbekcha qolgani: agentlik admini xabarlari, nomzod boti va kabineti,
AI xulosalari (bazada). Reja: `docs/taklif-til-anketa-ilova-2026-10-19.md`.

**ANKETA MODULI (1-bosqich) — DEPLOY QILINDI** (2026-10-20, `60e30be`..):
o'z nomzod oqimi. E'lon havolasi `t.me/TalentHubUzBot?start=a_<kod>_<kanal>`
(umumiy) yoki `v_<vakansiya uuid>_<kanal>` (to'ldirgach ARIZA ham tushadi)
-> bot "Anketani to'ldirish" (web_app) -> `anketa.html` (har ekranda bitta
savol, UZ/RU) -> bazada tayyor nomzod (`source:'anketa'`, `channel`,
`consentAt`). Javob -> maydon SHABLON bo'yicha (`services/survey.toFields`),
AI yo'q. Telefon — Mini App `requestContact`, bot webhook'i `message.contact`
(contact.user_id === from.id) bilan TASDIQLAYDI (`phoneVerifiedAt`);
qo'lda — zaxira. Nomzod topish: shu Telegram akkaunti, keyin telefon
(qo'lda yozilgan raqam bilan birovning bog'langan profili egallanmaydi).
Modellar: `Survey` (savollar bazada, shablon — Tarnov Verifix anketasi
asosida), `SurveyResponse` (har javobda saqlanadi, `step` — qayerda
to'xtagan). Ariza oqimi yagona: `services/applications.submit` (kabinet
ham). Panel: Vakansiyalar -> "Anketa" / "Umumiy anketa havolasi" (kanal
tanlanadi, manba bo'yicha boshladi/yubordi). Jonli: sahifa, API himoyasi,
havola yaratish tekshirildi (umumiy kod HMXT37).

**Birinchi haqiqiy anketa** (2026-10-20): uchinchi akkauntdan to'ldirildi
("Aziza", xostess, telefon tasdiqlangan, kanal `bot`). Havolasiz `/start`
endi begona odamga umumiy anketani ochadi (`a1b91f6`, `plainStart`).

**ANKETA 2-VERSIYA + SHARTLI SAVOLLAR — PROD'GA YOZILDI** (2026-10-20,
`81f5fd3`..`d90a69c`, Anas tasdig'i bilan `POST /api/surveys/upgrade`
apply:true). Tartib: ISH haqida -> SIZ haqingizda -> QO'SHIMCHA (`sec`).
Yangi: qachondan (`startWhen` -> `availableFrom`), ingliz tili, ism 2 so'z,
smena "faqat dam olish kunlari", maosh "kelishamiz", jins ixtiyoriy.
SHART (`showIf {q, in}`) savolning o'zida, bazada: faqat OLDINGI variantli
savolning belgilangan javobida so'raladi; yashirin savol majburiy emas va
javobi nomzodga tushmaydi. Qoida YAGONA: `survey.shownQuestions`
(server: majburiylik, `toFields`) = `anketa.html shownList` (progress
javobga qarab o'zgaradi). Lavozim ma'lum bo'lsa (vakansiya) shart shu
lavozim bo'yicha. Umumiy anketada lavozimga xos savollar shartli
(c_bron xostess, c_kuxnya/c_sex oshpaz, c_stol/c_kassa ofitsiant);
lavozim anketalari shablondan `forRole` bilan yasaladi (`ROLE_PRESETS`da
faqat farq). Prod: HMXT37 umumiy 24 savol, H7SDZW xostess 20 (rasm
majburiy), 6C62ZP oshpaz 20 (ingliz yo'q), Y23KFT ofitsiant 21.
Xostess vakansiyalari havolasi endi Xostess anketasini ochadi.
Konstruktorda "Faqat ma'lum javobda so'rash"; yangi savol/variant
kaliti brauzerda beriladi (saqlanmagan savolga shart qo'yish uchun).
Shu ishda tuzatilgan: variant bosilib 160 ms ichida "Keyingisi" ham
bosilsa javob ikki marta saqlanib, oldingi savolga keyingisining qiymati
yozilardi. Jonli: qayta upgrade o'zgarishsiz, o'zgarishsiz saqlash
ma'lumotni buzmadi, noto'g'ri shart 400. **Telegramda nomzod sifatida
HALI SINALMAGAN.**

**Konstruktor — DEPLOY QILINDI** (2026-10-20, `a661597`..`7d8b7e0`):
`anketalar.html` (Vakansiyalar -> Anketalar): ro'yxat, savol tahriri UZ/RU,
o'z savoli (matn/uzun matn/tanlov -> `Candidate.extraAnswers`), lavozim
anketalari (vakansiya havolasi `surveyForVacancy` bilan shu lavozim
anketasini ochadi), telefon ko'rinishi. Himoya SERVERDA
(`survey.cleanQuestions`): standart savol turi o'zgarmaydi, `keys:'fixed'`
variantga yangisi qo'shilmaydi, ism/telefon/rozilik o'chmaydi, rozilik
oxirida, bitta lavozimga bitta faol anketa. Jonli topilgan va tuzatilgan:
unikal indeksdan oldingi parallel so'rov 2-umumiy anketa (XYAFYP) yaratgan
edi — `ensureDefault` endi takrorni o'chiradi (eng eskisi qoladi) va
indeksni quradi. Jonli: bitta anketa qoldi, o'zgarishsiz saqlash ma'lumotni
buzmadi, roziliksiz saqlash 400. Keyingi: eslatma (Render bepul tarifida
cron ishonchsiz), ovozli javob, ball/saralash, nomzod kabineti ruscha.

**TAYYORLIK AUDITI (2026-10-20)** — to'rt yo'nalish (backend, Mini App,
panel, dizayn). Xulosa: yuzaki emas (mantiq puxta, qoidalar bir joyda),
lekin pulli mijozlar uchun to'liq tayyor emas. To'liq hisobot ATAYLAB
repoda EMAS (repo ochiq, tuzatilmagan teshiklar ro'yxati) — Anasda.
**0-bosqich (7 ta) — `19f43e9` da tuzatildi**: superadmin paroli faqat
`SUPERADMIN_PASSWORD` env'dan (har ishga tushishda bazadagi parol unga
tenglashadi — ilovada parol almashtirish oynasi yo'q); anketa telefon
bo'yicha mavjud profilga FAQAT Telegram tasdiqlagan raqam bilan ulanadi;
mijoz chatida `t` o'zgaruvchisi `t()` ni yopib tugma qotardi; `reveal()`
shu mijoz BOSHQA tanlovda ochgan nomzod uchun kredit yechmaydi
(`openedBefore`); qayta tahlil ism/telefon/email/rolni ustidan yozmaydi
(`mergeParsed`), fotosi yo'qlarga AI chaqirmaydi (`photoOnly`); telefon
o'zgarsa `phoneVerifiedAt` tushadi; `anonymize.hideContacts` matndan
telefon/email/@username/havolani yashiradi. Qolgani: 1-bosqich (refund
yo'li, kredit tranzaksiyasi, zaxira nusxa, monitoring, testlar, qidiruvda
jobStatus filtri, AI timeout, indekslar), huquqiy (hh nomzodlari
roziliksiz mijozga ko'rinadi, Gemini bepul tarifi, ma'lumot
lokalizatsiyasi), 2-bosqich (panel sikli: agentlik natija/refund
belgilay olmaydi, tanlov faqat mijozdan, arizalar faqat o'qish, TalentHub
RestoOne restoran tenant'i ichida), 3-bosqich (Telegram qorong'i mavzu,
cold start/retry, chat jonli emas, BackButton chatda yo'q, profil.html
faqat o'zbekcha, yagona token CSS, kontrast, brend).

**Eskiz SMS — QOLDIRILDI** (2026-10-20, Anas): yuridik shaxs shartnomasi,
ERI bilan Didox'da imzo, kamida 300 ming so'm — hozircha kerak emas.
O'z nomzodlari Telegram orqali; hh nomzodlariga — o'z SIM'dan qo'lda
"Taklif navbati" (qurilmagan, avval telefonli nomzodlar sonini o'lchash).

**Ma'lumot tozalash** — `boshqa` rollar, tahlil qilinmaganlar va
dublikatlar bajarildi (yuqoriga qarang). Qolgani: 3 ta `SINOV` test yozuvi.

**Render Starter ($7/oy)** — haqiqiy mijozlar kelishidan oldin. Bepul
tarifda 50 soniya sovuq start bor.

**Inline tugmalar** — `allowed_updates` ga `callback_query` qo'shilgandan
keyin jonli tekshirilmagan.

**Ochilib ketgan kalitlarni bekor qilish** — GitHub token `ghp_VBxW...`,
Telegram bot tokeni, `admin@tarnov.uz` paroli (eski skriptlarda qattiq
yozilgan edi, endi so'raydigan qilib o'zgartirilgan). Superadmin paroli
endi Render'dagi `SUPERADMIN_PASSWORD` orqali almashtiriladi (eski
boshlang'ich parol git tarixida qoladi — env qo'yilmaguncha u amal qiladi).

## Project Overview

**RestoOne — Restaurant Staff Training Platform** — multi-tenant SaaS for restaurant staff training. Restaurants manage menus, waiters take tests based on menu knowledge, and results are tracked with certificates for 90%+ scores.

- **Live URL:** https://tarnov-restaurant-platform.onrender.com
- **GitHub:** https://github.com/anasusmonov752-collab/tarnov-restaurant-platform
- **Database:** MongoDB Atlas (free tier, always-on)
- **Hosting:** Render.com (free tier — 50s cold start after inactivity)

## Commands

```bash
npm start          # Production server (node server.js)
npm run dev        # Development with auto-reload (nodemon)
npm install        # Install dependencies
```

**Deploy:** Push to `main` branch → Render auto-deploys. Use stored token for push:
```bash
git remote set-url origin https://TOKEN@github.com/anasusmonov752-collab/tarnov-restaurant-platform.git
git push origin main
git remote set-url origin https://github.com/anasusmonov752-collab/tarnov-restaurant-platform.git
```

## Environment Variables (Render)

**Never put real values in this file — it is committed to a PUBLIC repo.**
Local development reads `.env` (gitignored); see `.env.example` for the shape.
Production values live in the Render dashboard only.

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Random secret for JWT signing |
| `NODE_ENV` | `production` |
| `GEMINI_API_KEY` | Google AI Studio key — powers AI chat and written-answer grading |
| `ANTHROPIC_API_KEY` | Optional fallback when Gemini is unavailable |
| `AI_PROVIDER` | `gemini` (default) or `anthropic` |
| `SUPERADMIN_PASSWORD` | `admin@tarnov.uz` password (≥12 chars); DB hash is synced to it on every boot |

## Architecture

**Modular backend** — `server.js` is a thin bootstrap (config, static, health, media
streaming). Real logic lives under `src/`:
```
src/
  config/db.js                 — Mongo connect
  middleware/auth.js           — JWT + auth([...roles]) guard
  middleware/errorHandler.js   — asyncHandler + global error handler
  models/                      — Restaurant, SuperAdmin, MentorChat, MentorAssignment, AiUsage
  routes/                      — auth, super, restaurant, waiter
  services/                    — ai, aiQuota, grading, generator, kpi, mentor,
                                 mentorChat, mentorVoice, mentorVoice, assignments
  data/                        — roles.js, roleplay.js, baseline.js
  utils/kpi.js                 — period math (getPeriodKey/Label/RefDate)
```
(CLAUDE.md once described a single-file `server.js` — that is outdated; it is now modular.)

**No frontend framework** — vanilla JS + fetch API. Each page is a self-contained HTML file with inline `<script>`.

### Data Model (MongoDB/Mongoose)

Most data lives in a single `Restaurant` document (embedded subdocuments). Chat history
and mentor assignments are **separate collections** (they grow unbounded, so they are kept
out of the per-request Restaurant read).
```
Restaurant
  ├── menu[]          (MenuItemSchema) — Base64 images; also nameRu/descriptionRu (RU content)
  ├── waiters[]       (WaiterSchema)   — 4-digit PIN; role, phone, hireDate, documents[]
  ├── questions[]     (QuestionSchema) — type: choice|written; difficulty easy|medium|hard
  ├── testDays[]      (String[])       — ISO "YYYY-MM-DD"
  ├── announcements[] · testResults[] · checklist[] · waiterChecklists[]
  ├── modules[]       (ModuleSchema)   — lessons + mini-quiz + roles[] (role targeting)
  ├── moduleProgress[] · trainingVideos[] · waiterTrainingViews[]
  ├── waiterMenuProgress[] — knownDishIds[] + reviews[] (spaced repetition, Leitner boxes)
  ├── assessments[] · courses[]        — baseline diagnostic → personalized course
  ├── evalCriteria[] · evaluations[]   — floor (practical) evaluation
  ├── staffNotes[]    (StaffNoteSchema) — 1-on-1 reviews / praise / disciplinary log
  ├── adaptation{} · kpiSettings{}     — KPI weights: test/menu/module/floor
Separate collections: SuperAdmin, MentorChat, MentorAssignment, AiUsage
```

### Auth System

Cookie-based JWT, 3 roles:
- `superadmin` — email + password → manages all restaurants
- `restaurant` — email + password → manages own restaurant
- `waiter` — restaurantId + 4-digit PIN → takes tests, views menu, watches training videos

JWT stored in `httpOnly` cookie. Auth middleware: `auth(['role1', 'role2'])`.

### API Structure

```
POST /api/auth/login              — all 3 login types
GET  /api/restaurants/list        — public, for waiter login dropdown

/api/super/*                      — superadmin only
/api/restaurant/*                 — restaurant admin only
/api/waiter/*                     — waiter only
/api/waiter/training              — training videos list
/api/restaurant/training          — upload/manage training videos
```

Key restaurant-admin endpoints added for the HR/L&D expansion:
```
/api/restaurant/kpi[/export]      — composite KPI (test+menu+module+floor weights)
/api/restaurant/waiters/:id/documents        — employee docs (sanitary book, expiry)
/api/restaurant/eval-criteria · /evaluations — floor (practical) evaluation
/api/restaurant/staff-notes                  — 1-on-1 / praise / disciplinary log
/api/restaurant/analytics                    — team weak-standard heatmap + role breakdown
```
Key waiter endpoints:
```
/api/waiter/roleplay/scenarios|message|evaluate  — AI customer roleplay (mentor grades)
/api/waiter/menu-review · /menu-review/:dishId   — spaced repetition (Leitner)
```

### KPI (composite) — `src/services/kpi.js`

Single source of truth for KPI (was duplicated in routes). Level is driven by a **composite
score**, not just the menu test: `test`, `menu learned %`, `module completion %`, and
`floor (practical) eval %`, each with a configurable weight in `kpiSettings`
(`testWeight/menuWeight/moduleWeight/floorWeight`). A component with no data (e.g. no floor
eval yet) is dropped and remaining weights re-normalize — so a weight sits dormant until
data exists. Setting menu/module/floor weights to 0 reverts to test-only.

### Employee roles — `src/data/roles.js`

Waiters have a `role` (ofitsiant/barmen/xostess/oshpaz/kassir/menejer), default `ofitsiant`.
Modules can target roles via `roles[]` (empty = all). Single source shared by server + both
frontends (mirror the list in all three if changed).

### Test System

- Tests only available on designated `testDays`
- Menu hidden from waiters on test days
- 20 questions: 10 easy + 5 medium + 5 hard (randomly selected)
- 30 seconds per question
- One attempt per day per waiter
- Certificate awarded for ≥90% score

### Training Video System (IN PROGRESS)

15 service standard topics, each with:
- Video URL (uploaded to cloud or embedded)
- Uzbek description text
- Topic number and title

Topics:
1. Smenaga chiqish — mas'uliyat
2. Tashqi ko'rinish standartlari
3. Ish vaqtini ro'yxatdan o'tkazish
4. Smenani yopish
5. Standart №1 — Mehmonni 3 soniyada kutib olish
6. Standart №2 — Salomlashish + Tabassum
7. Standart №3 — Mehmonni joylashtirish
8. Standart №4 — Ofitsiantni tanishtirish
9. Standart №5 — Ichimlik taklif qilish
10. Standart №6 — Buyurtma qabul qilish
11. Standart №7 — Qo'shimcha sotuv (Upsell/Cross-sell)
12. Standart №8 — Buyurtmani nazorat qilish
13. Standart №9 — Fikr-mulohaza olish
14. Standart №10 — Hisob-kitob
15. Standart №11 — Xayrlashish skripti

### Image Storage

Images are stored as **Base64 strings directly in MongoDB** (no external storage). Frontend compresses images to max 800px width, JPEG 80% quality before storing. Menu items from external sources (e.g. tarnov.uz CDN) store the URL string directly as the `image` field.

### Waiter Bulk Import

Restaurant admin can upload CSV files with columns `Ism,PIN` (supports both `,` and `;` separators). Template download available.

## Frontend Files

| File | Role |
|------|------|
| `public/index.html` | Login page — 3 tabs for each role (split layout, cyan neon #00D4FF) |
| `public/index-presentation.html` | Presentation/landing page (cream/gold theme, saved separately) |
| `public/super-admin.html` | Super admin dashboard + restaurant CRUD |
| `public/restaurant-admin.html` | Restaurant admin — menu, waiters, questions, calendar, announcements, results |
| `public/waiter.html` | Waiter — menu browsing, test taking, history, certificate, training videos (TODO) |
| `public/js/utils.js` | Shared: `api()`, `apiForm()`, `toast()`, `logout()`, `requireRole()` |
| `public/js/i18n.js` | UZ/RU language toggle — neon green button, smart placement per page |
| `public/css/style.css` | Design system — dark bg #070B0F + cyan neon #00D4FF + glassmorphism + Inter font |

## Design System

```css
:root {
  --bg: #070B0F;
  --card: #0D1117;
  --card2: #111820;
  --neon: #00D4FF;          /* PRIMARY cyan neon */
  --neon-light: #33DDFF;
  --neon-dark: #0099CC;
  --border: #1A2535;
  --text: #E8F4FF;
  --text2: #8BAABF;
  --text3: #4A6070;
  --neon-glow: 0 0 20px rgba(0,212,255,0.4), 0 0 40px rgba(0,212,255,0.15);
}
```

Font: **Inter** (not Outfit, not Playfair Display)
Icons: **Lucide @0.462.0** (pinned version)

## i18n System

- Language key: `restoone_lang` (localStorage)
- Default: Uzbek (`uz`)
- Toggle: neon green button, placed smartly per page context
- MutationObserver watches for dynamic DOM changes

## Credentials

Not stored in this repo. Ask the project owner, or read them from the Render
dashboard / MongoDB Atlas. Local dev values go in `.env` (gitignored).

**MongoDB Atlas IP allowlist is `0.0.0.0/0`** (required for Render's dynamic IPs),
so the database is reachable from anywhere — the password is the only thing
protecting it. Treat it accordingly.

---

## Available Skills (C:\Users\user\.claude\skills)

These skills are installed and available via `/` commands:

### Engineering
- `/cs-backend-review` — Node.js/Express API code review
- `/cs-frontend-review` — HTML/CSS/JS code review
- `/cs-fullstack-review` — Full stack review
- `/focused-fix` — Targeted bug fix
- `/tech-debt` — Technical debt analysis
- `/tdd` — Test-driven development
- `/karpathy-check` — AI/ML code quality check
- `/a11y-audit` — Accessibility audit
- `/slo-design` — Service level objectives

### Product & UX
- `/prd` — Product requirements document
- `/user-story` — User story creation
- `/rice` — Feature prioritization (RICE framework)
- `/operator-audit` — Platform audit

### Project Management
- `/sprint-plan` — Sprint planning
- `/sprint-health` — Sprint health check
- `/retro` — Retrospective
- `/project-health` — Project health check
- `/okr` — OKR creation

### Marketing & Content
- `/cs-aeo` — SEO/AEO optimization
- `/competitive-matrix` — Competitor analysis
- `/seo-auditor` — SEO audit

### Business
- `/saas-health` — SaaS metrics health check
- `/financial-health` — Financial analysis
- `/pipeline` — Sales/business pipeline

### C-Level Advisors
Available in `c-level-advisor/` — CEO, CTO, CFO, CMO personas for strategic advice.

### Wiki & Docs
- `/wiki-init` — Initialize project wiki
- `/wiki-query` — Query project knowledge base
- `/wiki-log` — Log decisions and changes
- `/wiki-ingest` — Ingest documents into wiki

### Orchestration
Multi-agent workflows available in `orchestration/` for complex tasks.

### Marketing Skills (coreyhaines31/marketingskills — 44 skills)
Located in `C:\Users\user\.claude\skills\marketingskills\`

**Conversion & CRO:**
- `cro` — Conversion rate optimization
- `signup` — Signup flow optimization
- `onboarding` — User onboarding
- `popups` / `paywalls` — Popup & paywall strategy
- `ab-testing` — A/B test design

**Content & Copy:**
- `copywriting` — Sales copy
- `copy-editing` — Copy editing
- `cold-email` — Cold email sequences
- `emails` / `sms` — Email & SMS marketing
- `social` — Social media content
- `video` — Video marketing strategy
- `image` — Image/visual marketing

**SEO & Discovery:**
- `seo-audit` — Full SEO audit
- `ai-seo` — AI-powered SEO
- `programmatic-seo` — Programmatic SEO
- `site-architecture` — Site structure
- `competitors` / `competitor-profiling` — Competitor analysis
- `schema` — Schema markup
- `aso` — App store optimization

**Paid Marketing:**
- `ads` — Paid ads strategy
- `ad-creative` — Ad creative writing
- `analytics` — Marketing analytics

**Retention & Growth:**
- `churn-prevention` — Churn reduction
- `referrals` — Referral programs
- `co-marketing` — Partnership marketing
- `free-tools` — Free tool marketing
- `community-marketing` — Community building
- `lead-magnets` — Lead magnet creation

**Strategy:**
- `pricing` — Pricing strategy
- `launch` — Product launch
- `marketing-ideas` — Ideation
- `marketing-psychology` — Psychology-based marketing
- `marketing-plan` — Full marketing plan
- `customer-research` — Customer research
- `content-strategy` — Content strategy
- `public-relations` — PR strategy

**Sales & RevOps:**
- `revops` — Revenue operations
- `sales-enablement` — Sales enablement
- `prospecting` — Lead prospecting
- `directory-submissions` — Directory listings

**Foundation (load first):**
- `product-marketing` — Core product marketing context (required for all other skills)
