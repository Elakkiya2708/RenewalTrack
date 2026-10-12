# Renewal Tracking System — Frontend

A complete, static frontend for a Renewal Tracking System: contracts, licenses,
certifications, warranties, insurance policies, subscriptions and regulatory
permits — all in one dashboard, with reminders, history and reporting.

Built with **HTML5, CSS3 and vanilla JavaScript** (no build step, no framework,
no backend). All data is mock data persisted to `localStorage` in the browser,
so you can click around, add/edit/delete records, mark things as renewed, etc.
and it will behave like a real app across a page reload — until you clear
your browser storage.

## Running it

**IMPORTANT (Windows): extract the zip first.** Right-click the `.zip` →
**Extract All…**, then open the *extracted* folder. If you double-click
`index.html` while still inside the zip, Windows only extracts that one file and
the page shows up unstyled (no css/js/images).

Then pick one:

1. **Easiest (Windows):** double-click **`start.bat`** — it starts a local
   server and opens the browser at http://localhost:3000
2. **Any OS with Node.js:** open a terminal in the folder and run
   ```bash
   npm start        # or: node server.js
   ```
   then open http://localhost:3000
3. Or just double-click `index.html` from the **extracted** folder.

Opening the site shows the public landing page; click **Login** to enter the app.

## Accounts & Roles

### 1. Primary Admin Account
- **Name:** Elakkiya
- **Email:** `elakkiyaohai@gmail.com`
- **Password:** `Admin@1234`
- **Role:** `Admin` (Full Administrative Privileges, Team Management, Audit Logs)

### 2. Employee Account
- **Email:** `david.kim@renewaltrack.com`
- **Password:** `Demo@1234`
- **Role:** `Employee` (Manage assigned renewals & team visibility)

### 3. Viewer Account
- **Email:** `priya.nair@renewaltrack.com`
- **Password:** `Demo@1234`
- **Role:** `Viewer` (Read-only access)

## Project structure

```
renewal-tracking-system/
├── start.bat / server.js / package.json   Local launcher (Node, zero dependencies)
├── index.html          Public landing page (hero, features, FAQ…) — Login/Sign Up buttons lead to the app
├── login.html
├── register.html
├── dashboard.html
├── records.html         Renewal Records table + Add/Edit modal
├── details.html         Renewal Details page (see note below)
├── calendar.html
├── reminders.html
├── history.html
├── documents.html
├── reports.html
├── settings.html
├── css/
│   ├── style.css        Design tokens + app component styles
│   ├── landing.css      Landing page sections only
│   └── responsive.css   Tablet/mobile breakpoints
├── js/
│   ├── app.js           Data layer, auth, utilities, layout wiring, toasts
│   ├── auth.js          Login / register page logic
│   ├── landing.js       Landing page (mobile nav, FAQ accordion, auth-aware nav)
│   ├── dashboard.js
│   ├── records.js
│   ├── details.js
│   ├── calendar.js
│   ├── reminders.js
│   ├── history.js
│   ├── documents.js
│   ├── reports.js
│   └── settings.js
└── assets/              (empty — reserved for any static images/logos you add)
```

**One deviation from the originally requested file list:** the spec's file
structure didn't list a `details.html` / `details.js`, but section 6
("Renewal Details Page") explicitly requires a dedicated page showing full
record info, days remaining, renewal timeline/history, documents, and
Edit / Delete / Mark as Renewed actions. Building that as a real, linkable
page (`details.html?id=...`) rather than cramming it into a modal was the
more standard approach, so it's included as an addition.

## Mock data & status logic

On first load, `app.js` seeds 17 realistic renewal records (contracts,
licenses, certifications, warranties, insurance, subscriptions, regulatory
permits) with dates computed **relative to today**, so the Active / Due Soon /
Expired / Renewed mix stays correct no matter when you open the app.

Status is always calculated dynamically from the current date — never stored:

