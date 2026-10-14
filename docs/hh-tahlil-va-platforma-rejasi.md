# hh.uz tahlili va platformamiz rejasi

**Sana:** 2026-10-13
**Manba:** Tarnov ish beruvchi hisobi (employer id 11008269) — bevosita ko'rildi,
taxmin emas. Nomzod tomoni Anasning shaxsiy hisobidan.

---

## 1. hh'da nima bor

### 1.1 Ariza voronkasi — 15 bosqich

`/employer/vacancyresponses` sahifasida:

```
Все неразобранные → Подходящие → Подумать → Первичный контакт →
Звонок → Мессенджер → Связаться еще раз → Тестовое задание →
Собеседование → Предложение о работе → Выход на работу
```

Rad tomoni: `Не подходит` · `Кандидат отказался` · `Не выходит на связь` ·
`Вакансия закрыта`

Har bosqichda sanoq ko'rinadi.

### 1.2 Avtomatlashtirish (Tarnovda ikkalasi ham o'chiq)

| Funksiya | Nima qiladi |
|----------|-------------|
| **Авторазбор** | Kelgan arizalarni AI o'zi saralaydi, mos/nomos qiladi |
| **Автоопрос** | Nomzodga skrining savollari avtomatik beriladi |

### 1.3 Vakansiya

Ko'rishlar · arizalar · konversiya % · «N резюме в работе» ·
«N подходящих» · tugash sanasi · «Поднять» (pullik) ·
tariflar (Стандарт плюс / Премиум) · chat-bot ulash.

Vakansiyadan qidiruvga bir bosishda o'tish:
«Примените фильтры из этой вакансии».

### 1.4 Rezyume qidiruvi

Filtrlar, `Автопоиск` (saqlangan qidiruv + xabarnoma), `Избранное`,
saralash (moslik / sana).

Karta signallari: **«Часто отвечает»**, oxirgi tashrif vaqti,
«Активно ищет работу», umumiy tajriba, har lavozim muddati bilan,
ish joylari.

Amallar: `Открыть контакты` · **`Комментарии`** (ichki eslatma) ·
`Отправить нанимающему` · `В избранное`.

### 1.5 Nomzod profili

Foto · holat chipi · rezyume kartasi + **haftalik statistika**
(Показы / Просмотры / Приглашения) · «Поднять в поиске» (pullik) ·
bo'limlarga bo'lingan tahrirlash · tillar **daraja bilan** · ta'lim ·
kurslar · testlar · portfolio · hujjatlar (медкнижка, haydovchilik) ·
«Вы откликнулись N раз» · **«Индекс вежливости»** (ish beruvchining javob
tezligi reytingi).

### 1.6 Pul modeli

| Nima | Kim to'laydi |
|------|--------------|
| Vakansiya joylash | Ish beruvchi (paket) |
| Rezyume bazasiga kirish (kontakt ochish) | Ish beruvchi (kvota) |
| **Arizaga javob berganning kontakti** | **BEPUL** |
| «Поднять в поиске» | Nomzod |

---

## 2. Bizda nima bor

| Qism | Holat |
|------|-------|
| Nomzodlar bazasi, AI tahlil bilan | ✅ 799 ta |
| hh uslubidagi ro'yxat + kanban | ✅ |
| Telegram bot: siz / mijoz / nomzod | ✅ |
| Suhbatli AI agent (ikkala tomonda) | ✅ |
| Ovozli va matnli qidiruv | ✅ |
| Mini App: mijoz kabineti (3 tab) | ✅ |
| Nomzod profili + o'zi tahrirlashi | ✅ |
| Kredit + ledger | ✅ |
| Tanlov bosqichlari + rad sabablari | ✅ 9 holat |
| Mijoz lokatsiyasi + qo'ng'iroq kartasi | ✅ |

### Topilgan muammo: ikkita voronka bir-birini bilmaydi

| Tizim | Bosqichlar |
|-------|-----------|
| `Candidate.status` (kanban) | new · phone · interview · interview2 · trial · hired · reserve · rejected |
| `Shortlist.items[].state` (mijoz oqimi) | selected · contacting · candidate_ok/no · revealed · interview · hired · not_fit · refunded |

Bitta nomzod ikkala voronkada turishi mumkin va ular sinxron emas.
Bu kelajakda chalkashlik keltiradi — birlashtirish kerak.

---

## 3. hh'dan olamiz

Muhimlik tartibida. Hammasi emas — faqat bizning modelga mos keladiganlari.

