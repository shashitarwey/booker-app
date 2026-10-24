# Suggested Features for Booker

> Updated: October 2026, after the Booker revamp.
>
> **The use case:** a reseller books electronics on Amazon, Flipkart and other sites for shopkeepers (**Buyers**). The orders go on cards held by **self**, **family** (primary or add-on cards) and **friends (Bookers)**, who are paid back through a khata. The ideas below are ranked for that workflow.

---

## Status Legend

- ~~Strikethrough~~ ✅ = Done
- **Bold** = High priority next

---

## ✅ Already Built

| Area | Done |
|------|------|
| People & cards | ~~Self / family / friend people, primary & add-on cards, per-person tabs, combined family view~~ |
| Orders | ~~Return to friend, advances, coupon cashback (with profit toggle), remarks, custom variants, Delivered / Pending / Cancelled, bulk status / clear / delete, filter by booker~~ |
| Profit | ~~One formula on server and client, own vs friend profit, friend's profit, profit %~~ |
| Ledgers | ~~Buyer ledger timeline with receipts, Booker khata, Khata book, PDF report for each~~ |
| Analytics | ~~Monthly trend, profit by buyer / booker / platform, own & family vs bookers, cash position, AI "Ask your data"~~ |
| Cards | ~~Cashback limit per cycle (capped in the order form), spend by bank with billed vs ₹10L SFT meter~~ |
| Tax | ~~ITR spend report: person → bank → card, month-wise, add-ons billed to primary, SFT flag, PDF / CSV~~ |
| Data | ~~Download all my data + restore, encrypted weekly DB backup (GitHub Actions), activity log (1 year)~~ |
| Platform | ~~PWA, dark / light theme, sidebar + mobile layouts, Redis cache, Swagger, CI, 148 server + 48 client tests, Render Blueprint~~ |

---

## 1. Booker (Friend) Relationship

> Bookers lend their cards and expect their money on time. Trust is the core of the business.

- **Share Khata on WhatsApp** — One tap sends a booker their balance plus the PDF (`wa.me` link with the text pre-filled). Same for buyers.
- **Read-only Khata Link** — A signed, expiring link so a booker can check their own balance without an account.
- **Booker Card Bill Reminder** — Friends' cards have bill due dates. Warn when a booker's delivered-order dues aren't paid N days before their card's due date, so they never pay interest on your orders.
- **Booker SFT / Spend Meter** — The ITR report covers self and family. Add a per-booker FY spend meter so friends know when *their* card spend is close to ₹10L at a bank.
- **Booker Payment Mode** — UPI / bank / cash on booker payments and advances, to make reconciliation easier.
- **Settle-up Suggestion** — "Pay Ravi ₹60,800 to clear everything up to 20 Oct", grouping dues by order date.

---

## 2. Buyer (Shopkeeper) Collections

- **Receivable Aging** — Buyer balances split into 0–7 / 7–15 / 15–30 / 30+ days since delivery. This shows who is slow to pay.
- **Buyer Payment Reminder** — WhatsApp / email reminder with the current balance and ledger PDF.
- **Buyer Contact Details** — UPI ID, bank / IFSC and GST number on the buyer, shown on the ledger.
- **Payment Mode on Buyer Payments** — UPI / NEFT / cash / cheque, with a filter.
- **Buyer Credit Limit** — Warn when a new order would take a buyer's outstanding above a set limit.
- **Profit % per Buyer Trend** — Is a buyer squeezing margins over time?

---

## 3. Choosing the Right Card

> This would set Booker apart. All the data already exists (cashback cycles, limits, spend, SFT).

- **Smart Card Picker** — In the order form, given amount and date, rank cards by:
  - cashback still available this cycle
  - remaining credit limit
  - SFT headroom at that bank
  - the person's (or booker's) outstanding dues
