# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

**Deploy:** Push to `main` branch → Render auto-deploys. Use stored token for push:
```bash
git remote set-url origin https://TOKEN@github.com/anasusmonov752-collab/tarnov-restaurant-platform.git
git push origin main
git remote set-url origin https://github.com/anasusmonov752-collab/tarnov-restaurant-platform.git
```

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

## Architecture

**Single-file backend** (`server.js`) — all routes, schemas, middleware in one file.

**No frontend framework** — vanilla JS + fetch API. Each page is a self-contained HTML file with inline `<script>`.

### Data Model (MongoDB/Mongoose)

All restaurant data lives in a **single `Restaurant` document** (embedded subdocuments):
```
Restaurant
  ├── menu[]          (MenuItemSchema) — images stored as Base64 strings (max 1.5MB)
  ├── waiters[]       (WaiterSchema)   — 4-digit PIN authentication
  ├── questions[]     (QuestionSchema) — difficulty: easy|medium|hard
  ├── testDays[]      (String[])       — ISO date strings "YYYY-MM-DD"
  ├── announcements[]
  ├── testResults[]   (TestResultSchema)
  └── trainingVideos[] (TrainingVideoSchema) — video URL + description per topic
```

`SuperAdmin` is a separate collection (single document).

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

## Available Skills (C:\Users\user\.claude\skills)

These skills are installed and available via `/` commands:

### Engineering
- `/cs-backend-review` — Node.js/Express API code review
- `/cs-frontend-review` — HTML/CSS/JS code review
- `/cs-fullstack-review` — Full stack review
- `/focused-fix` — Targeted bug fix
- `/tech-debt` — Technical debt analysis
- `/tdd` — Test-driven development
- `/karpathy-check` — AI/ML code quality check
- `/a11y-audit` — Accessibility audit
- `/slo-design` — Service level objectives

### Product & UX
- `/prd` — Product requirements document
- `/user-story` — User story creation
- `/rice` — Feature prioritization (RICE framework)
- `/operator-audit` — Platform audit

### Project Management
- `/sprint-plan` — Sprint planning
- `/sprint-health` — Sprint health check
- `/retro` — Retrospective
- `/project-health` — Project health check
- `/okr` — OKR creation

### Marketing & Content
- `/cs-aeo` — SEO/AEO optimization
- `/competitive-matrix` — Competitor analysis
- `/seo-auditor` — SEO audit

### Business
- `/saas-health` — SaaS metrics health check
- `/financial-health` — Financial analysis
- `/pipeline` — Sales/business pipeline

### C-Level Advisors
Available in `c-level-advisor/` — CEO, CTO, CFO, CMO personas for strategic advice.

### Wiki & Docs
- `/wiki-init` — Initialize project wiki
- `/wiki-query` — Query project knowledge base
- `/wiki-log` — Log decisions and changes
- `/wiki-ingest` — Ingest documents into wiki

### Orchestration
Multi-agent workflows available in `orchestration/` for complex tasks.

### Marketing Skills (coreyhaines31/marketingskills — 44 skills)
Located in `C:\Users\user\.claude\skills\marketingskills\`

**Conversion & CRO:**
- `cro` — Conversion rate optimization
- `signup` — Signup flow optimization
- `onboarding` — User onboarding
- `popups` / `paywalls` — Popup & paywall strategy
- `ab-testing` — A/B test design

**Content & Copy:**
- `copywriting` — Sales copy
- `copy-editing` — Copy editing
- `cold-email` — Cold email sequences
- `emails` / `sms` — Email & SMS marketing
- `social` — Social media content
- `video` — Video marketing strategy
- `image` — Image/visual marketing

**SEO & Discovery:**
- `seo-audit` — Full SEO audit
- `ai-seo` — AI-powered SEO
- `programmatic-seo` — Programmatic SEO
- `site-architecture` — Site structure
- `competitors` / `competitor-profiling` — Competitor analysis
- `schema` — Schema markup
- `aso` — App store optimization

**Paid Marketing:**
- `ads` — Paid ads strategy
- `ad-creative` — Ad creative writing
- `analytics` — Marketing analytics

**Retention & Growth:**
- `churn-prevention` — Churn reduction
- `referrals` — Referral programs
- `co-marketing` — Partnership marketing
- `free-tools` — Free tool marketing
- `community-marketing` — Community building
- `lead-magnets` — Lead magnet creation

**Strategy:**
- `pricing` — Pricing strategy
- `launch` — Product launch
- `marketing-ideas` — Ideation
- `marketing-psychology` — Psychology-based marketing
- `marketing-plan` — Full marketing plan
- `customer-research` — Customer research
- `content-strategy` — Content strategy
- `public-relations` — PR strategy

**Sales & RevOps:**
- `revops` — Revenue operations
- `sales-enablement` — Sales enablement
- `prospecting` — Lead prospecting
- `directory-submissions` — Directory listings

**Foundation (load first):**
- `product-marketing` — Core product marketing context (required for all other skills)
