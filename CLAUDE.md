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

7. **HR nigohi — har ekran uchun** (Anas talabi, 2026-11-15). Matn yozishdan
   oldin **`docs/auditoriya.md`** ni o'qing: nomzod va mijoz BOSHQA odam,
   bitta ekran — bitta odam. Nomzodga agentlik tavsifi ("xodim tanlash
   xizmati", "biz tavsiya qilamiz") — MIJOZ matni, yozilmaydi. Har ekranda
   BITTA savol va BITTA asosiy harakat. Tekshiruv ro'yxati:
   - Odam TANLAGAN yo'lga qarama-qarshi tugma turibdimi? (ovozni tanlaganga
     "Anketa to'ldirish" asosiy tugmadek ko'rinmasin)
   - Chiqish yo'li bormi? Har bosqichda: "keyinroq", "orqaga", zaxira variant.
   - Tugma VA'DA bersa, bosilganda AYNAN shu bo'ladimi? ("3 kontakt bepul"
     bosilganda kontakt berilmasa — matn yolg'on).
   - Matn 5 banddan uzunmi yoki ekranni to'ldiradimi? Qisqartiring.
   - Oxiri ko'rinadimi? ("yana 2 ta savol"; katta son qo'rqitadi — ko'rsatmang).
   - Raqamlar BAZADANmi? To'qima raqam ishonchni butunlay yo'q qiladi.
   - Til: Telegram interfeysi tili faqat taxmin — almashtirish yo'li bo'lsin.
   Matnni yozgandan keyin oqimni lokal bazada "bosib" chiqing va HAR BIR bot
   xabarini ko'z bilan o'qing (2026-11-14: shunda 2 ta nuqson topildi).


## Loyiha

**TalentHub** — Toshkentdagi ishga joylash agentligi (Anasning shaxsiy biznesi, Tarnovniki EMAS). Restorandan
boshlangan, lekin platforma UMUMIY (Anas, 2026-11-27): nomzod matni va savoli restoranga bog'lanmasin
(HR-rekruter, operator vakansiyalari ham bor). Ikki tomon: **mijoz** (restoran) — Mini App `miniapp.html`, kredit bilan kontakt ochadi; **nomzod** —
bot `@TalentHubUzBot`, anketa `anketa.html`, kabinet `profil.html`. Agentlik paneli — `talenthub.html` va
yon menyudagi sahifalar. Tarnov — birinchi haqiqiy mijoz (`showName` ochiq).
Shu repoda eski **RestoOne** (ofitsiant o'qitish) ham bor — `docs/restoone.md`.

- Jonli: https://tarnov-restaurant-platform.onrender.com (`/ping` — deploy qilingan commit)
- GitHub (OCHIQ repo!): `anasusmonov752-collab/tarnov-restaurant-platform` · Render `RestoPro` (bepul,
  50 s sovuq start, UptimeRobot uyg'otib turadi) · MongoDB Atlas (IP `0.0.0.0/0` — parol yagona himoya)
- Stek: Node/Express/Mongoose, frontend — vanilla JS, har sahifa o'z ichki `<script>` i bilan.

**Hujjatlar:** `docs/tarix.md` — HAR BIR qurilgan funksiyaning tarixi (nima uchun, qaror, commit, jonli
tekshirildimi). Funksiyaga tegishdan oldin `grep -n "<servis nomi>" docs/tarix.md` qiling — u yerda rad
etilgan variantlar va Anas qarorlari bor. `docs/auditoriya.md` — matn yozishdan oldin (7-qoida).
Yangi funksiya tugasa — `docs/tarix.md` oxiriga bo'lim qo'shing; bu faylga faqat qoida/tuzoq bo'lsa yozing.

## Buyruqlar va deploy

`npm test` (node:test, pul oqimi mongodb-memory-server replikada) · `npm start` · `npm run dev`.
**Deploy — faqat `deploy` skill** (`bash .claude/skills/deploy/deploy.sh`, fonda): sintaksis -> CI ->
o'tsa `main` -> Render -> `/ping` yangi commitda. To'g'ridan-to'g'ri `git push origin main` QILMANG.
Kunduzi deploy — nomzodlar Render "waking up" sahifasini ko'radi; mayda o'zgarishni kechqurun chiqaring.
Lokal ko'rib chiqish: `.preview/` (git'ga kirmaydi) + `.claude/launch.json` "preview-static" (`/__p/` — soxta API).

## Arxitektura

`server.js` — yupqa bootstrap (statik, kesh sarlavhalari, server taymerlari har 2 daqiqa: interviews, jobPost,
placements, prescreen, billing...). Mantiq `src/`: `routes/` (miniapp = mijoz Mini App, candidate = nomzod
kabineti, anketa, telegram = bot webhook, vacancies, recruitment, shortlists, agency, pay, cron, hh, super),
`services/`, `models/`, `data/` (roles, plans, onboardQuiz), `utils/`. Testlar `test/*.test.js`.

**QOIDA YAGONA — bitta joyda, takrorlamang** (yangi kod shu funksiyani chaqirsin):

| Nima | Qayerda |
|---|---|
| Lavozim aniqlash | `data/roles.js guessRole` (tahlilchi, vakansiya, qidiruv) |
| Lug'at uz/ru, til tanlash | `public/js/th-i18n.js` (brauzer ham, server ham), `resolve(lang, tgLang)` |
| Vakansiya ko'rinishi, ruscha matn | `services/vacancy.js` — `forCandidate`, `tx(v, maydon, lang)`, `titleFor`; `full()` XOM |
| Anonim karta (kontaktgacha) | `services/anonymize.js` · "ochilgan" ta'rifi — `contactView.js` |
| Kontakt ochish, kredit | `shortlist.reveal` · balans+jurnal — `credits.move` (bitta tranzaksiya) |
| Arizadan ochish qoidasi | `applyReveal.js` · ariza yuborish — `applications.submit` |
| Ariza hayot yo'li, nomzodga xabar | `appLife.js` (`stepsFor`, `notify`, `closeForVacancy`) |
| Anketa: savollar, shart, yozuv | `survey.js` (`shownQuestions`, `toFields`, `openResponse`, `finalize`, `workSet`) |
| Ovozli rezyume | `voiceIntake.js` · anketa tugashi — `anketaDone.js` |
| Bot birinchi ekrani, SMS havola ekrani | `firstTouch.js` (`candidatePick`, `candidateInvite`, `jobBlocks`) |
| hh nomzodlariga SMS navbati | `outreach.js` |
| Suhbat kelishish | `interviews.js` · ariza tekshiruvi — `prescreen.js` · moslik bali — `matchScore.js` |
| Ishga olingandan keyin, kafolat | `placements.js` · ishonchlilik — `reliability.js` |
| Tarif, to'lov | `data/plans.js`, `billing.activate` (yagona yoqish), `cardPay.js`, payme/click/uzum |
| Test rejimi | `testMode.js` (sinov yozuvlari `isTest` — qidiruv, sanoq, reveal himoyalangan) |
| Analitika hodisalari | `track.js` (`Event`, xato yutiladi) |
| Kanalga post | `jobPost.js` · chala anketa eslatmasi — `reminders.js` |
| Ko'rildi/bog'lanildi | `contactLog.js` · qo'ng'iroq ro'yxati va natijasi — `callQueue.js` (panel `/qongiroq.html`) |
| Agentlik arizani rad etadi | `applications.agencyReject` (Arizalar ham, Qo'ng'iroqlar "Mos emas" ham) |
| "Hali ish qidiryapsizmi?" (14 kunda) · haftalik hisobot | `lookCheck.js` (`cp`/`cn`) · `weekly.js` |
| Dublikat kaliti | `utils/candidateKeys.js` (textHash, phoneKey) |

Panel umumiy qismi: `js/th-shell.js` (menyu, sanoqlar), `css/th.css` + `css/th-app.css` (tokenlar),
`js/th-resume.js` (`data-resume="<id>"` — istalgan joyda rezyume), `js/th-viewer.js` (rasm oynasi),
`js/th-story.js` (story rasm/video).

## Tuzoqlar (har biri bir marta jonli buzilgan)

- **Mini App oq ekran:** bitta nom ikki marta `const`/`function` (`IC` band — `AIC` ishlating); izohda yopuvchi
  script tegi; shell bilan HTML tahriri (6-qoida). Katta HTML/JS — `Write`/`Edit`. `test/htmlsyntax.test.js`
  har sahifa skriptini CI'da kompilyatsiya qiladi. Git Bash heredoc teskari chiziqni yeydi (`\'` -> `'`,
  `\n` -> yangi qator) — skriptni `Write` bilan faylga yozing.
- **Telegram ichida `alert()` ko'rinmaydi** — tugma jim qoladi. Mini App'da `showMsg`/`TG.showAlert`, profilda `fail()`.
- Telegram launch parametrlarini hash'ga qo'yadi — Mini App havolasida `?param=`, hash emas.
- **Bot rasmini URL bilan bermang** (Telegram Render'dan yuklay olmaydi) — `tg.sendLocalPhoto`/`editLocalPhoto`.
  Rasmli xabarda `editMessageText` ishlamaydi. Tahrir qilingan xabarda `parse_mode` ni unutmang (`html: true`).
- Mini App pastki oyna ZANJIR: har oyna `sheetEnter(kalit, chizish)`, "‹" va BackButton bir qadam orqaga.
- Chat jonli yangilanishi (`liveTick`, `MSG_SIG`) miniapp.html va profil.html'da BIR XIL — ikkalasini o'zgartiring.
- Sarlavha shrifti: `font-weight:var(--th-fw-h)`, `letter-spacing:calc(-.4px * var(--th-lsk))` (Android faux bold).
  `--th-bg-2` tokeni YO'Q. profil.html'da `.ab` klassi band.
- Kesh: CSS/JS `no-cache`; panel sahifalarida `?v=`; `sw.js` JS/CSS'ni tarmoqdan oladi.
- `SurveyResponse` sanog'ida `status: { $ne: 'merged' }`. Anketa variant matnlari BAZADA — roles.js o'zgarsa
  eski anketalar o'zgarmaydi. `survey.template()` hali eski uzun ro'yxat.
- SMS: GSM-7 dan tashqari bitta belgi (—, ’, kirill) xabarni UCS-2 ga o'tkazadi (`smsInfo`, `outreach.latin`).
- Prod ma'lumotni o'zgartiradigan endpoint'lar `apply:false` bilan avval ko'rsatadi — Anas tasdig'isiz `apply:true` yo'q.
- hh.uz API: qidiruv/rezyume/import bepul; "Открыть контакты" kvota yeydi — faqat Anas qarori bilan.

## Environment (Render) — qiymatlar FAQAT Render'da, bu fayl OCHIQ repoda

`MONGODB_URI`, `JWT_SECRET`, `NODE_ENV`, `GEMINI_API_KEY` (+ `ANTHROPIC_API_KEY`, `AI_PROVIDER`, `AI_TIMEOUT_MS`),
`SUPERADMIN_PASSWORD` (har ishga tushishda bazadagi parol unga tenglashadi), `ALERT_CHAT_ID`, `CRON_SECRET`
(GitHub Actions'da ham bir xil), to'lov: `PAYME_*`, `CLICK_*`, `UZUM_*` (merchant shartnoma hali yo'q),
ovoz: `AISHA_API_KEY` (VoiceLab `vlk_`), `VOICELAB_VOICE_UZ/_RU`, `AI_VOICE`, hh: `HH_CLIENT_ID`,
`HH_CLIENT_SECRET`, `HH_REDIRECT_URI`, `HH_USER_AGENT`, Verifix: `VERIFIX_CLIENT_ID/_SECRET`, boshqa:
`JOB_CHANNEL`, `REPLACE_GUARANTEE`, `REFERRAL_REWARD`. Lokal — `.env` (gitignore), shakli `.env.example`.

## Ochiq ishlar (2026-11-20)

**Telegramda HALI SINALMAGAN** (kod jonli, haqiqiy akkaunt bilan bosilmagan): `/test` -> haqiqiy mijoz (Tarnov),
Arizalarim yangi kartasi, suhbat kelishish (ikki akkaunt kerak), prescreen va moslik bali, ishga olingandan
keyingi kuzatuv, o'sish funksiyalari (smena bozori, do'st taklifi, birinchi kun), anketa ish tajribasi ekrani,
nomzod kabinetida ish tarixi tahriri, ruscha TTS ovozi; mijoz Mini App v3 (iPhone'da ovoz, mikrofon bilan
qidiruv), yangi anketa oqimi, SLA xabari, kanal havolasidan bir bosishda ariza; "Hali ish qidiryapsizmi?"
Ha/Yo'q (2026-11-26), dushanbalik haftalik hisobot.
**Anas qiladi:** jobChannel kanalini ulash (bot — kanal admini, panel Vakansiyalar -> "Kanal"; Tarnov
vakansiyalarida "Kanalga joylash"); Payme/Click/Uzum merchant shartnoma; haqiqiy kartani panelga kiritish;
Verifix'da OAuth foydalanuvchisiga "Вакансии" ruxsati; ochilib ketgan eski kalitlarni bekor qilish (GitHub
token, bot tokeni, `admin@tarnov.uz` paroli, **MongoDB Atlas foydalanuvchi paroli va `JWT_SECRET` — ochiq git
tarixida bor**); Mijozlar -> "Sinov mijozlari" tugmasi bilan sinov mijozlarini belgilash; Render Starter ($7)
— pulli mijozlardan oldin.
**Kod:** Candidate `fileData`/`photo` ni alohida kolleksiyaga — avval `GET /api/agency/storage` bilan o'lchab,
kerak bo'lsa; `#searchMode` — eski kod EMAS, botdagi qidiruv natijasi (`?s=`) uni ochadi: avval `?s=` ni `#sx` ga
ko'chirish, qurilmada sinash; nomzodlar ro'yxati/kanban birlashtirish (dizayn qarori Anas bilan). Tekshiruvlar — `docs/tarix.md`.
Huquqiy: hh nomzodlari roziliksiz mijozga ko'rinadi, oferta loyihasi yuristga, Gemini bepul tarifi.

Qo'shimcha: `docs/restoone.md` (RestoOne arxitekturasi, dizayn, ofitsiant test tizimi), `docs/claude-skills.md`
(kompyuterdagi skill'lar ro'yxati). Verifix API tafsiloti — `docs/tarix.md` ("VERIFIX API").
