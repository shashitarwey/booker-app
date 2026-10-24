# CardVault - Credit Card Spend Tracker & Financial Analyser

Full-stack app for a reseller who books electronics on e-commerce sites for shopkeepers ("Buyers", the `Seller` model) using cards held by themselves, family members and friends. Tracks card spend, orders, buyer ledgers and profit.

## Tech Stack

- **Backend**: Node.js, Express v5, MongoDB (Mongoose v8), Redis (ioredis), JWT auth
- **Frontend**: React 18, Vite, React Router v7, Axios, Recharts, Context API
- **Infra**: Docker + Docker Compose, PWA (vite-plugin-pwa), Cloudinary (file uploads), Nodemailer (emails), Winston (logging)

## Project Structure

```
server/
  index.js              # Express app entry, route registration, cleanup scheduler
  config/db.js          # MongoDB connection
  middleware/auth.js     # JWT verification middleware
  models/               # Mongoose schemas: User, Card, Transaction, Order, Seller, SellerPayment, PasswordResetToken
  routes/               # REST endpoints: auth, cards, transactions, orders, sellers, summary, analytics
  utils/
    cache.js            # Redis caching (graceful degradation if unavailable)
    helpers.js          # pickFields utility (mass-assignment protection)
    logger.js           # Winston file + console logging
    mailer.js           # Nodemailer (Ethereal in dev, SMTP in prod)
    cloudinary.js       # Cloudinary upload for payment receipts
    accountCleanup.js   # Background job: purge deleted accounts after 7-day grace period

client/
  src/
    api.js              # Axios instance + all API method exports
    App.jsx             # Route definitions
    context/            # AuthContext (user/token), ThemeContext (dark/light)
    hooks/useSummary.js # Summary data fetching + date filtering
    pages/              # AuthPage, DashboardPage, OrdersPage, SellersPage, SellerLedgerPage,
                        # ProfilePage, ChangePasswordPage, OrderAnalyticsPage, ForgotPasswordPage, ResetPasswordPage
    components/         # Navbar, CardWidget, AddCardModal, AddTransactionModal, AddOrderModal,
                        # AddPaymentModal, AddSellerModal, SellerLedgerModal, TransactionsTableView
    common/             # ActionMenu, ConfirmModal, DateFilter, DateRangeDropdown, ErrorBoundary,
                        # GlobalSearch, Pagination, SearchableDropdown, SingleDatePicker
    styles/             # CSS modules: base, layout, layout-mobile, auth, component-specific
    constants/index.js  # Shared constants (variants, ecomm sites, delivery statuses)
    utils/formatters.js # Currency/date formatting helpers
```

## Commands

```bash
# Development
cd server && npm install && npm run dev    # Backend on :5000 (nodemon)
cd client && npm install && npm run dev    # Frontend on :3000 (Vite, proxies /api to :5000)

# Production
cd server && npm start
cd client && npm run build                 # Outputs to client/dist/

# Docker (full stack)
docker-compose up --build                  # Server :5000, Client :80, MongoDB :27018
```

## Environment Variables

**Server** (`server/.env`):
- `PORT` (5000), `MONGO_URI` (DB name: `booker_app`), `JWT_SECRET`
- `REDIS_URL` (optional, defaults to localhost:6379)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` (email)
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `CORS_ORIGINS`, `CLIENT_URL`, `LOG_LEVEL`
- `BACKUP_PASSPHRASE`, `BACKUP_KEEP` (backup scripts only)

**Client** (`client/.env`):
- `VITE_API_URL` (e.g., `http://localhost:5000/api`)

## Database Models

| Model | Key Fields | Notes |
|-------|-----------|-------|
| **User** | name, email, password (bcrypt), deletion_requested_at | comparePassword method, 7-day deletion grace |
| **Person** | user_id, name, relation (`self`/`family`/`friend`), phone, notes | Card holder. One `self` per user (auto-created via `utils/people.js#ensureSelfPerson`) |
| **Card** | user_id, holder_id (Person), card_type (`primary`/`addon`), primary_card_id, bank_name, card_network, last_four_digit, cashback config, billing/due dates | holder_id defaults to self if omitted |
| **Variant** | user_id, name, key | User-added device variants on top of `Variant.DEFAULT_VARIANTS` |
| **Transaction** | card_id, amount, description, date | Index: {card_id, date} |
| **Order** | user_id, card_id, seller_id, order/return amounts, cashback, friend_amount, variant (free text), model, delivery_status (`Delivered`/`Pending`/`Cancelled`), ecomm_site, remark | Profit — see below |
| **Seller** | user_id, name, city, phone | Stats computed dynamically via aggregation |
| **SellerPayment** | user_id, seller_id, amount, payment_date, notes, receipt_url (Cloudinary) | Index: {user_id, seller_id, payment_date} |
| **PasswordResetToken** | user_id, token (SHA-256 hash), expires_at, used | TTL index auto-deletes expired tokens |

