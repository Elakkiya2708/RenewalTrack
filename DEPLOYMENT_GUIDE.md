# RenewalTrack — Production Deployment Guide
**Frontend**: Vercel &nbsp;|&nbsp; **Backend**: Render (Node.js) &nbsp;|&nbsp; **Database**: Render Persistent Disk or Supabase PostgreSQL

---

## Architecture Overview

```
               ┌──────────────────────────────────────────────┐
               │              Users / Browsers                │
               └──────────────────────┬───────────────────────┘
                                      │
            ┌─────────────────────────┴─────────────────────────┐
            ▼                                                   ▼
┌───────────────────────────────┐               ┌───────────────────────────────┐
│        Vercel Frontend        │               │         Render Backend        │
│    (Static HTML/CSS/JS)       │               │       (Express.js API)        │
│  https://your-app.vercel.app  │               │https://renewaltrack-tyvw.onrender.com│
└───────────────┬───────────────┘               └───────────────┬───────────────┘
                │                                               │
                │ Rewrites /api/* to Render                     │
                └───────────────────────────────────────────────┤
                                                                ▼
                                                ┌───────────────────────────────┐
                                                │        Data Persistence       │
                                                │ - Render Disk (/var/data) OR  │
                                                │ - Supabase PostgreSQL         │
                                                └───────────────────────────────┘
                                                                ▼
                                                ┌───────────────────────────────┐
                                                │       Gmail SMTP Engine       │
                                                │   (Automated Cron Reminders)  │
                                                └───────────────────────────────┘
```

---

## Part 1: Deploy Backend to Render

### Option A: Using Render Blueprints (Recommended - 1 Click)

