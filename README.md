<div align="center">

<img src="client/public/icon-192x192.png" width="88" alt="Booker logo" />

# Booker

**Track every order booked on your cards, and your family's and friends' cards, from checkout to profit.**

Buyer ledgers · Booker khata · Profit analytics · ITR spend reports with the ₹10L SFT check

![React](https://img.shields.io/badge/React_18-20232A?logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Node.js](https://img.shields.io/badge/Express_5-339933?logo=node.js&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?logo=redis&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?logo=pwa&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)

</div>

---

## Why Booker?

Resellers book phones, TVs and appliances on Amazon and Flipkart for shopkeepers. The orders go on several credit cards: their own, their family's, and their friends'. Keeping track of who paid, who is owed, how much cashback is left and whether a bank is close to the ₹10 lakh reporting limit usually means a notebook and a lot of guesswork.

**Booker keeps all of it in one place.**

## ✨ Features

### 👥 People and cards
- Cards belong to **you, family members, or friends (bookers)**, as primary or add-on cards.
- Each person has their own tab for cards and orders. Family members also appear together in one combined view.
- Cards are grouped by bank, with a **billed vs ₹10L SFT meter** for each bank.
- Cashback limits are tracked per cycle, and order cashback is capped at what's left in the cycle.

### 🛒 Orders
- Record order amount, return from the buyer, cashback, coupon cashback, variant, site, delivery status and remarks.
- **Booker orders** also record the amount returned to the friend and an optional advance.
- Filters, bulk status updates, search and mobile card views.

### 💰 Profit that's always right
| Card | Your profit |
|------|-------------|
| Own / family | `return − order + cashback (+ coupon)` |
| Booker (friend) | `return − amount to friend (+ coupon)` |

The same formula is used by the server, the client, analytics and reports.

### 📒 Ledgers and khata
- **Buyer ledger:** a two-sided timeline of what each shopkeeper owes and what they've paid, with receipt uploads.
- **Booker khata:** what you owe each friend on delivered orders, minus advances and payments.
- **Khata book:** a simple gave/got ledger for anyone else.
- PDF reports for every ledger.

### 📊 Analytics
- Monthly profit trend, profit by buyer, booker and platform.
- **Cash position:** receivable from buyers, payable to bookers, money tied up in pending orders.
- Own and family vs bookers comparison.
- **Ask your data:** an AI assistant (Gemini) for plain-English questions about your orders.

### 🧾 ITR spend report
- Spend by person → bank → card for any financial year, with a month-wise split.
- Add-on spend is billed to the primary card holder.
- Flags banks at or over ₹10 lakh (SFT reportable).
- Export to PDF or CSV.

### 🛡️ Your data is safe
- Download all your data as one file, and restore it into a fresh account.
- Weekly **encrypted** (AES-256-GCM) database backups through GitHub Actions.
- Activity log of every change, kept for one year.
- JWT auth, bcrypt, rate limiting, ownership checks on every endpoint.

### 📱 Works everywhere
- Installable PWA with dark and light themes.
- Sidebar layout on desktop, a compact rail on tablets, and a drawer on phones.

## 🧱 Tech stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, Vite, React Router 7, Recharts, lucide-react, vite-plugin-pwa |
| Backend | Node.js, Express 5, Mongoose 8, ioredis, Winston, Swagger |
| Data | MongoDB, Redis cache (optional, degrades gracefully) |
| Services | Cloudinary (receipts), Nodemailer (password reset), Gemini (AI assistant) |
| Testing | Jest, Supertest, mongodb-memory-server, Vitest |
| Infra | Docker Compose, GitHub Actions (CI + scheduled backups) |

## 🚀 Getting started

### Prerequisites
- Node.js 20+
- MongoDB 6+ (local or Atlas)
- Redis (optional)

### 1. Clone and install
```bash
git clone https://github.com/shashitarwey/booker-app.git
cd booker-app
(cd server && npm install) && (cd client && npm install)
```

### 2. Configure `server/.env`
```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/booker_app
JWT_SECRET=change-me
CORS_ORIGINS=http://localhost:3000
CLIENT_URL=http://localhost:3000

# Optional
REDIS_URL=redis://localhost:6379
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
GEMINI_API_KEY=
```

### 3. Run
```bash
./run.local.sh          # server on :5000, client on :3000
```
Open **http://localhost:3000**. API docs are at **http://localhost:5000/api/docs**.

### Or with Docker
```bash
docker-compose up --build   # client :80 · server :5000 · MongoDB :27018
```

## ☁️ Deploy (free)
1. Create a free **MongoDB Atlas** M0 cluster, add a database user, and allow access from `0.0.0.0/0`.
2. On **Render**: **New → Blueprint** → pick this repo. [`render.yaml`](render.yaml) creates `booker-api` (Node) and `booker` (static site).
3. Fill in `MONGO_URI`, `CORS_ORIGINS` / `CLIENT_URL` (the app's URL) and `VITE_API_URL` (the API's URL + `/api`). Everything else is optional.
4. Open the app's URL and install it from the browser menu.

The free API sleeps after 15 minutes idle, so the first request after that takes about 30–60 seconds.

## 🧪 Tests
```bash
./run.test.sh           # server (Jest) + client (Vitest)
```

## 💾 Backups
```bash
cd server
MONGO_URI=... BACKUP_PASSPHRASE=... npm run backup              # writes an encrypted file to backups/
MONGO_URI=... BACKUP_PASSPHRASE=... npm run restore -- <file>   # refuses a database that already has data unless --force
```
For automatic weekly backups, add the `MONGO_URI` and `BACKUP_PASSPHRASE` repository secrets. The **Database Backup** workflow then stores each encrypted dump as an artifact for 90 days. Keep the passphrase somewhere safe outside GitHub too: without it a backup can't be restored.

## 📁 Project structure
```
server/
  routes/      REST API (auth, people, cards, orders, sellers, customers, reports, analytics, export…)
  services/    analytics, account export/import
  utils/       profit, khata, ledger feeds, cache, dates, migrations
  scripts/     encrypted backup / restore
  tests/       Jest + Supertest
client/
  src/pages/       Dashboard, People, Orders, Buyers, Khata, Analytics, ITR Report, Activity, Profile
  src/components/  Card widgets, ledgers, order table/cards, modals
  src/styles/      design tokens + dark/light themes
```

<div align="center">

Made with ☕ for everyone who has ever tracked card orders in a notebook.

</div>
