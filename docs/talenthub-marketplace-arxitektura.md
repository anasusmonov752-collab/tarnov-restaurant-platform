# TalentHub — vositachi model arxitekturasi

**Maqsad:** nomzodlar bazasi sizniki, mijoz restoranlar uni **anonim** ko'radi,
yoqqanini tanlaydi, kontakt faqat siz tasdiqlagandan va kredit yechilgandan
keyin ochiladi.

Bu hujjat 1-bosqichdagi `telegram-bot-arxitektura.md` ning davomi. U yerdagi
nomzod bilan yozishma mexanizmi o'zgarmaydi — ustiga mijoz qatlami qo'shiladi.

---

## 1. Nima o'zgaradi

| | Hozir | Yangi model |
|---|---|---|
| Nomzod kimniki | Restoranga tegishli | **Agentlikka** (sizga) |
| Kontakt | Hamma ko'radi | Faqat siz; mijoz sotib oladi |
| Mijoz | Yo'q | Yangi obyekt, bot orqali ishlaydi |
| Bot rollari | nomzod + siz | nomzod + **mijoz** + siz |

Qurilgan narsa behuda ketmaydi: nomzod yozishmasi, qidiruv, rekruting paneli
hammasi qoladi. Ustiga mijoz qatlami va kredit hisobi qo'shiladi.

---

## 2. Surface bo'linishi

```
Mijoz menejeri        Bot: so'rov, bildirishnoma, holat
                      Mini App: ko'rib chiqish va tanlash

Siz (agentlik)        Bot: tanlov keldi, nomzod javob berdi
                      Veb panel: to'liq ish (mavjud /recruitment.html)

Nomzod                Bot: faqat yozishma (1-bosqichdagidek)
```

**Nega tanlash Mini App'da:** mijoz 10-15 ta kartani ko'rib, bir nechtasini
belgilashi kerak. Chatda belgilangan holatni ko'rsatib bo'lmaydi, taqqoslash
yo'q, skroll uzoq. Mini App — mavjud `recruitment.html` ning anonim varianti.

---

## 3. Ma'lumotlar modeli

### 3.1 Yangi: `Client` — mijoz restoran

```js
{
  id, agencyId,                 // agencyId = sizning Restaurant.id
  name,                         // "Chaykhana Navruz"
  contactName, phone,
  tgChatId,                     // menejerning Telegrami
  tgLinkToken,                  // bog'lash havolasi, bir martalik
  status,                       // pending | active | blocked
  credits,                      // qolgan kontakt krediti
  createdAt, lastSeenAt
}
```

`status: pending` muhim — botga istalgan odam yoza oladi. Siz tasdiqlamaguncha
hech narsa ko'rsatilmaydi, aks holda raqobatchi bazangizni ko'radi.

### 3.2 Yangi: `Vacancy` — mijozning ehtiyoji

```js
{
  id, clientId, agencyId,
  role, title,
  minExp, languages[], location, salaryFrom, salaryTo, shift,
  notes,
  status,                       // open | paused | closed
  autoNotify,                   // yangi mos nomzod kelsa xabar berilsinmi
  createdAt, closedAt
}
```

**Nega so'rov emas, vakansiya:** mijoz bir marta ochadi, keyin yangi nomzod
kelganda bot o'zi xabar qiladi. Mijoz qaytib keladi. Va sizda talab statistikasi
yig'iladi — nimani qidirish kerakligini bilasiz.

### 3.3 Yangi: `Shortlist` — mijoz tanlagan nomzodlar

```js
{
  id, clientId, vacancyId, agencyId,
  items: [{
    candidateId,
    state,                      // selected | contacting | candidate_ok |
                                // candidate_no | revealed | refunded
    revealedAt, refundedAt, note
  }],
  status,                       // new | in_progress | done
  createdAt
}
```

Bitta so'rovni oxirigacha kuzatish uchun. 5 ta mijoz bilan ishlaganda kim
nimani tanlagani va qaysi bosqichda ekani esda qolmaydi.

### 3.4 Yangi: `CreditLedger` — har bir kredit harakati

```js
{
  id, clientId, agencyId,
  delta,                        // +10 paket | -1 ochildi | +1 qaytarildi
  reason,                       // purchase | reveal | refund | bonus
  shortlistId, candidateId,
  note, createdAt
}
```

Faqat qo'shiladigan jurnal. Nizo chiqqanda "qachon nima yechilgan" aniq
ko'rinadi. `Client.credits` — shu jurnalning yig'indisi (tezlik uchun saqlanadi).

### 3.5 `Candidate` ga qo'shiladi

```js
publicCode,                     // mijozga ko'rsatiladigan kod: "A-128"
jobStatus,                      // qidirmoqda | ko'rib chiqmoqda | qidirmayapti
jobStatusAt,                    // qachon belgilangan/tasdiqlangan
shownToClients: [clientId]      // kimga ko'rsatilgan (takrorlamaslik uchun)
```