## API Endpoints

### Auth (`/api/auth`)
- `POST /register` - Register (password: 8+ chars, upper+lower+digit+special)
- `POST /login` - Login, returns JWT (30-day expiry)
- `PUT /profile` - Update name/email (auth required)
- `PUT /change-password` - Change password with old password verification
- `POST /request-deletion` / `POST /cancel-deletion` / `GET /account-status` - Account deletion flow
- `POST /forgot-password` / `POST /reset-password/:token` - Email-based password reset

### Cards (`/api/cards`)
- `GET /` / `POST /` / `PUT /:id` / `DELETE /:id` - CRUD (delete cascades to transactions)

### Transactions (`/api/transactions`)
- `GET /` - Merged view of transactions + orders via `$unionWith` aggregation. Query: cardId, bankName, from_date, to_date, page, limit
- `POST /` / `DELETE /:id`

### Orders (`/api/orders`)
- `GET /` / `POST /` / `PUT /:id` / `DELETE /:id` - Filters: date ranges, seller, card, delivery_status, model, ecomm_site

### Sellers (`/api/sellers`)
- `GET /` / `GET /:id` / `POST /` / `PUT /:id` / `DELETE /:id` - Delete blocked if orders exist
- `GET /:sellerId/payment` / `POST /payment` / `PUT /payment/:id` / `DELETE /payment/:id` - Payment ledger (multipart upload for receipts)

### Summary (`/api/summary`)
- `GET /` - Spend per card/bank with date filtering (5-min Redis cache)

### Analytics (`/api/analytics`)
- `GET /profit` - Monthly trend, profit by buyer / e-comm site, **byBooker** (card holder incl. their profit + pending dues), **bySource** (own & family vs bookers), **position** (all-time receivable from buyers, payable to bookers, pending-order value, net). 5-min Redis cache, invalidated by order/card/buyer-payment/booker-payment writes

### Health (`/api/health`)
- `GET /` - MongoDB/Redis status, uptime, memory

## Architecture Notes