| # | Nima | Nega |
|---|------|------|
| 1 | **«Часto otvechaet» signali** | Javob beradigan nomzodni javob bermaydiganidan ajratadi. Bizda `BotMessage` tarixi bor — hisoblash arzon |
| 2 | **Nomzod bo'yicha ichki izoh** | «Комментарии» — qo'ng'iroqdan keyin yozib qo'yasiz. Hozir yo'q |
| 3 | **Avtopoisk** | Yangi mos nomzod kelsa mijozga xabar. Mijozni qaytarib keltiradi |
| 4 | **Vakansiyadan qidiruvga bir bosish** | Vakansiya mezonlari darhol filtrga tushadi |
| 5 | **«Не выходит на связь» bosqichi** | Bizda yo'q, lekin eng ko'p uchraydigan holat |
| 6 | **«Подумать» / zaxira** | Yoqdi-yu hozir emas. Bazani kuydirmaslik uchun kerak |
| 7 | **Vakansiya muddati va tasdiq** | Soxta e'lon muammosi yechimi |
| 8 | **Avtorazbor (AI saralash)** | Bizda agent bor — arizalarni ham shu saralasin |

### Olmaymiz

| Nima | Nega |
|------|------|
| Portfolio, testlar, kurslar | Oq yoqa uchun. Ofitsiantda bo'lmaydi |
| «Поднять в поиске» (nomzoddan pul) | Nomzoddan pul olmaymiz — bu bizning tamoyil |
| 15 bosqichli voronka | 6 tadan ortiq bosqichni hech kim yangilamaydi |
| Медкнижка alohida bo'lim | Bir marta qo'ygandik, olib tashladik — O'zbekistonda har doim talab qilinmayapti |

---

## 4. Bizda bor, hh'da yo'q

Bular nusxa emas — shular tufayli biz kerak bo'lamiz.

### 4.1 Ovozli rezyume
Ofitsiant rezyume yozmaydi. hh'ning butun mahsuloti rezyume formasiga
qurilgan, shuning uchun ular buni qila olmaydi. Bizda Gemini ovozni
tushunadi — sinovdan o'tgan.

### 4.2 Rad sabablaridan maslahat
hh voronkada bosqichni ko'rsatadi, lekin **xulosa chiqarmaydi**.
Bizda rad sabablari ro'yxatdan tanlanadi, demak sanaladi:

> «8 nomzoddan 6 tasi maosh sababli rad etdi. 5 mln qilsangiz,
> ertaga odam topaman.»

Bu bizni vositachidan maslahatchiga aylantiradi.

### 4.3 Tiriklik tekshiruvi
hh «oxirgi tashrif» sanasini ko'rsatadi — passiv. Biz **so'raymiz**:
«Hali ish qidiryapsizmi?» Javob bermagan bazadan chiqadi.

### 4.4 Telegram-native
Ilova o'rnatish yo'q, ro'yxatdan o'tish yo'q. hh buni qila olmaydi —
mahsuloti veb/ilovaga bog'langan.

### 4.5 RestoOne bilan bog'lanish
Topish **va** o'qitish bitta tizimda. O'zbekistonda hech kimda yo'q.
«Ofitsiant topamiz, 2 hafta o'qitamiz, menyuni biladigan holda chiqaramiz».

---

## 5. Qurish tartibi

Har biri oldingisiga tayanadi.

| # | Ish | Soat | Izoh |
|---|-----|------|------|
| 1 | Ikki voronkani birlashtirish | 3 | Avval shu — keyin qo'shilganlari ikkiga bo'linmaydi |
| 2 | Nomzod bo'yicha ichki izoh | 1 | Eng arzon foyda |
| 3 | «Javob beradi» signali | 2 | `BotMessage` dan hisoblanadi |
| 4 | «Bog'lanib bo'lmadi» va «Zaxira» bosqichlari | 1 | Voronkani to'ldiradi |
| 5 | Vakansiya obyekti + muddat/tasdiq | 5 | Suhbat orqali to'ladi |
| 6 | Avtopoisk — yangi mos nomzod xabari | 3 | Mijozni qaytaradi |
| 7 | Arizalarni AI saralash | 4 | hh'ning «Авторазбор» ekvivalenti |

**Jami ~19 soat.** Sinov bilan ~25.

Bu ro'yxat [yo'l xaritasidagi](talenthub-yolxarita.md) ishlarni almashtirmaydi —
ularning ustiga qo'shiladi. Ustuvorlik baribir SMS (Eskiz) da: nomzodga
yeta olmasak, qolgan hammasi bo'sh ishlaydi.
