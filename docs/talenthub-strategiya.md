# TalentHub — uzoq muddatli strategiya

**Sana:** 2026-10-06
**Maqsad:** O'zbekistonda ish beruvchi va ish qidiruvchi uchun ikki tomonlama
platforma. Bu hujjat yo'nalishni belgilaydi — joriy ishlarni emas.

Joriy qurilish hujjatlari: [vositachi model](talenthub-marketplace-arxitektura.md),
[Telegram bot](telegram-bot-arxitektura.md).

---

## 1. Bozor haqiqati

Dastlab "O'zbekistondagi birinchi ilova" deb o'ylangandi. **Bu to'g'ri emas:**

| Platforma | Holati |
|-----------|--------|
| hh.uz | Eng katta, o'n minglab vakansiya. Biz uning mijozimiz |
| OLX.uz | Oyiga ~2,7 mln tashrif (2025 iyun) |
| ish.uz, Jobs.uz | Ishlayapti |
| Telegram kanallari | Rasmiy emas, lekin real va katta kanal |

Shuning uchun strategiya **"birinchi bo'lish" emas** — kimdir yomon xizmat
qilayotgan segmentda eng yaxshi bo'lish.

---

## 2. Global muammolar (2025 ma'lumotlari)

Dunyodagi barcha ish platformalari bir xil ikki kasallikdan aziyat chekadi.