`jobStatus` — hh.uz'dagidek uch holat ("Активно ищет работу" / "Рассматривает
предложения" / "Не ищет"). Dastlab rezyumedan olinadi, keyin bot orqali
nomzodning o'zidan so'ralib yangilanadi. Mijoz kartada shuni ko'radi —
eski nomzodga vaqt sarflamaydi.

---

## 4. Anonim karta

### Yashiriladi — faqat ikki narsa
**ism-familiya** · **telefon va email**

### Qolgani ochiq
lavozim · tajriba · ish joylari (nomi bilan) · ko'nikmalar · tillar · yosh ·
hudud · maosh talabi · ta'lim · AI moslik · foto · holat

### Nega to'liq niqoblash shart emas
Dastlab ish joyi nomlarini ham yashirish rejalashtirilgandi — mijoz nomzodni
hh.uz'da topib olmasin deb. **Bu keraksiz ekan:** hh'da kontakt ochishning eng
arzon tarifi ~18 mln so'm. Mijoz bitta ofitsiant uchun bunga kirmaydi.

Ya'ni himoya sir saqlashda emas — **narx to'sig'ida**. Mijoz nomzodni taniy
oladi, lekin unga chiqishning yo'li baribir siz orqali, chunki muqobili
qimmatroq.

Bu qaror ishni ancha soddalashtiradi: `anonSummary` kerak emas, rezyumeni
qayta ishlash shart emas, mavjud maydonlar shundayligicha ishlatiladi.
Anonimlashtirish — bitta funksiya, ikki maydonni olib tashlaydi.

### Haqiqiy qiymat
Telefon raqamining o'zi arzon. Mijoz **tekshirilgan tayyorlik** uchun to'laydi:
siz gaplashgansiz, nomzod bo'sh, maoshni aytgan, chiqish sanasi ma'lum.

---

## 5. Kredit mexanikasi

**Kredit TANLAGANDA emas, KONTAKT OCHILGANDA yechiladi.**

```
Mijoz tanlaydi            -> 0 kredit (bepul)
Siz nomzod bilan gaplashasiz
  nomzod rozi             -> kontakt ochiladi, -1 kredit
  nomzod yo'q / topilmadi -> 0 kredit, mijozga boshqasi taklif qilinadi
Ochilgandan keyin 48 soat ichida javob bermasa -> +1 qaytariladi
```

Kafolat shu oqimning ichiga qurilgan: mijoz **doim tekshirilgan** kontakt oladi,
chunki siz tasdiqlamaguncha ochilmaydi.

---

## 6. Oqimlar

### 6.1 Mijozni qo'shish
```
Siz panelda mijoz yaratasiz -> bot havolasi
-> menejer /start bosadi -> Client.tgChatId bog'lanadi
-> status: active, boshlang'ich kredit beriladi
```

### 6.2 Vakansiya va tanlash
```
Menejer botga: "xostes kerak, ingliz tili bilan"
-> bot kriteriyani tushunadi (mavjud candidateSearch)
-> vakansiya yaratiladi
-> bot: "12 ta mos nomzod bor" + [Ko'rish] tugmasi
-> Mini App: anonim kartalar, belgilash, "3 ta tanlandi" -> [Yuborish]
-> Shortlist yaratiladi
-> SIZGA bot xabar: "Navruz 3 ta nomzod tanladi" + to'liq kontaktlar
```

### 6.3 Siz nomzodlar bilan
```
Har nomzodga: bot orqali yozasiz yoki qo'ng'iroq
-> "rozi" bosasiz   -> kontakt mijozga ochiladi, -1 kredit
-> "yo'q" bosasiz   -> mijozga sabab bilan xabar, kredit yechilmaydi
```

### 6.4 Tiriklik tekshiruvi
```
Har 7-10 kunda: ulangan, available, uzoq so'ralmagan nomzodlarga
-> "Hali ish qidiryapsizmi?" [Ha] [Yo'q]
-> Yo'q -> available=false, mijozlarga ko'rsatilmaydi
```

Bu sizning asosiy ustunligingiz: raqobatchilar eski ro'yxat sotadi.

---

## 6.5 Hammasi bitta botdami

**Ha — bitta bot, @TalentHubUzBot.**

