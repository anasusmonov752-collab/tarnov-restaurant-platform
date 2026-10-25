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
telefon/email/@username/havolani yashiradi.
**1-bosqich — `6026fbb`..`bcfdbc1` da**: `shortlist.refund` (sabab
`pipeline.REFUND_REASONS`, faqat jurnalda yechilgan bo'lsa +1, hired'dan
yo'q; panelda tugma, mijozga UZ/RU xabar); `credits.move` balans+jurnal
BITTA tranzaksiyada, jurnalda element boshiga bitta reveal/refund
(partial unique indeks); qo'lda ayirish `adjust`; qidiruvda hired va
not_looking chiqmaydi; `services/alert.js` — 500 va unhandledRejection
egasiga Telegramda (`ALERT_CHAT_ID`, bo'lmasa agentlik admin chati;
30 daq/kalit, 20/soat); AI 45 s timeout; Telegram 429 qayta urinish;
rasm havolasida initData o'rniga `utils/photoToken` (12 soat, guard'lar
`X-Photo-Token` sarlavhasida beradi); frameguard o'rniga frame-ancestors;
kunlik shifrlangan zaxira `.github/workflows/backup.yml` (GitHub sirlari
`MONGODB_URI`, `BACKUP_PASSPHRASE` kerak); testlar `npm test` (node:test,
pul oqimi mongodb-memory-server replika to'plamida), CI har push'da,
natija annotatsiyada. `package-lock.json` eskirgan (pdf-parse yo'q) —
CI `npm install` ishlatadi. Qolgani: maosh filtri (maosh matn), Client
tgChatId noyobligi (avval takrorni o'lchash). Keyingi: huquqiy (hh nomzodlari
roziliksiz mijozga ko'rinadi, Gemini bepul tarifi, ma'lumot
lokalizatsiyasi), 2-bosqich (panel sikli: agentlik natija/refund
belgilay olmaydi, tanlov faqat mijozdan, arizalar faqat o'qish, TalentHub
RestoOne restoran tenant'i ichida), 3-bosqich (Telegram qorong'i mavzu,
cold start/retry, chat jonli emas, BackButton chatda yo'q, profil.html
faqat o'zbekcha, yagona token CSS, kontrast, brend).

**TALENTHUB TARNOVDAN AJRATILDI (kod)** (2026-10-22, `dbb3b2a`): Tarnov
paneliga boshqa xodimlar ham kiradi, Rekruting faqat TalentHub uchun, 742
hh nomzodi Tarnov bilan kelishilgan holda TalentHub'ga o'tadi (Anas qarori).
`Restaurant.kind='agency'`; `middleware/agency.js` — rekruting API'lari faqat
agentlikka, O'TISH REJIMI: agentlik yo'q bo'lsa eskicha. Ko'chirish —
super-admin "TalentHub'ni ajratish" (`POST /api/super/agency-split`, reja ->
ko'chirish, takror xavfsiz, bot admin chati ham). Agentlik login ->
`/talenthub.html`. **Ko'chirishni Anas o'zi qiladi** (yangi akkaunt paroli).

**DIZAYN — iOS uslubi, DEPLOY QILINDI** (2026-10-22, `21f535b`..`f219ce6`):
yagona tizim `public/css/th.css` (tizim shrifti — SF Pro'ni ulab bo'lmaydi,
Dynamic Type o'lchamlari, iOS ranglarining KONTRASTLI variantlari, kunduz/tun
`data-theme`). Panel: `js/th-shell.js` (bitta chap menyu, sanoqlar, telefonda
☰), `css/th-app.css` (eski sahifa tokenlari body darajasida yangisiga
bog'lanadi — sahifa CSS'i qayta yozilmagan), "Bugun" `/talenthub.html`
(`GET /api/agency/today`). Mini App/profil/anketa: tokenlar th.css'ga,
`applyTheme()` Telegram colorScheme -> data-theme + setHeaderColor; anonim
kartada lavozim belgisi (`roleIcon`) va ishonch belgilari (`phoneVerified`,
`fromAnketa` — anonymize, faqat ha/yo'q); "Ochish · 1 kredit". `js/uz-date.js`
— brauzerda 'uz' sana formati yo'q (M10 22) — o'zi chiqaradi. Belgi:
`img/talenthub-mark.svg`. Namuna: `docs/dizayn-taklif.html`.

**PANEL ISH OQIMI (2-bosqich) — DEPLOY QILINDI** (2026-10-22, `213d667`..`0172466`):
agentlik natijani o'zi belgilaydi (`POST /api/shortlists/:id/outcome/:cid` —
`setClientState` clientId'siz; suhbat sana bilan, mos kelmadi sabab bilan,
yakuniy qayta o'zgarmaydi); tanlovni paneldan yaratish ("Mijozga taklif",
`POST /api/shortlists`, nomzodlar 'selected', mijozga `nc.proposed`);
arizalar oynasida "Tanlovga qo'shish"/"Rad etish"/"Bazada ochish"
(`POST /api/vacancies/:id/applications/:appId/shortlist|reject`, Mini App
qoidasi bilan bir xil); recruitment `?q=` va publicCode bo'yicha qidiruv;
telefonda: jadvallar kartaga (th-shell `data-label` + th-app.css), Nomzodlarda
bosqich `<select>`, Suhbatlarda "‹ Suhbatlar". `test/workflow.test.js`.
Hali qolgan: nomzodlar bazasi ikki sahifaga bo'lingan (ro'yxat/kanban
birlashtirilmagan), 1000+ sahifalash, o'chirishda ogohlantirish, qo'lda
qo'shishda dublikat tekshiruvi, profil.html ruscha.

**RASM OYNASI VA MIJOZ LOGOTIPI — DEPLOY QILINDI** (2026-10-22, `4492a2a`,
`51b80a8`): `public/js/th-viewer.js` — yagona iOS Photos uslubidagi oyna
(Mini App, profil, panel sahifalari). Sahifaga ulash kifoya: `img[data-zoom]`
yoki src'da `/photo`/`/logo` bo'lgan rasmni o'zi ushlaydi (`data-nozoom` —
chiqarib tashlash). Ikki marta bosish/ikki barmoq — kattalashtirish (asl
o'lchamdan 2x dan oshmaydi), pastga surish/✕/Esc/Telegram "orqaga" — yopish.
miniapp.html BackButton zanjiri: `window.thViewerHostBack = true` va
`onTgBack` boshida `thViewer.consumeBack()`; boshqa sahifada oyna o'zi
boshqaradi. Izohda yopuvchi script tegini yozmang (ichki joylashtirishni
buzadi). Logotip: `Client.logo` (data URL, ≤200 KB, png/jpeg/webp,
`logoAt`), panel Mijozlar → Tahrirlash (brauzerda 256px gacha kichraytiriladi,
darhol saqlanadi); `GET /api/clients/:id/logo` (agentlik),
`GET /api/cand/companies/:id/logo?t=<photoToken>` — faqat kontakt ochilgan
nomzodga. Ro'yxat javobida faqat `hasLogo`, base64 chiqmaydi.
`fc6c080`: nomzod Xabarlar ro'yxati va chat sarlavhasida ham logotip
(`/api/cand/chats` → `hasLogo` faqat ochiq kontaktda). Chat ro'yxati va
sarlavha avatarlari `data-nozoom` — bosish chatni/kartani ochadi, rasm
oynasini emas (aks holda mijoz Mini App'ida nomzod fotosini bossa chat
ochilmasdi). Qadalgan TalentHub — "Yordam chati": quloqchin belgisi
(`AG_IC`), bo'sh chatda salomlashuv (bazaga yozilmaydi, `chat.supportHello`).

**ANKETALAR KONSTRUKTORI — iOS USLUBI, DEPLOY QILINDI** (2026-10-22,
`f4e1721`, `3717bdd`): bo'limlar (`sections()` = `survey.withMeta` qoidasi:
standart savol bo'limni belgilaydi, o'z savoli oldingisinikini oladi),
har savol bitta qator (tur ikonkasi, `*`, kulrang izoh), shart inson
tilida (`condLabel`: ko'p variant tanlangan bo'lsa teskarisi — "«Yo'q»
bo'lmasa"). Anketalar segment tugmalarida, nom/lavozim/faollik
"Sozlamalar"da. AVTOMATIK SAQLASH: o'zgarishdan 0.9 s keyin butun anketa
PUT; holat yopishqoq sarlavhada; shart xatosi bo'lsa yuborilmaydi; server
rad etsa sabab + "Qayta urinish". Saqlangach `CUR`ga tegilmaydi (yozish
davom etishi mumkin). Tartib: sudrash (sichqoncha) + ochiq savolda
Yuqoriga/Pastga (telefon). Tahrir qator ostida — telefon ko'rinishi yonida
qoladi. "Call operator" -> "Call-markaz operatori" (roles.js, i18n, panel);
prod'dagi 4 anketaning lavozim varianti ham Anas roziligi bilan
o'zgartirildi (boshqa hech narsa o'zgarmagani solishtirib tekshirildi).
Variant matnlari BAZADA — roles.js o'zgarsa eski anketalar o'zgarmaydi.

**NOMZODLAR MANBA BO'YICHA IKKI BO'LIM — JONLI TEKSHIRILDI** (2026-10-22,
`daf58c4`..`4a8c3ba`): baza BITTA (dublikat, qidiruv, tanlov hamma bo'yicha),
bo'lim — `recruitment.html?src=anketa` ("Anketadan") va usiz ("hh.uz bazasi",
`source $ne anketa`); kanban ham `?src=`. Anketadan: tepada javob kutmoqda /
ko'rilmagan / shu hafta / boshladi→yubordi (`GET /api/recruitment/sections`),
kartada ko'rilmagan (ko'k), "N kundan beri javobsiz", ishga chiqish, tasdiqlangan
telefon, kanal, "Qo'ng'iroq". Qoida YAGONA — `services/contactLog.js`:
`seenAt` (kartani ochish, `POST /:id/seen`), `firstContactAt` (bosqich
o'zgarishi, guruh amali, Telegram xabari — panel va admin reply,
`POST /:id/contacted`); faqat birinchisi yoziladi; bosqichi 'new' dan boshqa —
ko'rilgan/bog'lanilgan. Yon menyu: `anketaUnseen`, `baseWeek` (/api/agency/today).
`test/sections.test.js`. Jonli: sanoqlar bazaga mos, Aziza "ko'rildi" 1→0.
KESH: CSS/JS endi `Cache-Control: public, no-cache` (304 bilan) — ilgari 1 soat
eski menyu ko'rinardi; panel sahifalarida `?v=2`. CI yiqilgan test tafsilotini
(expected/actual/qator) annotatsiyada beradi.

**VAKANSIYA.UZ SINOVI** (2026-10-22, Anas qarori): Anas o'z "vakansiya.uz"
Telegram kanaliga anketa havolasini tashlab oqimni sinaydi. Kanal kaliti
`vakuz` (`survey.CHANNELS`, havola oynasida birinchi va asosiy; `bd39cd1`,
jonli: `a_HMXT37_vakuz`, vakansiya havolasi 44 belgi). Ro'yxat bo'sh
ko'rinmasligi uchun «Работа в ресторане Уз» (@workinrestaurant) guruhining
22.10 e'lonlaridan 19 restoran "Kutilmoqda" mijoz (izohda manba, qo'shimcha
tel/TG) va 33 ochiq vakansiya yaratildi (ofitsiant 13, oshpaz 12, xostess 3,
kassir 3, barmen 2). Nomzodga restoran nomi ko'rinmaydi (`vac.forCandidate`).
Kunlik to'lov — `conditions` matnida (oylik maosh to'qilmagan). Shubhali
(karaoke/raqqosa), restoran bo'lmagan va kamsituvchi talabli e'lonlar olinmadi.
MODEL: ariza kelsa — 24 soatda nomzodga qo'ng'iroq, tekshirib, restoranga
"birinchi 3 nomzod bepul" bilan chiqish; rozi bo'lsa mijozga 3 sinov krediti
(Mijozlar → Kredit). Nomzodga kontaktdan oldin restoran nomini aytish.