### Ghosting
- Arizalarning **75%** i javobsiz qoladi
- Ish beruvchilarning **80%** i ghosting qilishini tan oladi
- Suhbatdan keyin ham javobsizlik — **61%** (2024 boshidan 9 punktga o'sgan)
- Kichik kompaniyalar yiriklardan **2 barobar** ko'p ghosting qiladi

### Soxta vakansiyalar
- Har **3 ta ish beruvchidan 1 tasi** yollash niyatisiz e'lon joylashtiradi
- Nomzodlarning **39%** i buni asosiy muammo deb biladi
- **43%** i e'lon haqiqiymi yoki yo'qmi ajrata olmasligini aytadi

### Ish beruvchi tomoni
- Asosiy muammo — mos kelmaydigan arizalar oqimi (**56%**)
- Ikkinchisi — nomzodning yo'qolib qolishi (**52%**)

**Xulosa:** bu texnik emas, **ishonch** muammosi. Ikkala tomon ham bir-biriga
ishonmaydi, platforma esa o'rtada turib hech kimga javobgar emas.

---

## 3. Modellar tahlili

| Model | Kuchli tomoni | Zaif tomoni |
|-------|---------------|-------------|
| hh / rezyume bazasi | Ish beruvchi o'zi qidiradi, tez | **Kirish** sotiladi, natija emas |
| LinkedIn / tarmoq | Passiv nomzodlar, professional aloqa | Ko'k yoqada ishlamaydi |
| Indeed / agregator | Ulkan hajm, arzon | Sifat qulaydi, soxta e'lon ko'p |
| Glassdoor / sharhlar | Nomzodga kuch beradi | Yollash oqimi yo'q |
| Smena ilovalari | Tekshirilgan ishchi, tez moslash | Og'ir operatsiya, har shaharda jamoa |

Oxirgisi bizga eng yaqin: ular **tekshirishni mahsulotga aylantirgan**.

---

## 4. O'zbekistondagi bo'shliq

hh.uz kuchli, lekin **oq yoqa** uchun. Ko'k yoqa (restoran, savdo, xizmat)
OLX va Telegram kanallarida — u yerda saralash ham, tekshirish ham,
javobgarlik ham yo'q.

**Hal qiluvchi fakt (2026-10-06 da o'z hisobimizdan aniqlangan):**
hh.uz'da rezyume bazasiga kontaktli kirishning eng arzon tarifi **~18 mln so'm**.

Demak restoran, kafe, do'kon, chaykhana — ya'ni bizning butun maqsadli
auditoriyamiz — hh'ga **kira olmaydi**. Ular bozordan narx bilan chiqarib
tashlangan.

> **Bo'shliq:** kichik ish beruvchi + ko'k yoqa xodim + natijaga to'lov.

---

## 5. Bizning farqimiz

Muhimlik tartibida.

### 5.1 Ovozli rezyume — asosiy ustunlik
Ofitsiant, oshpaz, sotuvchi rezyume yozmaydi. Bu ularning platformalarga
kirmasligining asosiy sababi. Bizda **ovozni tushunadigan AI allaqachon
ishlaydi** (Gemini, sinovdan o'tgan): nomzod 30 soniyalik ovozli xabar
yuboradi, AI to'liq profil quradi.

Raqobatchilar buni qila olmaydi — ularning butun mahsuloti rezyume formasiga
qurilgan.

### 5.2 Javob kafolati
75% ariza javobsiz qoladi. Biz vositachi bo'lganimiz uchun buni nazorat
qilamiz: har nomzod javob oladi, hatto rad javobi bo'lsa ham. Arzon, lekin
hech kim qilmaydi.

### 5.3 Vakansiya tasdig'i
Ish beruvchi vakansiyani muntazam tasdiqlab turadi; kartada "2 kun oldin
tasdiqlangan" ko'rinadi. Tasdiqlamasa — arxivga. Soxta e'lonlar muammosining
oddiy yechimi.

### 5.4 Kirish emas, natija sotish
hh oldindan kirish sotadi. Biz tekshirilgan kontakt sotamiz, ishlamasa
qaytaramiz. Kichik biznes uchun yagona ma'noli model.

### 5.5 Telegram-native
Ilova o'rnatish yo'q, ro'yxatdan o'tish yo'q. hh buni qila olmaydi —
ularning mahsuloti veb/ilovaga bog'langan.

### 5.6 Ikki tomonlama reputatsiya
Ish beruvchi — javob tezligi bo'yicha, nomzod — suhbatga kelgani bo'yicha.
Ghosting qilgan tomon ko'rinadi.

---

## 6. Arxitekturaga ta'siri

Bitta katta o'zgarish kerak bo'ladi:

> **Hozir nomzod — yozuv. Kelajakda nomzod — foydalanuvchi.**

| | Hozir | Kerak bo'ladi |
|---|-------|---------------|
| Nomzod | Biz yuklagan PDF | O'z kabineti, profilini o'zi yangilaydi |
| Vakansiya | Yo'q | Birinchi darajali obyekt, ariza qabul qiladi |
| Oqim | Faqat biz qidiramiz | Nomzod ham ariza beradi |
| Kim ko'rdi | Yo'q | "3 ta restoran profilingizni ko'rdi" |

**Eng qiyin qismi allaqachon qurilgan:** `Candidate.tgChatId` bor, bot ikki
tomonlama yozishadi, ovoz tushuniladi. Nomzodni foydalanuvchiga aylantirish
uchun poydevor tayyor.

---

## 7. Bosqichlar — va nega aynan shu tartibda

Ikki tomonlama bozorning asosiy o'ldiruvchisi — **"tovuqmi, tuxummi"**.
Nomzod yo'q bo'lsa ish beruvchi kelmaydi; ish beruvchi yo'q bo'lsa nomzod
kelmaydi.

Bizda bu muammo **hal bo'lgan holatda boshlanyapti**: 799 ta nomzod bor
(2026-10-06), vositachi model bilan birinchi to'lovchi mijozlar keladi.

```
1-bosqich  AGENTLIK (hozir)
           Biz qidiramiz, biz tekshiramiz, mijoz tanlaydi.
           Maqsad: 10-20 to'lovchi mijoz, 2000+ tirik nomzod.

2-bosqich  YARIM OCHIQ
           Ish beruvchi o'zi vakansiya qo'yadi, lekin kontakt
           baribir biz orqali. Nomzodga kabinet beriladi.

3-bosqich  BOZOR
           Ikki tomon o'z-o'ziga xizmat qiladi. Biz tekshirish va
           kafolat qatlami bo'lib qolamiz.
```

**Agentlik modelini tashlab bozorga yugurmaslik kerak.** Agentlik — bozorning
urug'i. 3-bosqich ochilgan kuni bozor allaqachon to'la bo'lishi shart.

---

## 8. Xavflar

| Xavf | Izoh |
|------|------|
| Nomzod bazasining eskirishi | Eng katta xavf. Tiriklik tekshiruvi majburiy |
| hh narxni tushirishi | Ehtimoli past — bu ularning asosiy daromadi |
| Operatsion yuk | Tekshirish qo'lda. 50+ mijozda jamoa kerak bo'ladi |
| Ikki tomonlama o'tish | 2-bosqichda nomzod sifati tushishi mumkin — ochilish nazorat bilan |
| Bitta botga bog'liqlik | Bot cheklansa hammasi to'xtaydi |

---

## 9. Manbalar

- [2025 Ghosting Index](https://blog.theinterviewguys.com/the-2025-ghosting-index/)
- [Ghost jobs va ishonch inqirozi — HR Dive](https://www.hrdive.com/news/ghost-jobs-and-fake-applicants-have-created-a-hiring-trust-gap/831871/)
- [iHire: nomzodlarning 53% i ghosting ko'rgan](https://www.ihire.com/resourcecenter/employer/pages/53-percent-of-job-seekers-have-been-ghosted-by-a-potential-employer)
- [O'zbekistonda yollash — Rivermate](https://rivermate.com/guides/uzbekistan/recruitment)
- [O'zbek platformalari ro'yxati](https://sharh.commeta.uz/en/blog/Ish-qidiruvchilar-uchun-eng-yaxshi-platformalar)
- [OLX.uz trafigi — Ahrefs](https://ahrefs.com/websites/olx.uz)

hh.uz tarifi va kvota ma'lumotlari hisobning o'zidan olingan (2026-10-06).
