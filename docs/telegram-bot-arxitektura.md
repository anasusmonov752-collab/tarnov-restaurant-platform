# Telegram bot — 1-bosqich arxitekturasi

**Maqsad:** rekruting modulidagi nomzodlar bilan Telegram orqali ikki tomonlama
yozishma. Admin RestoOne'dan (yoki o'z Telegramidan) yozadi, nomzod javob beradi,
javob adminning Telegramiga keladi.

Bu hujjat faqat **1-bosqich**ni qamraydi. Ovozli qidiruv, Mini App, suhbat
belgilash — keyingi bosqichlar, oxirida qisqacha eslatilgan.

---

## 1. Asosiy cheklov va undan kelib chiqqan oqim

**Telegram boti o'zi birinchi bo'lib hech kimga yoza olmaydi.** Bot faqat
`/start` bosgan foydalanuvchiga xabar yubora oladi. Telefon raqami yoki
`@username` orqali odamni topish Bot API da yo'q.

Shuning uchun birinchi aloqa **bot orqali emas, SMS orqali** bo'ladi:

```
1. Admin "Telegramga taklif" bosadi
2. Server bir martalik token yaratadi  ->  t.me/<bot>?start=<token>
3. SMS yuboriladi (Eskiz.uz), ichida shu havola
4. Nomzod havolani bosadi -> Telegram ochiladi -> /start <token>
5. Bot tokenni yechadi -> chatId ni nomzodga bog'laydi
6. Shundan keyin ikki tomonlama yozishma ishlaydi
```

Bu usul **rozilikka asoslangan**: nomzod o'zi havolani bosadi, demak spam
shikoyati va bot bloklanishi xavfi yo'q.

### Deep link cheklovlari
- `?start=` payload **maksimum 64 belgi**, faqat `A-Z a-z 0-9 _ -`.
- Shuning uchun JWT sig'maydi — qisqa tasodifiy token ishlatamiz (22 belgi),
  bazada nomzodga yozib qo'yiladi.

---

## 2. Multi-tenant qarori

RestoOne ko'p restoranli SaaS. Ikki yo'l bor edi:

| Yo'l | Afzalligi | Kamchiligi |
|------|-----------|------------|
| Bitta umumiy bot | Sozlash oson | Nomzod restoran brendini ko'rmaydi |
| Har restoranga o'z boti | Brendlangan, izolyatsiya | Har tenant BotFather'dan token oladi |

**Tanlov: har restoranga o'z boti.** Hozir bitta restoran bor, lekin keyinroq
ko'chirish og'riqli bo'ladi. Qo'shimcha kod deyarli yo'q:

- Bot tokeni `Restaurant.telegram.botToken` da saqlanadi
- Webhook manzili restoranni o'zida olib yuradi:
  `POST /api/tg/webhook/:restaurantId/:secret`
- Bitta Express endpoint hammasiga xizmat qiladi

---

## 3. Ma'lumotlar modeli

### 3.1 `Restaurant` ga qo'shiladigan blok

Restoran hujjati ichida — kichik va cheklangan, alohida kolleksiya shart emas.

```js
telegram: {
  botToken:      { type: String, default: '' },   // BotFather'dan
  botUsername:   { type: String, default: '' },   // deep link qurish uchun
  webhookSecret: { type: String, default: '' },   // URL va header tekshiruvi
  adminChatId:   { type: String, default: '' },   // admin javoblarni shu yerda oladi
  adminLinkToken:{ type: String, default: '' },   // admin o'zini bog'lash uchun
  enabled:       { type: Boolean, default: false }
}
```

### 3.2 `Candidate` ga qo'shiladigan maydonlar

```js
tgChatId:       { type: String, default: '' },    // bog'langandan keyin to'ladi
tgUsername:     { type: String, default: '' },
tgState:        { type: String, default: 'none' },// none|invited|linked|blocked|stopped
tgInviteToken:  { type: String, default: '' },    // deep link payload (bir martalik)
tgInviteSentAt: { type: Date,   default: null },
tgLinkedAt:     { type: Date,   default: null },
tgUnread:       { type: Number, default: 0 }      // o'qilmagan xabarlar soni
```

`tgState` holatlari:
- `none` — hali taklif yuborilmagan
- `invited` — SMS ketdi, hali bosmagan
- `linked` — bog'landi, yozish mumkin
- `blocked` — nomzod botni bloklagan (API 403 qaytardi)
- `stopped` — nomzod `/stop` yubordi (ixtiyoriy chiqish)

`blocked` va `stopped` da **yozish taqiqlanadi** — serverda ham tekshiriladi.

### 3.3 Yangi kolleksiya: `BotMessage`