**VAKANSIYA SHABLONI — NOMZOD UCHUN TAVSIF, JONLI** (2026-10-22, `99aa3e9`):
Anas "soxtaga o'xshaydi, hammasi bir xil" dedi. Sabablar: 13 ta "Ofitsiant ·
Toshkentda restoran", kunlik maosh matnda yashirin (maosh qatori 4/33),
sharoit bitta blok, "Bugun tasdiqlangan" asossiz. Yangi ixtiyoriy maydonlar
(`Vacancy`): `venue` (joy tavsifi NOMSIZ), `landmark`, `salaryPeriod`
(month|day|shift — salaryText "… / smena"), `payout` (daily|weekly|twice|
monthly), `perks` (th-i18n PERK_KEYS, + tajribasiz, talaba), `duties`,
`requirements` (bandlar, ≤6), `hook` (e'londagi haqiqiy fakt), `verifiedAt`.
ISHONCH (`forCandidate.trust`): verified — agentlik ish beruvchiga
qo'ng'iroq qilib "Tekshirildi" bosgan (`POST /api/vacancies/:id/verify`),
client — faol mijoz, posted — faqat "Joylandi: N kun oldin". Talab bandlarida
minExp/yosh takrorlanmaydi (jadvalda bor). Nomzod kabineti (profil.html):
karta — sarlavha, joy, maosh/davr, to'lov, 3 belgi, jalb; batafsil —
Vazifalar/Talablar/Ish sharoiti/Afzalliklar. 33 ta import vakansiya qayta
yozildi (maosh 16 tasida — qolganlarida e'londa raqam yo'q edi). Mijoz
Mini App formasi yangi maydonlarni hali bermaydi.

**ARIZA OQIMI — QAYTA QURILDI, JONLI** (2026-10-22, `5406931`..`2fcc5be`):
Anas: "bosdim, hech narsa bo'lmadi". Sabab: kabinet xatoni `alert()` bilan
ko'rsatardi — Telegram ichida chiqmaydi, tugma jimgina qaytardi (bazada 33
yangi vakansiyaga 0 ariza). Eng ehtimolli xato — initData 24 soatdan eskirgan
(guard endi `code:'expired'` qaytaradi). profil.html'da `alert()` QOLMADI —
xato oyna ichida (`fail()`), har biriga yechim tugmasi. Ariza oynasi: profil
tekshiruvi (ism+telefon majburiy), ixtiyoriy xat (`message`), muvaffaqiyat
ekrani 3 qadam bilan. Apply xato kodlari: no_name, no_phone, bad_phone,
closed, duplicate. HAYOT YO'LI — `services/appLife.stepsFor` (saqlanmaydi,
yig'iladi): Application (yuborildi, ko'rib chiqildi — agencySeenAt/seenAt,
HR bog'landi — contactedAt, taklif/rad) + Shortlist elementi (suhbat sanasi,
natija). Nomzodga Telegram: taklif qilindi / rad (yumshoq) — panel ham, mijoz
Mini App ham (`appLife.notify`; 'open' yo'lida reveal() o'zi yozadi).
Panel `/arizalar.html`: hamma vakansiyalar bo'yicha bitta quti
(`GET /api/vacancies/applications/inbox`, tab new/work/done), ko'rilmagan,
"N kundan beri javobsiz", Qo'ng'iroq/Bog'landim (`POST .../applications/:id/
seen|contacted`), taklif, ikki bosqichli rad. Yon menyu: Arizalar
(`appsUnseen`). `test/applications.test.js`. Anas nomzod akkauntidan ariza
berdi — "Arizalarim"da bosqichlar chiqdi (2026-10-22). Xat maydoni Anas
qarori bilan olib tashlandi (ko'k yoqa uchun ortiqcha). Kartani bosish:
mijozda rezyume (`wireCardTap`, tugmalar `CARD_SKIP`), nomzodning arizasida
kompaniya (kontakt ochiq) yoki vakansiya (`72050ee`).

**NOMZODNI USHLAB QOLISH** (2026-10-22, `37b8005`): anketa tugagach nomzod
"Rahmat" ekranida qolmaydi — 2 s da o'zi `profil.html#jobs` (ariza bergan
bo'lsa `#apps`); ekranda "Sizga mos N ta ish" (finish javobida `jobs`,
`matches`, `next` — nomzod kabineti ro'yxati qoidasi bilan bir xil). initData
sahifalar orasida saqlanadi (telegram-web-app.js sessionStorage). Botdagi
rahmat va qaytgan nomzodning `/start` xabari — "💼 Ishlarni ko'rish" /
"👤 Profilim" tugmalari bilan. Chala anketa eslatmasi — pastda.
`test/unit.test.js` endi hamma marshrut faylini yuklaydi (sintaksis xatosi CI'da).
`/start` birinchi xabari (`97ffb4f`, `telegram.js hookText`, HTML): ism bilan
salom, kimmiz, HOZIR nechta ochiq ish va 5 ta asosiy lavozim (bazadan —
kabinet ro'yxati qoidasi), to'rt va'da ("HR 24 soat ichida qo'ng'iroq
qiladi" — jamoa majburiyati), "📝 Anketani boshlash · 3 daqiqa"; vakansiya
havolasida qo'shimcha qator. uz/ru, rus ko'plik shakllari. Nomzodni
Telegramdan uzish — panel Telegram oynasida (`POST /api/recruitment/:id/tg/
unlink`, rezyume qoladi; `abced18`). Farina (hh) test akkauntidan uzildi.

**ANKETA QISQARTIRILDI — PROD'GA YOZILDI** (2026-10-22, Anas qarori): ko'k yoqa
uchun 20–24 savol ko'p edi. To'rtala anketada qoldi: role, experience,
startWhen, shift, salary, fullName, birthDate, phone, location, russian,
photo, consent (+ c_kuxnya oshpazga). Olib tashlandi: lastJob, gender,
english, sanitary, c_sanit, study, c_vaqt, c_bron, c_sex, c_stol, c_kassa
(konstruktorning "Olib tashlangan standart savollar" menyusidan qaytadi).
Nomzod ko'radi: umumiy 12 (oshpaz 13), xostess/ofitsiant 11, oshpaz 12.
(2026-10-23: `experience` o'rnini `lastJob` — ish tajribasi ekrani oldi, soni o'sha.)
Qolgan savollar mazmuni o'zgarishsiz (solishtirildi). Matn "2 daqiqa"
(`a837df7`). Diqqat: `survey.template()` (yangi agentlik/upgrade) hali
eski uzun ro'yxat — kerak bo'lsa shablonni ham qisqartirish.

**ANKETADA ISH TAJRIBASI — PROD'GA YOZILDI** (2026-10-23, `27823c5`..`86084c3`):
Anas: "rezyumeda deyarli hech narsa yo'q, filtr qilib bo'lmaydi". "Qancha
tajribangiz bor?" o'rniga "Qayerda ishlagansiz?" (`lastJob`, tur `work`):
tepada "Tajribam yo'q" almashtirgichi (javob `'none'`), aks holda 1–3 ish joyi
— joy nomi, lavozim, muddat oralig'i (`th-i18n` WORK_ROLES, WORK_DURS:
6 oygacha · 6 oy–1 yil · 1–3 · 3–5 · 5+). Oy/yil, vazifalar, izoh ATAYLAB yo'q
(birinchi variant "juda yuzaki va qiyin" deb rad etildi). Dizayn iOS
Sozlamalari: guruhlangan qatorlar, Lavozim/Muddat pastdan ✓ ro'yxatli oyna
(`openSheet`, Telegram BackButton avval oynani yopadi). Javob ->
`Candidate.workHistory` (company/position/period), `experienceYears` =
oraliqlar PASTKI chegarasi yig'indisi (`DUR_MONTHS`; panelda anketa
nomzodiga "1+ yil"), `experienceSummary`. Eski `experience` savoli
`legacyQuestions()` da (katalog, eski anketalar buzilmaydi). Panel kartasi:
"Ish tajribasi" bloki — ro'yxatda workHistory yo'q, karta ochilganda
`GET /api/recruitment/:id` dan olinadi (hh nomzodlarida ham chiqadi), Smena
qatori, tarix "Qo'shildi · manba", anketa nomzodida AI qatori yo'q.
Prod: 4 anketada `experience` o'rnida `lastJob` (zaxira bilan solishtirildi —
boshqa hech narsa o'zgarmadi). Jonli: fayllar, prod anketalari, hh kartasida
blok. **Telegramda nomzod sifatida HALI TO'LDIRILMAGAN.** Eski anketa
nomzodlarida (oldin to'ldirganlar) workHistory yo'q.

**TARIFLAR VA TO'LOV — DEPLOY QILINDI** (2026-10-23, `cfde213`): Anas bilan
kelishilgan (birinchi 20 restoran uchun, keyin 690k/1.29m/3.99m): Base 499 000 /
14 kun / 10 kontakt, Pro 999 000 / 30 kun / 30, Max 2 999 000 / 30 kun / "cheksiz"
(ichki 100) + shaxsiy HR; bepul sinov 3 kontakt / 7 kun (bir marta). Kafolat:
Base/Pro — kamida 5/15 ta tekshirilgan nomzod, bo'lmasa muddat uzayadi; Max —
oy ichida 1 xodim ishga chiqadi, bo'lmasa keyingi oy bepul; shart: maosh bozor
darajasida, 48 soatda javob, oshpaz/menejer kafolatsiz. Jadval YAGONA —
`src/data/plans.js`. Tarif = kredit (`credits.purchase`) + `Client.plan`
(key/endsAt); qolgan kreditlar yangi tarifga o'tadi, muddat tugaganda yonadi
('expire'), 3 kun oldin eslatma — `billing.tick` soatlik cron ichida (kunduzi).
Buyurtma `Order`; faollashtirish YAGONA — `billing.activate` (takror xavfsiz):
Payme Merchant API (`services/payme.js`, `/api/pay/payme`, Basic Paycom:KEY,
tiyin, 12 soat timeout), Click SHOP API (`services/click.js`,
`/api/pay/click/prepare|complete`, md5 imzo), qo'lda — panel `/tolovlar.html`
yoki botdagi "✅ To'landi" tugmasi (`bo:`). Kalitlar Render env'da:
`PAYME_MERCHANT_ID`, `PAYME_KEY` (`PAYME_TEST=1` sinov kassasi), `CLICK_SERVICE_ID`,
`CLICK_MERCHANT_ID`, `CLICK_SECRET_KEY` — yo'q bo'lsa Mini App faqat "Menejer
orqali" taklif qiladi. **Merchant shartnoma (YaTT/yuridik shaxs) hali YO'Q** —
avtomatik to'lov jonli sinalmagan; endpoint'lar kalitsiz to'g'ri rad etadi.
Mini App: balans oynasida tarif holati, "Tarif tanlash" -> kartalar -> to'lov
usuli. `test/billing.test.js`. Taqdimot va savdo rejasi artifact'larda (Anasda).

**TO'LOV 2-BOSQICH — DEPLOY QILINDI** (2026-10-24, `a163f23`): rasmiy hujjatlar
o'rganildi (developer.help.paycom.uz, docs.click.uz, developer.uzumbank.uz).
Payme: sinov sahifasi `test.paycom.uz`; boshqa faol tranzaksiyali buyurtmaga
Create -31008 (sandbox talabi), CheckPerform -31099; 12 soat Payme `time` dan
(`paymeTime`), GetStatement shu bo'yicha; ichki xato -32400; Cancel state 2 dan
-2 — `billing.refundOrder` (faqat tarif kreditlari ishlatilmagan bo'lsa;
oldingi tarif `Order.prevPlan` dan tiklanadi), aks holda -31007; SetFiscalData
saqlanadi; fiskal `detail` — `PAYME_IKPU`+`PAYME_PACKAGE_CODE` (+`PAYME_VAT`).
Click: tekshirish tartibi rasmiy kutubxonadagidek (-8,-1,-3,-5,-6,-4,-2,-9),
summa ±0.01, havola `/services/pay/?..amount=N.00`. **Uzum Bank Merchant API**
(`services/uzum.js`, `/api/pay/uzum/check|create|confirm|reverse|status`,
Basic `UZUM_LOGIN:UZUM_PASSWORD`, `UZUM_SERVICE_ID`, xato HTTP 400 + errorCode,
confirm 30 daqiqa). Buyurtmada qisqa `code` (8 raqam) — Uzum'da qo'lda yoziladi;
deep link `uzumbank.uz/open-service` RASMIY EMAS (Uzum bilan tasdiqlash).
Yangiliklar: **kafolat avtomatik** (`billing.guaranteeProgress`: davrda kontakti
ochilgan yoki candidate_ok nomzodlar, Max — hired; bajarilmasa `tick` muddatni
bir marta `plan.days` ga uzaytiradi, `bill.extended`); **kam balans** (reveal
dan keyin ≤2 — botda Pro taklifi `?open=plans`, davrda bir marta `plan.lowAt`);
faol tarifda yangilash muddat OXIRIDAN; **avto-yangilash** (`paymeSubscribe.js`:
karta Mini App'da to'g'ridan-to'g'ri Payme'da tokenlanadi, server cards.check,
1 kun oldin receipts.create+pay, tarifni Merchant API yoqadi; kafolat
bajarilmagan bo'lsa yechilmaydi; `PAYME_SUBSCRIBE=1`); **hisob-faktura**
(provider `invoice`, kompaniya+STIR); **oferta** `/oferta.html` (uz/ru, LOYIHA —
rekvizitlar `[ ]`, yuristga ko'rsatish kerak); **tavsiya** (`Client.referralCode`,
`ref_<kod>` botda kutilmoqda mijoz yaratadi, birinchi to'lovda ikkalasiga +3).
Mini App `alert()` -> `showMsg` (TG.showAlert). `test/billing-extra.test.js`.
Jonli: endpoint'lar kalitsiz to'g'ri rad etadi, oynalar soxta ma'lumot bilan
tekshirildi. Merchant shartnoma bo'lmagani uchun haqiqiy to'lov HALI SINALMAGAN.
**SERVICE WORKER**: `sw.js` (RestoOne PWA, panel sahifalari `utils.js` orqali
o'rnatadi, scope `/`) JS/CSS'ni "avval kesh" berardi — deploydan keyin ?v=
o'zgarmagan skript abadiy eski qolardi. Endi JS/CSS tarmoqdan (v6 kesh).

**KARTAGA O'TKAZMA — DEPLOY QILINDI** (2026-10-25, `29fd1f6`, Anas qarori: merchant
shartnomasigacha yarim avtomat). Qoida YAGONA — `services/cardPay.js`. Rekvizit
`Restaurant.payCard` (panel To'lovlar -> "Kartaga o'tkazma", Luhn ogohlantirish,
o'zgarsa admin chatiga xabar). Mijoz: tarif -> "Kartaga o'tkazma" -> karta, aniq
summa, nusxa tugmalari, buyurtma №, ixtiyoriy "kimning kartasidan" -> "To'ladim"
(`claimedAt`) -> "Tekshirilmoqda" (5 s da o'zi yangilanadi) -> "Tasdiqlandi". Botga
ham rekvizit xabari (HTML, <code> — bosib nusxa) va "✅ To'ladim" (`pc:`). Agentlikka
botda "✅ Pul tushdi — yoqish" (`bo:` -> billing.activate) / "❌ Tushmadi" (`bx:` ->
reject, mijozga xabar, qayta "To'ladim" mumkin). Bir tarifga ikkinchi buyurtma
ochilmaydi. `billing.tick`: 3 soat "To'ladim" yo'q -> mijozga eslatma, 72 soat ->
bekor, "To'ladim" 2 soat tasdiqlanmasa -> agentlikka eslatma. Yon menyu sanog'i
faqat "To'ladim" bosilganlarni oladi. `test/cardpay.test.js`. Jonli: oynalar soxta
ma'lumot bilan tekshirildi; HAQIQIY karta hali kiritilmagan (Anas panelda kiritadi).
CI: yiqilgan test fayli bloki "Yiqilgan fayl tafsiloti" annotatsiyasida (sintaksis
xatosi ham ko'rinadi).

**MINI APP "HISOB" BO'LIMI — DEPLOY QILINDI** (2026-10-25, `d57c2f7`, Anas: "balans,
tariflar, to'lov juda yuzaki"). Pastki menyuda 5-tab `tHS` (Lucide wallet), `loadAccount`/
`renderAccount`: balans kartasi (kontakt soni, tarif, muddat chizig'i — 3 kun qolsa sariq),
kutilayotgan to'lov/avto-yangilash xatosi bannerlari, kafolat halqasi, bepul sinov,
tariflar (segment Base/Pro/Max + batafsil: narx, kontakt narxi, 3 ko'rsatkich, imkoniyatlar),
ro'yxat (avto-yangilash, tavsiya, oferta, yordam), Tarix (To'lovlar | Kreditlar). Hisobda
tepadagi `.chead` yashiriladi (`#cabMode.on-hs`). `showCredits`/`showPlans` endi shu
bo'limga olib boradi. To'lov — `choosePay`: buyurtma xulosasi (muddat oralig'i — faol
tarif oxiridan, balans X -> Y, kafolat, jami), to'lov usuli radio ro'yxati, oferta roziligi,
yopishqoq "To'lash". `/api/ma/plans` endi `history` (oxirgi 20 buyurtma, holati bilan) va
`current.startedAt` beradi. Ikonkalar `AIC` (`IC` band — bir nom ikki marta e'lon qilinsa
butun Mini App oq ekran bo'ladi). Lokal ko'rib chiqish: `.preview/` (git'ga kirmaydi:
`.git/info/exclude`) + `.claude/launch.json` "preview-static" (PowerShell HttpListener,
public/ ni beradi, `/__p/` — soxta API bilan sahifa).

**ANKETA C VARIANT + TALABA + NOMZOD KABINETI TUZATISHLARI** (2026-10-23,
`4addf87`..`6689dea`): ish tajribasi ekrani — REZYUME KARTALARI (Anas uchta
variantdan C'ni tanladi): bo'sh holatda "Ish joyi qo'shish" (pastki tugma) va
"Hali tajribam yo'q" havolasi; qo'shish/tahrir pastdan oynada 3 bosqich (joy ->
lavozim (emoji) -> muddat), matn bosqichida oyna butun ekran (iOS'da
klaviatura ko'tarish kodi oynani tepaga chiqarib yuborardi — olib tashlandi).
"Talabamisiz?" (study: Kunduzgi/Kechki ta'lim/Masofaviy/Yo'q) shablonda smena
o'rnida, `STUDY_SHIFT` bilan smena javobdan yoziladi; shift `legacyQuestions`da.
Prod: 4 anketada `shift` o'rnida `study` (zaxira bilan solishtirildi — boshqa hech narsa
o'zgarmadi). Ko'chirish jonli ishladi: 3 anketa nomzodiga `experienceMonths` yozildi.
BARCHA SAVOLLAR MAJBURIY (Anas, 2026-10-23): prod'dagi 4 anketada rasm (3 tasida) va
oshpazda rus tili ham majburiy qilindi, shablon ham (jins — ixtiyoriy, anketalarda yo'q).
Rasm majburiyligi tugatishni kamaytirishi mumkin — anketa statistikasida (`dropAt`) kuzatish.
`Candidate.experienceMonths` — 0 yil, lekin 6–12 oy ishlagan "Tajribasiz" bo'lib
chiqardi (mijoz kartasi, profil); eski anketa nomzodlari server ishga tushganda
`services/migrations.js` bilan to'ldiriladi. Panel kartasi: anketa nomzodida
rezyume maydonlari (email, ko'nikma, fayl) yo'q — "Anketa javoblari" rawText'dan
(`ankAnswers`, standart savollarga qisqa nom). Nomzod kabineti: Tajriba
(`expText`), Smena yozuvi (xom kalit emas), "O'zingiz haqingizda" anketa tizim
matnini ko'rsatmaydi (`autoSummary`), ishlar ro'yxatida qidiruv va filtr
(Hammasi / Sizga mos / lavozim), pastki menyuda o'qilmaganlar SONI (ikkala
Mini App), qadalgan "TalentHub" chatida o'qilmaganlar (`Candidate.supportSeenAt`,
`chat.supportUnread`).

**ADMIN TEST REJIMI — DEPLOY QILINDI** (2026-10-23, `0252539`..`126903c`):
botda `/test` (faqat agentlik admin chati — `Restaurant.telegram.adminChatId`):
👔 Mijoz · 👤 Nomzod · 🛠 Admin · 🔄 Anketani qaytadan (callback `tm:`).
Qoida YAGONA — `services/testMode.js`, holat `TestMode` (rejim, sinov mijozi/
nomzodi, test rejimidan oldingi ulanishlar `saved`). Bot va Mini App'lar odamni
FAQAT tgChatId bo'yicha taniydi — rejim almashganda sinov yozuvi akkauntga
ULANADI, boshqalari uziladi (mavjud kod o'zgarmagan); admin rejimida oldingi
ulanishlar tiklanadi. Test rejimida (mijoz/nomzod) admin chati tarmog'i
chetlab o'tiladi (admin reply faqat admin rejimida). Sinov mijozi — «🧪 Sinov
restoran» (`Client.isTest`, kredit 2 dan kam bo'lsa 5 gacha `credits.bonus`
bilan). Sinov nomzodi — test rejimida to'ldirilgan anketadan
(`SurveyResponse.isTest` -> `Candidate.isTest`; telefon bo'yicha haqiqiy profilga
ulanmaydi). "Anketani qaytadan": shu akkaunt SurveyResponse'lari o'chadi, sinov
nomzodi uziladi (panelda "🧪 SINOV" bo'lib qoladi), keyingi /start — yangi odam.
HIMOYA: `shortlist.reveal` — sinov mijozi faqat sinov nomzodini ochadi (holat va
kreditdan OLDIN); `candidateSearch` — sinov nomzodi faqat `includeTest`
(sinov mijozi / sinov vakansiyasi) qidiruvida; `Vacancy` pre-validate hook —
sinov mijozining vakansiyasi `isTest`, haqiqiy nomzodlarga ko'rinmaydi;
"Bugun", "Anketadan", anketa statistikasi, arizalar sanog'i, ochiq ishlar soni
sinov yozuvlarini hisoblamaydi. `test/testmode.test.js`. Jonli: deploy'dan
oldin va keyin sanoqlar bir xil, webhook sog'. **Telegramda /test HALI
BOSILMAGAN** (Anas sinaydi).

**CHALA ANKETA ESLATMASI — JONLI ISHLADI** (2026-10-23, `85cfbdb`): botda
/start bosib anketani ochmagan yoki yarmida qoldirganlarga bot yozadi.
Qoida YAGONA — `services/reminders.js`: faqat `started`, 7 kundan yangi;
1-eslatma 2 soatdan keyin, 2-(oxirgi) 22 soatdan keyin, keyin jim; tunda
emas (Toshkent 22:00–09:00); shu Telegram nomzodga/mijozga ulangan yoki
boshqa anketani tugatgan bo'lsa — yozilmaydi; 403 (bloklagan) ->
`remindStop`. Matn ikki xil (ochmagan / yarmida — "Davom ettirish",
javoblar saqlangan), tugma `anketa.html?r=<id>`. Chaqiruvchi —
`.github/workflows/reminders.yml` (soatlik :20, qo'lda ham) ->
`POST /api/cron/reminders`, sarlavha `X-Cron-Secret` = Render va GitHub'dagi
`CRON_SECRET` (ikkalasi BIR XIL; Render'da Environment Variables, Secret
Files EMAS). `{dry:true}` — kimga ketishini ko'rsatadi. Logda faqat sonlar.
Jonli: birinchi ishga tushishda 7/7 yuborildi (6 ochmagan, 1 yarmida),
qayta tekshiruvda navbat 0. `test/reminders.test.js`.

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
| `ALERT_CHAT_ID` | Optional Telegram chat for server error alerts (default: agency admin chat) |
| `AI_TIMEOUT_MS` | Optional AI call timeout, default 45000 |
| `PAYME_MERCHANT_ID`, `PAYME_KEY` | Payme kassa (merchant shartnomadan keyin); `PAYME_TEST=1` — sinov kassasi |
| `CLICK_SERVICE_ID`, `CLICK_MERCHANT_ID`, `CLICK_SECRET_KEY` | Click SHOP API |
| `CRON_SECRET` | Shared secret for `/api/cron/*` (GitHub Actions reminders job); same value in GitHub Actions secrets |

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
