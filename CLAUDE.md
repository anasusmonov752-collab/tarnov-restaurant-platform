# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Tarnov Restaurant HR Training Platform** — multi-tenant SaaS for restaurant staff training. Restaurants manage menus, waiters take tests based on menu knowledge, and results are tracked with certificates for 90%+ scores.

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

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | `mongodb+srv://Tarnov:Tarnov2024@cluster0.cc5qev4.mongodb.net/tarnov?appName=Cluster0` |
| `JWT_SECRET` | Random secret for JWT signing |
| `NODE_ENV` | `production` |

## Architecture

**Single-file backend** (`server.js`) — all routes, schemas, middleware in one file.

**No frontend framework** — vanilla JS + fetch API. Each page is a self-contained HTML file with inline `<script>`.

### Data Model (MongoDB/Mongoose)

All restaurant data lives in a **single `Restaurant` document** (embedded subdocuments):
```
Restaurant
  ├── menu[]         (MenuItemSchema) — images stored as Base64 strings (max 1.5MB)
  ├── waiters[]      (WaiterSchema)   — 4-digit PIN authentication
  ├── questions[]    (QuestionSchema) — difficulty: easy|medium|hard
  ├── testDays[]     (String[])       — ISO date strings "YYYY-MM-DD"
  ├── announcements[]
  └── testResults[]  (TestResultSchema)
```

`SuperAdmin` is a separate collection (single document).

### Auth System

Cookie-based JWT, 3 roles:
- `superadmin` — email + password → manages all restaurants
- `restaurant` — email + password → manages own restaurant
- `waiter` — restaurantId + 4-digit PIN → takes tests, views menu

JWT stored in `httpOnly` cookie. Auth middleware: `auth(['role1', 'role2'])`.

### API Structure

```
POST /api/auth/login         — all 3 login types
GET  /api/restaurants/list   — public, for waiter login dropdown

/api/super/*                 — superadmin only
/api/restaurant/*            — restaurant admin only
/api/waiter/*                — waiter only
```

### Test System

- Tests only available on designated `testDays`
- Menu hidden from waiters on test days
- 20 questions: 10 easy + 5 medium + 5 hard (randomly selected)
- 30 seconds per question
- One attempt per day per waiter
- Certificate awarded for ≥90% score

### Image Storage

Images are stored as **Base64 strings directly in MongoDB** (no external storage). Frontend compresses images to max 800px width, JPEG 80% quality before storing. Menu items from external sources (e.g. tarnov.uz CDN) store the URL string directly as the `image` field.

### Waiter Bulk Import

Restaurant admin can upload CSV files with columns `Ism,PIN` (supports both `,` and `;` separators). Template download available.

## Frontend Files

| File | Role |
|------|------|
| `public/index.html` | Login page — 3 tabs for each role |
| `public/super-admin.html` | Super admin dashboard + restaurant CRUD |
| `public/restaurant-admin.html` | Restaurant admin — menu, waiters, questions, calendar, announcements, results |
| `public/waiter.html` | Waiter — menu browsing, test taking, history, certificate |
| `public/js/utils.js` | Shared: `api()`, `apiForm()`, `toast()`, `logout()`, `requireRole()` |
| `public/css/style.css` | Full design system — black (#0A0A0A) + gold (#C8922A) theme |

## Default Credentials

- **Super Admin:** `admin@tarnov.uz` / `Tarnov2024!`
- **MongoDB user:** `Tarnov` / `Tarnov2024`
- **MongoDB Atlas IP:** `0.0.0.0/0` (all IPs allowed — required for Render)