- **Credit Limit & Utilization** — `credit_limit` on Card, plus a utilization bar on the card widget (important for friends' cards).
- **Cashback Cycle Countdown** — "₹2,400 left · resets in 6 days" on every card, plus a dashboard list of cards with unused cashback.
- **Statement / Due Date Reminders** — Use the existing `billing_date` / `due_date` fields for own and family cards.
- **Annual Fee & Waiver Tracking** — Fee, waiver spend target, and progress towards it.
- **Card Expiry Warning** — Expiry month / year, with a warning 60 days before.

---

## 4. Faster Order Entry

- **Paste-to-Parse** — Paste the Amazon / Flipkart order confirmation and the form fills in model, amount and date.
- **Repeat / Clone Order** — Copy an order (same model, buyer and card) with today's date.
- **Duplicate Warning** — Same model + card + date + amount already exists.
- **Bulk Order Import (CSV)** — For moving existing notebook or Excel data in.
- **Recently Used Chips** — The last 5 buyers, cards and models as one-tap chips.
- **Tracking Number / URL** — Courier link on the order, with a "track" button in the list.
- **Expected Delivery Date** — Pending orders past their expected date get highlighted.
- **Keyboard Shortcuts** — `N` new order, `/` search, `Esc` close.

---

## 5. Business Insights

- **Product Performance** — Profit and margin by model + variant. Which phones are worth booking, and which lose money.
- **Platform Comparison** — Average margin, cancellation rate and delivery time by e-comm site.
- **Cash Flow Forecast** — Next 7 / 30 days:
  - expected in from buyers (delivered and pending orders)
  - expected out to bookers
  - card bills due
- **Capital Locked** — Money sitting in pending orders per card or booker, and how long it's been there.
- **Booker Ranking** — Profit per booker per month, cancellation rate, and average days to settle.
- **Price History** — Order price per model over time, to spot good buying windows.
- **Year-over-Year** — Compare profit and volume with the same month last FY.

---

## 6. Tax & Compliance

- **Profit Statement for ITR** — FY profit summary (business income) with month-wise detail, next to the spend report.
- **AIS Reconciliation** — Enter the bank's AIS / SFT figure next to Booker's billed total and see the difference.
- **GST-ready Export** — If the user registers for GST: buyer-wise invoices and an output summary.

---

## 7. Notifications

> No notification setup exists yet. One small notification centre would serve sections 1–3.

- **In-app Notification Centre** — A bell icon for card dues, booker settlements, slow buyers, cashback resets and SFT warnings.
- **Web Push (PWA)** — Push notifications on the installed app.
- **Weekly Email Digest** — Profit, receivables, payables and pending orders (Nodemailer already set up).

---

## 8. Account & Security

- ~~Profile, change password, forgot password, account deletion with 7-day grace~~ ✅
- ~~Account export / restore, encrypted DB backups~~ ✅
- **Two-Factor Auth (TOTP)** — The app holds financial data for several people.
- **Session Management** — Log out all devices (JWTs can't be revoked today).
- **App Lock PIN** — A quick PIN or biometric unlock on the installed PWA.

---

## 9. Platform & Infrastructure

- **Keep-alive / Cold Start** — Ping `/api/health` (cron-job.org) or move to a paid instance. The free Render tier sleeps after 15 minutes idle.
- **Error Tracking** — Sentry (free tier) for server and client.
- **Per-user Rate Limits** — Today's limit is per IP and only on auth routes.
- **Restore Drill** — A monthly GitHub Action that restores the latest backup into a scratch DB and checks the counts.
- **Offline Order Draft** — Save the order form offline and sync it when back online.

---

## Priority Matrix

| Priority | Feature | Impact | Effort |
|----------|---------|--------|--------|
| **P0** | Share Khata / Ledger on WhatsApp | Very High | Low |
| **P0** | Receivable Aging for buyers | Very High | Low |
| **P0** | Credit Limit + Utilization (esp. booker cards) | High | Very Low |
| **P0** | Booker Card Bill Reminder | Very High | Medium |
| **P1** | Smart Card Picker in order form | Very High | Medium |
| **P1** | Product Performance report | High | Low |
| **P1** | Repeat Order + Duplicate Warning | High | Low |
| **P1** | Payment Mode on buyer / booker payments | Medium | Very Low |
| **P1** | Booker SFT / Spend Meter | High | Low |
| **P1** | Cash Flow Forecast | High | Medium |
| **P2** | Notification Centre + Web Push | High | Medium |
| **P2** | Paste-to-Parse order entry | High | High |
| **P2** | Read-only Khata Link for bookers | Medium | Medium |
| **P2** | Profit Statement for ITR | Medium | Low |
| **P2** | Bulk Order Import (CSV) | Medium | Medium |
| **P2** | Tracking Number + Expected Delivery | Medium | Low |
| **P3** | 2FA + Session Management | Medium | Medium |
| **P3** | AIS Reconciliation / GST export | Medium | Medium |
| **P3** | Sentry + Restore Drill | Medium | Low |

---

## Recommended Build Order

1. **Share on WhatsApp** — Builds on the existing PDFs. Bookers and buyers see their balance in seconds.
2. **Receivable Aging** — One aggregation on data that already exists. Shows who to chase first.
3. **Credit Limit + Utilization** — One field and a bar on the card widget.
4. **Payment Mode** — Small schema change that makes reconciliation easier.
5. **Product Performance** — Reuses the analytics service. Book the models that make money.
6. **Repeat Order + Duplicate Warning** — Daily time saver that also prevents double entries.
7. **Booker SFT Meter + Card Bill Reminder** — Protects friends, which protects the business.
8. **Smart Card Picker** — Combines cashback cycle, limits, SFT and dues. Builds on items 3 and 7.
9. **Cash Flow Forecast** — Built from aging, pending orders and card due dates.
10. **Notification Centre** — Brings all the reminders above together, then add Web Push.