- **Expired** — expiry date is in the past
- **Due Soon** — expiry date is within 30 days
- **Renewed** — was renewed within the last 30 days (and isn't due/expired again)
- **Active** — everything else

## Connecting a real backend (Node.js + Express + Supabase)

Every page talks to data **only** through `RTS.data.*` and `RTS.auth.*` in
`js/app.js` — never directly to `localStorage`. To wire up a real backend:

1. In `js/app.js`, replace the internals of the functions under `data:` and
   `auth:` (e.g. `getRenewals`, `addRenewal`, `updateRenewal`, `deleteRenewal`,
   `markAsRenewed`, `login`, `registerAccount`, `changePassword`, etc.) with
   `fetch()` calls to your Express API endpoints (e.g.
   `GET/POST/PUT/DELETE /api/renewals`, `POST /api/auth/login`, etc.), backed
   by Supabase (Postgres) tables mirroring the renewal record shape used
   throughout the app (see any seed record in `seedData()` for the exact
   field names: `name`, `category`, `organization`, `description`,
   `referenceNumber`, `issueDate`, `expiryDate`, `reminderDate`, `cost`,
   `currency`, `priority`, `responsiblePerson`, `notes`, `documents[]`,
   `history[]`, `lastRenewedAt`, `reminderCompleted`).
2. Keep the function **names and return shapes** the same — every page script
   only calls these functions, so nothing else needs to change.
3. Document uploads currently just store file metadata (`name`, `type`,
   `size`, `uploadDate`) client-side. Swap `addDocumentToRenewal` to upload to
   Supabase Storage (or an Express endpoint that streams to S3/disk) and store
   the returned URL/path instead.
4. `RTS.auth.login` / `registerAccount` currently check a plaintext mock
   `accounts` array in `localStorage` — replace with real authentication
   (Supabase Auth or your own JWT/session flow via Express) and swap
   `isLoggedIn()` to check a real session/token instead of a localStorage flag.
5. Status/day calculations (`computeStatus`, `daysRemaining`, etc.) are pure
   functions of `expiryDate` and today's date — they can stay exactly as-is on
   the frontend, or be mirrored server-side for reports/queries.

## Notes

- Icons: [Lucide](https://lucide.dev) via CDN (`unpkg.com/lucide@latest`).
- Fonts: Inter (single family, varying weights) via Google Fonts.
- Design language: professional **indigo/slate** (default) — dark slate sidebar, light
  content area, standard green/amber/red status colours.
- **Themes** (Settings → Application → Theme): Indigo (light, default), Indigo (dark),
  Black & Gold, Ivory & Gold. Everything is driven by CSS variables in `css/style.css`
  (`body.theme-*` blocks), so adding another theme means adding one block.
- **Logo:** `assets/logo.png` (indigo) and `assets/logo-gold.png`; the app swaps logo,
  favicon and the landing preview image automatically when the theme changes
  (`data-img-indigo` / `data-img-gold` attributes + `applyTheme()` in `js/app.js`).
- Fully responsive: collapsible sidebar + off-canvas drawer on tablet/mobile,
  responsive tables, mobile-friendly modals and forms.
- Landing page: opening `index.html` shows the public marketing page. The app
  itself is only entered via the **Login** / **Get Started Free** buttons.
  Note: the testimonials and the stats band on the landing page are placeholder
  content — replace them with real ones before publishing.

## Automated Real Email Reminder System

RenewGuard includes an automated, background-scheduled email reminder engine powered by **Node.js, Express, node-cron, Nodemailer / Resend, and Supabase PostgreSQL**:

- **Automated Intervals:** Dispatches notifications **30 days, 15 days, 7 days** before expiry, and **on the exact expiry date (0 days)**.
- **Duplicate Prevention:** Tracks every sent reminder in the `reminder_logs` database table with a unique constraint on `(renewal_id, reminder_interval, expiry_date)`. Reminders for the same interval will never be sent twice.
- **Responsible Person Routing:** Delivers reminders specifically to the assigned responsible user or email, falling back safely to the configured administrator email.
- **Safe Development Mode:** By default, `EMAIL_SEND_ENABLED=false` logs email previews to the server console safely. Toggle to `true` with your SMTP or Resend credentials in `.env` to send live emails to inboxes.
- **Scheduled Background Job:** Runs independently on `CRON_SCHEDULE` (default: `0 8 * * *` daily at 8:00 AM) even when no browser session is open.
- **On-Demand Testing:** Test delivery instantly via the Settings page ("Send Test Reminder Email" or "Run Reminder Check Now") or via `POST /api/reminders/trigger`.

