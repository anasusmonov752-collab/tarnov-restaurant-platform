# TalentHub — qurilgan ishlar tarixi

CLAUDE.md dan 2026-11-19 da ko'chirildi (matn o'zgarmagan). Har bo'lim: nima qurildi, nima uchun, qaysi commit, jonli tekshirildimi.
Qidirish: `grep -n "<servis yoki kalit so'z>" docs/tarix.md`.

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

**YAGONA DIZAYN v2 — DEPLOY QILINDI** (2026-10-26, `1fe4cf2`, Anas: "Hisob dizayni
yoqdi, hamma qismi shunday bo'lsin, tepadagi balans kerak emas"). miniapp.html: `.chead`
(balans qatori) OLIB TASHLANDI — o'rniga katta sarlavha `.lt` (restoran nomi + bo'lim
nomi `ltTitle`, Vakansiyada "+ Yangi" `ltAct` -> `bNewV`); balans faqat Hisob bo'limida.
Har uch sahifa (miniapp, profil, anketa) `<style>` oxirida "YAGONA DIZAYN v2" bloki —
oldingi qoidalar ustidan yozadi: 18px chegarasiz kartalar, kapsula chiplar (`--th-*-soft`),
to'ldirilgan tugmalar (`--th-fill`), KPI plitkalar, guruhlangan suhbatlar ro'yxati,
pastdan oyna (tutqich, yumaloq ✕). Nomzod profili — gradient karta (Hisob balansi bilan bir
xil), Ish o'rinlari/Arizalarim/Xabarlar katta sarlavhali. Yangi komponent qo'shsangiz —
shu blokdagi tokenlar bilan.

**NOMZOD PROFILI KARTASI RANGI — DEPLOY QILINDI** (2026-10-26, `7bd2810`): nomzod kartasi
rangini o'zi tanlaydi — 8 ta BOSIQ rang (To'q ko'k, Grafit, Zumrad, Dengiz, Bordo, Siyohrang,
Chang-pushti, Bronza), `services/profileStyle.js`, `PATCH /api/cand/style`,
`Candidate.profileStyle`. Boshlang'ich rang — Telegram profil rangidan (`tg.getChat` ->
`profile_accent_color_id`, eng yaqin bosiq rangga), bo'lmasa to'q ko'k. Jinsga qarab avtomatik
rang YO'Q (Anas taklif qildi, rad etildi: jins noma'lum, kamsitish xavfi). Birinchi variant (16
yorqin gradient + emoji naqsh + oltin rozetka) Anas: "juda bachkana, professional emas" —
olib tashlandi. Tasdiq belgisi — oq doira ichida ✓ (`phoneVerified`). Faqat o'z kabinetida.

**VAKANSIYA — TO'LIQ EKRAN SAHIFA, DEPLOY QILINDI** (2026-10-26, `6a8b114` nomzod,
`d313d17` mijoz): pastdan oyna o'rniga o'ngdan suriladigan sahifa (`.vp`, z-index 65 —
suhbat 60 va oyna 70 orasida). Nomzod (`profil.html showJob`): sarlavha, joy, maosh, shartlar
plitkalarda, Vazifalar/Talablar, "Ariza berish" doim pastda, Ulashish ->
`t.me/<bot>?start=v_<id>_ref` (`/api/cand/me` endi `bot` beradi), `profil.html#v=<id>`
havolasi. Mijoz (`miniapp.html showVacancy`, `#vx`): holat, voronka, arizalar, nomzodlar,
shartlar, ⋯ menyu, pastda "Mos nomzodlarni ko'rish"; qidiruvga o'tilsa sahifa ochiq qoladi
(`vp-lock` vaqtincha olinadi, `backToCab` qaytaradi). Telegram "Orqaga": oyna -> qidiruv
kartasi -> vakansiya sahifasi (`onTgBack`, `syncBack`).

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

**MIJOZ VAKANSIYA FORMASI, NOMZOD KABINETI RUSCHA, JONLI CHAT — DEPLOY
QILINDI** (2026-11-03, `8ce0030`..`368caac`, CI 83/83):
- Mijoz Mini App vakansiya formasi panel bilan teng: maosh davri, to'lov
  tartibi, afzalliklar (bosiladigan belgilar `.pk`), joy, mo'ljal, asosiy
  afzallik, vazifalar, talablar; vakansiya sahifasi ularni ko'rsatadi.
