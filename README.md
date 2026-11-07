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
5. In the project, open **Storage → Create Database → Neon (Serverless Postgres)**, accept the defaults and connect it to the project. This adds `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING` and similar variables, which the app picks up automatically (you do not need to copy them into `DATABASE_URL`).
6. **Deployments → ⋯ on the latest → Redeploy.** When it is green, open the site and sign in with company code `kudu` and `ADMIN_EMAIL` / `ADMIN_PASSWORD`. The same email and password open the super-admin area at `/platform/login` (or set `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` to use a different login there).
7. Add staff in **Settings → Users & roles**. Then fill in company details, banking, PCO number and signature, products and warranty terms in **Settings**.

Sign-in uses email and password. Google is optional: setting `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` adds "Sign in with Google" and enables Calendar sync.

## Companies (multi-company)

One installation serves many companies. **Each company has its own database**: its own logo, settings, users, products, customers, quotations, job cards, invoices and calendar. Nothing is shared between companies.

| Piece | Where it lives |
| --- | --- |
| Platform registry: the list of companies, where each one's database is, and the super-admins | Schema `platform` of the main database (`prisma/platform/schema.prisma`) |
| The original Kudu data | The main database (schema `public`), registered as company code `kudu` |
| Every other company | Its own database, `company_<code>`, created on the same Neon server, or an external database (e.g. its own Neon project) whose connection string is stored encrypted |

**Signing in.** Company users go to `/login` and type their **company code**, email and password. A link like `/login?company=acme` fills the code in, and the browser remembers it. Super-admins sign in at `/platform/login`.

**Super-admins** create companies at `/platform`: name, company code, optional logo and the first admin's email and password. The app creates the database, applies all migrations, seeds settings and the products list, and creates that admin. Super-admins can also rename a company, change its code, switch its access off (its data is kept), and add users or reset passwords. They cannot see a company's customers or documents. While no super-admin exists, `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` (or, if not set, `ADMIN_EMAIL` / `ADMIN_PASSWORD`) create the first one at `/platform/login`.

**Logos.** Each company uploads its logo in **Settings → Company**. It shows in the menu bar and prints on quotations, job cards and invoices. Until one is uploaded, the Kudu company shows the Kudu logo and other companies show their name.

**Deploys.** `npm run vercel-build` runs `scripts/migrate-all.mjs`, which migrates the platform registry, the main database and every company database. If any company fails to migrate, the build stops.

**Keep `AUTH_SECRET` unchanged.** It also encrypts external company connection strings; changing it makes those unreadable.

Not built yet: deleting a company (switch access off instead; dropping a database cannot be undone), and per-company subdomains.

## Roles and permissions

Every user has one role. The rules live in `src/lib/permissions.ts`; pages, server actions and the menu all check them there.

| | Admin | Office | Technician |
|---|---|---|---|
| Customers, quotations, invoices, payments | ✓ | ✓ | — |
| Job cards | all | all | only the ones assigned to them |
| Create job cards, assign technician, schedule, scope | ✓ | ✓ | — (read-only) |
| Fill in work done, photos, warranty, client sign-off | ✓ | ✓ | own jobs |
| Cancel a job | ✓ | ✓ | — |
| Prices and totals | ✓ | ✓ | — |
| Calendar | all, edit | all, edit | own jobs, view only |
| Delete customers, quotations, job cards, invoices, payments | ✓ | — | — |
| Company settings, products, Google connection | ✓ | — | — |
| Users and roles | ✓ | — | — |

- Users who existed before roles were added became **Admins**. New users default to **Office**. The first admin (from `ADMIN_EMAIL`, or created by a super-admin) is an Admin.
- A company always keeps at least one active admin: you cannot remove your own admin rights, or demote or disable the last admin.
- A job card's **Assigned to** picks the user who does the job; that user sees it under *My Job Cards* and on *My Calendar*. The printed technician name follows the chosen user unless you type over it.
- Opening a page or action without permission leads to `/no-access`.
- Local demo mode (`AUTH_DISABLED=true`) signs you in as an Admin; set `DEMO_ROLE=OFFICE` or `DEMO_ROLE=TECHNICIAN` to try the other roles.

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
