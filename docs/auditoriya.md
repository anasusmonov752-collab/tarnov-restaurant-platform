# Auditoriya — kim o'qiyapti (matn yozishdan OLDIN)

Bu hujjat TalentHub'da yoziladigan har bir matnning asosi. Yangi ekran,
bot xabari, tugma yoki bildirishnoma yozishdan oldin shu yerdan boshlang.
Sabab: 2026-11-15 da nomzodning botdagi birinchi ekrani **mijoz uchun
yozilgan matn** bo'lib chiqdi ("xodim tanlash xizmati… restoranlar bizga
so'raydi… biz tavsiya qilamiz"). Bu bitta matnning xatosi emas — kim
o'qiyotganini o'ylamay yozishning natijasi.

Qoida: **bitta ekran — bitta odam.** Nomzodga mijozning matni, mijozga
nomzodning matni hech qachon ko'rsatilmaydi.

---

## 1. NOMZOD

**Kim:** Toshkentdagi restoran/kafe xodimi — ofitsiant, xostess, oshpaz,
kassir, barmen, menejer, operator. Ko'pi 18–30 yosh. Kompyuteri yo'q,
telefon bor, asosiy ilovasi — Telegram. Ko'pi talaba yoki viloyatdan
yangi kelgan. Telefon interfeysi ruscha bo'lishi mumkin, o'zi o'zbekcha
gapiradi (shuning uchun til tugmasi birinchi ekranda turadi).

**Nima so'raydi — shu tartibda:**
1. **Qancha to'laydi?**
2. **Qayerda?** (yo'l — pul va vaqt; shuning uchun tumanni darhol ko'rsatamiz)
3. **Qachondan, haqiqiymi?**
4. Va faqat shundan keyin: men nima qilishim kerak?

**Nimadan qo'rqadi:**
- Pul so'rashadi (O'zbekistonda nomzoddan pul oladigan agentliklar bor)
- Uzun forma, rezyume yozish — "men yoza olmayman"
- Shahar bo'ylab borib kelib, ish yo'q chiqishi
- Va'da qilingan maosh bilan to'lanadigan maosh boshqa bo'lishi
- Telefon raqami begonaga ketishi

**Biz unga nima beramiz (hammasi rost):**
- Bepul
- Rezyume yozish shart emas — tugma bosish yoki ovozda gapirish
- Bir marta javob beradi — hamma restoranlarga yaraydi
- Maosh va tuman kontaktdan OLDIN ko'rinadi (ko'r-ko'rona borish yo'q)
- HR 24 soat ichida o'zi qo'ng'iroq qiladi

**Nomzodga AYTILMAYDIGAN so'zlar** (chapda — bizning ichki tilimiz,
o'ngda — uning tili):

| Yozmang | Yozing |
|---|---|
| nomzod | siz / ism bilan |
| xodim tanlash xizmati, platforma | (umuman aytmang — u ish qidiryapti, xizmat emas) |
| restoranlar bizga murojaat qiladi, biz tavsiya qilamiz | (bu MIJOZ matni) |
| anketa to'ldiring (sarlavhada) | bir necha savolga javob bering · 2 daqiqa |
| rezyume | (faqat "rezyume shart emas" shaklida) |
| vakansiya | ish |
| sizni ish beruvchiga taqdim etamiz | HR o'zi qo'ng'iroq qiladi |

**Birinchi ekran formulasi (ochiq ish BOR):**
```
salom (ism bilan, bitta qator)
HOZIR nechta ochiq ish                                  ← bazadan
"qaysi biri sizga kerak? maoshi va manzilini ko'rsataman"
[FAQAT ishi bor lavozimlar, soni tugmada: "Oshpaz · 5"]
[ro'yxatdan tashqari ish — o'z nomi bilan: "HR-rekruter · 1"]
```
Ishi yo'q lavozim tugmasi va taqsimot qatori YO'Q (2026-11-27: "aji-buji
lavozimlar" — bo'sh ekranga olib boradigan tugma va tugmalarni takrorlaydigan
qator ekranni to'ldiradi, tanlovni qiyinlashtiradi).
Agentlik haqida bitta so'z ham yo'q. U nima bilan shug'ullanishimizni
bilishi shart emas — ish borligini bilishi kerak.

**Ochiq ish YO'Q bo'lsa:** raqamni to'qimaymiz. O'rniga uch qator foyda
(bepul · rezyume yozmaysiz · HR o'zi qo'ng'iroq qiladi) va o'sha savol.
Lekin bilib turing: **ish yo'q bo'lsa hech qanday matn ushlab turmaydi.**
Bu matn muammosi emas, ma'lumot muammosi — pastga qarang.

---

## 2. MIJOZ (restoran)

**Kim:** restoran egasi yoki menejer. Vaqti yo'q, odam kerak — bugun.
Ko'pincha avval boshqa agentlikdan kuygan.

**Nima so'raydi:**
1. Sizda odam bormi? Nechta? **Hozir?**
2. Qachon ko'raman?
3. Qancha turadi?
4. Kelmasa / ketib qolsa — nima bo'ladi?

**Nimadan qo'rqadi:** pul to'laydi — odam kelmaydi; bazangiz eski;
nomzod bir hafta ishlab ketib qoladi.

**Unga aytiladigani:** bazadagi haqiqiy son, bozor maoshi, 3 ta anonim
karta, ishonch belgilari (suhbatga kelgan, oldingi ishda qolgan),
kafolat. Ya'ni nomzodga aytmaydigan hamma narsa.

**Birinchi ekran formulasi:** va'dalar → bazadagi son → "Kim kerak?" →
lavozim → son + bozor maoshi + 3 anonim karta → bepul sinov.

---

## 3. Ikkalasiga baravar (har ekran uchun tekshiruv)

CLAUDE.md 7-qoida bilan bir xil:
- Bitta savol, bitta asosiy harakat
- Tanlangan yo'lga qarama-qarshi tugma turmasin
- Har bosqichda chiqish yo'li
- Tugma nima va'da qilsa — bosilganda AYNAN shu bo'lsin
- 5 banddan uzun bo'lmasin
- Oxiri ko'rinsin ("yana 2 ta savol"), katta son ko'rsatilmasin
- Raqam BAZADAN
- Til — almashtirish mumkin

**Yozib bo'lgach:** oqimni lokal bazada bosib chiqing va har bir xabarni
ko'z bilan o'qing. "Grep qildim, qator bor" — tekshiruv emas.

---

## 4. Matn ishlamasligining eng keng tarqalgan sababi: ma'lumot

Nomzodning birinchi ekrani bo'm-bo'sh ko'rinsa, avval **bazaga** qarang:

- Vakansiya `confirmedAt` 14 kundan eski bo'lsa (`vac.STALE_DAYS`) u
  nomzodga KO'RINMAYDI: botdagi son ham, kabinetdagi ro'yxat ham,
  anketadan keyingi "sizga mos N ta ish" ham nolga tushadi.
- Bu ataylab: tasdiqlanmagan ishni nomzodga ko'rsatish — uni behuda
  qo'ng'iroqqa yuborish. Lekin buning narxi bor: **agentlik har 2
  haftada vakansiyani tasdiqlashi kerak** (panel → Vakansiyalar →
  "tasdiqlang").
- Shuning uchun tasdiqlanmagan vakansiyalar soni "Bugun" sahifasida va
  yon menyuda ko'rinadi. U qizil bo'lsa — nomzod bo'sh ekran ko'ryapti.