- Nomzod kabineti (profil.html) uz/ru: matn lug'atda `cb.*` (statik HTML —
  `data-t`/`data-tph`/`data-tal`, `applyStatic()`), profil oxirida "Til"
  UZ | RU -> `PATCH /api/cand/me {lang}`. Server (`routes/candidate.js`):
  miniapp.js kabi til middleware + `errText`, guard `Candidate.lang` va
  `Candidate.tgLang` (Telegram tili, bot xabarlari uchun). `vac.forCandidate(v,
  cl, lang)` — sarlavha (avtomatik bo'lsa), maosh, to'lov, afzalliklar, joy;
  `appLife.stepsFor(a, item, lang)` va `notify` (`al.*`, `resolve(lang, tgLang)`).
  Qo'lda yozilgan erkin matn (venue, hook, vazifalar) yozilgan tilida qoladi.
  Hali o'zbekcha: nomzod boti (/start dan tashqari), anketa matnlaridan
  tashqari tizim xabarlari, AI xulosalari.
- Chat jonli: Mini App'ga server push qila olmaydi — ochiq suhbat 4 s,
  ro'yxat 12 s, o'qilmaganlar 30 s (`liveTick`), fonda to'xtaydi;
  `MSG_SIG` — o'zgarmasa qayta chizilmaydi, yuqoriga aylantirilgan bo'lsa
  joyida qoladi. Ikkala faylda bir xil — birini o'zgartirsangiz ikkinchisini ham.
- Telegramda haqiqiy akkaunt bilan HALI SINALMAGAN.

**SUHBATNI AVTOMATIK KELISHISH — DEPLOY QILINDI** (2026-11-08, `a63f94f`..`1f2b6f4`,
CI 94/94). Hook: "suhbatga kelmagan nomzod uchun pul to'lamaysiz". Qoida YAGONA —
`services/interviews.js`, yozuv `Interview` (status offered/scheduled/confirmed/done/
declined/expired/noshow/conflict/cancelled). Mijoz Mini App kartasida "Suhbat" qadami
-> `ivSheet`: "Nomzod tanlasin" (kunlar + soat oralig'i -> `Client.ivPrefs`, keyingi
safar saqlanadi) yoki "Aniq vaqt"; manzil. Nomzodga botda 3 kun × 4 vaqtgacha tugma
(`makeSlots`: hozirdan 3 soat keyin, shu mijozning band vaqtlari ±30 daq chiqariladi),
tanlasa tanlov elementi `interview` + `interviewAt` (`markItem`). Eslatma: 24 soat oldin
(kamida 25 soat oldin belgilangan bo'lsa) va 2 soat oldin "✅ Boraman / ❌ Bora olmayman",
"🚶 Yo'ldaman" — mijozga xabar; 30 daqiqa qolib tasdiqlamasa mijozga ogohlantirish.
Suhbatdan 1 soat keyin ikki tomondan "keldimi?" (mijoz javob bermasa 20 soatdan keyin
bir marta qayta). "Keldi" -> "Ishga olasizmi?" (hired / o'ylayapman / not_fit sabab bilan).
KREDIT QAYTADI (`shortlist.refund`, yangi sabab `no_show`): nomzod "umuman bormayman",
24 soatda vaqt tanlamadi, mijoz "kelmadi" yoki nomzod "bormadim". Mijoz "kelmadi" +
nomzod "bordim" -> `conflict`, kredit qaytmaydi, agentlik admin chatiga ⚠️. Har qaytish
admin chatiga ↩️ (suiiste'molni ko'rish uchun). Bot tugmalari `iv:<amal>:<id>[:<arg>]`
(`CB_RE`, amal harf+raqam — `h1`), faqat egasining chatidan. Nomzod Telegramda bo'lmasa
(hh) — eski qo'lda sana. Rejali qism `tick()`: server ichida HAR 2 DAQIQA (server.js
`setInterval` — GitHub cron 34 daqiqagacha kechikadi, "2 soat oldin"ga yaramaydi; server
UptimeRobot bilan uyg'oq) + `/api/cron/reminders` zaxira; har xabar oldidan bayroq atomik.
Mini App kartada holat qatori (`ivLine`, emoji'siz), "Keldi / Kelmadi" (`POST
/api/ma/interviews/:id/outcome`), faol suhbatni "Boshqa vaqt" / "Bekor qilish".
`test/interviews.test.js`. **Telegramda HALI SINALMAGAN** — to'liq sinov uchun IKKI
akkaunt kerak (mijoz va nomzod bir vaqtda ulangan bo'lishi kerak; /test bitta akkauntda
faqat bittasini ulaydi).

**ARIZADAN KEYIN BOTDA TEKSHIRUV + MOSLIK BALI — DEPLOY QILINDI** (2026-11-09,
`50922de`, CI 102/102). HR har arizachiga qo'ng'iroq qilmasin. `services/prescreen.js`:
`applications.submit` dan keyin (Telegramdagi nomzodga) botda savollar — shartlar (joy,
smena, maosh) mosmi (✅ / 💬 maosh / ❌ -> sababi: maosh/joy uzoq/smena/boshqa, keyin
tugaydi), qachondan chiqadi (anketada `availableFrom` bo'lsa so'ralmaydi — `startPre`,
raqamlash "1/2"), yo'l qancha (30/60/90/bilmayman), ixtiyoriy 20-30 s OVOZLI TANISHUV
(nomzod chatidagi ovozli xabar `takeVoice` bilan oxirgi savoldagi arizaga yoziladi,
48 soat). Javoblar `Application.screen`; tugmalar `ps:<f|w|s|c|v>:<appId>:<qiymat>`,
faqat egasining chatidan; 3 soatda javob bermasa bitta eslatma (kunduzi, server
taymeri). MOSLIK BALI `services/matchScore.js` — SAQLANMAYDI, har ko'rsatishda: lavozim
25, tajriba 20, maosh 15 (`parseMoney` "4-5 mln" -> 4 000 000, faqat oylik vakansiya),
yo'l/tuman 10, smena 10, qachondan 10, shartlarga roziligi 10; AI yo'q, jins/yosh
ATAYLAB yo'q. Mijoz Mini App: arizada "86% mos" (yashil ≥75), 4 tagacha sabab
(yashil/qizil), "Bot savollariga javob kutilmoqda", "Ovozli tanishuv · 0:27" — ovoz
mijozning TELEGRAM CHATIGA yuboriladi (`POST /api/ma/applications/:id/voice`, sendVoice
file_id bilan; OGG iOS Mini App'da ishonchsiz). Qaror qilinmagan arizalar ball bo'yicha
tepada (`appOrder`). Panel `arizalar.html`da ball HALI yo'q. `test/prescreen.test.js`.
**Telegramda HALI SINALMAGAN.**

**VAKANSIYA KANALGA O'ZI CHIQADI + MOS NOMZODLARGA XABAR — DEPLOY QILINDI** (2026-11-09,
`31b5afc`, CI 109/109). `services/jobPost.js`. Kanal — `Restaurant.telegram.jobChannel`
(panel Vakansiyalar -> "Kanal": "@kanal" / t.me havola; saqlashda bot huquqi
tekshiriladi — `getChatMember`, kanalda "Xabar joylash" huquqli ADMIN bo'lishi shart),
zaxira `JOB_CHANNEL` env. Server taymeri (`tick`, 2 daqiqa): ochiq + listed + sinov emas
+ hali joylanmagan + `createdAt`/`confirmedAt` >= `jobChannelSince` (kanal ulangan payt —
eski vakansiyalar o'zi chiqmaydi, panelda "Kanalga joylash") vakansiyani kunduzi
(09–21), tick'da 3 tagacha HTML post qiladi: sarlavha, joy tavsifi, 📍/💰/🕒/✅, jalb,
vazifa/talab 3 tadan, RESTORAN NOMISIZ, tugma `t.me/<bot>?start=v_<uuid>_vakuz` (anketa ->
ariza shu vakansiyaga). `Vacancy.channelPost` {chatId, messageId, url, postedAt, closedAt};
yopilsa yoki listed=false — postga "❌ YOPILDI", tugma olinadi (kechasi ham). Joylanganda
`alertCandidates`: Telegramdagi, jobStatus≠not_looking, `jobAlertsOff`≠true, sinov emas,
shu lavozim (`guessRole` ruscha ham), ariza bermagan, `jobAlertAt` 20 soatdan eski,
`matchScore` >= 55 — eng moslari 40 tagacha, "💼 Sizga mos ish" + profil.html#v= +
"🔕 kerak emas" (`ja:off`). Mijozga "kanalga chiqdi, N ta nomzodga yozildi" (havola bilan);
Mini App vakansiya sahifasida "Kanalda e'lon qilingan · Ko'rish ›". `test/jobpost.test.js`.
**Kanal hali ULANMAGAN** — Anas botni kanalga admin qilib, panelda "Kanal"ni saqlashi kerak.

**ISHGA OLINGANDAN KEYIN KUZATUV + KAFOLAT + ISHONCHLILIK — DEPLOY QILINDI** (2026-11-09,
`cce312f`, CI 116/116). `services/placements.js`, yozuv `Placement` — `shortlist.setClientState`
'hired' bo'lganda yaratiladi (Mini App, bot "Ha, olaman", panel natijasi — hammasi shu
nuqtadan). Server taymeri: 1-, 7-, 30-kunda (10:00–20:00) mijozga "ishga chiqdimi / hali
ishlayaptimi?" (✅/❌), nomzodga "ish qanday?" (👍 / 😐 muammo bor — agentlik admin chatiga
⚠️ telefon bilan, bir marta / ❌ ketdim). Faqat joriy bosqich so'raladi (eskisi o'tkazib
yuboriladi); 33 kundan o'tib ketmaganlar — `done`. 30 KUN ICHIDA KETSA — KAFOLAT
(`markLeft`): vakansiya qayta ochiladi (open, listed, `channelPost` tozalanadi — jobPost
yangi post qiladi va mos nomzodlarga yozadi), mijozga +1 kredit (`credits.bonus`, "keyingi
kontakt bepul"), nomzod `jobStatus` yana 'active'; agentlikka 🛡. O'chirish —
`REPLACE_GUARANTEE=0` env. ANAS TASDIQLADI (2026-11-09): +1 kredit qoladi, HAMMA tariflarda;
oshpaz va menejer — kreditsiz (oferta 5-band), faqat vakansiya qayta ochiladi (`pl.reopened`).
Hisob bo'limida har tarifda `pl.fReplace`, oferta 5-bandida umumiy band (uz/ru). ISHONCHLILIK `services/reliability.js` (saqlanmaydi):
suhbatlar done/(done+noshow) — oldindan "bormayman" hisobga olinmaydi; ishda 30+ kun
qolgan. Mijoz anonim kartalarida (qidiruv, arizalar, tanlov, rezyume) "3/3 suhbatga
kelgan", "Oldingi ishda 1+ oy". Mini App ishga olingan kartada `plLine` ("Ishlayapti ·
7-kun", "Ketdi · kafolat: o'rniga qidirilmoqda"). `test/placements.test.js`.

**OVOZLI REZYUME + AI OVOZI — DEPLOY QILINDI** (2026-11-10, `e902f80`, `71f25ca`, CI 122/122):
botda anketa yonida "🎤 Ovoz bilan" (`vi:go`). Qoida YAGONA — `services/voiceIntake.js`, holat
anketaning o'zi (`SurveyResponse.mode:'voice'`, `vstep` consent -> wait -> review -> chase):
rozilik -> 9 savollik shablon (`vi.template`) -> nomzod gapiradi -> Gemini JSON (`VOICE_SCHEMA`)
-> javoblar anketa maydonlariga `survey.checkAnswer` orqali (noto'g'risi tashlanadi, variantlar
`{key, uz, ru}`) -> tasdiq -> yetishmaganini (rasm, telefon, variantli savollar) bot bittadan
so'raydi -> `survey.finalize` (anketa bilan BITTA qoida: dublikat, telefon tasdig'i, ariza).
Nomzodda `voiceIntro{fileId,dur}`, `prefersVoice`; mijoz rezyumeda "Ovozli rezyume" — Telegram
chatiga yuboriladi (`POST /api/ma/candidates/:id/voice`, faqat `clientKnows`). AI rekruter: nomzod
ovozi matnga aylanib agentga boradi; `prefersVoice` bo'lsa javob ovoz bilan (`services/tts.js`,
Aisha TTS `back.aisha.group`, `AISHA_API_KEY` bo'lmasa o'chiq, `AI_VOICE=0` — o'chirish; WAV ->
OGG ffmpeg-static). Thanks/agentlik xabari — `services/anketaDone.js` (anketa va ovoz uchun bitta).
Mijozning ovozli vakansiyasi QURILMAGAN (Anas: hozircha kerak emas). `test/voiceintake.test.js`.
KALIT (2026-11-10, `3beed7b`): Aisha kalitini endi VoiceLab beradi (voicelab.uz -> Разработчик ->
Ключи API, `vlk_...`) — BOSHQA API: `api.voicelab.uz/v1/tts`, Bearer, JSON, `voice_id` `/v1/voices`
dan (yoki env `VOICELAB_VOICE_UZ`/`_RU`), 202 bo'lsa navbat kutiladi; prefiks bo'yicha tanlanadi.
Kalit ruxsatlari: Преобразование текста в речь — Доступ, Голоса — Читать (boshqasi kerak emas;
faqat "Писать" bilan 403 insufficient_scope). Kalit Render RestoPro xizmatida `AISHA_API_KEY`.
Server ishga tushganda `tts.selfCheck` — Render Logs'da `[TTS] tayyor` / `[TTS] ISHLAMAYAPTI`.
Ovoz NOMI bo'yicha tanlanadi (`PREFER`: uz Gulnoza/Sardor/Lola, ru Alina/Vera; env
`VOICELAB_VOICE_UZ`/`_RU` — nom yoki id) — katalogdagi birinchi ovoz aksentli edi (Anas). JONLI: o'zbekcha sintez + OGG ishladi. Ruscha ovoz va Telegramdagi ovozli javob HALI SINALMAGAN.

**O'SISH FUNKSIYALARI — DEPLOY QILINDI** (2026-11-10, `9bcc29e`):
- MAOSH TAHLILI `services/market.js`: nomzodlar kutgan maosh (`parseMoney`, 1–50 mln) va ochiq
  oylik takliflar medianasi/p25/p75, 100 mingga yaxlitlanadi, KAMIDA 5 yozuv (bo'lmasa null —
  bitta odam maoshi ochilmasin), sinov yozuvlari yo'q. `advise`: low ≤ −15%, high ≥ +20%. Mini App
  vakansiya formasi va sahifasida `marketHint` (`GET /api/ma/market`). Ochiq sahifa `/maosh.html`
  (`GET /api/public/market`, agentlik — standart anketa egasi, 10 daq kesh) — sotuv uchun;
  restoran tugmasi `?start=emp_<manba>` -> botda "kutilmoqda" mijoz + admin xabari (`employerStart`).
- ISH BERUVCHI REYTINGI `services/employerRating.js`: 7/30-kun "ishlayapti" javobidan keyin
  xodimdan "maosh va shartlar va'da qilinganidek?" (`pl:py|pq|pn`, `Placement.payOk`); "yo'q" —
  agentlikka 🚩. Belgi (kamida 1 "ha", 0 "yo'q") nomzod kabinetida (`employerOk`) va kanal postida.
- DO'ST TAKLIFI: nomzod kodi `Candidate.refCode` (`/api/cand/me` yaratadi), havola
  `?start=f_<kod>` -> anketa `channel:'ref'`, `SurveyResponse.refBy` -> faqat YANGI nomzodga
  `referredBy`. Do'sti 30 kun ishlasa (`placements.tick` -> `rewardReferrer`, bir marta) — taklif
  qilganga xabar, agentlikka "N so'm to'lang" (`REFERRAL_REWARD`, standart 50 000; QO'LDA to'lanadi).
- BIRINCHI KUN PAKETI `services/onboard.js`: `placements.create` da xodimga `Client.onboard`
  (manzil — bo'sh bo'lsa suhbat/restoran manzili, vaqt, kim kutib oladi, kiyim, hujjatlar) va
  5 savollik standartlar testi (`data/onboardQuiz.js`, zal/oshxona; `ob:s|a`, javob atomik
  `quizStep`), natija mijozga. Mini App: Hisob -> "Birinchi ish kuni" (`GET/PUT /api/ma/onboard`).
- SMENA BOZORI (beta, BEPUL — kredit yechilmaydi) `services/shifts.js`, model `Shift`: Mini App
  Hisob -> "Smena bozori" -> e'lon (lavozim, sana, vaqt Toshkent, tungi smena ertasiga, 50k+ to'lov,
  1–10 kishi) -> mos nomzodlarga bot (shu tumandagi oldin, ko'pi 40, nomzodga 6 soatda bitta taklif,
  hired/not_looking/`shiftOptOut`/sinov yo'q; restoran nomi band qilguncha ko'rinmaydi) -> "✅ Olaman"
  atomik (`bookedN < slots`) -> mijozga ism+telefon, nomzodga manzil+telefon -> nomzod 2 soatgacha
  bekor qila oladi -> 2 soat oldin eslatma -> tugagach mijozdan "keldi/kelmadi" (bot yoki Mini App,
  `mark`), kelmadi — agentlikka 🚩. Natija `reliability` ga qo'shiladi ("N/M suhbat va smenaga kelgan").
  Nomzod kabinetida smenalar ro'yxati YO'Q — faqat bot.
`test/growth.test.js`. **Telegramda HALI SINALMAGAN.**

**NOMZOD KABINETIDA ISH TAJRIBASI VA FOTO TAHRIRI — DEPLOY QILINDI** (2026-11-13,
`ff898b5`, CI 143/143):
anketani eski shaklda to'ldirganlar va hh nomzodlarida ish tarixini kabinetdan
to'ldirib bo'lmasdi — filtr uchun ma'lumot yo'q edi. Profilim → "Ish tarixi" →
Tahrirlash: anketadagi rezyume kartalari oynasi (joy → lavozim → muddat, uch
qadam BITTA pastki oynada almashadi; Telegram "orqaga" avval qadamni qaytaradi,
keyin oynani yopadi), "Hali tajribam yo'q", qatorni o'chirish. QOIDA YAGONA —
`services/survey.js`: `cleanWork` (tekshirish) → `workSet` (maydonlar) →
`workToHistory`; anketa savoli ham shu yo'ldan o'tadi. Tajriba yillari
ro'yxatdan qayta hisoblanadi, lekin KAMAYMAYDI (rezyumedagi qiymat saqlanadi),
oylar — oraliqlarning pastki chegarasi. Nomzod O'ZI yozgan "o'zim haqimda"
matni ustidan yozilmaydi (`isAutoSummary`); bu qoida endi faqat serverda —
javobdagi `aboutAuto` (kabinetdagi nusxa `source==='anketa'` ga bog'liq edi,
hh nomzodida xato ishlardi). Rezyumedan kelgan vazifalar matni va asl muddat
("2019-2021") tahrirda yo'qolmaydi (`workRaw.desc/periodText`; muddat o'zgarsa
standart yozuv). hh qatorlari oynaga `historyToWork` bilan tiklanadi (lavozim —
`guessRole`, muddat — `durFromPeriod`: "2019-2021", "2 yil", "8 месяцев");
tanib bo'lmasa kartada "Muddatni tanlang" va Saqlash o'chiq turadi. Xom javob
(`Candidate.workRaw`, `workNone`) faqat JORIY ish tarixini bergan bo'lsa
ishlatiladi — agentlik paneldan tarixni o'zgartirsa oyna yangisidan tiklanadi
(`survey.workRows`). Rezyumeda 3 tadan ko'p ish joyi bo'lsa tahrirda
yo'qolmaydi (`cleanWork {max}`). Foto: kartadagi kamera tugmasi → tanlash /
o'chirish (brauzerda 800px, JPEG 80%; server `cleanPhoto` — anketa savoli bilan
bitta qoida); `Candidate.photoAt` rasm havolasida `?v=` bo'lib ketadi, aks holda
soatlik kesh eski rasmni ko'rsatardi. To'ldirilganlik ko'rsatkichiga ish tajribasi
(14) va foto (9) qo'shildi. Anketada "Tajribam yo'q" endi eski ish tarixini ham
tozalaydi (ilgari kartada "Tajribasiz" yozuvi ostida ish joylari qolardi).
Lug'atda yetishmagan `ank.w.none` qo'shildi (panelda "ank.w.none" matni chiqardi).
`test/candprofile.test.js`. Brauzerda (Chromium, soxta API bilan — avval lokal,
keyin JONLI sahifada) oqimlar tekshirildi: qo'shish, tahrir, o'chirish, "tajribam
yo'q", muddatsiz hh qatori (Saqlash o'chiq turadi), uz/ru, kunduz/tun, orqaga
zanjiri. Jonli: /ping ff898b5, lug'at kalitlari, uchala yangi endpoint initData'siz
401. **Telegramda nomzod sifatida HALI SINALMAGAN.**

**ANDROID SHRIFTI — DEPLOY QILINDI** (2026-11-14, Anas: "Android'da shriftlar
xunuk va bachkana"). Sabab: sarlavhalarda `font-weight:800`. iOS'da SF Pro'ning
haqiqiy 800 qalinligi bor, Android'da (Roboto, Samsung One UI) va Windows'da
(Segoe UI) yo'q — brauzer 700'ni SUN'IY qalinlashtiradi (faux bold), ustiga
manfiy `letter-spacing` qo'shilib harflar yopishadi. Yechim — th.css'da ikki
token: `--th-fw-h` (800 / Apple'da, 700 boshqasida) va `--th-lsk` (manfiy
zichlik koeffitsienti: 1 / .35). Uchala Mini App sahifasidagi 40 ta
`font-weight:800` va 30 ta manfiy `letter-spacing` shu tokenlarga o'tkazildi;
`body` shrifti ham `var(--th-font)` (Android'da Roboto aniq ko'rsatiladi —
Samsung shrifti qalin holatda yomon chiqadi). Platformani `applyOs()` aniqlaydi
(`html[data-os="ios"|"droid"]`, applyTheme yonida, birinchi chizishdan oldin).
Ochiq `maosh.html` th.css'siz — u yerda shunchaki 700. Yangi sarlavha
qo'shsangiz: `font-weight:var(--th-fw-h)`, `letter-spacing:calc(-.4px * var(--th-lsk))`.
Brauzerda ikki UA bilan tekshirildi: Android 700 / -0.245px / Roboto, iOS 800 /
-0.7px / SF — tartib buzilmadi.
**2-qadam (o'sha kuni): INTER — O'Z SERVERIMIZDAN.** Anas iOS va Android ekranini
yonma-yon qo'yib "baribir farq qilmoqda" dedi — tizim shriftlari (SF Pro / Roboto /
Segoe) hech qachon bir xil ko'rinmaydi. Inter qo'shildi (SF Pro'ga eng yaqin UI
shrifti, HAQIQIY 800 qalinlik bor, RestoOne ham Inter'da): `public/fonts/inter-*.woff2`
(lotin 48 KB, kirill 19 KB, +ext'lar; brauzer faqat keragini oladi), `@font-face`
th.css'da, `server.js` woff2'ni bir yil keshlaydi. FAQAT `html[data-os="droid"]` da —
iOS'da Inter umuman yuklanmaydi, SF Pro qoladi; Android/Windows'da `--th-fw-h: 800`,
`--th-lsk: .9`. Google Fonts'ga bog'lanmaydi (qo'shimcha DNS/TLS va kechikish).
Jonli tekshirish: Android UA — Inter yuklandi, qalinlik 800; iPhone UA — bitta ham
woff2 so'ralmadi. iOS'ni ham Inter'ga o'tkazish kerak bo'lsa: `--th-font` ni
`:root` da almashtirish kifoya. **Anas Android'da ko'rib tasdiqlaydi.**

**BOTGA BIRINCHI KIRISH — IKKALA TOMON (hook)** (2026-11-14, CI 151/151).
Anas: "botga birinchi kirganda funksiyalarimiz bilan ushlab qolish kerak".
Muammo: ikkala tomonda ham birinchi xabar SO'RARDI (nomzoddan 2 daqiqalik
anketa, restorandan "ovozda kim kerakligini ayting"), odam esa hali hech narsa
ko'rmagan; restoranning hisobi "kutilmoqda" bo'lib, yozgani AI qidiruviga ham
tushmasdi — menejer qo'ng'iroq qilgunicha bot jim turardi.
Qoida YAGONA — `services/firstTouch.js` (tugmalar `ft:`, boshqa servislar
bilan bir xil `handleCallback` shakli; bitta xabar `editMessageText` bilan
o'zgarib boradi, chat to'lib ketmaydi).
- NOMZOD: `/start` da (vakansiya havolasisiz) avval LAVOZIM tugmalari ->
  tanlagan lavozimidagi ochiq ishlar (joy + maosh, restoran nomisiz) -> shundan
  keyin "Anketani boshlash · 2 daqiqa". Anketa shu lavozimniki bo'lsa o'sha
  ochiladi (lavozim savoli so'ralmaydi), javoblar bitta `SurveyResponse` da
  qoladi. Vakansiya havolasi bilan kelgan — avvalgidek to'g'ridan-to'g'ri.
- RESTORAN: `employerStart` endi quruq salom emas — va'dalar + BAZADAGI
  haqiqiy raqamlar ("8 ta nomzod: ofitsiant 3 · xostess 2") + "Kim kerak?"
  tugmalari -> lavozim bosilsa: nechta nomzod, bozor maoshi (`market.stats`,
  5 tadan kam yozuvda ko'rsatilmaydi) va 3 ta ANONIM karta (kod/lavozim,
  tajriba, hudud, maosh, ishonch belgilari). Ism/telefon/foto yo'q.
- NAMOYISH QIDIRUVI: tasdiqlanmagan ("kutilmoqda") restoran yozsa yoki OVOZ
  yuborsa — endi jim qolmaydi, AI qidiruvi ishlaydi, lekin natija anonim va
  kontakt ochadigan tugmalar berilmaydi (ular `status:'active'` talab qiladi).
  Soni cheklangan: `Client.demoSearches` <= 3 (`firstTouch.DEMO_LIMIT`) —
  raqobatchi restoran niqobida bazani ko'chirib olmasin.
- BEPUL SINOV tugmasi agentlikka so'rov yuboradi (`Client.trialAskedAt`,
  admin chatiga xabar, ikkinchi bosishda takrorlanmaydi). Kreditni Anas
  beradi — AVTOMATIK EMAS (qaror: begona bazani ko'rmasin). Avtomatga
  o'tkazish kerak bo'lsa: `handleCallback` dagi `ft:t` shoxi.
- OVOZ ikkala tomonda ham ko'rinadi: nomzodga tugma + "gapiring, AI anketani
  o'zi to'ldiradi", restoranga birinchi xabarda misol bilan taklif va
  "🎤 Ovozda aytaman" tugmasi.
JONLI TOPILGAN VA TUZATILGAN (o'sha kuni, Anas Telegramda bosdi):
  1) Tahrirlangan xabarda `parse_mode` yo'q edi — mijoz "<b>Официант</b>"
     matnini ko'rdi. Endi servis `html: true` qaytaradi, dispatcher HTML qo'yadi.
  2) Ovoz tugmasi bosilganda hech narsa bo'lmadi (deploy paytiga to'g'ri kelgan
     bo'lishi mumkin) — `voiceIntake` endi yozuv topilmasa jim qolmaydi: shu
     odamning oxirgi ochiq anketasi bilan davom etadi.
Yangi lug'at kalitlari `ft.*` (uz/ru). `test/firsttouch.test.js` (9 ta):
anonim kartada ism/telefon yo'qligi, sinov va "ish qidirmayapti" yozuvlari
hisoblanmasligi, yopiq/sinov vakansiyalari chiqmasligi, takroriy
`SurveyResponse` ochilmasligi, sinov so'rovi bir marta ketishi.
**Telegramda HALI BOSILMAGAN** — Anas uchta akkaunt bilan sinaydi.

**BOT MATN VA TUGMALARI — HR AUDITI** (2026-11-14, Anas: ovoz tanlagandan keyin
ekranda yagona tugma «Заполнить анкету» chiqdi — "bu ko'pchilikni chalg'itib
qo'yadi"). Xatolar sinfi BITTA: ekranda nomzod tanlagan yo'lga QARAMA-QARSHI
harakat turibdi yoki chiqish yo'li yo'q. Tuzatildi:
1. **Ovoz ekranidagi raqib tugma.** «📝 Anketa bilan to'ldirish» asosiy
   harakatdek ko'rinardi — endi «Ovozim chiqmayapti — yozib to'ldiraman»
   (zaxira ekani matndan ko'rinadi). Kirish tugmasi ham taklifkorroq:
   «🎤 Gapirib beraman · 1 daqiqa».
2. **9 savol bitta ovozli xabarda.** Ko'k yoqa nomzod 9 bandni eslay olmaydi,
   devor-matn qo'rqitadi. Endi 5 ta asosiy band + «Hammasini eslay olmasangiz —
   qolganini keyin o'zim so'rayman» (chase bosqichi allaqachon bor edi, lekin
   aytilmasdi). Namuna 2 jumla. AI ovozi (templateSay) ham shu 5 band.
3. **«Mikrofon tugmasini bosib turing 👇»** — 👇 inline tugmani ko'rsatardi
   (aynan chalg'ituvchi). Endi: «🎙 Mikrofon tugmasi — pastda, o'ng tomonda».
4. **Vaqt nomuvofiqligi**: tugmada «1 daqiqa», shablonda «1–2 daqiqa» — bir xil.
5. **/start da uchta raqib harakat** (7 lavozim tugmasi + Anketa + Ovoz).
   Endi birinchi ekran BITTA savol: faqat lavozimlar + bitta zaxira
   («Lavozimim ro'yxatda yo'q — anketa»). Anketa va ovoz — lavozim
   tanlangandan keyingi ekranda, kontekst aniq bo'lganda.
6. **Ketma-ket savollarda oxiri ko'rinmasdi** — endi «Yana N ta savol»,
   LEKIN faqat 4 tagacha qolganda: «yana 12 ta savol» ovozni tanlagan odamni
   qochiradi (jonli sinovda aynan shu chiqdi).
7. **Rasm bosqichi boshi berk edi** (tugma ham, izoh ham yo'q): rasmi
   bo'lmagan odam shu yerda tashlab ketardi. Endi «Hozir rasm topolmasangiz —
   keyinroq shu yerga yuborsangiz ham bo'ladi, javoblaringiz saqlanadi».
8. **Ochiq ish yo'q bo'lsa ham «Ariza berish uchun anketa»** deyilardi — ariza
   beradigan vakansiya yo'q. Endi alohida matn: anketa kelajakdagi ish uchun.
9. **Va'da/natija nomuvofiqligi (mijoz tomoni)**: «🎁 3 ta kontakt bepul»
   tugmasi aslida faqat SO'ROV yuborardi — endi «🎁 3 ta bepul kontakt so'rash».
Tekshirish: ovozli oqim boshidan oxirigacha lokal bazada "bosib" ko'rildi
(har bir bot xabari o'qib chiqildi), CI 152/152.

**BOTDA TIL — BIR BOSISHDA** (2026-11-15, Anas: "Telegramim rus interfeysida,
botda faqat rus tili chiqyapti"). Muammo: nomzodning tili FAQAT Telegram
interfeysidan olinardi (`I18N.fromTelegram`), botda almashtirish yo'li yo'q edi —
O'zbekistonda ko'p telefon ruscha sozlangan holda sotiladi, egasi esa o'zbekcha
gapiradi. Anketa (Mini App) tilni so'rardi, bot esa yo'q — ya'ni odam ruscha
tugmalarni bosib, formada "Tilni tanlang" degan savolga tushardi.
Yechim — ALOHIDA TIL EKRANI EMAS (u hammaga ortiqcha qadam qo'shadi va "avval
ber, keyin so'ra" qoidasini buzadi), balki birinchi ekranning pastida BITTA
tugma: faqat IKKINCHI til, o'z tilida yozilgan («🇺🇿 O'zbekcha» / «🇷🇺 Русский»).
Bosilganda o'sha xabarning o'zi tanlangan tilda qayta chiziladi (`firstScreen`
alohida funksiyaga ajratildi), tanlov `SurveyResponse.lang` ga yoziladi —
ANKETA endi tilni qayta so'ramaydi (`anketa.html`: `if (S.lang)`), nomzod
bo'lsa `Candidate.lang` ham yangilanadi. Til ustunligi: botda tanlangan >
profil > Telegram interfeysi (`firstTouch.handleCallback`; aks holda lavozim
bosilganda ruschaga qaytib ketardi — jonli sinovda topildi). Nomzod uchun
`/til` buyrug'i ham qo'shildi (ilgari faqat mijozda edi; `lg:` tugmalari endi
nomzodni ham taniydi). `test/firsttouch.test.js` (10 ta), CI 153/153.

**NOMZOD MATNI MIJOZ MATNIDAN AJRATILDI** (2026-11-15, `49fa9da`.., Anas
ekranni ko'rsatib: "bu tekst nomzod uchun emas, ko'proq mijoz uchun mos
tushadi"). Rost edi: nomzodning `/start` ekrani agentlikning o'zi haqida
yozilgan edi — "TalentHub — xodim tanlash xizmati… restoranlar bizga
so'raydi… biz mos nomzodni tanlab tavsiya qilamiz" + 4 ta ✅. Bu investorga
yoki restoranga aytiladigan gap; ish qidirayotgan odamga emas.
**Miya — `docs/auditoriya.md`** (yangi, CLAUDE.md 7-qoidadan havola): nomzod
kim, nimadan qo'rqadi, nima so'raydi (qancha → qayerda → qachondan → men
nima qilaman), unga AYTILMAYDIGAN so'zlar jadvali (nomzod, xizmat, platforma,
tavsiya qilamiz, vakansiya), birinchi ekran formulasi; mijoz uchun shu
narsalarning teskarisi. Matn endi shu hujjatdan yoziladi.
Nomzod ekranlari qayta yozildi (uz/ru): birinchi ekran — salom + HOZIR nechta
ochiq ish va lavozimlar bo'yicha taqsimot (`ft.cPick`, bazadan) + "Maoshi va
tumani bilan ko'rsataman — qaysi ish kerak?"; agentlik haqida bitta so'z yo'q.
Ish bo'lmasa raqam to'qilmaydi — uch foyda (`ft.cPick0`: bepul · rezyume
yozmaysiz · HR o'zi qo'ng'iroq qiladi). Lavozim ekrani: ishlar ro'yxati +
"Avval bir necha savolga javob bering — 2 daqiqa, rezyume shart emas, bepul.
Tugagach shu ishlarga ariza berasiz" (`ft.cAsk`). Vakansiya havolasi bilan
kelganga: e'lonning O'ZI (lavozim, tuman, maosh) va "arizangiz shu ishga
DARHOL yuboriladi" (`ft.cAskVac`, tugma `ft.cApply` — "Ariza berish", chunki
bu yo'lda ariza rostdan yuboriladi). O'chirildi: `ank.hookLead`, `hookAbout`,
`hookPoints`, `hookCta`, `hookJobs`, `ft.cPickLine`.
QOIDA YAGONA: birinchi ekranni endi faqat `firstTouch.candidatePick` chizadi
— `/start` ham, "⬅️ Orqaga" ham AYNAN shu (ilgari ikki joyda edi va Orqaga'da
til tugmasi ham, "Lavozimim ro'yxatda yo'q" zaxira yo'li ham yo'qolardi).
`langSwitchBtn` ham shu yerga ko'chdi. `telegram.js hookText` o'rnida
`firstScreen` (test shuni chaqiradi).
**ILDIZ SABAB — MATN EMAS, MA'LUMOT:** Anas yuborgan ekranda ish soni umuman
yo'q edi, chunki jonli bazada ochiq ish **0** ta. 22.10 da import qilingan 33
vakansiyaning `confirmedAt` 14 kundan oshgan (`vac.STALE_DAYS`) — 5-noyabrdan
beri ular nomzodga KO'RINMAYDI: botdagi son ham, nomzod kabinetidagi ro'yxat
ham, anketadan keyingi "sizga mos N ta ish" ham nol. Hech qanday matn bo'sh
ro'yxatni qoplay olmaydi. Endi bu ko'rinadi: `/api/agency/today` → `openJobs`,
`staleJobs`; "Bugun" sahifasida qizil/sariq qator ("Nomzod hozir N ta ish
ko'ryapti"), yon menyuda Vakansiyalar yonida tasdiqlanmaganlar soni.
**Anas qiladigan ish:** panel → Vakansiyalar → eskirganlarni tasdiqlash yoki
yopish. Tasdiqlanmaguncha nomzod tomoni bo'sh turadi.
`test/applications.test.js` (birinchi ekran: agentlik tavsifi yo'qligi,
tugmalar, ish yo'q holati), `test/firsttouch.test.js` (Orqaga = /start),
`test/sections.test.js` (openJobs/staleJobs). CI 155/155. Oqim lokal bazada
webhook darajasida bosib chiqildi (7 ekran, uz/ru, har xabar o'qildi).

**TAKLIF NAVBATI (hh bazasiga SMS) + RESTORAN NOMI OCHIQ** (2026-11-15,
Anas: "742 nomzodning telefoniga tayyor havola qilib ber, matnni o'zim
shaxsiy nomerimdan yuboraman").
- `services/outreach.js` — qoida YAGONA. Navbatga tushadi: manba anketa
  EMAS, Telegramga ulanmagan, `smsSentAt` bo'sh, telefoni haqiqiy
  (`phoneKey`), `not_looking` emas, bosqichi hired/rejected emas, sinov
  emas. Eng yangi rezyume oldin. Panel `/taklif.html` (yon menyu "Taklif
  navbati") — TELEFON uchun: lavozim chiplari, tahrirlanadigan matn
  ({ism} · {lavozim} · {havola}), tirik ko'rinish, har qatorda bitta katta
  "SMS" tugmasi. Tugma — `sms:` havolasi: iOS'da `&body=`, boshqasida
  `?body=` (ikkisi har xil o'qiydi). WhatsApp — kichik zaxira tugma.
  SERVER HECH KIMGA SMS YUBORMAYDI (Eskiz shartnomasi yo'q, operator
  ommaviy yuborishni bloklaydi) — sahifada kuniga 30–50 ogohlantirishi.
- SMS BITTA bo'lishi uchun matn GSM-7 da: bitta "—" yoki "’" butun
  xabarni UCS-2 ga o'tkazadi (160 o'rniga 70 belgi, 1 SMS o'rniga 3).
  `smsInfo()` serverda ham, sahifada ham bir xil — yomon belgini
  qizil qilib ko'rsatadi. Standart matn 145 belgi, 1 SMS, ASCII.
- Havola `t.me/<bot>?start=a_<kod>_sms` — yangi manba kaliti `sms`
  (`survey.CHANNELS`), shu bo'yicha konversiyani o'lchaymiz.
- Bosilgan zahoti "yuborildi" (`Candidate.smsSentAt` + `firstContactAt`)
  — sahifa yuborilganini bila olmaydi; "Qaytarish" bor va u faqat SHU
  amal qo'ygan `firstContactAt` ni oladi (oldingi qo'ng'iroq qolaveradi).
- **RESTORAN NOMI**: `Client.showName` (standart — yopiq). Yoqilsa
  `vac.forCandidate.employer` to'ladi: nomzod kabinetida karta va
  vakansiya sahifasida, kanal postida nom ko'rinadi. Panel: Mijozlar →
  Tahrirlash → belgi. Anas qarori 2026-11-15: **Tarnov uchun ochiq**
  (o'z brendimiz; begona restoranda yopiq qoladi — aks holda nomzod
  to'g'ridan-to'g'ri o'ziga boradi).
`test/outreach.test.js` (6 ta), CI 161/161. Sahifa brauzerda telefon va
kompyuter ko'rinishida tekshirildi (soxta API, iOS va Android UA).

**VERIFIX API — ULANDI, REKRUTING FORMALARIGA RUXSAT KUTILMOQDA** (2026-11-15).
Tarnovning Verifix hisobi (OOO "MARVELOUS", company_code `tarnov`, filial
`154049` "Tarnov", loyiha `vhr`). OAuth2 mijozi "Анас CLAUDE" (Client
credentials, Read/Write) — Verifix → Настройки → Клиенты OAuth2 сервера.
KALIT REPODA YO'Q va bo'lmasin (repo ochiq) — Render env'ga
`VERIFIX_CLIENT_ID`/`VERIFIX_CLIENT_SECRET` bo'lib kiradi.
- Host `app.verifix.com` (NE `verifix.uz` — u reklama sayti; NE
  `id.verifix.com` — u boshqa OAuth server, bizning kalitga `invalid_client`).
- Token: `POST https://app.verifix.com/security/oauth/token`, body **JSON**
  `{"grant_type":"client_credentials","client_id":..,"client_secret":..}`.
  Form-urlencoded va Basic auth — `400 Bad request` (sinab ko'rildi).
  Javob: bearer, 64 belgi, `expires_in` 10800 (3 soat).
- Ma'lumot: Biruni freymvork — `POST https://app.verifix.com/b/<forma>:<amal>`,
  sarlavhalar `Authorization: Bearer ..`, `project_code: vhr`,
  `filial_id: 154049`, `Content-Type: application/json`. `:model` — forma
  meta + birinchi ma'lumot (`/vhr/href/employee/employee_list:model` 200).
  `b/biruni/m:session` — kim ekanimiz va filiallar.
- Rekruting formalari: `/vhr/hrec/vacancy_list` (Вакансии),
  `/vhr/hrec/candidate/candidate_list` (Кандидаты),
  `/vhr/hrec/application_list` (Заявки на вакансии) — hammasi
  **403 "Нет доступа к форме"**: OAuth mijozining foydalanuvchisiga
  ("CLIENT: Анас CLAUDE", user_id 572215) rekruting ruxsati berilmagan.
  Anas Verifix'da shu foydalanuvchiga "Вакансии" ga (o'qish) ruxsat berishi kerak.
  Nomzodlar (2171) TARNOVNIKI — roziliksiz TalentHub'ga olinmaydi; faqat vakansiyalar.
- Cloud sessiya tarmog'iga `app.verifix.com` (va verifix.uz/com) qo'shilgan.

**TARNOV — BIRINCHI HAQIQIY MIJOZ, 5 VAKANSIYA JONLI** (2026-11-15, `3f73b3a`).
Anas qarori: Verifix'dagi ~100 vakansiya filial bo'yicha EMAS, LAVOZIM bo'yicha —
bitta lavozim = bitta vakansiya (aks holda bir xil karta 15 marta, 22.10 dagi
"soxtaga o'xshaydi" muammosi). Joy bo'sh emas: `location` = filiallar ro'yxati
"Sebzor, Drujba, Chorsu, Keles, Istirohat" ("Drujba" — "Do'stlik" EMAS, shu nom
bilan mashhur), `venue` = "5 ta filial — uyingizga yaqinini tanlaysiz".
Ma'lumot Anas yuborgan rasmiy shartlardan (Verifix'dagi umumiy matn emas):
Ofitsiant (savdodan 6%, 2-oydan 7%; o'qish haftasida 60 000/kun; 1-kun kuzatish
to'lanmaydi — jalb qatorida OCHIQ yozilgan, aks holda nomzod 7,5 mln deb kelib
aldangandek bo'ladi), Xostess 225 000/kun, Ranner 215 000/kun (tajribasiz),
Salatchi 220 000 dan/kun (forma), Buyurtma yig'uvchi 225 000/kun. Hammasi
3 mahal ovqat (yig'uvchidan tashqari), har 10 kunda maosh, 5 kunda 30% avans.
Ranner va Buyurtma yig'uvchi — `ofitsiant` rolida (bizda alohida rol yo'q;
sarlavhada aniq nomi). Yig'uvchining to'lov davri yozilmagan — bo'sh qoldirildi.
Yangi to'lov davri `tenday` ("Har 10 kunda", `vac.PAYOUTS`, panel va Mini App
formalari, uz/ru) — ilgari yo'q edi va `clean()` uni jimgina o'chirardi.
Prod: Tarnov mijozi (faol, `showName`, 35 kredit), 5 vakansiya `verifiedAt` bilan,
22.10 importidan qolgan 34 eskirgan vakansiya (19 "kutilmoqda" restoran + 1 SINOV)
YOPILDI. "Bugun": nomzod 0 → **5** ta ish ko'radi, tasdiqlanmagan 0. Saqlangan
maydonlar jonli o'qib, haqiqiy `forCandidate` bilan tekshirildi.
Bu vakansiyalar kanal ulanishidan OLDIN yaratilgan — kanal ulansa o'zi chiqmaydi
(`jobChannelSince`), panelda har biriga "Kanalga joylash" bosish kerak.

**NOMZOD YO'LI ANALITIKASI — DEPLOY QILINDI** (2026-11-15). Anas: "nomzod botga
kirib anketani to'ldirmay chiqib ketishi mumkin; vakansiyani kim, qachon ko'rdi —
har qadamni analitika qilishimiz kerak". Qoida YAGONA — `services/track.js`, jurnal
`Event` (faqat qo'shiladi; 180 kunda TTL bilan o'chadi). `track(kind, {...})` —
kutilmaydi, xato yutiladi (asosiy oqim HECH QACHON to'xtamaydi). Hodisalar va
yoziladigan JOYI (yangisini qo'shsangiz — shu ro'yxatga):
`start` (telegram.js startSurvey; kanal bilan, vakansiya havolasida `ref`) ·
`lang` (ft:lang tugmasi) · `role` (firstTouch.candidateRole) · `voice`
(voiceIntake 'go') · `open` (anketa GET /:rid) · `done` (survey.finalize — anketa
ham, ovoz ham) · `view` (vakansiya havolasi bilan /start + nomzod kabineti
`POST /api/cand/vacancies/:id/view`, profil.html showJob chaqiradi) · `apply`
(applications.submit; Telegramsiz nomzodda kalit `cand:<id>`). `view`/`open`
30 daqiqada bir marta (`QUIET`). Sinov rejimi (`isTest`) sanalmaydi.
Anketa ICHIDA qaysi savolda to'xtagani — `SurveyResponse.step` dan (takrorlanmaydi).
VORONKA KOHORTA bo'yicha: davrda `start` qilganlar keyin qaysi bosqichga yetgan
(davrdagi barcha "tugatdi" ni sanash foizni 100% dan oshirardi). Bosqichlar:
kirdi -> ochdi (open|voice) -> tugatdi -> ariza.
Panel `/analitika.html` (yon menyu "Analitika"; `GET /api/agency/analytics?days=1|7|30|90`,
`GET /api/agency/analytics/user/:tg`): voronka + "eng ko'p yo'qotish" xulosasi
(qaysi o'tishda va nima uchun bo'lishi mumkin), anketada qayerda to'xtadi (savol
nomi — `CATALOG.field`), qaysi lavozimni qidirishadi, manba bo'yicha (SMS / IG /
kanal / bot — tugatish %), vakansiyalar (ko'rdi · ariza · % · oxirgi ko'rganlar),
so'nggi harakatlar -> bosilsa odamning butun yo'li. Ma'lumot 15-noyabrdan
yig'iladi (oldingisi yo'q). `test/analytics.test.js` (6), CI 168/168. Webhook
darajasida bosib tekshirildi: start/lang/role, vakansiya havolasida start+view.
Shu ishda: `--th-bg-2` tokeni th.css'da YO'Q — taklif.html'da fonlar shaffof edi
(`--th-surface`/`--th-fill` ga almashtirildi). Taklif navbatida SMS matni har
lavozimga alohida saqlanadi va SMS soni eng uzun ism bo'yicha hisoblanadi.
Xato tushunilgan va qaytarilgan: "20 ta xostess, 15 ta ofitsiant" — bu SMS soni
edi, vakansiyadagi kerakli odam soni EMAS (bir necha daqiqa "20 ta o'rin"
deb turdi, qaytarildi).

**hh NOMZODIGA SHAXSIY HAVOLA — ANKETASIZ, BIR TUGMALI ARIZA** (2026-11-15, Anas:
"SMS juda tushunarsiz; hh'dan kelgan nomzod anketa to'ldirmaydi-ku, profili allaqachon
bor"). Ikkala gapning ildizi BITTA edi: SMS havolasi UMUMIY anketaga olib borardi —
matn anketani tushuntirishga majbur bo'lib siqilib ketgan, rezyumesi bizda bor odam
esa hamma narsani qaytadan yozishi kerak edi.
- Har qatorda SHAXSIY havola: `t.me/<bot>?start=<token>` (10 belgi [A-Za-z0-9],
  pastki chiziqsiz — a_/v_/ref_/emp_/f_ bilan aralashmaydi; umumiy havola bilan bir
  xil uzunlik). `outreach.ensureTokens` navbat ochilganda yaratadi, `markSent`
  `tgInviteSentAt` yozadi. Eski 22 belgili taklif tokenlari ham ishlayveradi.
- Bosilganda (telegram.js eski taklif tarmog'i — profil kartasi "Hammasi to'g'rimi?"
  O'RNIGA) `firstTouch.candidateInvite`: "hh.uz'dagi rezyumengiz bizda bor — anketa
  shart emas" + o'z LAVOZIMIDAGI ochiq ishlar (bo'lmasa — boshqalari) restoran nomi
  bilan (`showName`) + har ish = tugma `ft:ap:<vakansiya>` -> `inviteApply`: kabinet
  bilan BIR XIL shartlar (ochiq, ism, telefon `validPhone`, takror 11000) ->
  `applications.submit` (prescreen o'zi boshlanadi). Chiqish yo'li: "Rezyumemni
  ko'rish" (profil.html), "Hozir ish qidirmayapman" (`ft:no`), til (`ft:il:<lang>`).
  Yuborilgan ish tugmada "✓ Yuborilgan". Analitika: `start` (kanal sms) va `apply`.
- Boshi berk joy yopildi: token bir martalik — havolani IKKINCHI bosgan o'sha odam
  o'z ekranini ko'radi, begona odam oddiy birinchi ekranni (ilgari "Havola eskirgan").
- SMS matni — REKRUTER OVOZI (Anas namunasi: "Salom, Nilufar! Men talenthub
  agentligi rekruteriman, rezyumengizni ko'rgan edim va ish taklif qilmoqchi edim"):
  "Salom, {ism}! Men TalentHub agentligi rekruteriman. hh.uz'dagi rezyumengizni
  ko'rib, sizga ish taklif qilmoqchi edim: Tarnov restoraniga xostess kerak. Qiziq
  bo'lsa, platformamiz orqali batafsil ma'lumot oling: {havola}". Maosh, to'lov
  muddati va "ariza" so'zi SMS'da YO'Q (Anas qarori) — javobni botning birinchi
  ekrani beradi. SMS shaxsiy raqamdan — "men" rost. 2 ta SMS (~255 belgi, GSM-7
  chegarasi 306) — telefonda bitta xabar; sahifa faqat 3+ ni qizil qiladi. Rad etilgan variantlar: "Hurmatli…, hh.uz'dagi rezyumengiz bo'yicha:
  … TalentHub: havola" (siqilgan, "tushunarsiz") va 1 SMS'ga sig'dirilgan
  qisqa variant ("juda galati") — 1 SMS chegarasi uchun ohangni qurbon qilmang.
- JONLI SINOVDA TOPILDI: hh ismlari ko'pincha KIRILLCHA — bitta kirill harfi SMS'ni
  UCS-2 ga o'tkazib 3 taga bo'lardi. `outreach.latin` (o'zbek kirill -> lotin,
  "Е" so'z boshida "Ye", ў/қ/ғ/ҳ) — SMS'da ism lotinda, botda asl yozuvi.
  Ruscha `ft.cJobs` ko'plik shakllari yo'q edi ("2 открытых вакансий") — massiv.
`test/outreach.test.js` (9). Webhook darajasida bosib o'qildi: SMS -> havola (rus
Telegram) -> ekran -> tugma -> tasdiq + prescreen -> qayta bosish -> begona odam.

**hh SMS VA HAVOLA EKRANI — 3-VERSIYA** (2026-11-16, Anas: "rezyumengiz tayyor,
hech narsa to'ldirish shart emas — bunaqa gaplar umuman kerak emas; havolada TalentHub
haqida qisqacha ma'lumot bo'lsin"). SMS (`outreach.DEFAULT_TPL`) — YAKUNIY, ANAS O'ZI
TANLAGAN (4-versiya): UMUMIY (lavozim, restoran, "Toshkent" yo'q — maqsad platformaga olib
kirish; 510 kishiga shaxsiy va'da bermaslik), IKKI TILDA: o'zbekcha, havola ALOHIDA
qatorda (bosish qulay), bo'sh qator, ruscha KIRILLDA ("по ссылке выше"). Ruscha kirill —
butun xabar UCS-2, ~5 SMS (lotindagi ruscha 2 SMS edi, Anas kirillni tanladi). Sahifa
kirill bo'lsa harflarni "yomon belgi" demaydi, 6+ SMS qizil. `tidy`/`fill` qator
tashlashni SAQLAYDI (faqat probel qisqaradi). Oldingi variantlar (rad etilgan): "Tarnov
restoraniga {lavozim} kerak, sizni taklif qilmoqchimiz" (va'da), "Toshkent restoranlariga
{lavozim}lar kerak" ("Toshkent" kerak emas), hook'li (bepul/24 soat/10 kunda).
Ism: `outreach.nameWord` — "ФИО скрыто соискателем" -> ismsiz salom, "САИДА" -> "Saida"
(SMS va bot ekrani bir qoida). Havola ekrani (`firstTouch.candidateInvite`):
salom -> `ft.iAbout` (TalentHub kimligi: restoranlar bilan to'g'ridan-to'g'ri, vakansiyani
o'zimiz tekshiramiz, nomzodga bepul — VA'DA, yangi restoranda ham bajarilsin) -> o'z
lavozimidagi ishlar (maosh + to'lov davri) -> `ft.iPick`. "Rezyume bizda bor / anketa shart
emas" matnda YO'Q. NAVBAT FAQAT OCHIQ VAKANSIYASI BOR LAVOZIM (`outreach.openRoles`):
menejer/kassir/barmenga SMS ketsa havolada ranner chiqardi; vakansiya ochilsa o'zi
qo'shiladi. `{lavozim}` = haqiqiy vakansiya nomi (oshpaz roli -> "salatchi", qavsdagi izoh olinadi; lavozim nomi
bilan boshlanadigan vakansiya bo'lsa — lavozim nomi). Sahifa matni `th_sms_tpl4:` kalitida, FAQAT odam tahrirlaganda saqlanadi
(telefonda saqlangan eski matn yangisini yopmasin). Shu ishda: `/api/telegram/status`
2e51ec9 dan beri 500 berardi (`outreach.available()` yo'q edi) — tuzatildi.

**OVOZDAN KEYIN MINI APP + BOT ISH RO'YXATI** (2026-11-16, `1939019`, Anas skrinshotlari):
- Ovozli rezyumedan keyin yetishmaganlar (ism, telefon, rasm...) bot chatda BITTALAB
  so'ralmaydi: tasdiq tugmasi `vi.fillBtn` — web_app `anketa.html?r=<id>&fill=1`
  (`voiceIntake.fillUrl`). Fill rejimi: faqat bo'sh majburiy savollar (`answeredQ` =
  server submit qoidasi) + javob o'zgarib yangi chiqqani; kirish ekrani `ank.fill*`.
  Yuborilganda `routes/anketa` submit `r.mode==='voice'` bo'lsa `voiceIntake.applyVoice`
  (ovoz yozuvi, tavsif, prefersVoice) va agentlikka "🎤". Chatda bittalab — faqat
  zaxira (appBase yo'q). Anketa endi oxirgi KO'RINADIGAN savoldan keyin yuboradi
  (ilgari faqat `Q.length-1` — yashirin oxirgi savolda jim qolardi).
- Bot ish ro'yxati (`firstTouch.jobBlocks` — lavozim ekrani va SMS havola ekrani bitta):
  har ish blok: "1. <b>Nom</b> · Restoran" / <i>qavsdagi izoh</i> / "💰 maosh · to'lov
  davri"; filiallar hammasida bir xil bo'lsa ostida BIR MARTA; lavozimning o'zi birinchi;
  boshqa nomli ish bo'lsa sarlavha `ft.cJobsMix` ("Ofitsiant va shunga yaqin ishlar —
  3 ta"; ilgari "Ofitsiant — 3 ta", ofitsiant esa bitta edi). Restoran nomi — `showName`.
  Telegramda HALI bosib ko'rilmagan.

**SMS BIRINCHI KUNI + PANEL VA BOT** (2026-11-16): 68 SMS, real 6 kirish, 3 ariza (Parizod,
Nigora, Xusenov). Anas o'z SMS havolalarini tekshirib bosganda Telegrami hh nomzodlariga
ulanib qoldi -> `outreach.inviteClaim`: admin chati — faqat ko'rinish, boshqa telefonli
nomzodga ulangan chat — o'z ekrani, token kuymaydi (3 nomzodning havolasi kuygan).
Paneldagi "Havola yaratish" (`botRelay.invite`) buzuq edi (outreach.send yo'q) — endi faqat
havola, SMS tokeni bo'lsa o'shani qaytaradi. Taklif navbati: rasm (bosilsa kattalashadi),
Toshkentdan tashqari chiqmaydi (`outreach.TASHKENT_RE`, hudud bo'sh/metro/Keles qoladi).
REZYUME ISTALGAN OYNADA — `public/js/th-resume.js` (th-shell hamma panel sahifasiga ulaydi):
elementga `data-resume="<id>"` kifoya. TELEGRAM TUGMASI (username bo'lsa t.me/<u>, aks holda
t.me/+998...) — Arizalar, Nomzodlar bazasi, kanban, rezyume oynasi, Taklif navbati (matn
nusxalanadi). BOT PROFILI — `services/botProfile.js` server ishga tushganda (nom "TalentHub",
qisqa tavsif FAQAT agentlik kimligi — Anas: "rasmiy" yo'q, restoran/maosh yo'q); avatar
`docs/talenthub-bot-avatar.png` (BotFather /setuserpic — Bot API o'rnatmaydi).
TEST REJIMI "📄 hh nomzod" (`tm:hh`): `TestMode.hhCandidateId` — har bosishda arizalari
o'chadi, yangi token, botga SMS matni; havola admin chatiga bog'lanadi (sinov yozuvi). Rezyume
tanlash: panel to'liq karta "🧪 Test rejimida sinash" yoki yuklashda `testHh=1` (takror
tekshiruvisiz). Anasning o'z rezyumesi yuklandi (HR-menejer, isTest). Sinov arizasi haqiqiy
mijozga bormaydi va Mini App'da ko'rinmaydi (`noTestApps`). Kunduzi deploy — bepul Render
"waking up" sahifasini ko'rsatadi: mayda o'zgarishlarni kechqurun chiqaring.

**STORY USLUBI (SINOV), $ MAOSH, hh API, BIRINCHI XABAR BRENDI** (2026-11-16..17,
`6c17b34`..`61f3238`):
- STORY RASM — panel Vakansiyalar → "Story rasm" (`public/js/th-story.js`, canvas 1080×1920,
  uz/ru): mijozning ochiq vakansiyalaridan, maosh/filial bazadan, sarlavha tahrirlanadi;
  standart tanlov — eng ko'p to'lanadigani oldin, har xil roldan. Analitikada Telegram
  story — eng kuchli kanal (2026-11-16).
- STORY USLUBI — SINOV (Anas: "yoqmasa ortga qaytaramiz"): to'q ko'k gradient, oltin doira
  `#FFC53D`, Inter. Qo'llangan: nomzod vakansiya sahifasi tepasi (profil.html), anketa
  kirish/yakun ekranlari (`.st*` — `.sh*` pastki oyna bilan to'qnashardi), `maosh.html`.
  Nomzod ishlar ro'yxati ixcham (`fbe7560`): birinchi ish katta karta, qolgani bir qator;
  tartib: mos → eng ko'p ariza → yangi.
- MAOSH DOLLARDA (`a1781bc`): `Vacancy.salaryCurrency` uzs|usd ("1 000 $ dan"); usd vakansiya
  so'mli hisoblarga (moslik bali, oylik oralig'i, qidiruv) KIRMAYDI. Top lavozimlar: Servis
  menejeri, Shef-povar (milliy, Chorsu), Konditer (yevropa desertlari, Sebzor) — afzalliklarsiz.
- Arizalar: yopilgan vakansiyaning arizasi "Yakunlangan"ga o'tadi, sanoqlarga kirmaydi.
- hh.uz RASMIY API — ULANGAN (`bd0c1f4`..`a18b54d`): dev.hh.ru "RestoOne HR" ilovasi ISH
  BERUVCHI akkauntida tasdiqlangan (nomzod akkauntida ko'rinmaydi — "tasdiqlanmagan" deb
  adashmang). `services/hh.js`, `/api/hh/*` (status, connect → callback, resumes,
  resumes/:id, import, dictionaries); tokenlar `Restaurant.hh` (`select:false` — o'qishda
  `.select('+hh.accessToken +hh.refreshToken')`), muddati o'tsa refresh; `host=hh.uz`,
  `area=2759`, `HH-User-Agent`. Qidiruv, rezyume ko'rish va import KVOTA YEMAYDI;
  "Открыть контакты" — yeydi, faqat Anas qarori bilan. Import `hhResumeId` bo'yicha takrorsiz,
  `hhUrl` (rezyume oynasida "hh.uz'da ochish"). Env (faqat Render): `HH_CLIENT_ID`,
  `HH_CLIENT_SECRET`, `HH_REDIRECT_URI`, `HH_USER_AGENT`.
- SMS HAVOLA EKRANI — BREND RASMI (`61f3238`; Anas: "g'alati, jalb qilmaydi, eng ko'p
  yo'qotish shu yerda — professional agentlik sifatida ko'rinishimiz kerak"). SHIOR (Anas
  ko'p variantdan tanladi): **"Talab bormi? Talant bor!"** / «Есть запрос? Есть таланты!» —
  ikki tomonlama (restoranga ham, nomzodga ham), qisqa. `firstTouch.candidateInvite` →
  `{text, keyboard, photo}`: rasm `public/img/bot-welcome-<uz|ru>.jpg` (1280×640, ~70 KB:
  shior, "Toshkent restoranlari uchun ishga joylash agentligi", 3 va'da); izoh 4 qator —
  salom, `ft.iIntro`, qalin `ft.iLead2` ("Hozir N ta ochiq ish · oyiga 6–13 mln so'm" —
  bazadan, kunlik×26, smena×15), `ft.iPick`. Tugmalar: Ishlarni ko'rish (web_app) / ikkinchi
  til / Hozir ish qidirmayapman. Yuborish — `routes/telegram.js sendScreen` (rasm o'tmasa —
  matn).
- RASMNI URL BILAN BERMANG: Telegram uni bepul Render'dan yuklay olmay qoldi (jonli: "failed to
  get HTTP URL content", 6–11 s, ruscha tugma rasm o'rniga yangi matnli xabar yubordi). `photo` —
  public/ ichidagi yo'l (`img/...`); `tg.sendLocalPhoto` / `tg.editLocalPhoto` faylni o'zi
  yuklaydi (multipart, `attach://photo`), keyin xotiradagi file_id (deploy'da yangilanadi).
  `test/tgphoto.test.js`.
- TUGMALAR JIM QOLMAYDI (`5a2eb07`..): RASMLI XABARDA `editMessageText` ISHLAMAYDI — dispatcher
  `cq.message.photo` bo'lsa navbat bilan: rasm+izoh (`editLocalPhoto`) -> faqat izoh; matnli
  xabarda `editMessageText`. "not modified" va "canceled by new edit" (tez-tez bosildi) — xato
  emas; boshqa xatoda yangi xabar. Servis bo'sh javob qaytarsa — `bot.stale` ogohlantirishi;
  har bosish Render logida `[CB] <teg> Nms`. JONLI: Anas Telegramda sinadi (2026-11-17, `e8180e0`) —
  rasm, UZ/RU almashishi va tugmalar ISHLADI.
- ANKETA YOZUVI — BITTA ODAMGA BITTA (2026-11-18; Anas: story'dan kelganlar «Botni o'zi topgan»).
  Sabab: lavozim tanlanganda `candidateRole` YANGI yozuv ochib kanalga 'bot' yozardi — nomzod
  kartasi, hodisalar, anketa statistikasi shu bo'yicha; /start dagi (kanalli) yozuv bo'sh qolib
  "boshladi, tugatmadi" va analitikadagi "Birinchi savolgacha"ni sun'iy oshirardi. Qoida YAGONA —
  `survey.openResponse` (startSurvey vakansiyasiz + candidateRole): shu anketaning ochiq yozuvi →
  javobsiz yozuv shu anketaga o'tadi → (umumiy havola, `resume`) chala anketa davom etadi → yangi
  (kanal va tavsiya meros). «Lavozimim ro'yxatda yo'q» — `anketa.html?r=..&g=1` (javobsiz yozuv
  umumiy anketaga qaytadi). Eski ma'lumot — `migrations.mergeShells` (server ishga tushganda,
  takror xavfsiz): javobsiz takrorlar `status:'merged'` + `mergedInto` (O'CHIRILMAYDI; statistikaga
  kirmaydi, eslatma ketmaydi, eski tugma asosiysini ochadi); kanal faqat asosiysida 'bot'/bo'sh
  bo'lsa va undan OLDIN ochilgan yozuvda aniq kanal bo'lsa o'tadi (nomzod va hodisalarga ham).
  SurveyResponse sanog'ini yozsangiz — `status: { $ne: 'merged' }`. `test/openresponse.test.js`.
  JONLI (`58c3f28`): 13 ta takror birlashtirildi, 9 tasida kanal tuzatildi.
- ARIZALARIM — QAYTA QURILDI, JONLI (2026-11-18, `38a8a97`, Anas namunani tasdiqladi): kartada
  nomzod tilidagi sarlavha (`vac.titleFor` — sarlavha lavozimning o'zi bo'lsa tarjima), restoran
  nomi (showName), to'lov tartibi; BITTA holat bloki — `stateLabel` + `next` (`al.next.<stage>`);
  botdagi tekshiruv kutsa sariq qator (`screen` — `screenPending`); faol suhbat (vaqt, joy,
  xarita, Boraman / Bora olmayman → boshqa vaqt | umuman yo'q) — `POST /api/cand/interviews/:id/:op`
  (y|r|x|p) botdagi `interviews.handleCallback` ning O'ZI; "HR'ga yozish" — qadalgan chat;
  qaytarib olish `POST /api/cand/applications/:id/withdraw` — faqat qaror qilinmagan, `state:
  'rejected', reason:'withdrawn'` (bot savollari `screen.step:'stopped'`, agentlikka ↩️; panel va
  mijoz Mini App'ida "qaytarib oldi"); tarix bir qatorda; Faol / Yakunlangan; O'xshash ishlar.
  CSS: `.ab` band (ariza tugmasi) — kartadagi qator `.apb`. `test/candapps.test.js`. Telegramda
  HALI SINALMAGAN.
- VAKANSIYANING RUSCHA MATNI — JONLI (2026-11-18, `dc1c67f`): `Vacancy.ru` {title, venue, landmark,
  hook, schedule, conditions, duties, requirements}. Qoida YAGONA — `vac.tx(v, maydon, lang)`: rus
  tilidagi o'quvchiga ruscha nusxa, bo'sh bo'lsa o'zbekcha; `titleFor` ham `ru.title` ni oladi (bot ish
  ro'yxati, Arizalarim, bildirishnomalar — hammasi shundan). `forCandidate`, prescreen shartlar qatori,
  mijoz botidagi vakansiya kartasi tx orqali; `full()` XOM qaytaradi (+`ru`, `hasRu`) — formalar tahrir
  manbai, u yerda tarjima qilinmaydi. Tuman (`location`) ATAYLAB yo'q — qidiruv filtri. Kanal posti
  o'zbekcha qoladi. Panel formasida "Ruscha" bo'limi + "Ruschaga tarjima (AI)" (`POST
  /api/vacancies/translate` — faqat formani to'ldiradi, SAQLAMAYDI; asl matni bo'sh maydon bo'sh qoladi);
  ro'yxatda ochiq vakansiyada "RU yo'q". Ruschasiz forma (mijoz Mini App'i) o'zbekcha maydonni
  o'zgartirsa — shu maydonning ruschasi o'chadi (`clean`, eskirgan grafik ruscha qolmasin). Tarnovning
  9 vakansiyasiga ruscha qo'lda yozildi ("Salatchi" — "Повар холодного цеха (салаты)", jinssiz).
  `test/vacru.test.js`. Mijoz Mini App formasida ruscha maydon YO'Q.
- ARIZALARIM IXCHAM KARTA — JONLI (2026-11-18, `18a5858`, Anas: "ma'lumot ko'p, siqilgan"): nom + ⋯,
  "restoran · maosh", 4 qadamli chiziq (`appProg`, `P_STEP`), bitta holat bloki (vaqt sarlavhada, bosilsa
  tarix), "HR'ga yozish" havolasi. KO'K TUGMA FAQAT NOMZOD ISH QILISHI KERAK BO'LGANDA (bot savollari
  "Ответить", suhbat "Приду"). Qaytarib olish va vakansiya — ⋯ (TG.showPopup); karta bosilsa vakansiya.
- NOMZODGA YAKUNIY XABAR — JONLI (2026-11-18, `708eab6`, `db00b5b`, Anas qarori). Vakansiya yopilsa
  (panel PATCH yoki mijoz Mini App PATCH, status -> closed) `appLife.closeForVacancy`: qaror qilinmagan
  (new/seen) arizalar `state:'rejected', reason:'vac_closed'`, bot savollari 'stopped', nomzodga
  `al.nVacClosed` + ochiq ishlar soni (bazadan, 0 bo'lsa aytilmaydi) + "Ish o'rinlari". Kabinetda
  "O'rin yopildi" (`stage:'vacClosed'`) — "boshqa nomzod tanlandi" EMAS (yolg'on edi). Tanlovga o'tganlar
  (shortlisted) tegilmaydi. Suhbatdan keyingi "mos kelmadi" (`shortlist.setClientState` not_fit — Mini
  App, panel natijasi, botdagi "Ishga olasizmi?") endi nomzodga `al.nClosed` yuboradi; `no_show` — yo'q.
  Bir martalik tozalash `POST /api/vacancies/closed-sweep` (apply:false — ko'rish) — har odamga BITTA
  xabar ro'yxat bilan (`al.nVacClosedMany`). Bajarildi (Anas tasdig'i): 29 ariza / 12 kishi, 9 tasiga
  ketdi (3 tasi Telegramga ulanmagan). Anas Tarnov mijoz rolidan (Mini App) ham status beradi.
  `test/appclose.test.js`.
- TEST REJIMI — HAQIQIY MIJOZ (2026-11-18, `1b74781`): `/test` → "👔 <mijoz nomi>" (`tm:real`, `TestMode.
  realClientId`) — admin akkaunti HAQIQIY mijozga (Tarnov) ulanadi: kredit to'ldirilmaydi, isTest yo'q, kontakt
  ochilsa haqiqiy kredit yechiladi. Bir nechta faol haqiqiy mijoz bo'lsa — tanlash (`tm:rc:<id>`), keyin eslab
  qoladi. Boshqa Telegramga ulangan mijoz uzilmaydi (409). "🧪 Sinov mijoz" (`tm:client`) — eskicha.
  `test/testmode-real.test.js`. Prod'da "Sinov 2" va "SINOV Chaykhana Navruz" faol va isTest EMAS — ro'yxatga
  tushadi (tozalash kerak). Telegramda HALI BOSILMAGAN.
- STORY VIDEO — JONLI (2026-11-18, `1e18ccf`): panel Vakansiyalar → Story rasm → "🎬 Video (9 s)". Bitta
  `thStory.paint(ctx, d, t)` — `t=Infinity` PNG (eski bilan pikselma-piksel bir xil, o'lchandi), `t` soniya —
  video kadri. `renderVideo`: brauzer `MediaRecorder` (Chrome 126+/Safari — MP4 H.264, aks holda WebM ogohlantirish),
  real vaqtda ~10 s, taymer `setTimeout` (rAF yashirin varaqda to'xtaydi — video qotardi). Yozuvchi ~0.5 s kech
  boshlaydi — brend birinchi kadrdanoq turadi. Jonli: Tarnov 9 vakansiya → 1080×1920, 10.4 s, 3.3 MB.
  Skill: `.claude/skills/story-video` (lokal). Deploy skill birinchi haqiqiy ishida ishladi (208/208).

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


**MIJOZ MINI APP v3 — BUGUN · NOMZODLAR · NOMZOD SAHIFASI** (2026-11-19, `7305ab4`, Anas: "nomzod
tomoni zo'r, mijoz tomoni sodda, ma'lumot tiqilib qolgan"). Avval `.preview/mijoz-v3.html` prototipi
(v3 -> v3.1 "yengilroq") ko'rsatildi, Anas tasdiqladi. Tablar: **Bugun** (`tTD/vTD`, bosh ekran) ·
**Nomzodlar** (`tAP`, arizalar + tanlovlar BITTA ro'yxatda) · Vakansiya · Aloqa · Hisob. "Tanlovlar"
(`vSL`) menyuda yo'q — yashirin, `SL_ROWS` ma'lumoti uchun yuklanadi.
- Ma'lumot: `loadPeople()` = `/api/ma/applications` + `/api/ma/shortlists`; `candRows()` ularni bitta
  qator modeliga yig'adi (`k:'ap'|'sl'`, `seg: new|work|hired|arch`). `shortlisted` ariza tashlanadi —
  u tanlov elementi bo'lib turibdi. `renderCab()` — ochiq bo'limni qayta chizadi (`loadApps`,
  `loadShortlists` ham chaqiradi).
- Bugun (`renderToday`): javob kutayotgan arizalar (ball bo'yicha 3 tasi + "Hammasini ko'rish"), faol
  suhbatlar (vaqt chapda; o'tgan suhbatda Keldi/Kelmadi — `data-ivo`), kontakt ochilgan-u suhbat yo'q
  ("Qo'ng'iroq kutmoqda"), 30 kun ichidagi yangi xodimlar, balans + tarif (`ME_PLAN` /me dan).
  Ariza yo'q bo'lsa — "Mos nomzodlarni ko'rish" -> Vakansiya.
- Qator (`rowHtml3`): 2 satr — "Lavozim · tajriba" (ochiq bo'lsa ism) va BITTA fakt (yosh·hudud yoki
  holat: 36 soatdan ko'p javobsiz — sariq, kontakt ochildi — ko'k). O'ngda vaqt va % (75+ yashil,
  aks holda kulrang matn). Vakansiya bo'yicha guruh sarlavhasi kichik kulrang.
- Nomzod sahifasi (`showCand`, `#cx`, `.vp` uslubi, z 65): bosh qism, holat (tanlovda `stepsHtml` —
  `.cd` ichida, `wireCards` ishlashi uchun), moslik halqasi, ishonch qatorlari, ovozli tanishuv,
  rezyume (`/api/ma/candidates/:id`). Pastda: qaror qilinmagan ariza — Rad etish / Ochish · 1 kredit
  (+ "Suhbatga kelmasa — kredit qaytariladi") yoki Tanlash; ochiq kontakt — Yozish / Qo'ng'iroq.
  Amallar `wireApps`/`wireCards` orqali (mantiq takrorlanmaydi). Telegram Orqaga: sheet -> cx -> vx.
- CSS tuzoq: miniapp.html'da global `.w`, `.b` klasslari bor — modifikatorlar `is-w`, `is-b`, `ib`,
  `ia`, `cw-y`, `cw-n` deb nomlandi.
- Lokal sinov: `.preview/miniapp.html` = public nusxasi + `/__p/mock.js` + `/__p/mock-v3.js`,
  telegram-web-app.js olib tashlangan (aks holda mock ishlamaydi).
Hali: Vakansiya va Hisob bo'limlari eski ko'rinishda; arizaning 14 yosh / 15 yil tajriba nomuvofiqligi
(anketa yosh ≥14 va tajriba yig'indisini tekshirmaydi) tuzatilmagan.
**v3.2** (2026-11-19, `8af5441`): nomzod sahifasida ovozli tanishuv bosh qism ostida (`cx-voice`; ariza
ovozi — `data-voice`, rezyume ovozi — `/candidates/:id/voice`), "Bir qarashda" plitkalari (qachon chiqadi,
smena, kutgan maosh, tillar — `cx-gl`), ish tajribasi soni bilan. Vakansiya ro'yxati — ixcham qator
(`vr`: maosh·grafik, ko'pi bilan 3 fakt, yangi ariza -> Nomzodlar shu vakansiya filtri bilan; "Mos
nomzodlar" va ⋯ — vakansiya sahifasida). Hisob: tariflar `plansSheet()` pastki oynasida (`showPlans`
ham shuni ochadi), qatorlar Xizmatlar / Ma'lumot guruhlarida.

**OVOZ SAHIFADA + "KIM KERAK?" QIDIRUVI — JONLI** (2026-11-19, `b82c427`, Anas: "nega ovoz chatga ketadi?
bazadan qidiruvni Mini App ichida professionalroq qiling").
- OVOZ: Telegram ovozi OGG/Opus — iPhone Mini App'da ishonchsiz, shuning uchun chatga yuborilardi. Endi
  `services/voiceAudio.js`: getFile -> ffmpeg-static AAC (m4a, faststart) -> xotirada 40 ta kesh, bir vaqtdagi
  so'rov bitta o'giriladi; `send()` Range qo'llaydi (iOS <audio> 206 talab qiladi). Endpoint'lar
  `GET /api/ma/candidates/:id/voice.m4a`, `/applications/:id/voice.m4a` — `?t=photoToken` (audio sarlavha
  yubora olmaydi), ruxsat POST .../voice bilan bir xil. Frontend `mountVoice(box, src, dur, sendPath)` —
  nomzod sahifasi va rezyume oynasida; o'ynamasa — eskicha chatga (`sendPath`). `stopVoice()` sahifa/oyna
  yopilganda. `test/voiceaudio.test.js`.
- QIDIRUV: `POST /api/ma/search` — `{text}` -> `candidateSearch.parseQuery` (bot bilan BITTA AI parser; yiqilsa
  `guessRole`) yoki `{criteria}` (chiplar, `cleanCriteria` — faqat ma'lum maydonlar) -> `search()` yumshatish
  bilan, 30 ta -> `countRelaxed` jami, `facets` (toraytirish + son), `market.stats` (median/p25/p75, 5 tadan
  kam bo'lsa yo'q) -> `SearchSession` (tanlov eski `POST /shortlist`, foto `/photo/:key/:id`). `vacancyId`
  berilsa (vakansiyadan) tanlov shu vakansiyaga. Kartalar `sessionCards()` — bot seansi bilan bitta;
  `picked` — allaqachon tanlangan. `clientKnows` endi 24 soatlik qidiruv seansini ham oladi (anonim
  rezyume, foto, ovoz — qidiruv kartasi darajasida).
- Mini App `#sx` (`openSx`, `runSx`, `drawSx`): matn (Enter), "Ovozda aytish" (botga yo'naltiradi — Mini App
  mikrofoni iOS Telegram'da ishonchsiz), lavozim plitkalari, chiplar (× — olib tashlab qayta qidiradi),
  "+ variant · N", natija kartochkasi (jami, bozor maoshi, nima hisobga olinmadi), qatorlar + belgilash,
  "Tanlash (N)" -> Nomzodlar "Jarayonda". Qatorni bosish — nomzod sahifasi (`k:'sx'`, pastda Tanlash).
  "Kim kerak?" qatori Bugun va Nomzodlar tepasida. Botdagi qidiruv (`?s=`) va vakansiyaning "Mos
  nomzodlar" tugmasi ham shu sahifani ochadi; eski `openSearch` (qidiruv rejimi) endi chaqirilmaydi.
- CSS tuzoq: global `.mk`, `.rx` ham bor ekan — `sx-mk`, `sx-rx`.
Telegramda HALI SINALMAGAN: haqiqiy ovozning iPhone'da o'ynashi, AI qidiruvning haqiqiy bazada natijasi.
**Ovoz bilan qidirish Mini App ichida + "AI band"** (2026-11-19, `3cb2283`): "Сказать голосом" endi botga
yubormaydi — `sxRecStart` MediaRecorder (iOS mp4/AAC, Android webm/Opus; 30 s; Bekor/Tayyor), base64
`POST /api/ma/search {audio}` -> `voiceAudio.toOgg` (ffmpeg, 16 kHz Opus) -> `parseQuery({audio})` ->
`transcript` matn maydoniga yoziladi. Mikrofonga ruxsat yo'q — `sx.micNo` (matn yoki bot). `ai.isBusy(err)`
(timeout, kvota, 429/503): bot xom "Gemini 45 s ichida javob bermadi" o'rniga `bot.aiBusy` + "🔎 Ilovada
qidirish" (`miniapp.html?sx=1` — qidiruv sahifasi, lavozim plitkalari AI'siz); Mini App qidiruvi 503 +
`sx.aiBusy`. Sabab (Anas, 2026-11-19): Gemini bepul kunlik limiti tugagan payt. Mini App mikrofoni
Telegram iOS'da HALI SINALMAGAN — ruxsat oynasi chiqmasa zaxira yo'l ishlaydi.

**NOMZOD YO'LI TAHLILI VA TUZATISHLAR — JONLI** (2026-11-19, `145cde1`..`b289adc`, 217/217). Anas: "botni o'zi
topgan odamning anketa yo'lini 7-qoida bo'yicha tahlil qil". Topilganlar: bot "tugagach ariza berasiz" desa-da ariza
o'zi ketmasdi (kabinetda qo'lda), "2 daqiqa" va'dasi real 2,5–3,5 daqiqa, barmen/kassir/menejer/operator
lavozimni ikki marta tanlardi, rasm majburiy va chiqish yo'lisiz, "1 / 12" boshidan, sana g'ildiragi bugundan,
14 yoshga ruxsat, lavozim tugmalarida son yo'q. Tuzatildi:
- `SurveyResponse.role` + `offerIds` (firstTouch.candidateRole yozadi). `survey.presetRoleOf(r, s, v)` — YAGONA:
  vakansiya -> lavozim anketasi -> botdagi lavozim (routes/anketa, voiceIntake, finalize). "Lavozimim ro'yxatda
  yo'q" (g=1) ikkalasini tozalaydi.
- `finalize`: vakansiyasiz va `offerIds` bo'lsa — hali ochiq/ko'rinadigan ishlarga botdagi tartibda ariza;
  `applications.submit({prescreen})` — bot savollari faqat birinchisiga. Javobda `appliedTo`; anketa
  `appliedN`, Rahmat ekrani "Arizangiz N ta ishga yuborildi", bot xabari `ank.botApplied` + "📋 Arizalarim".
  `ft.cAsk`: "arizangiz shu ishlarga o'zi yuboriladi" (va'da = natija).
- Rasm: `answer {q:'photo', value:'later'}` -> `answers.photoLater`; submit majburiylikni o'tkazadi; rahmat
  xabarida `ank.botNoPhoto`. Rasm baribir so'raladi (Anas qarori saqlandi — faqat keyinroq yuborish yo'li).
- Sana: kun/oy/yil `<select>` (MONTHS uz/ru), 16–70 yosh, 31-fevral rad (server: UTC tushlikda solishtiriladi —
  Toshkent yarim tuni UTC'da oldingi kun, birinchi variant HAMMA sanani rad etdi, CI ushladi).
- Hisoblagich: oxirgi 3 savolda "Yana N ta savol" / "Oxirgi savol". Kirishda "javoblar saqlanadi".
- Vaqt matnlari "3 daqiqa" (ovoz "2 daqiqa") — 12 kalit uz/ru.
- Lavozim tugmalarida ochiq ishlar soni ("🍽 Ofitsiant · 3"), ishi bor lavozim oldin (`roleRows(counts)`).
`test/anketaflow.test.js`. Telegramda HALI bosib o'tilmagan. Qolgan: "HR 24 soatda qo'ng'iroq qiladi" va'dasi
uchun HR'ga ogohlantirish yo'q; real vaqtni analitikada (open -> done mediani) o'lchash.
**HR 24 SOAT VA'DASI NAZORATI — JONLI** (2026-11-19, `b3d874c`, 219/219): `services/slaAlert.js`, server
2 daqiqalik taymerida. Qaror qilinmagan (new/seen), `contactedAt` yo'q, ariza tushgach nomzod bilan aloqa
(`Candidate.firstContactAt`) bo'lmagan arizalar: 18 soatda "⏳ 6 soat qoldi", 24 soatda "⏰ 24 soatdan beri
qo'ng'iroq qilinmadi" — agentlik admin chatiga yig'ma xabar (ism, vakansiya, soat, telefon, "📨 Arizalarni
ochish" -> /arizalar.html). Har bosqich bir marta (`Application.slaWarnAt/slaLateAt`, atomik), kunduzi 09–21,
sinov / yopilgan vakansiya / 7 kundan eski yo'q. Ro'yxatdan chiqarish — panelda "Bog'landim".
Birinchi kunduzgi tickda oxirgi 7 kunda "Bog'landim" bosilmagan arizalar bitta xabarda keladi.
`test/sla.test.js`.

**TO'LIQ TEKSHIRUV VA TUZATISHLAR** (2026-11-20, Anas: "platformani yakuniy holatga keltir — xato, bag,
nomuvofiqlik, vaqt oladiganlar — hammasi"). 5 yo'nalish parallel o'qib chiqildi (pul, mijoz Mini App, nomzod
boti/anketa, panel+xavfsizlik, taymerlar) — 68 topilma; batafsil ro'yxat ATAYLAB repoda EMAS (ochiq repo).
Lokal testlar endi ishlaydi (`npm install --no-package-lock` + `npm i --no-save mongodb-memory-server@10`).
Tuzatildi (249/249):
- **Pul.** Bir vaqtdagi ikki ochish bir-birining TO'LANMAGAN bandligini ko'rib bepul ochardi — `reveal`
  oldingi ochilishni faqat jurnaldagi 'reveal' bilan hisoblaydi; Mini App `/applications/:id/open|pick|reject`
  arizani ATOMIK band qiladi, ochish yiqilsa ariza avvalgi holatiga qaytadi (osilib qolmaydi). Pullik ochilish
  qaytarilsa boshqa tanlovdagi bepul nusxa ham `refunded`. Payme Perform / Uzum confirm: buyurtma boshqa yo'l
  bilan to'langan bo'lsa pul yechilmaydi (-31008); ochiq tranzaksiyali buyurtmani mijoz bekor qila olmaydi.
  `billing.activate` (buyurtma+kredit+tarif) — BITTA tranzaksiya (`credits.withTxn`). `billing.tick`: muddat
  tugashi, kafolat uzaytirish, eslatma — atomik shart bilan (shu orada to'lov yangi tarif yozgan bo'lsa tegmaydi);
  sinov tugaganda faqat sinov kreditlari yonadi. Max "Cheksiz/∞" -> "100 ta kontakt" (oferta "cheksiz*, texnik
  100" — matni yuristda, tegilmadi); Max'ga ham kam balans ogohlantirishi. Haqiqiy mijozga sinov nomzodi
  ochilmaydi. Suhbatdagi "kelmadi"/"bordim" ziddiyatida admin xabari kredit qaytgan-qaytmaganini to'g'ri aytadi;
  yiqilgan qaytarish 3 martagacha qayta urinadi (`Interview.refundTries`).
- **Taymerlar.** server.js tick: qadamlar ro'yxati, har xato `alert.report`ga, 10 daqiqalik qo'riqchi (osilgan
  so'rov hamma taymerni to'xtatmaydi), Mongo `socketTimeoutMS`. jobPost: post kanalga chiqqach keyingi xato
  takror post qilmaydi; kanal buzilsa 6 soat kutadi va agentlikka bir marta xabar (`channelPost.failedAt/error`).
  403 (bot bloklangan) — `services/telegram` YAGONA joyda nomzodni `blocked` qiladi; qaytib yozsa `linked`.
  Cron: bir vaqtda bitta (curl qayta urinishi), eslatma avval egallanadi, 400 ham to'xtatadi, sinov yozuvlariga
  yo'q. `mergeShells` endi faqat 2026-11-19 gacha bo'lgan yozuvlarga (har deployda jonli anketani buzardi).
  SLA: kutilmaydigan arizalarga ham bayroq (qayta o'qilmaydi, limitni to'smaydi), indekslar. Suhbatdan keyingi
  "keldimi?" kunduzi.
- **Mijoz Mini App.** Suhbat vaqtini o'zgartirish: yangi vaqt AVVAL tekshiriladi (noto'g'ri vaqt eski suhbatni
  jimgina bekor qilardi); sana maydonida `min`, bo'sh — xabar. `confirm()` -> `askConfirm` (Ishga olindi, suhbat
  bekor, vakansiya yopish); Rad etish — tasdiq bilan. Vakansiya sahifasi bo'lim almashganda yopiladi (chat ostida
  qolardi); tahrir/yopishdan keyin sahifa yangilanadi. "Ko'rildi" endi nomzod sahifasi ochilganda (`POST
  /applications/:id/seen`), ro'yxat yuklanganda emas. `fitScore/fitReason` mijozga chiqmaydi. "N mos" sanoqlari
  parallel. Vakansiya yopilganda arizachilarga xabar fonda. `noCredits` -> tariflar. To'langan rezyumeda tajriba
  oylari va "qachondan"; tanlovda ishonch belgilari. `/topup` o'chirildi. Chatda Telegram "Orqaga". Chat havolasi
  `?tab=chat`. `?apps=` shu vakansiya filtri. Ishlatilmaydigan funksiyalar olib tashlandi.
- **Nomzod.** Ovozli anketa yarim qolsa admin/mijoz xabarlarini yutardi — mijoz va admin chati o'tkazib
  yuboriladi. `survey.finalize` atomik (`finalizingAt`) — ikki bosish ikki nomzod yaratmaydi; 409 `ank.err.already`.
  Profili tayyor nomzod kanal havolasini bossa — anketa emas, bir bosishda ariza (`ft:ap:`). Telegram tili TAXMIN
  yozuvga saqlanmaydi (`chosenLang`) — anketa til ekranini ko'rsatadi. Rahmat xabari ariza bo'lsa "Arizalarim" ga
  mos (`ank.botThanksA`). `handleCallback` qobig'i — xatoda tugma aylanib qolmaydi. Menyu tugmasi va bot javoblari
  nomzod tilida. Qaytarib olingan ariza qayta topshiriladi. Yosh Toshkent kalendari bo'yicha. auditoriya.md:
  ft.cPick0 dan agentlik tavsifi, "rezyume/anketa" so'zlari olib tashlandi. Ruscha "от 21 года".
- **Panel va xavfsizlik.** Login faqat satr (NoSQL operator), PIN tanlashga restoran bo'yicha chegara, so'rov
  satri `simple` parser, o'chirilgan akkaunt 1 daqiqada chiqariladi, rezyume fayli PDF/matn + `CSP: sandbox`,
  rasm faqat raster, tokenlar `/recruitment/:id` javobidan olindi, multer 8 MB x 15. Ildizdagi 7 ta eski
  RestoOne skriptidan ochiq parol olindi (`TARNOV_ADMIN_PASSWORD`). Sanoq indekslari (`isTest` bilan).
  Suhbatlar backfill bitta so'rov. Nomzodlar ro'yxati 1000 chegarasisiz (500 talik bo'laklar, `X-Has-More`).
  Arizalar sahifasi 1000 ta.
- **Ochiq ishlar (CLAUDE.md).** `Client.tgChatId` noyob (bitta Telegram — bitta mijoz; ulashda boshqasidan
  uziladi), `'ca'` suhbat noyob — `migrations.uniqueIndexes` takror bo'lsa indeks qurmaydi va xabar beradi.
  Arizalar sahifasida moslik bali va "Eng moslari oldin". Mijoz Mini App'da saqlangan vakansiyaning bo'sh ruscha
  maydonlari fonda AI bilan (`vac.fillRu`, qo'lda yozilgan ruscha ustidan yozilmaydi). Maosh filtri:
  `Candidate.salaryMin` (pre-save + migratsiya), qidiruvda +15%, noma'lum tashlanmaydi, yumshatishda "maosh".
  Sinov mijozlari: Mijozlar -> "Sinov mijozlari" (avval ro'yxat, keyin tanlanganlarga `isTest` — o'chirilmaydi).
- **CI.** `test/htmlsyntax.test.js` — har sahifa ichki skriptini kompilyatsiya qiladi ("Mini App oq ekran"
  tuzog'i deploydan oldin ushlanadi). `test/fixes1120.test.js` — yuqoridagi asosiy tuzatishlar.
Qolgan (kod): Candidate'da `fileData`/`photo` (Atlas 512 MB, og'ir hujjat) — alohida kolleksiyaga ko'chirish
(katta ish, migratsiya); eski `#searchMode` kodi (BackButton bilan bog'liq, qurilmada sinab olib tashlash).
Anas: ochiq git tarixidagi Mongo paroli va `JWT_SECRET` ni almashtirish.

**JONLI RAQAMLAR VA NOMZOD YO'LI AUDITI** (2026-11-23). Panel (o'qish): 30 kunda botga 29 kirdi, 17 anketa
tugadi, 10 ariza (Telegram kanali eng samarali: 12 -> 7 ariza; vakansiya.uz 6 -> 0). Tarnovga haftada 13
ariza, 10 tasi qo'ng'iroqsiz (8 tasi 6–7 kun — "HR 24 soat" va'dasi buzilgan), bu oy ochilgan kontakt 0,
ishga olingan 0; faol mijoz faqat Tarnov, 19 potensial restoran 22-oktabrdan beri faollashmagan.
Xulosa: tor joy — qo'ng'iroq bosqichi (inson halqasi), kod emas. Anas tekshiruv mantiqi xotirada
(`anas-tekshiruv-mantiqi`, 17 band). Yo'l haqiqiy kod bilan lokal bazada bosib o'qildi (`.preview/flow-audit.js`
— webhook + anketa API, Telegram yozib olinadi; git'da emas). Tuzatildi:
- Ariza tushgach bot savollari (prescreen) rahmat xabaridan OLDIN ketib, uning ostida ko'milardi —
  endi `finalize` boshlamaydi (`prescreenFor`), `anketaDone.afterFinalize` rahmatdan KEYIN boshlaydi
  (faol savol chatning eng pastida). Ovozli yo'l ham shu orqali.
- Til tanlanmagan holatda rahmat ruscha, savollar o'zbekcha chiqardi — submit'da va ovozli yo'lda til
  yozuvga avval yoziladi. Anketa kirish ekranida doimiy til tugmasi (botda tanlangan bo'lsa ham).
- `outreach.nameWord` doim 2-so'zni ism derdi ("Zuhra Tolibxonova" -> "Tolibxonova!") — familiya qo'shimchasi
  bo'yicha tartib aniqlanadi, kichik harf bosh harfga.
- Agentlikka "Yangi ariza" xabarida "Ofitsiant — Ofitsiant / Ofitsiant" takrori — profil lavozimi faqat
  farq qilsa ("Profili: ...").
- auditoriya.md: eslatma va tugmalarda "anketa" (`rem.*`, `ank.botOpen`, `ft.cOther`), "Oxirgi eslatma 🙂",
  ruscha "вакансий" -> "работ"; kanal postida avval 💰 keyin 📍, chaqiruv "3 daqiqa, rezyume shart emas,
  bepul" (avval "3 daqiqalik anketa").
- Panelda yaratilgan/tahrirlangan vakansiyaning bo'sh ruscha maydonlari ham fonda (`vac.fillRu`) —
  kabinetda tillar aralashmasin. SMS matniga TEGILMADI (Anas tanlagan yakuniy 4-versiya).

**EKRANLAR AUDITI — 17 BAND** (2026-11-23, Anas: "xato topa olmasligimga kafolat berasanmi?" — kafolat
berilmadi, qolgan ekranlar tekshirildi). Mijoz Mini App (Nomzodlar, Vakansiya, forma, Hisob), nomzod kabineti
(Profilim, Ish o'rinlari, Arizalarim), anketa, jonli panel (Bugun, Arizalar, Vakansiyalar, Anketadan
kelganlar, Mijozlar) skrinshotda; lug'at skript bilan (nomzod kalitlarida taqiqlangan so'zlar, ruscha ko'plik).
- Panel "Bugun": bosh kartochka "Ko'rilmagan arizalar: 2" edi, holbuki 10 ta arizaga va 38 ta anketa nomzodiga
  qo'ng'iroq qilinmagan (hammasi 24 soatdan oshgan) — endi "Qo'ng'iroq kutmoqda" (ariza + anketa,
  `callWaiting/callLate/ankWaiting/ankLate`, 24 soatdan oshgani qizil). Kutish navbatidan sinov mijozlari olindi.
- Nomzodga "vakansiya" -> "ish" (13 kalit: cb.*, ank.*, ivx.k*, jp.closedNote), "rezyume" -> "profil"
  (hh ekrani "Mening rezyumem", ank.fillH, vi.consent — Anas 2026-11-16 qarori), sarlavhada "anketa" yo'q
  (ank.doneH, ank.botClosed). Mijozga ruscha ko'plik: "Осталось бесплатных поисков: {n}", "кандидатам: {n}".
- Anketa kirish ekranidagi til tugmasi sariq bezak ustida o'qilmasdi — to'q fon.
Ko'rilib, nuqson topilmadi: Mini App ro'yxatlari, forma, tariflar; kabinet Arizalarim (bosqich chizig'i);
panel Arizalar (moslik bali), Mijozlar (ma'lumot sifati bloki). Telegramda haqiqiy akkaunt bilan sinalmagan.

**hh VAKANSIYA QORALAMASI (API)** (2026-11-23, Anas: "HeadHunter'ga API orqali vakansiya ochib to'ldir, joylashdan
oldin menga ko'rsat"). `services/hh.js` — `request()` endi `{method, body}` qabul qiladi; `drafts` (list/create/get/
update/remove/publish) va `publications` (`/employers/{id}/services/available_publications` — tarif paketlari).
Route'lar `/api/hh/vacancy-drafts*`, `/api/hh/publications` (agentlik guard'i). Qoralama hh'da E'LON QILINMAYDI —
kabinetdagi "Черновики" da turadi. Nashr `POST /api/hh/vacancy-drafts/:id/publish` faqat `{apply:true}` bilan;
busiz qoralamaning o'zi qaytadi (prod qoidasi: avval ko'rsat). Ruxsat etilmagan maydonlar hh'ga uzatilmaydi
(`DRAFT_KEYS`). Test savollarini (hh "тест к вакансии") API yaratmaydi — kabinetda qo'lda, qoralamaga `test.id`
bilan ulanadi. Birinchi qoralama — Tarnov rekruteri (6–8 mln, 6/1 10:00–20:00).
Arizalar: `hh.applicants` + `GET /api/hh/vacancies/:vid/applicants` (`?collection=response&page=`) — to'plamlar
sanog'i va arizalar rezyume bilan (ixcham), faqat o'qish: holat o'zgartirilmaydi. Birinchi vakansiya — Tarnov
rekruteri, hh vacancy 139742433 (2026-11-23, Anas qarori bilan testsiz, "Стандарт" paketi).
Asl PDF: `hh.resumePdf` + `GET /api/hh/resumes/:id/pdf` — hh'ning o'z PDF rezyumesi (token bilan; havola faqat
`api.hh.ru/resumes/.../download/`, javob `%PDF` bilan tekshiriladi). Kontakt ochilmagan bo'lsa anonim — kvota yemaydi.
Kontakt ochish: `hh.openContacts` + `POST /api/hh/resumes/:id/contacts` — FAQAT `{apply:true}` bilan (kvotadan 1 ta;
hh bergan `actions.get_with_contact` havolasi, boshqa xost rad etiladi). Ism-telefonli PDF — `.../pdf?contact=1`
(faqat kontakt ochilgandan keyin). Birinchi ochilgan: rekruter nomzodi K28 (2026-11-23, Anas qarori).

**QO'NG'IROQ RO'YXATI + "HALI ISH QIDIRYAPSIZMI?" + HAFTALIK HISOBOT** (2026-11-26, Anas: "barchasini qil").
Sabab: 2026-11-23 da 50 nomzod qo'ng'iroq kutardi (46 tasi 24 soatdan oshgan) — tor joy inson halqasi, kod emas.
- **Qo'ng'iroqlar** (`services/callQueue.js`, panel `/qongiroq.html`, menyuda birinchi, sanoq `callsDue`):
  ariza (qaror yo'q, "Bog'landim" yo'q, vakansiya ochiq) + anketa (`contactLog.WAITING`) BITTA ro'yxatda, bir
  odam bir qator. Natija bir bosishda: "Gaplashdik" (arizalar `contactedAt`, nomzod `firstContactAt`; arizasi
  bo'lsa kartada "Ish beruvchiga taklif"), "Javob bermadi" (ertaga 10:00 Toshkent qayta, 3-marta — "Ulanmadi";
  yangi ariza bersa qaytadi; urinish aloqa EMAS — nomzod "HR bog'landi" ko'rmaydi), "Mos emas" (ikki bosqich;
  arizalar rad — nomzodga yumshoq xabar, arizasiz anketa nomzodi `status:'rejected'`). Tartib: bugun kelganlar ->
  qayta qo'ng'iroq vaqti kelganlar -> kechikkanlar. Nomzodda `callTries/callLast/callLastAt/callNextAt`.
  "Bugun" bosh kartochkasi va SLA xabari shu ro'yxatga (ikki ta'rif bo'lmasin; eski `callWaiting/ankWaiting` olindi).
  Rad etish qoidasi bitta joyda — `applications.agencyReject` (Arizalar sahifasi ham, atomik: ikki bosish ikki xabar emas).
  Topilgan nomuvofiqlik: Arizalar'dagi "Bog'landim" nomzodning `firstContactAt`'ini yozmasdi — anketa nomzodi
  "Anketadan" bo'limida va ro'yxatda kutayotgandek qolardi. Endi `contactLog.contacted`; eski yozuvlar uchun
  `build` arizasi bo'yicha bog'lanilganlarni anketa sifatida sanamaydi.
- **"Hali ish qidiryapsizmi?"** (`services/lookCheck.js`, taymer `LK`): botdagi `cp`/`cn` tugmalari va `jobStatus`
  bor edi, savolni hech kim yubormasdi. Endi Telegramga ulangan, 14 kundan beri tasdiqlamagan (`jobStatusAt`),
  14 kunda ariza bermagan va so'ralmagan nomzodga, kunduzi 10–20, tick'da 20 ta; suhbat/sinov/ishga olingan/rad
  etilgan — yo'q. "Ha" — `active` + ochiq ishlar soni va "Ishlarni ko'rish" (`profil.html#jobs`); "Yo'q" —
  `not_looking` (mijoz qidiruvi va applyReveal allaqachon hisobga oladi). Javob matnlari endi nomzod tilida
  (`lk.*`), admin chatiga birma-bir yuborilmaydi. Indeks `{tgState, lookAskedAt}` — PDF'li hujjatlar skanerlanmasin.
- **Haftalik hisobot** (`services/weekly.js`, taymer `WR`): dushanba 09–13 Toshkent, o'tgan dush–yak, admin chatiga:
  yangi nomzodlar (manba), arizalar va 24 soatda qo'ng'iroq qilingani, hozir kutayotganlar, qo'ng'iroq natijalari,
  taklif/kontakt/ishga olindi, so'rov javoblari, faol baza lavozim bo'yicha (30 kun). `Restaurant.weeklyReportAt`
  atomik — haftada bir marta.
- **Baza hajmi** `GET /api/agency/storage` (faqat o'qish): Atlas 512 MB'dan qanchasi band va nomzod `fileData`/`photo`
  qancha egallaydi — ko'chirish migratsiyasi kerakmi, shu raqamdan keyin qaror.
- **Toast hamma panel sahifasida o'qilmasdi** (Arizalar, To'lovlar, Nomzodlar): `th-app.css` fonni oq shishaga
  almashtirgan, sahifalar yozuvni oq qilgan — `color:var(--th-ink)` bitta joyda.
- **`#searchMode` olib TASHLANMADI**: eski kod emas — mijoz botdagi qidiruv natijasida "Ko'rish" (`?s=`) shu ekranni
  ochadi. Olib tashlash uchun avval `?s=` ni `#sx` ga ko'chirish kerak (qurilmada sinab). Nomzodlar ro'yxati/kanban
  birlashtirish — dizayn qarori, Anas bilan kelishilmagan.
Testlar `test/calls.test.js` (11). Lokal ko'rishda (`.preview/qongiroq.html`, soxta API) bosib ko'rildi, telefon
kengligi ham. Telegramda HALI SINALMAGAN: "Ha/Yo'q" tugmalari, haftalik xabar.

**STORY OYNASI: TEZ LAVOZIM, MAVZULAR, FON RASMLARI** (2026-11-27, Anas: "shashlikchi kerak, lekin vakansiya
yaratmoqchi emasman; nomini o'zim kiritsam, dizaynni o'zim tanlasam").
- **Rad etilgan variant — story'ga qo'lda matn va maosh.** Rasm "Shashlikchi — 300 000" deydi, nomzod botga
  kiradi — bunday ish yo'q (va'da beruvchi tugma qoidasi, 7-qoida). Qo'lda maosh vakansiyadagidan ajralib ketadi.
- **"+ Yangi lavozim"** (Vakansiyalar -> Story rasm): nomi, maosh ("300 000", "250 000–350 000", "3 mln"; ostida
  qanday tushunilgani ko'rinadi), davr. "Qo'shish" — shu mijozga HAQIQIY ochiq vakansiya (`POST /api/vacancies`,
  `listed:true` -> tasdiqlangan, botda ko'rinadi); filiallar va maosh berish tartibi mijozning boshqa
  vakansiyalaridan, afzalliklar KO'CHIRILMAYDI. Story'da faqat yangisi belgilanadi.
- **Bitta lavozim kompozitsiyasi** (`th-story.js oneBlock`): "Tarnovga / *shashlikchi* / kerak" (ru: "Tarnov: /
  требуется / *…*" — kelishik yasalmaydi), to'liq kenglikdagi katta maosh, shu vakansiyaning afzalliklari (bazadan).
- **4 ta mavzu** (`THEMES`): Tungi (oltin doira kichraytirildi — "bachkana"), Oq, Issiq, Rasm. Erkin rang tanlash
  YO'Q — brend bir xil qolsin. Tanlov brauzerda eslab qolinadi.
- **Fon rasmlari kutubxonasi** `public/images/story/` — Anas fikri "AI o'zi topib joylasin" o'rniga: har safar
  qidirish = litsenziya, sifat lotereyasi, "bu bizning oshxona" degan yolg'on taassurot. Bir marta tanlangan 17 ta
  Pexels rasmi (tijoriy, imzosiz litsenziya), lavozimga qarab o'zi tanlanadi (`photoGroup`: bitta lavozim — o'z
  guruhi, bir nechta — zal), "Boshqa rasm" navbatma-navbat, "O'z rasmingiz" — faqat brauzerda. Repo OCHIQ va Pexels
  asl nusxani tarqatishni taqiqlaydi — 540×960, ffmpeg `gblur=sigma=7` nusxa (~20 KB; yuz tanilmasin). Manba ID:
  shashlik 36606987, 31459983, 36543113 · oshpaz 4253133, 24357593 · ofitsiant 3769740, 9198288 · xostess 4254255,
  4254257 · barmen 8941708, 4485364 · kassir 31777070, 4921159 · konditer 31040962, 37888518 · zal 16754448, 4784165.
  Tarnovning o'z rasmlari kelsa — shu papkaga, `LIB` sonini oshirish.
- `roles.js`: shashlikchi/mangalchi/kabobchi (kasb shakli) -> oshpaz; restoran NOMIdagi "Shashlik House" — yo'q.
  Test `test/roles.test.js`.
Lokal ko'rishda (`.preview/vakansiyalar.html`, soxta API) bosildi: qo'shish so'rovi, 4 mavzu bitta va 4 lavozim
bilan, ruscha, rasm almashishi, rasmli MP4 (4,3 MB). Jonli serverda haqiqiy vakansiya ochilishi HALI SINALMAGAN.

**ANKETA: TAHLIL VA "AQLLI QOIDALAR", ISH TAJRIBASI EKRANI** (2026-11-27, Anas: "nimaga oxirigacha
tugatilmagan anketalar"; "platforma umumiy bo'lishi kerak, hamma narsani restoranga moslagansan").
- **Tahlil (jonli, 90 kun):** botga 39 kirdi, 28 anketa ochdi, 23 tugatdi, 15 ariza. Umumiy anketa: 53 boshlangan,
  35 yuborilgan; 18 chaladan 13 tasi birorta savolga javob bermagan, 3 tasi faqat lavozimni tanlagan — ya'ni 16/18
  "Qayerda ishlagansiz?" ekranida (lavozim ma'lum bo'lsa u BIRINCHI savol edi) yoki kirish ekranida to'xtagan.
  Asosiy tugma darhol "Restoran yoki kafe nomi"ni yozdirardi, "Hali tajribam yo'q" — kichik havola. 2026-11-27
  ertalab operator postidan kelgan 3 kishi anketani ochib, hech narsa yozmay chiqib ketgan.
  Tugatib ariza bermaganlar (8): tanlagan lavozimiga vakansiya yo'q (kassir, operator, menejer) — kod emas, talab.
- **Aqlli qoidalar** (`survey.js`: `ruleHides`, `arrange`, `visibleQuestions`; anketa.html `shownAll` — flag'lar
  savolda keladi). BAZADAGI anketaga tegilmaydi, har agentlik anketasiga ko'rsatishda qo'llanadi:
  ish tajribasi bir bosishli savollardan (qachon, o'qish, maosh) keyin, "Siz haqingizda"dan oldin; "Hali
  ishlamaganman" deganga tajriba savollari (`EXP_ONLY`: stol, kassa dasturi, bron, oshxona, sex) yo'q; sanitar
  kitobcha faqat ofitsiant/oshpaz/barmen/xostess/kassirga; ro'yxatdan tashqari lavozimli vakansiyada
  (HR-rekruter) `presetRoleOf` = 'boshqa' — "Qaysi lavozimda?" (restoran ro'yxati) so'ralmaydi; eski restoranga
  xos izohlar (o'zgartirilmagan bo'lsa) umumiy matn bilan. Konstruktor (panel) bazadagi tartibni ko'rsatadi.
- **Ish tajribasi ekrani:** bo'sh holatda sarlavha "Ish tajribangiz bormi?" va ikki teng karta (SVG ikonka,
  izoh): "Ha, ishlaganman" / "Hali ishlamaganman" (bir bosishda keyingi savol). Lavozim qadami — o'zi yozadi
  ("sotuvchi-konsultant") yoki kapsuladan tanlaydi; emoji ro'yxati olib tashlandi; yozilgani ro'yxatdagi nomga
  mos kelsa — o'sha kalit, aks holda 'boshqa' + matn. Ish joyi so'rovi: "Kompaniya, do'kon, restoran...".
- Botdagi nomzod matnlari umumiy: "Toshkentda hozir N ta ochiq ish", "Ish beruvchilar bilan...".
- Analitika: kirish ekranidagi "Boshlash" — yangi hodisa `begin` ("Anketani boshladi") — kirish ekranida
  to'xtash va birinchi savolda to'xtash endi ajraladi.
- Yo'lda: C disk to'lgan edi (24 MB) — test bazasi ishga tushmasdi; Anas ruxsati bilan video loyihasidagi
  `work/qaytgan/OF1/vid` (9,9 GB) o'chirildi.
Testlar: `test/unit.test.js` (aqlli qoidalar). Lokal ko'rishda (`.preview/anketa-new.html`, serverning haqiqiy
savollari) bosildi. Mijoz tomonidagi matnlar (bot.empHello, ft.eHi — "restoranlar uchun") va nomzod kabinetidagi
ish tarixi tahriri (profil.html) HALI restoran uslubida.

**BOT /start: FAQAT ISHI BOR LAVOZIMLAR** (2026-11-27, Anas: "birinchi xabar juda ma'lumot ko'p, tushunarsiz,
aji-buji lavozimlar qo'yib chiqishi shartmi?"). Bazaga qarab o'lchandi: 12 ta ochiq ish, lekin ekranda 7 ta
lavozim tugmasi — Barmen va Kassirda ish 0 (bosilsa bo'sh ekran), HR-rekruter (role `boshqa`) esa tugmasiz edi;
matndagi "oshpaz 5 · ofitsiant 3 · call-markaz operatori 1 · ..." qatori tugmalarni takrorlardi.
Endi (`firstTouch.candidatePick` -> `pickRows`): salom + "Hozir N ta ochiq ish bor. Qaysi biri sizga kerak?" +
FAQAT ishi bor lavozimlar, soni tugmada; ro'yxatdan tashqari ishlar `ft:c:boshqa` (bitta bo'lsa o'z nomi —
"HR-rekruter · 1", ko'p bo'lsa "Boshqa ishlar"); uzun nom alohida qatorda; 🔥 olib tashlandi; zaxira tugma
"Mosi yo'q — anketa qoldiraman". `openJobs('boshqa')` = ro'yxatdan tashqari HAR QANDAY lavozim (`$nin ROLE_KEYS`).
Ish umuman yo'q bo'lsa — eski to'liq ro'yxat (anketa kelajakdagi ish uchun). `docs/auditoriya.md` formulasi
yangilandi. Testlar: `test/anketaflow.test.js`, `test/applications.test.js`.
