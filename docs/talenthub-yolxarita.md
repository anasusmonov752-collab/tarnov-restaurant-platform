# TalentHub — yo'l xaritasi: bugundan to'liq ishlashgacha

**Sana:** 2026-10-10
**Holat:** asosiy tsikl ishlaydi, mijoz yo'q, narx qo'yilmagan

Soatlar — **men bilan ishlash vaqti** (kod yozish + sinash). Taqvim kuni
emas. Sizning mijoz topish va qo'ng'iroq qilish ishingiz bunga kirmaydi —
u alohida va kattaroq.

---

## 0. Bugun nima ishlaydi

Tekshirilgan va jonli:

| Qism | Holat |
|------|-------|
| 799 nomzod, AI tahlil bilan | ✅ |
| hh uslubidagi nomzodlar bazasi (sayt) | ✅ |
| Telegram bot: siz / mijoz / nomzod — uch rol | ✅ |
| Ovozli va matnli nomzod qidiruvi | ✅ |
| Mini App: anonim kartalar, tanlash, yuborish | ✅ |
| Mijozlar va tanlovlar sahifasi (sayt) | ✅ |
| Kontakt ochish, kredit yechish, ledger | ✅ |
| Telegram inline tugmalar (rozi / yo'q) | ✅ |
| Mijoz kabineti: tanlovlar, balans, aloqa | ✅ |

**Ya'ni pul ishlaydigan tsikl yopilgan.** Qolgani — va'dalarni bajarish,
sifat va o'sish.

---

## 1-bosqich — Birinchi to'lovchi mijozga tayyor

Busiz ishlash mumkin, lekin professional ko'rinmaydi va siz ma'lumot
yig'a olmaysiz.

| # | Ish | Soat | Nega kerak |
|---|-----|------|------------|
| 1.1 | **Qo'ng'iroq sabablari** — "javob bermadi / keyinroq / boshqa ish topdi / maosh past / joy uzoq" | 3 | Mijozga "nega topilmadi" deb ayta olasiz. Eng katta maslahat qiymati |
| 1.2 | **Nomzodning to'liq rezyumesi** adminda — ish tarixi, ko'nikma, ta'lim + original PDF | 2 | Qo'ng'iroq qilishdan oldin kimga qo'ng'iroq qilayotganingizni bilishingiz kerak |
| 1.3 | **Rad etilganda mijozga xabar** | 1 | Hozir jim qoladi — mijoz kutadi va ishonchni yo'qotadi |
| 1.4 | Ma'lumot tozalash: 162 ta `boshqa` rol, 33 ta tahlilsiz, 3 ta sinov yozuvi | 2 | Filtr noto'g'ri ishlayapti, demo buziladi |
| 1.5 | Render Starter + bot tokenini almashtirish | 1 | Bepul tarif 15 daqiqada uxlaydi — mijoz botni "o'lgan" deb o'ylaydi |

**Jami: 9 soat**

> Shu yerdan keyin birinchi bepul mijozlarni qabul qilish mumkin.

---

## 2-bosqich — Va'dalarni bajarish

Modelimiz ikki narsa va'da qiladi: **kafolat** va **tirik nomzod**. Ikkalasi
ham hali kodda yo'q.

| # | Ish | Soat | Izoh |
|---|-----|------|------|
| 2.1 | **48 soatlik qaytarish** — nomzod javob bermasa kredit qaytadi | 3 | Model hujjatida va'da qilingan, kodda yo'q |
| 2.2 | **Tiriklik tekshiruvi** — har 7-10 kunda "hali ish qidiryapsizmi?" | 4 | Asosiy raqobat ustunligi. Busiz baza eskiradi |
| 2.3 | **Jadval (cron)** — 2.1 va 2.2 uchun | 2 | Render bepul tarifda ishonchli cron yo'q. Starter + tashqi cron |
| 2.4 | **Vakansiya** — mijozdan maosh/smena/muddat so'raladi, tanlov tepasida turadi | 5 | Qo'ng'iroqda nima taklif qilayotganingizni bilasiz. Matching ham yaxshilanadi |

**Jami: 14 soat**

> Shundan keyin pul olish halol: va'da qilingan narsa haqiqatan ishlaydi.

---

## 3-bosqich — Nomzod oqimi

Eng katta xavf shu: **baza eskiradi**. 799 nomzod bir martalik aktiv, uni
to'ldirmasa mahsulot o'ladi.

| # | Ish | Soat | Izoh |
|---|-----|------|------|
| 3.1 | **Ovozli rezyume** — nomzod 30 soniya gapiradi, AI profil quradi | 6 | Asosiy ustunlik. Texnologiya tayyor (Gemini), oqim qurilmagan |
| 3.2 | Nomzod ro'yxatdan o'tish oqimi (bot ichida) | 4 | Hozir nomzod faqat siz yuklaganingizda paydo bo'ladi |
| 3.3 | Telegram kanaliga avtomatik joylash (kuniga 3-5 anonim karta) | 3 | Ikki tomonni birga yig'adi — marketing hujjatiga qarang |
| 3.4 | Tavsiya halqasi (mijoz va nomzod uchun) | 2 | Arzon o'sish |
| 3.5 | "Bu nomzod oldin ko'rsatilgan" ogohlantirishi | 1 | Bazani kuydirmaslik |

**Jami: 16 soat**

---

## 4-bosqich — Operatsion barqarorlik

| # | Ish | Soat | Izoh |
|---|-----|------|------|
| 4.1 | **PDF'larni bazadan chiqarish** | 4 | Atlas bepul tarifi 512 MB. 799 rezyume base64 holda ichida — chegaraga yaqin |
| 4.2 | Avtomatik zaxira | 2 | Hozir qo'lda skript bor, jadval yo'q |
| 4.3 | **To'lov qabul qilish (Payme/Click)** | 8 | 5 mijozgacha qo'lda bemalol. 20 mijozda shart |
| 4.4 | Sizning analitikangiz — nima so'ralyapti, nima topilmayapti | 3 | Qaysi nomzodni yig'ish kerakligini bilish |
| 4.5 | Shartnoma / foydalanish shartlari | 2 | Shaxsiy ma'lumot saqlayapsiz — rasmiylashtirish kerak |

**Jami: 19 soat**

---

## Yig'indi

| Bosqich | Soat | Nima beradi |
|---------|------|-------------|
| 1 — Birinchi mijozga tayyor | 9 | Bepul sinov mijozlarini qabul qilish |
| 2 — Va'dalarni bajarish | 14 | Halol pul olish |
| 3 — Nomzod oqimi | 16 | Mahsulot o'lmaydi |
| 4 — Operatsion | 19 | 20+ mijozni ko'tara oladi |
| **JAMI** | **58 soat** | |

**Minimum javob:**

- **9 soat** — birinchi mijozni qabul qilish
- **23 soat** — pul olishga halol tayyor (1 + 2)
- **58 soat** — to'liq, o'sishga tayyor

Sinash va tuzatish uchun **+30%** qo'shing: real ko'rsatkich **~75 soat**.
Bugungi tezligimizda bu **8–10 ta ish seansi**.

---

## Eng muhim ogohlantirish

58 soat kod yozilsa ham, **mijoz o'zi kelmaydi**.

| Ish | Kim | Vaqt |
|-----|-----|------|
| Kod | Men | ~58 soat |
| **Mijoz topish** | **Siz** | **haftalar** |
| Nomzodlar bilan qo'ng'iroq | Siz | kundalik |

Loyihaning muvaffaqiyati kodga emas, **birinchi 10 mijozga** bog'liq.
Shuning uchun tavsiyam:

> **1-bosqichni tugating (9 soat) va sotuvni boshlang.**
> 2 va 3-bosqichlarni mijoz bilan ishlagan holda qiling.

Sabab: hozir qurilgan narsalarning qaysi biri haqiqatan kerakligini faqat
mijoz ko'rsatadi. Mijozsiz 58 soat yozish — taxmin bo'yicha qurish.

---

## Ko'rib chiqilmagan savollar

**Shaxsiy ma'lumot.** 799 odamning ismi, telefoni va rezyumesi saqlanyapti.
Ular hh.uz orqali Tarnov hisobidan yig'ilgan. O'z biznesingizda ishlatish
uchun huquqiy asos aniqlanishi kerak — bu kod masalasi emas.

**RestoOne bilan aloqa.** Ikki mahsulot bitta kodda. Mijoz TalentHub orqali
xodim oladi -> o'sha xodim RestoOne'da o'qiydi. Bog'lash mantiqiy, lekin
hali qurilmagan va 58 soatga kirmagan.

**Narx.** Hali yo'q — ataylab. Birinchi 5 mijozdan keyin haqiqiy ma'lumot
bilan qo'yiladi.
