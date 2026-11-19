# RestoOne — ofitsiant o'qitish platformasi (eski qism)

CLAUDE.md dan 2026-11-19 da ko'chirildi (matn o'zgarmagan). Bu qism TalentHub ishlarida kam kerak.

## Project Overview

**RestoOne — Restaurant Staff Training Platform** — multi-tenant SaaS for restaurant staff training. Restaurants manage menus, waiters take tests based on menu knowledge, and results are tracked with certificates for 90%+ scores.

- **Live URL:** https://tarnov-restaurant-platform.onrender.com
- **GitHub:** https://github.com/anasusmonov752-collab/tarnov-restaurant-platform
- **Database:** MongoDB Atlas (free tier, always-on)
- **Hosting:** Render.com (free tier — 50s cold start after inactivity)

## Commands

```bash
npm start          # Production server (node server.js)
npm run dev        # Development with auto-reload (nodemon)
npm install        # Install dependencies
```

**Deploy:** `deploy` skill (`.claude/skills/deploy/`, faqat shu kompyuterda — `.claude/` gitignore'da):
`bash .claude/skills/deploy/deploy.sh` (fonda) — `tmp-syntax-check` -> CI (`npm test`) -> o'tsa `main`
-> Render -> `/ping` yangi commitda. CI yiqilsa main'ga chiqmaydi. `--check` — faqat holat,
`--ci` — faqat CI. To'g'ridan-to'g'ri `git push origin main` QILMANG (lokalda Node yo'q, testsiz chiqadi).

## Environment Variables (Render)

**Never put real values in this file — it is committed to a PUBLIC repo.**
Local development reads `.env` (gitignored); see `.env.example` for the shape.
Production values live in the Render dashboard only.

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Random secret for JWT signing |
| `NODE_ENV` | `production` |
| `GEMINI_API_KEY` | Google AI Studio key — powers AI chat and written-answer grading |
| `ANTHROPIC_API_KEY` | Optional fallback when Gemini is unavailable |
| `AI_PROVIDER` | `gemini` (default) or `anthropic` |
| `SUPERADMIN_PASSWORD` | `admin@tarnov.uz` password (≥12 chars); DB hash is synced to it on every boot |
| `ALERT_CHAT_ID` | Optional Telegram chat for server error alerts (default: agency admin chat) |
| `AI_TIMEOUT_MS` | Optional AI call timeout, default 45000 |
| `PAYME_MERCHANT_ID`, `PAYME_KEY` | Payme kassa (merchant shartnomadan keyin); `PAYME_TEST=1` — sinov kassasi |
| `CLICK_SERVICE_ID`, `CLICK_MERCHANT_ID`, `CLICK_SECRET_KEY` | Click SHOP API |
| `CRON_SECRET` | Shared secret for `/api/cron/*` (GitHub Actions reminders job); same value in GitHub Actions secrets |

## Architecture

**Modular backend** — `server.js` is a thin bootstrap (config, static, health, media
streaming). Real logic lives under `src/`:
```
src/
  config/db.js                 — Mongo connect
  middleware/auth.js           — JWT + auth([...roles]) guard
  middleware/errorHandler.js   — asyncHandler + global error handler
  models/                      — Restaurant, SuperAdmin, MentorChat, MentorAssignment, AiUsage
  routes/                      — auth, super, restaurant, waiter
  services/                    — ai, aiQuota, grading, generator, kpi, mentor,
                                 mentorChat, mentorVoice, mentorVoice, assignments
  data/                        — roles.js, roleplay.js, baseline.js
  utils/kpi.js                 — period math (getPeriodKey/Label/RefDate)
```
(CLAUDE.md once described a single-file `server.js` — that is outdated; it is now modular.)

**No frontend framework** — vanilla JS + fetch API. Each page is a self-contained HTML file with inline `<script>`.

### Data Model (MongoDB/Mongoose)

Most data lives in a single `Restaurant` document (embedded subdocuments). Chat history
and mentor assignments are **separate collections** (they grow unbounded, so they are kept
out of the per-request Restaurant read).
```
Restaurant
  ├── menu[]          (MenuItemSchema) — Base64 images; also nameRu/descriptionRu (RU content)
  ├── waiters[]       (WaiterSchema)   — 4-digit PIN; role, phone, hireDate, documents[]
  ├── questions[]     (QuestionSchema) — type: choice|written; difficulty easy|medium|hard
  ├── testDays[]      (String[])       — ISO "YYYY-MM-DD"
  ├── announcements[] · testResults[] · checklist[] · waiterChecklists[]
  ├── modules[]       (ModuleSchema)   — lessons + mini-quiz + roles[] (role targeting)
  ├── moduleProgress[] · trainingVideos[] · waiterTrainingViews[]
  ├── waiterMenuProgress[] — knownDishIds[] + reviews[] (spaced repetition, Leitner boxes)
  ├── assessments[] · courses[]        — baseline diagnostic → personalized course
  ├── evalCriteria[] · evaluations[]   — floor (practical) evaluation
  ├── staffNotes[]    (StaffNoteSchema) — 1-on-1 reviews / praise / disciplinary log
  ├── adaptation{} · kpiSettings{}     — KPI weights: test/menu/module/floor
Separate collections: SuperAdmin, MentorChat, MentorAssignment, AiUsage
```

### Auth System

Cookie-based JWT, 3 roles:
- `superadmin` — email + password → manages all restaurants
- `restaurant` — email + password → manages own restaurant
- `waiter` — restaurantId + 4-digit PIN → takes tests, views menu, watches training videos

JWT stored in `httpOnly` cookie. Auth middleware: `auth(['role1', 'role2'])`.

### API Structure

```
POST /api/auth/login              — all 3 login types
GET  /api/restaurants/list        — public, for waiter login dropdown

/api/super/*                      — superadmin only
/api/restaurant/*                 — restaurant admin only
/api/waiter/*                     — waiter only
/api/waiter/training              — training videos list
/api/restaurant/training          — upload/manage training videos
```

Key restaurant-admin endpoints added for the HR/L&D expansion:
```
/api/restaurant/kpi[/export]      — composite KPI (test+menu+module+floor weights)
/api/restaurant/waiters/:id/documents        — employee docs (sanitary book, expiry)
/api/restaurant/eval-criteria · /evaluations — floor (practical) evaluation
/api/restaurant/staff-notes                  — 1-on-1 / praise / disciplinary log
/api/restaurant/analytics                    — team weak-standard heatmap + role breakdown
```
Key waiter endpoints:
```
/api/waiter/roleplay/scenarios|message|evaluate  — AI customer roleplay (mentor grades)
/api/waiter/menu-review · /menu-review/:dishId   — spaced repetition (Leitner)
```

### KPI (composite) — `src/services/kpi.js`

Single source of truth for KPI (was duplicated in routes). Level is driven by a **composite
score**, not just the menu test: `test`, `menu learned %`, `module completion %`, and
`floor (practical) eval %`, each with a configurable weight in `kpiSettings`
(`testWeight/menuWeight/moduleWeight/floorWeight`). A component with no data (e.g. no floor
eval yet) is dropped and remaining weights re-normalize — so a weight sits dormant until
data exists. Setting menu/module/floor weights to 0 reverts to test-only.

### Employee roles — `src/data/roles.js`

Waiters have a `role` (ofitsiant/barmen/xostess/oshpaz/kassir/menejer), default `ofitsiant`.
Modules can target roles via `roles[]` (empty = all). Single source shared by server + both
frontends (mirror the list in all three if changed).

### Test System

- Tests only available on designated `testDays`
- Menu hidden from waiters on test days
- 20 questions: 10 easy + 5 medium + 5 hard (randomly selected)
- 30 seconds per question
- One attempt per day per waiter
- Certificate awarded for ≥90% score

### Training Video System (IN PROGRESS)

15 service standard topics, each with:
- Video URL (uploaded to cloud or embedded)
- Uzbek description text
- Topic number and title

Topics:
1. Smenaga chiqish — mas'uliyat
2. Tashqi ko'rinish standartlari
3. Ish vaqtini ro'yxatdan o'tkazish
4. Smenani yopish
5. Standart №1 — Mehmonni 3 soniyada kutib olish
6. Standart №2 — Salomlashish + Tabassum
7. Standart №3 — Mehmonni joylashtirish
8. Standart №4 — Ofitsiantni tanishtirish
9. Standart №5 — Ichimlik taklif qilish
10. Standart №6 — Buyurtma qabul qilish
11. Standart №7 — Qo'shimcha sotuv (Upsell/Cross-sell)
12. Standart №8 — Buyurtmani nazorat qilish
13. Standart №9 — Fikr-mulohaza olish
14. Standart №10 — Hisob-kitob
15. Standart №11 — Xayrlashish skripti

### Image Storage

Images are stored as **Base64 strings directly in MongoDB** (no external storage). Frontend compresses images to max 800px width, JPEG 80% quality before storing. Menu items from external sources (e.g. tarnov.uz CDN) store the URL string directly as the `image` field.

### Waiter Bulk Import

Restaurant admin can upload CSV files with columns `Ism,PIN` (supports both `,` and `;` separators). Template download available.

## Frontend Files

| File | Role |
|------|------|
| `public/index.html` | Login page — 3 tabs for each role (split layout, cyan neon #00D4FF) |
| `public/index-presentation.html` | Presentation/landing page (cream/gold theme, saved separately) |
| `public/super-admin.html` | Super admin dashboard + restaurant CRUD |
| `public/restaurant-admin.html` | Restaurant admin — menu, waiters, questions, calendar, announcements, results |
| `public/waiter.html` | Waiter — menu browsing, test taking, history, certificate, training videos (TODO) |
| `public/js/utils.js` | Shared: `api()`, `apiForm()`, `toast()`, `logout()`, `requireRole()` |
| `public/js/i18n.js` | UZ/RU language toggle — neon green button, smart placement per page |
| `public/css/style.css` | Design system — dark bg #070B0F + cyan neon #00D4FF + glassmorphism + Inter font |

## Design System

```css
:root {
  --bg: #070B0F;
  --card: #0D1117;
  --card2: #111820;
  --neon: #00D4FF;          /* PRIMARY cyan neon */
  --neon-light: #33DDFF;
  --neon-dark: #0099CC;
  --border: #1A2535;
  --text: #E8F4FF;
  --text2: #8BAABF;
  --text3: #4A6070;
  --neon-glow: 0 0 20px rgba(0,212,255,0.4), 0 0 40px rgba(0,212,255,0.15);
}
```

Font: **Inter** (not Outfit, not Playfair Display)
Icons: **Lucide @0.462.0** (pinned version)

## i18n System

- Language key: `restoone_lang` (localStorage)
- Default: Uzbek (`uz`)
- Toggle: neon green button, placed smartly per page context
- MutationObserver watches for dynamic DOM changes

## Credentials

Not stored in this repo. Ask the project owner, or read them from the Render
dashboard / MongoDB Atlas. Local dev values go in `.env` (gitignored).

**MongoDB Atlas IP allowlist is `0.0.0.0/0`** (required for Render's dynamic IPs),
so the database is reachable from anywhere — the password is the only thing
protecting it. Treat it accordingly.

---