1. Push your repository to GitHub.
2. Sign in to [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** &rarr; **Blueprint**.
4. Select your `RenewalTrack` GitHub repository.
5. Render will detect [`render.yaml`](./render.yaml) automatically.
6. Under **Environment Variables**, fill in your secret values:
   - `GMAIL_USER`: `elakkiya270806@gmail.com` (or your sending Gmail)
   - `GMAIL_APP_PASSWORD`: Your 16-character Google App Password (without spaces)
   - `APP_URL`: Leave empty initially, or set to your Vercel URL once deployed
   - `ALLOWED_ORIGINS`: Set to your Vercel URL (e.g. `https://your-app.vercel.app`)
7. Click **Apply**.
8. Render will provision the Web Service, attach the 1GB persistent disk at `/var/data`, and start the server.

---

### Option B: Manual Web Service Setup on Render

1. Sign in to [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** &rarr; **Web Service**.
3. Connect your `RenewalTrack` GitHub repository.
4. Fill in the service configuration:
   - **Name**: `renewaltrack-backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/health`
5. Click **Advanced** &rarr; **Add Disk**:
   - **Name**: `renewaltrack-data`
   - **Mount Path**: `/var/data`
   - **Size**: `1 GB`
6. Add Environment Variables under **Environment**:

| Variable | Value | Description |
|---|---|---|
| `NODE_ENV` | `production` | Production mode |
| `PORT` | `10000` | Port automatically assigned by Render |
| `DATA_DIR` | `/var/data` | Points to persistent disk mount |
| `APP_URL` | `https://your-app.vercel.app` | Your Vercel frontend URL |
| `ALLOWED_ORIGINS` | `https://your-app.vercel.app` | Allowed CORS origin |
| `ALLOW_VERCEL_PREVIEWS` | `true` | Allows Vercel preview URLs |
| `JWT_SECRET` | *(Click "Generate")* | Strong random string |
| `EMAIL_PROVIDER` | `nodemailer` | Real email delivery engine |
| `EMAIL_SEND_ENABLED` | `true` | Real dispatch enabled |
| `SMTP_HOST` | `smtp.gmail.com` | Gmail SMTP host |
| `SMTP_PORT` | `587` | STARTTLS port |
| `SMTP_SERVICE` | `gmail` | Nodemailer service preset |
| `GMAIL_USER` | `elakkiya270806@gmail.com` | Your Gmail address |
| `GMAIL_APP_PASSWORD` | `your16charaapppassword` | 16-character App Password |
| `ALERT_FALLBACK_EMAIL` | `elakkiya270806@gmail.com` | Fallback alert recipient |
| `CRON_SCHEDULE` | `0 8 * * *` | Daily alert cron at 08:00 AM |

7. Click **Create Web Service**.
8. Note your public backend URL: `https://renewaltrack-tyvw.onrender.com`.

---

## Part 2: Data Persistence Guarantee

Render Web Services use ephemeral filesystems by default. RenewalTrack ensures **zero data loss** through two supported mechanisms:

### Method 1: Render Persistent Disk (Configured via `render.yaml`)
- A 1GB disk mounted at `/var/data` stores `store.json`.
- Files on this disk survive server restarts, sleeps, redeploys, and crashes.
- **Auto-Seeding**: On first boot of a fresh disk, `backend/db.js` automatically copies from [`data/seed.json`](./data/seed.json), ensuring that Primary Admin (`elakkiya270806@gmail.com`), genuine invited members, and audit logs are available immediately.

### Method 2: Supabase Cloud PostgreSQL (Recommended & 100% Free)
- Uses your Supabase PostgreSQL cloud database for infinite persistence across all Render restarts, sleeps, and redeploys without needing a paid disk.
- **Step 1**: Open your Supabase SQL Editor:
  [https://supabase.com/dashboard/project/pzkyvgcbfjcnzcxsgekb/sql/new](https://supabase.com/dashboard/project/pzkyvgcbfjcnzcxsgekb/sql/new)
- **Step 2**: Copy the entire contents of [`supabase/COMPLETE_SUPABASE_SCHEMA.sql`](./supabase/COMPLETE_SUPABASE_SCHEMA.sql), paste into the editor, and click **Run**.
  - This creates all 7 tables (`renewals`, `app_users`, `invitations`, `reminder_logs`, `audit_logs`, `password_resets`, `notification_settings`).
  - Automatically seeds your Primary Admin (`elakkiya270806@gmail.com`) and team members.
- **Step 3**: In Render &rarr; Environment Variables, add:
  - `SUPABASE_URL`: `https://pzkyvgcbfjcnzcxsgekb.supabase.co`
  - `SUPABASE_ANON_KEY`: *(Your Supabase anon public key)*
  - `SUPABASE_SERVICE_ROLE_KEY`: *(Your Supabase service_role secret key)*
- **Step 4**: RenewalTrack will automatically detect your Supabase connection and run in PostgreSQL mode!

---

## Part 3: Deploy Frontend to Vercel

1. Sign in to [Vercel](https://vercel.com).
2. Click **Add New...** &rarr; **Project**.
3. Import your `RenewalTrack` GitHub repository.
4. Leave **Framework Preset** as **Other** (static HTML/CSS/JS).
5. In [`vercel.json`](./vercel.json), the `destination` URL is configured to your real Render backend:
   ```json
   {
     "rewrites": [
       {
         "source": "/api/:path*",
         "destination": "https://renewaltrack-tyvw.onrender.com/api/:path*"
       }
     ]
   }
   ```
6. Click **Deploy**.
7. Vercel will deploy your frontend in seconds (e.g. `https://renewaltrack.vercel.app`).
8. Direct cross-origin API calls are also pre-configured in [`js/config.js`](./js/config.js) to:
   ```javascript
   window.RTS_CONFIG = {
     API_URL: "https://renewaltrack-tyvw.onrender.com",
   };
   ```

---

## Part 4: Setup Gmail SMTP & App Password

To enable automated email alerts and invitations without any cost:

1. Go to your **Google Account**: [https://myaccount.google.com/](https://myaccount.google.com/)
2. On the left navigation, click **Security**.
3. Under *"How you sign in to Google"*, make sure **2-Step Verification** is turned **ON**.
4. Go to **App Passwords**: [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
5. Enter App name: `RenewalTrack` &rarr; click **Create**.
6. Google will display a 16-character password (e.g., `abcd efgh ijkl mnop`).
7. Copy the code and remove all spaces: `abcdefghijklmnop`.
8. In Render &rarr; Environment &rarr; set:
   - `GMAIL_USER`: `elakkiya270806@gmail.com`
   - `GMAIL_APP_PASSWORD`: `abcdefghijklmnop`

---

## Part 5: Post-Deployment Verification Checklist

Once both services are deployed, verify the complete pipeline:

1. **Backend Health Check**:
   - Open `https://renewaltrack-tyvw.onrender.com/api/health`
   - Response should return:
     ```json
     {
       "status": "ok",
       "app": "RenewalTrack - Renewal & Compliance Management System",
       "smtpConfigured": true,
       "storageMode": "json_store"
     }
     ```
2. **Frontend Loading**:
   - Open your Vercel URL: `https://your-app.vercel.app`
   - Verify landing page, styles, and Lucide icons render cleanly.
3. **Admin Sign In**:
   - Go to `https://your-app.vercel.app/login.html`
   - Sign in as Primary Admin: `elakkiya270806@gmail.com`
   - Dashboard loads with navigation, metrics, and role badge.
4. **Member Invitation & Real Email**:
   - Navigate to `Team Members` &rarr; click **Invite Member**.
   - Enter an email and role &rarr; verify email arrives with genuine registration link pointing to your Vercel URL.
5. **Data Persistence**:
   - On Render, trigger a manual restart (**Manual Deploy** &rarr; **Deploy latest commit** or **Restart Service**).
   - Once healthy, refresh your Vercel dashboard and verify all renewals and team members are preserved.