Yozishma cheksiz o'sadi, shuning uchun alohida kolleksiya —
`MentorChat` bilan bir xil mantiq.

```js
{
  id:           String,   // uuid
  restaurantId: String,
  candidateId:  String,
  direction:    String,   // 'out' (admin -> nomzod) | 'in' (nomzod -> admin)
  text:         String,
  kind:         String,   // 'text' | 'template' | 'system'
  tgMessageId:  Number,   // nomzod chatidagi xabar id
  adminMsgId:   Number,   // admin chatiga forward qilingan xabar id (reply uchun)
  sentBy:       String,   // 'panel' | 'telegram' | 'system'
  error:        String,   // yuborilmasa sabab
  createdAt:    Date
}
```

**Indekslar:**
```js
BotMessageSchema.index({ restaurantId: 1, candidateId: 1, createdAt: -1 });
BotMessageSchema.index({ restaurantId: 1, adminMsgId: 1 });  // reply'ni topish uchun
CandidateSchema.index({ tgInviteToken: 1 });                  // deep link yechish
CandidateSchema.index({ restaurantId: 1, tgChatId: 1 });      // kiruvchi xabarni bog'lash
```

---

## 4. Fayl tuzilishi

Mavjud `src/` konvensiyasiga mos:

```
src/
  models/
    BotMessage.js            -- yangi kolleksiya
    Candidate.js             -- tg* maydonlari qo'shiladi
    Restaurant.js            -- telegram{} bloki qo'shiladi
  services/
    telegram.js              -- Bot API o'rami (sendMessage, setWebhook, ...)
    sms.js                   -- Eskiz.uz (provayder almashtiriladigan qilib)
    botRelay.js              -- relay mantig'i: kim kimga, qaysi holatda
  routes/
    telegram.js              -- /api/tg/* (webhook + admin endpointlari)
docs/
  telegram-bot-arxitektura.md
```

`server.js` ga bitta qator:
```js
app.use('/api/tg', require('./src/routes/telegram'));
```

---

## 5. Kutubxona tanlovi

**Kutubxona ishlatmaymiz — Bot API ga to'g'ridan `fetch`.**

Sabab: 1-bosqichda bizga atigi 4 ta metod kerak — `setWebhook`, `sendMessage`,
`getMe`, `getFile`. Node 18+ da `fetch` tayyor, qo'shimcha bog'liqlik nolga teng.
Webhook'ni Express o'zi qabul qiladi, `express.json()` allaqachon ulangan.

`telegraf`/`grammY` ning kuchi — suhbat holati (conversation state) va middleware.
Bu 4-bosqichda (bot screening, suhbat belgilash) kerak bo'ladi. O'shanda
**grammY** ni qo'shamiz: webhook rejimi Express bilan toza ishlaydi va
`telegraf` ga qaraganda faolroq qo'llab-quvvatlanadi.

Ya'ni: hozir bog'liqliksiz, kerak bo'lganda qo'shamiz.

---

## 6. Endpointlar

### 6.1 Webhook (ochiq, lekin himoyalangan)

```
POST /api/tg/webhook/:restaurantId/:secret
```

