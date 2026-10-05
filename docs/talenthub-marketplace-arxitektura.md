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
available,                      // hali ish qidiryaptimi
availabilityAskedAt,
availabilityAnsweredAt,
anonSummary,                    // ish joyi nomlarisiz xulosa (pastga qarang)
shownToClients: [clientId]      // kimga ko'rsatilgan (takrorlamaslik uchun)
```

---

## 4. Anonim karta — eng nozik joy

**Xavf:** "Xostes, 21 yosh, Benedict'da 1 yil, ingliz+rus" — mijoz buni hh.uz'da
ikki daqiqada topadi. Nomzodlar hh'dan kelgan, mijozning ham hh'ga kirishi bor.

### Ko'rsatiladi
kod (A-128) · lavozim · tajriba yili · ko'nikmalar · tillar · yosh **oralig'i**
(20-25) · hudud (shahar, aniq manzil emas) · maosh **oralig'i** · AI moslik ·
tiriklik belgisi ("bu hafta tasdiqlangan")

### Ko'rsatilmaydi
ism · telefon · email · **foto** · ish joyi **nomlari** · rezyume PDF

### `anonSummary` kerakligi
Mavjud `experienceSummary` ichida kompaniya nomlari bor ("Benedict'da ishlagan").
Shuning uchun AI tahlilida **ikkinchi, niqoblangan variant** ham yaratiladi:

> "Premium restoranda 1 yil xostes, bron tizimi va mehmon kutib olish tajribasi"

Bu rezyume yuklanganda bir marta hisoblanadi, qayta ishlov kerak emas.

### Haqiqiy himoya — sir emas, qiymat
Telefon raqamining o'zi arzon. Mijoz **tekshirilgan tayyorlik** uchun to'laydi:
siz gaplashgansiz, nomzod bo'sh, maoshni aytgan, chiqish sanasi ma'lum.
Raqam sizib chiqsa ham bu yo'qolmaydi.

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
    Candidate.js         publicCode, available, anonSummary qo'shiladi
  services/
    anonymize.js         yangi - nomzodni mijoz uchun tozalaydi
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
| 3 | `anonymize.js` + `anonSummary` | — |
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

**Nomzod roziligi.** Nomzodlar rezyumeni hh.uz'ga yuklagan, sizga emas.
Botga ulanganlar rozilik bergan hisoblanadi. Ulanmaganlarni mijozga ko'rsatish
— huquqiy jihatdan noaniq. Xavfsiz yo'l: faqat ulangan va `available`
nomzodlarni ko'rsatish. Bu sifatni ham oshiradi.

**RestoOne bilan aloqa.** Mijoz TalentHub orqali xodim oldi -> o'sha xodim
RestoOne'ga o'quvga tushadi. Rekruting bir martalik, o'qitish oylik. Ikkala
mahsulotni birga ushlashning asosiy sababi shu — lekin bu alohida ish.