**Profit (single source of truth: `server/utils/profit.js`, mirrored in `client/src/utils/profit.js`)**:
- Own/family card: `return_amount − order_amount + cashback` (+ `coupon_cashback` unless `coupon_in_profit === false`, for both own and friend orders; coupons never change the friend's earning)
- Friend card (`friend_amount` is a number = amount given to the friend): `return_amount − friend_amount`; friend earns `friend_amount − order_amount + cashback`
- The orders route requires `friend_amount` for friend-held cards and nulls it otherwise. Friend orders may carry `advance_amount` (0..friend_amount, null = none). **Booker khata** (`utils/bookerKhata.js`, `GET /api/people/:id/khata`, payments via `BookerPayment` + `/api/people/:id/payments`): balance = friend_amount on Delivered orders − advances (non-cancelled orders) − payments; `pending_dues` everywhere is this all-time balance. Always use `PROFIT_EXPR` in aggregations, never inline the formula.

**People UI**: `/people` redirects to `/people/family`. On `/people/:id` the top strip shows ONE "Family" chip (self + family) plus a chip per booker; `/people/family` is the combined family view (member pills drill into one member). Server accepts `person_id=family` (orders) and `holder_id=family` (cards). Tabs: Cards | Orders (| Khata for bookers). `OrdersPage` takes an optional `person` prop that scopes everything via `GET /api/orders?person_id=`.

**Activity log**: TTL 365 days (`models/ActivityLog.js`).

**Dates / timezone**: stored dates are calendar days at UTC midnight. "Today" must be the local day: client `getToday()` (constants), server `utils/dates.js` (`todayLocal`, `todayAsUtcDate`; `APP_TZ`, default Asia/Kolkata). Never use `toISOString()` for "today".

**Cashback limit**: `GET /api/cards/:id/cashback-cycle?date=&exclude_order=` returns limit/earned/remaining for the cycle containing that date (`getCashbackCycle` in utils/helpers.js); the order form caps auto-cashback at `remaining`. Person cards tab shows spend by bank with billed (primary + linked add-ons) vs the ₹10L SFT limit (`components/BankSection.jsx` + `utils/bankSpend.js`; cards are grouped by bank).

**Caching**: server `cacheMiddleware(300)` on summary, analytics, people (+khata) and reports. Writes call `invalidateCache(req, '<change>')`; the `AFFECTS` map in `utils/cache.js` decides which areas are cleared (uses SCAN, not KEYS). Client `api.js` has a 30s `cachedGet` for people/cards/buyers/summary/variants; any non-GET response clears it, as does logout.

**Ledgers**: buyer ledger, khata customer and booker khata feeds are paginated inside MongoDB (`utils/ledgerFeed.js`: `$unionWith` + `$setWindowFields` running balance + `$facet`). The UI for all three is `client/src/components/LedgerView.jsx` (+ `LedgerSummary`).

**Analytics**: computed in `services/analytics.js` (`computeProfitAnalytics`), shared by `/api/analytics/profit` and the AI assistant snapshot (`routes/ai.js` sends aggregates + latest 150 orders, not raw history).

**Migrations**: `utils/migrations.js` `runMigrations()` runs once after Mongo connects (idempotent; e.g. backfills `Transaction.user_id`).

**Orders UI**: `pages/OrdersPage.jsx` holds state; presentational pieces live in `components/orders/` (OrderFilters, OrdersTable, OrderCardList, BulkBar). Cards with orders cannot be deleted.

**Dashboard / UI**: `/` is booker-centric — KPIs plus a card per person (friends = "Bookers", then Me & Family) using `GET /api/people?from_date&to_date` (stats: order_count, delivered_count, pending_count, total_order_amount, my_profit, pending_dues = Return to Friend on Delivered orders). Shared stats UI: `components/BookerStats.jsx`.

**ITR spend report**: `/reports/spends` ← `GET /api/reports/spends?from_date&to_date[&person_id][&relations=self,family][&include_items=true]` (`routes/reports.js`). Person → bank → card spend (transactions + non-cancelled orders), monthly split, `billed_total` on primary cards = own + linked add-ons, `sft_reportable` when a person's billed total at one bank ≥ ₹10L. Exports in `client/src/utils/spendReportExport.js` (PDF via print, summary CSV, entries CSV). Desktop uses a left sidebar (`Navbar.jsx`, ≥900px); visual tokens live in `styles/base.css`, theme overrides in `styles/theme.css` (loaded last).

**Auth flow**: JWT stored in localStorage as `cv_token` -> Axios interceptor attaches `Authorization: Bearer` header -> `authMiddleware` validates -> 401 triggers auto-logout.

**Caching**: Redis with 5-min TTL on summary/analytics. Graceful degradation (no-op if Redis unavailable). Cache invalidated on POST/PUT/DELETE to cards/transactions/orders/sellers using wildcard pattern `route:{userId}:*`.

**Transactions merge**: GET /api/transactions uses MongoDB `$unionWith` to combine transactions + orders into a unified timeline, with `$facet` for parallel count + total + paginated results in a single query.

**Seller stats**: Computed dynamically on every GET via Order + SellerPayment aggregation (not stored in DB), ensuring consistency.

**Account deletion**: Request sets `deletion_requested_at` -> 7-day grace (login cancels) -> background job runs every 6 hours to cascade-delete all user data.

**Security**: bcrypt (12 rounds), rate limiting (20 req/15min on auth), field whitelisting via `pickFields`, ownership verification on all endpoints, password complexity validation.

**PWA**: Service worker with NetworkFirst for API (5-min cache, except `/api/export`, which is never cached), CacheFirst for fonts (1-year cache). Installable on mobile/desktop.

**Backups**:
- **Per-account** (`services/accountData.js`, `routes/export.js`; UI under Profile → Your Data). `GET /api/export` downloads every record the user owns as JSON (`format: booker-account-backup`, `user_id`/`__v` stripped). `POST /api/export/import` (25mb body limit) restores only into an *empty* account. It gives every record a fresh `_id`, remaps references through `REFS`, maps the backup's self person onto the account's self, validates everything before writing, and undoes partial inserts on failure. When adding a collection or a reference field, update `COLLECTIONS`/`REFS` and `tests/backup.test.js`.
- **Whole database**: `npm run backup` / `npm run restore -- <file> [--force]` (server/scripts). Writes an EJSON dump with gzip and AES-256-GCM using `BACKUP_PASSPHRASE` (12+ chars) to `backups/` (gitignored; keeps the newest `BACKUP_KEEP`, default 14). Restore refuses non-empty collections unless `--force`. `.github/workflows/backup.yml` runs it weekly (plus manual dispatch) using the `MONGO_URI` and `BACKUP_PASSPHRASE` secrets, and keeps the encrypted file as a 90-day artifact.

**Theme colours**: Use tokens, not hex, for coloured text: `--success`/`--danger`/`--amber`, and `--ink-red`/`--ink-green`/`--ink-amber` for text on tinted chips. Every token has a light-mode value. Entity-coloured tags (relation badge, activity tags) pass the colour as `--tag` and CSS darkens it in light mode. Card widgets are always dark, so they use fixed light colours.

## Tests

- Server: `cd server && npm test` (Jest + Supertest + mongodb-memory-server)
- Client: `cd client && npx vitest run`