**Himoya — uch qavat:**
1. URL dagi `:secret` `Restaurant.telegram.webhookSecret` bilan solishtiriladi
2. `X-Telegram-Bot-Api-Secret-Token` header tekshiriladi (`setWebhook` da
   `secret_token` berilgan bo'ladi)
3. `express-rate-limit` — IP bo'yicha

Bu endpoint `auth()` guard'dan **tashqarida** — Telegram cookie yubormaydi.
Shuning uchun sir orqali tekshiriladi.

Javob **doim `200`** qaytarilsin (xato bo'lsa ham) — aks holda Telegram
qayta-qayta yuboraveradi. Xato logga yoziladi.

### 6.2 Admin endpointlari (`auth(['restaurant'])`)

```
POST   /api/tg/setup              -- bot tokenini saqlash + setWebhook + getMe
GET    /api/tg/status             -- bot ulanganmi, admin bog'langanmi
GET    /api/tg/admin-link         -- adminning o'zini bog'lash havolasi

POST   /api/recruitment/:id/tg/invite    -- token yaratib SMS yuborish
POST   /api/recruitment/:id/tg/message   -- bog'langan nomzodga xabar
GET    /api/recruitment/:id/tg/thread    -- yozishma tarixi
POST   /api/recruitment/tg/broadcast     -- bir nechta nomzodga (guruh amali)
```

Oxirgisi mavjud "guruh tanlash" bilan bog'lanadi — ro'yxatdan 10 ta nomzodni
belgilab, bittada taklif yuborish.

---

## 7. Oqimlar

### 7.1 Adminni bog'lash (bir marta)

```
Admin panel -> "Telegramni ulash" -> t.me/<bot>?start=admin_<token>
-> admin bosadi -> bot /start admin_<token> oladi
-> Restaurant.telegram.adminChatId = chat.id
```

Shundan keyin nomzodlarning javoblari shu chatga keladi.

### 7.2 Nomzodni taklif qilish

```
POST /api/recruitment/:id/tg/invite
  -> tgInviteToken = qisqa tasodifiy (22 belgi)
  -> tgState = 'invited', tgInviteSentAt = now
  -> sms.send(candidate.phone, matn + t.me/<bot>?start=<token>)
```

SMS matni shabloni (restoran nomi o'rniga `{restoran}`):

> {restoran} HR: rezyumengiz ko'rib chiqildi. Suhbat uchun bog'lanamiz —
> Telegram orqali yozish qulayroq: {havola}

### 7.3 Nomzod havolani bosdi

```
Webhook: message.text = "/start <token>"
  -> Candidate.findOne({ tgInviteToken: token })
  -> topilmasa: "Havola eskirgan, HR bilan bog'laning"
  -> topilsa:
       tgChatId = chat.id, tgUsername = from.username
       tgState = 'linked', tgLinkedAt = now
       tgInviteToken = ''            // bir martalik, kuydiriladi
  -> nomzodga salom xabari
  -> adminga xabar: "Aliyev Vali (Ofitsiant) Telegramga ulandi"
```

### 7.4 Nomzod xabar yozdi

```
Webhook: oddiy matn, chatId bo'yicha nomzod topiladi
  -> BotMessage{direction:'in'} saqlanadi
  -> Candidate.tgUnread++
  -> adminning chatiga forward qilinadi, sarlavha bilan:

     Aliyev Vali - Ofitsiant
     ---
     Assalomu alaykum, qachon kelsam bo'ladi?

  -> yuborilgan xabarning id si BotMessage.adminMsgId ga yoziladi
```

### 7.5 Admin Telegramdan javob berdi

Bu eng nozik joy. Admin chatida bir vaqtda o'nlab nomzod bo'ladi — qaysi
javobni kimga yuborishni bilish kerak.

**Yechim: Telegramning "reply" mexanizmi.** Admin kelgan xabarga *reply*
qilib yozadi:

```
message.reply_to_message.message_id
  -> BotMessage.findOne({ restaurantId, adminMsgId: <shu id> })
  -> candidateId topildi
  -> nomzodga yuboriladi, BotMessage{direction:'out', sentBy:'telegram'}
```

Agar admin reply qilmasdan shunchaki yozsa — bot eslatadi:
"Javob berish uchun nomzod xabariga *reply* qiling".

### 7.6 Admin paneldan javob berdi

```
POST /api/recruitment/:id/tg/message { text }
  -> tgState tekshiriladi ('linked' bo'lishi shart)
  -> telegram.sendMessage(chatId, text)
  -> BotMessage{direction:'out', sentBy:'panel'}
  -> tgUnread = 0
```

### 7.7 Bosqich o'zgarganda avtomatik xabar (ixtiyoriy)

Mavjud `PATCH /api/recruitment/:id` da `status` o'zgarsa va nomzod
`linked` bo'lsa — shablon xabar yuborish mumkin. **Default: o'chiq**,
admin sozlamadan yoqadi. Sabab: har bosqich o'zgarishi nomzodga xabar
yuborilishi kerak emas (masalan ichki `reserve`).

---

## 8. SMS servisi

`src/services/sms.js` — provayder almashtiriladigan qilib yoziladi:

```js
module.exports = { send, balance, provider };
```

**Eskiz.uz** (birinchi provayder):
- `POST /api/auth/login` -> token (30 kun amal qiladi, keshlanadi)
- `POST /api/message/sms/send` -> { mobile_phone, message, from }
- Matn shablonlari Eskiz'da **oldindan tasdiqlanishi kerak** — bu muhim,
  tasdiqlanmagan matn yuborilmaydi. Shablonlarni oldindan ro'yxatdan
  o'tkazish kerak.

Muqobil: **Playmobile.uz** — bir xil interfeys ostiga tushadi.

**Env:**
```
SMS_PROVIDER=eskiz
ESKIZ_EMAIL=
ESKIZ_PASSWORD=
SMS_FROM=4546
```

---

## 9. Xavfsizlik va chegaralar

| Xavf | Chora |
|------|-------|
| Webhook'ga soxta so'rov | URL sir + `X-Telegram-Bot-Api-Secret-Token` header |
| Token bazadan sizib chiqishi | `telegram.botToken` hech qachon API javobida qaytarilmaydi |
| Bloklangan nomzodga yozish | `tgState` serverda tekshiriladi, 403 qaytariladi |
| Telegram rate limit | Bitta chatga 1 msg/sek, umumiy 30 msg/sek. Broadcast navbat bilan, 100ms oraliq |
| Nomzod botni bloklasa | API 403 -> `tgState='blocked'`, qayta urinmaydi |
| Chiqish huquqi | `/stop` -> `tgState='stopped'`, boshqa yozilmaydi |
| SMS spam | Bitta nomzodga 24 soatda 1 taklif (`tgInviteSentAt` tekshiriladi) |

---

## 10. Render cheklovi

Bepul tarif 15 daqiqa jimlikdan keyin uxlaydi, uyg'onishi ~50 soniya.
Telegram webhook'ni ~10 soniya kutadi va qayta yuboradi.

Natija: nomzod yozadi -> javob kechikadi yoki xabar takrorlanadi.

**Yechim: Render Starter ($7/oy).** Boshqa yo'llari bor (tashqi ping bilan
uyg'oq tutish), lekin ular ishonchsiz va Render qoidalariga zid.

Shu sababli webhook'da **idempotentlik** ham kerak: Telegram bitta
`update_id` ni qayta yuborsa, ikki marta qayta ishlanmasin.
`update_id` ni oxirgi 1000 tasini xotirada saqlash yetarli.

---

## 11. Frontend o'zgarishlari

Mavjud `public/recruitment.html` (ro'yxat ko'rinishi) ga:

1. Karta pastidagi amallar qatoriga **"Telegram"** tugmasi:
   - `tgState='none'` -> "Telegramga taklif" (SMS yuboradi)
   - `tgState='invited'` -> "Taklif yuborilgan" (kulrang, sana bilan)
   - `tgState='linked'` -> "Yozish" + o'qilmagan belgisi
   - `tgState='blocked'|'stopped'` -> o'chiq, sababi tultip'da

2. Tafsilot oynasida yangi blok — **yozishma** (thread), oddiy chat ko'rinishida.

3. Guruh amallari qatoriga **"Telegramga taklif"** — belgilangan nomzodlarga
   bittada SMS.

4. Admin panelda sozlama: bot tokeni, "Telegramni ulash" havolasi, holat.

---

## 12. Ish tartibi (1-bosqich)

| # | Ish | Natija |
|---|-----|--------|
| 1 | `telegram.js` servis + `BotMessage` model | Bot API ga xabar yuborish ishlaydi |
| 2 | Webhook endpoint + sir tekshiruvi | Telegram xabarlari kelib tushadi |
| 3 | Admin bog'lanishi (`/start admin_<token>`) | Javoblar adminga keladi |
| 4 | `sms.js` + Eskiz integratsiyasi | SMS ketadi |
| 5 | Nomzod taklifi + bog'lanish oqimi | Nomzod havolani bosib ulanadi |
| 6 | Relay: in/out + reply orqali javob | To'liq ikki tomonlama yozishma |
| 7 | Frontend: tugmalar + thread | Paneldan boshqarish |

---

## 13. Oldindan hal qilinishi kerak

Kodga o'tishdan oldin javob kerak bo'lgan savollar:

1. **Bot nomi** — BotFather'da qanday username olinadi? (`@TarnovHRbot`?)
2. **SMS provayderi** — Eskiz.uz hisobi bormi? Yo'q bo'lsa ochish kerak
   (yuridik shaxs hujjatlari talab qilinadi) va matn shablonlarini
   tasdiqlatish kerak — bu bir necha kun oladi.
3. **Render Starter** — $7/oy ga o'tishga rozimi?
4. **SMS matni** — yuqoridagi shablon maqulmi? Eskiz tasdiqlashi uchun
   aniq matn kerak.

---

## Keyingi bosqichlar (qisqacha)

- **2-bosqich:** ovozli/matnli qidiruv. Gemini ovozni to'g'ridan tushunadi
  (`GEMINI_API_KEY` bor), alohida STT kerak emas. Ovoz -> kriteriyalar ->
  `Candidate` bo'yicha qidiruv -> AI saralash.
- **3-bosqich:** Mini App. `recruitment.html` ni qayta ishlatish mumkin —
  cookie auth o'rniga Telegram `initData` tekshiruvi.
- **4-bosqich:** suhbat belgilash va bot screening. Shu yerda **grammY**
  qo'shiladi (suhbat holati kerak bo'ladi).
- **Uzoq maqsad:** ishga olingan nomzodning o'sha Telegram chati RestoOne
  o'quv kanaliga aylanadi — test eslatmalari, menyu yangilanishi, modul
  havolalari. Rekruting -> onboarding -> o'qitish bitta botda.
