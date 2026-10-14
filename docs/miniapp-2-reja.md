# MINIAPP-2 — ikki kabinet

**Holat:** rejalashtirilgan, boshlanmagan. Buyruq bo'lsa boshlanadi.
**Sana:** 2026-10-13

hh.uz mantiqida to'liq ilova: nomzod uchun ham, mijoz uchun ham alohida
kabinet. Tahlil: [hh tahlili](hh-tahlil-va-platforma-rejasi.md).

---

## Nomzod kabineti

hh'dagi `Профиль` + `Поиск` + `Отклики` ning Telegram varianti.

| Tab | Holat | Nima bo'ladi |
|-----|-------|--------------|
| **Profilim** | ✅ bor | Foto, holat chipi, to'ldirilganlik %, statistika, bo'limli tahrirlash |
| **Ish o'rinlari** | ❌ yangi | Vakansiyalar ro'yxati · «Sizga mos» · filtr (hudud, maosh, smena) |
| **Arizalarim** | ❌ yangi | Qaysi vakansiyaga ariza berdim, qaysi bosqichda |
| **Takliflar** | ❌ yangi | Kim meni taklif qildi · suhbat sanasi · tasdiqlash tugmasi |
| **Aloqa** | ✅ bor | HR bilan yozishuv |

Vakansiyada restoran nomi **ko'rinmaydi** — faqat «Chilonzorda restoran,
4-5 mln, kechki smena». Aks holda nomzod to'g'ridan-to'g'ri borib ishga
kiradi va biz hech narsa olmaymiz.

---

## Mijoz kabineti

| Tab | Holat | Nima bo'ladi |
|-----|-------|--------------|
| **Tanlovlarim** | ✅ bor | Nomzodlar, holati, ochilgan kontakt |
| **Vakansiyalarim** | ❌ yangi | Yaratish · tahrirlash · muddat va tasdiq · arxiv |
| **Arizalar** | ❌ yangi | Vakansiyaga kelgan arizalar + voronka |
| **Balans** | ✅ bor | Kredit, tarix, so'rov |
| **Aloqa** | ✅ bor | HR bilan yozishuv |

---

## Oldindan bajarilishi kerak

Bular tayyor bo'lmasa kabinetlar bo'sh ishlaydi:

| # | Ish | Nega |
|---|-----|------|
| 1 | **Eskiz SMS** | 799 nomzoddan bittasi botda. Nomzod kabineti kimga kerak? |
| 2 | **Ikki voronkani birlashtirish** | `Candidate.status` va `Shortlist.items[].state` sinxron emas |
| 3 | **Vakansiya obyekti** | Ikkala kabinetning markazi. Busiz «Ish o'rinlari» va «Arizalar» yo'q |

---

## Taxminiy hajm

| Blok | Soat |
|------|------|
| Vakansiya obyekti (model, CRUD, muddat/tasdiq) | 5 |
| Nomzod: Ish o'rinlari + ariza berish | 6 |
| Nomzod: Arizalarim + Takliflar | 4 |
| Mijoz: Vakansiyalarim | 4 |
| Mijoz: Arizalar + voronka | 5 |
| Dizayn va sinov | 6 |
| **Jami** | **~30 soat** |

Oldindan bajariladigan 3 ta ish bunga kirmagan (~12 soat).