Sabablari:
- Rol ajratish allaqachon ishlayapti (`chatId` bo'yicha), uchinchi rol
  qo'shish — bir nechta qator
- Bitta token, bitta webhook, bitta deploy — xato qidirish bir joyda
- Telegram har foydalanuvchiga **alohida buyruqlar menyusi** beradi
  (`setMyCommands` + `scope: chat_id`), demak nomzod va mijoz har xil
  menyu ko'radi, bot bitta bo'lsa ham
- Brend bitta joyda to'planadi

**Yagona jiddiy e'tiroz:** bitta bot — bitta nuqtadan buzilish. Bot
cheklansa (masalan nomzodlardan spam shikoyati), hammasi to'xtaydi:
nomzodlar ham, mijozlar ham. Lekin bizning oqim roziliкka asoslangan
(nomzod havolani o'zi bosadi), shuning uchun bu xavf past.

### Rol ustunligi
Bir odam ikki rolda bo'lishi mumkin (masalan menejer o'zi ham ish
qidiryapti). Shuning uchun tartib qat'iy:

```
1. adminChatId    -> siz
2. Client.tgChatId -> mijoz menejeri     <- to'lov munosabati ustun
3. Candidate.tgChatId -> nomzod
```

---

## 7. Bot uch rolni qanday ajratadi

`chatId` bo'yicha, shu tartibda:

```
1. Restaurant.telegram.adminChatId  -> SIZ
2. Client.tgChatId                  -> mijoz menejeri
3. Candidate.tgChatId               -> nomzod
topilmasa                           -> notanish, /start havolasini so'raydi
```

Har rol uchun alohida xabar qayta ishlash. Hozirgi kod 1 va 3 ni biladi —
2 qo'shiladi.

---

## 8. Mini App avtorizatsiyasi

Telegram `initData` yuboradi — bot tokeni bilan imzolangan. Server HMAC ni
tekshiradi, `user.id` ni oladi, `Client.tgChatId` bilan solishtiradi.

Cookie yo'q, parol yo'q. `auth_date` eskirgan bo'lsa (masalan 24 soatdan katta)
rad etiladi.

Mini App faqat **anonim** ma'lumot beradigan endpointlarni ko'radi — alohida
route oilasi (`/api/ma/*`), tasodifan to'liq ma'lumot chiqib ketmasligi uchun.

---

## 9. Fayl tuzilishi

```
src/
  models/
    Client.js            yangi
    Vacancy.js           yangi
    Shortlist.js         yangi
    CreditLedger.js      yangi
    Candidate.js         publicCode, jobStatus qo'shiladi
  services/
    anonymize.js         yangi - ism va kontaktni olib tashlaydi
    credits.js           yangi - yechish/qaytarish, jurnal bilan
    clientBot.js         yangi - mijoz tomonidagi suhbat
    candidateSearch.js   mavjud, vakansiya kriteriyasi bilan ishlatiladi
  routes/
    clients.js           yangi - siz uchun mijoz boshqaruvi
    miniapp.js           yangi - /api/ma/*, initData avtorizatsiyasi
    telegram.js          mavjud, mijoz roli qo'shiladi
public/
  miniapp.html           yangi - recruitment.html ning anonim varianti
```

---

## 10. Ish tartibi

| # | Ish | Bog'liqlik |
|---|-----|-----------|
| 1 | `Client` modeli + siz uchun mijoz boshqaruvi | — |
| 2 | Botda mijoz roli: bog'lanish, so'rov | 1 |
| 3 | `anonymize.js` (ism + kontaktni olib tashlaydi) | — |
| 4 | Mini App: anonim ro'yxat, tanlash | 3 |
| 5 | `Shortlist` + sizga bildirishnoma | 2, 4 |
| 6 | `credits.js` + ochish/qaytarish | 5 |
| 7 | Tiriklik tekshiruvi | — |

1-6 asosiy oqim. 7 alohida, istalgan vaqtda.

---

## 11. Hal qilinmagan savollar

**Narx.** Kredit paketi narxi hali yo'q — birinchi 3-5 mijozga bepul berib,
haqiqiy ma'lumot bilan qo'yiladi. Tizim narxga bog'liq emas, shuning uchun
hozir to'sqinlik qilmaydi.

**To'lov qabul qilish.** Hozir qo'lda (siz kredit qo'shasiz). Payme/Click
integratsiyasi keyinroq, mijozlar paydo bo'lgandan keyin.

**Tiriklik tekshiruvi jadvali.** Render bepul tarifda ishonchli cron yo'q
(xizmat uxlaydi). Variantlar: tashqi cron xizmati, yoki har so'rovda
"eskirgan" nomzodlarni tekshirish. Starter tarifga o'tilsa muammo yo'qoladi.

**Qaysi nomzodlar ko'rsatiladi.** Dastlab "faqat botga ulanganlar" deb
o'ylangandi, lekin hozir 245 tadan atigi bittasi ulangan — bu bazani
ishlatib bo'lmas qilardi. **Qaror: hammasi ko'rsatiladi**, kartada
`jobStatus` belgisi bilan. Nomzodlar bot orqali ulangani sayin status
aniqlashib boradi.

**RestoOne bilan aloqa.** Mijoz TalentHub orqali xodim oldi -> o'sha xodim
RestoOne'ga o'quvga tushadi. Rekruting bir martalik, o'qitish oylik. Ikkala
mahsulotni birga ushlashning asosiy sababi shu — lekin bu alohida ish.
