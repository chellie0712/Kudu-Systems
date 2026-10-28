# Kudu Systems – CRM & BPA Online System

Customer management and job workflow for Kudu Systems: customer profiles with quotations, job cards and invoices, one-click conversion from quotation to job card or invoice, payments, and a calendar that syncs with Google Calendar.

## What it does

| Area | Features |
| --- | --- |
| **Customers** | Business or individual, contacts, billing and site addresses, VAT/reg numbers, notes, archive. Profile tabs: Information, Quotations, Job Cards, Invoices, Calendar, with invoiced / outstanding totals. |
| **Quotations** | Line items with live totals, discount, VAT, validity date, notes and terms. Status: Draft → Sent → Accepted / Declined / Expired. Printable A4 (Print → Save as PDF). |
| **Job cards** | *Job Card & Service Warranty*, laid out like the PurePest Solutions card in 7 sections: job details, client details, work performed (area/pest treated, description), before/after photos plus up to 8 more, warranty details (number, start/end dates with end auto-set N months after start, covers, active ingredients from a registered-products list, comments), warranty terms, and client sign-off (confirmation tick, signatory, on-screen signature with timestamp, PCO number and signature). Created blank or **from a quotation**. A job can only be saved as *Completed* once it has a work description, a signature and the confirmation tick. Printable. |
| **Invoices** | Created blank, **from a quotation** (line items copied) or **from a job card**. Payments (partial or full) update the status automatically; overdue invoices are flagged. Banking details print on the invoice. |
| **Calendar** | Month view. Scheduled job cards appear automatically. Appointments can be linked to a customer and show on that customer's profile. Two-way Google Calendar sync. |
| **Dashboard** | Open quotes, open job cards, outstanding and overdue amounts, next 14 days. |
| **Settings** | Company details, VAT rate, currency, banking details, document prefixes and numbering, default terms, job card title, PCO number and signature, warranty length / covers / terms, the products list, Google Calendar connection. |

Photos are compressed in the browser (max 1600 px JPEG) and uploaded one at a time, so a job card with 10 photos never hits request size limits. They are stored in the database for now; moving them to object storage (e.g. Vercel Blob) is a sensible step once volumes grow.

Money is stored in cents (no rounding drift). Document numbers (`QT-0001`, `JC-0001`, `INV-0001`) are reserved atomically, so two people saving at once never get the same number.

## Tech stack

- **Next.js 15** (App Router, server actions) + **TypeScript** + **Tailwind CSS 4**
- **PostgreSQL** via **Prisma**
- **Auth.js** (email + password sign-in with users managed in Settings; optional Google sign-in)
- **googleapis** for Google Calendar

## Run it locally

Requirements: Node 20+, PostgreSQL 14+.

```bash
npm install
cp .env.example .env          # then fill in DATABASE_URL and AUTH_SECRET
npx prisma migrate dev        # creates the tables
npm run dev                   # http://localhost:3000
```

Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`, or put `AUTH_DISABLED="true"` in `.env` to skip sign-in (development only; ignored in production builds).

## Deploy (Vercel + Neon)

1. Sign up at [vercel.com](https://vercel.com/signup) with your GitHub account.
2. **Add New → Project → Import** this repository. Before clicking Deploy, open **Build and Output Settings** and set **Build Command** to `npm run vercel-build` (this applies database migrations on every deploy).
3. Add these **Environment Variables**:
   - `AUTH_SECRET`: a long random string. Generate one at <https://generate-secret.vercel.app/32>.
   - `ADMIN_EMAIL`: the email you will sign in with.
   - `ADMIN_PASSWORD`: a strong password, used only for the very first sign-in.
   - `APP_TIMEZONE`: `Africa/Johannesburg`.
4. Click **Deploy**. The first build fails because there is no database yet; that is expected.
5. In the project, open **Storage → Create Database → Neon (Serverless Postgres)**, accept the defaults and connect it to the project. This sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED` automatically.
6. **Deployments → ⋯ on the latest → Redeploy.** When it is green, open the site and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
7. Add staff in **Settings → Users**. Then fill in company details, banking, PCO number and signature, products and warranty terms in **Settings**.

Sign-in uses email and password. Google is optional: setting `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` adds "Sign in with Google" and enables Calendar sync.

## Google sign-in and Calendar sync

You need one OAuth client from Google Cloud. About 10 minutes:

1. Go to <https://console.cloud.google.com/> and create a project (e.g. "Kudu CRM").
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **APIs & Services → OAuth consent screen**: User type *External* (or *Internal* if you use Google Workspace). Fill in app name "Kudu Systems", support email, and add the scope `.../auth/calendar.events`. While in *Testing* mode, add every staff Google account under **Test users**.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** → *Web application*.
   - Authorised JavaScript origins: `http://localhost:3000` and your production URL.
   - Authorised redirect URIs: `http://localhost:3000/api/auth/callback/google` and `https://YOUR-DOMAIN/api/auth/callback/google`.
5. Copy the Client ID and Client Secret into `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` (Vercel → Settings → Environment Variables), then redeploy. Kudu users can then also sign in with the Google account that has the same email; `ALLOWED_EMAILS` can admit extra Google accounts.
6. Sign in to Kudu with Google and approve calendar access. Then go to **Settings → Calendar connection → Use my Google account**.
7. Optional: to use a shared company calendar instead of your personal one, put its Calendar ID (Google Calendar → calendar settings → *Integrate calendar*) in **Settings → Google Calendar → Calendar ID**.

### How sync behaves

- Saving a job card with a scheduled time, or saving an appointment, creates or updates the Google event immediately. Deleting or cancelling removes it.
- **Calendar → Sync with Google** pulls changes made in Google (new, moved, deleted events). The first pull imports the last 90 days onwards; later pulls are incremental.
- Each Google event carries the Kudu customer link in private extended properties, so the customer link survives a round-trip.
- If Google is unreachable, the save in Kudu still succeeds and a warning is shown.
- Google's *Testing* mode refresh tokens expire after 7 days. Publish the consent screen (or use an *Internal* Workspace app) for production.

## Project layout

```
prisma/schema.prisma          data model
src/auth.ts                   sign-in, allow-list, requireUser()
src/lib/google.ts             Google Calendar push / pull
src/lib/settings.ts           company settings, document numbering
src/app/actions/*.ts          server actions (all check the signed-in user)
src/app/(app)/...             pages
src/components/...            forms, editors, printable document parts
```
