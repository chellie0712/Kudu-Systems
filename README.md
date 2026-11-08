# Kudu Systems – CRM & BPA Online System

Customer management and job workflow for Kudu Systems: customer profiles with quotations, job cards and invoices, one-click conversion from quotation to job card or invoice, payments, and a calendar that syncs with Google Calendar.

## What it does

| Area | Features |
| --- | --- |
| **Customers** | Business or individual, contacts, billing and site addresses, VAT/reg numbers, notes, archive. Profile tabs: Information, Quotations, Job Cards, Invoices, Calendar, with invoiced / outstanding totals. |
| **Quotations** | Line items with live totals, discount, VAT, validity date, notes and terms. Status: Draft → Sent → Accepted / Declined / Expired. Printable A4 (Print → Save as PDF). |
| **Job cards** | *Job Card & Service Warranty*, laid out like the PurePest Solutions card in 7 sections: job details, client details, work performed (area/pest treated, description), before/after photos plus up to 8 more, warranty details (number, start/end dates with end auto-set N months after start, covers, active ingredients from a registered-products list, comments), warranty terms, and client sign-off (confirmation tick, signatory, on-screen signature with timestamp, PCO number and signature). Created blank or **from a quotation**. A job can only be saved as *Completed* once it has a work description, a signature and the confirmation tick. Printable. **Client sign-off on the phone** (`/sign/<job>`): a full-screen page the technician hands to the client, with a job summary, the warranty terms, a large signature box, the confirmation tick, a 1–5 star rating and a comment. Signing completes the job and stops any timer still running on it. The rating and comment show on the job card on screen only, not on the printout. |
| **Invoices** | Created blank, **from a quotation** (line items copied) or **from a job card**. Payments (partial or full) update the status automatically; overdue invoices are flagged. Banking details print on the invoice. |
| **Inventory** | Stock items (unit, cost and sell price, reorder level), a warehouse and vans, receiving, transfers, stock counts, full movement history, low-stock warnings. Technicians see "My van" and book products used on their job cards out of their own van; the office adds them to the invoice. |
| **Customer assets** | Equipment on a customer's site (bait stations, fly units, traps…) with code, location, serial number, install date and service interval. Technicians record a result for each asset on the job card; results print on the job card and build each asset's service history. |
| **Queries** | Customer complaints, requests and callbacks with priority, assignee, due date, notes timeline and resolution; raise a job card from a query. |
| **Reports** | Sales, VAT, payments, quote conversion, cashflow forecast, aged debtors, top customers, technician jobs and hours, materials used; CSV exports. |
| **Email campaigns** | Marketing email to customers, sent from each user's **own mailbox** (Gmail / Google Workspace, Outlook / Microsoft 365, or any SMTP mailbox) and their sign-in address. Simple formatting, a button, merge fields, preview, test send, audience filters, progress, daily limits, POPIA-compliant consent and unsubscribe. |
| **Customer portal** | `/portal`: a customer's contacts sign in (company code + email + password, kept apart from staff logins) to see sent quotations and accept or decline them, booked visits, completed job cards / service warranties (printable), sent invoices with payments and banking details, and to log queries or re-service requests. Staff give access on the customer's **Portal** tab, which makes a one-time link (valid 14 days) to send by WhatsApp or email; the customer opens it and chooses a password. The same button makes a password-reset link. Drafts, cancelled documents, internal query notes and other customers are never shown. |
| **Offline mode** | Technicians can add the app to their phone's home screen. While they have signal, their open jobs are kept on the phone; with no signal the app opens **My jobs (offline)** (`/offline`), where they fill in work done, tick checklists, take photos and get the client's signature, rating and comment. Everything is sent automatically when the signal comes back and goes through the same checks as online (a sign-off the server can't accept stays on the phone with the reason). Signing out deletes the phone's copy, warning first about unsent work. |
| **Branches** | Optional offices. Customers belong to a branch; a header switcher filters the lists, calendar and dashboard; documents print the branch's contact details. |
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

## Job statuses, forms and checklists

**Custom job statuses** (Settings → Job statuses): your own names and colours, e.g. "Awaiting parts". Each belongs to one of the four stages (Scheduled, In progress, Completed, Cancelled). The stage drives the dashboard, the calendar and Google sync; the custom name is what people see on the job card, the job list and the filter. Pick one in the job card's Status list, or with "Other status…" on the job card page. Deleting a status puts its job cards back on their stage. Three examples are added on first deploy; rename or delete them.

**Forms & checklists** (Settings → Forms & checklists): a checklist is a list of items, one per line. It can be added to every job card, to job cards of one job type, or by hand on the job card. Technicians tick items and add notes on their own job cards; the checklist prints on the job card. "All items must be ticked to complete the job" stops a job being marked Completed (in the form and on the server) until every item is ticked. Job cards keep their own copy, so editing or deleting a template never changes past jobs. A "Safety checklist" example is added on first deploy.

## Job time tracking and labour billing

**Time on a job card** (the "Time on this job" box on the job card page): anyone who can open the job card can start and stop a timer (one running timer per person; starting another stops the first) or add time by hand (date, from, to, note). Technicians record only their own time and never see rates or amounts. Office and admins can record time for anyone, mark entries billable or not, stop someone's timer and delete unbilled entries.

**Labour billing** (Settings → Labour billing): a company hourly rate excl. VAT, the invoice line wording, and rounding (time is rounded up per person, default 15 minutes; 0 bills exact minutes). A person can have their own rate in Settings → Users & roles. "Create invoice" on a job card now adds the unbilled time as labour lines (one per rate) after the quotation's lines, and marks that time billed. Time recorded later can be added to the job's draft invoice with "Add labour to draft invoice". Deleting an invoice makes its time unbilled again.

## Invoice approval

Off by default. Switch it on in **Settings → Invoice approval**, optionally only for invoices from a set total (incl. VAT; 0 = every invoice). While an invoice needs approval it cannot be marked as sent (the button is hidden and the server refuses). Office staff press **Submit for approval**; admins see a banner on the dashboard and the **AWAITING APPROVAL** invoice filter, then **Approve** or **Send back** with a reason, which the office sees on the invoice. If the total changes after approval, it needs approving again (an already-sent invoice stays sent, but shows up for the admin to re-approve). Payments can be recorded at any time.

## Inventory and van stock

**Inventory** (menu, office and admins): add stock items with a unit (each, ml, L, kg…), cost and sell price excl. VAT, and a reorder level. A "Warehouse" location is created on first deploy; add vans under **Locations** and give each van its driver. Move stock with **Receive** (into a location, optionally at a new cost price), **Transfer** (e.g. warehouse to van) and **Stock count** (sets the quantity at a location to what was counted and records the difference). Every change is kept in the history on the item page. Items at or below their reorder level are flagged on the Inventory page and on the dashboard. Levels may go below zero (product used before it was booked in); they show in red until corrected.

**Stock used on a job card** (the "Stock used" box on the job card page): technicians record what they used, from their own van only, and can remove their own entries until they are billed. They never see prices. Office staff can book stock out of any location. Materials are **not** added automatically when an invoice is created, because quoted prices often already include the chemicals; use **Add materials to draft invoice** on the job card to add them (one line per product at the sell price). Technicians see their van's stock under **My van**. Only admins can delete items; an item that has been billed can't be deleted, only made inactive.

## Customer assets

**Assets tab** on the customer profile (office and admins): add the equipment on the customer's site with a code (e.g. BS-01), name, location on site, serial number, install date and service interval. The list shows each asset's last check and the next service date (red when overdue). "Edit / history" opens the asset's details and every check made on it. Untick Active to retire an asset but keep its history; only admins can delete one.

**Site assets on the job card**: anyone who can open the job card (technicians: their own) picks a result for each asset on this visit, e.g. "Checked, OK", "Activity found", "Bait / glue board replaced", "Missing", with an optional note. The checks print on the job card as "Site assets checked". Technicians can also add a new asset from the job card (e.g. a station installed today), but only the office can change an existing one.

## Customer queries

**Queries** (menu, office and admins) tracks complaints, re-service requests, callbacks and other customer queries until they are resolved. Each query gets a number (`QRY-0001`; prefix in Settings → Documents), a customer, subject, details, type, how it was received, priority (Low to Urgent), an assignee (office or admin) and a "respond by" date. It is overdue once that day has passed.

- The list has views for Open, Assigned to me, Overdue, Unassigned and All, plus search and a status filter. Urgent queries sort first, then by due date.
- On a query you add notes, change the status (Open → In progress → Waiting on customer → Resolved / Closed), and edit the details. Resolving or closing needs a resolution. Every change is written to the query's timeline with who and when. Adding a note to an Open query moves it to In progress.
- **Create job card** raises a job card for the customer (e.g. a re-service) with the query in its scope, and links the two.
- Customers have a **Queries** tab, job cards show their queries with a "+ Log query" link, and the dashboard shows open, overdue and your queries. Queries follow the branch switcher.
- Only admins can delete a query.

## Reports and cashflow

**Reports** (menu, office and admins) for a period: last 12 months by default, presets for this/last month, this quarter, this/last year, or any from–to dates. It follows the branch switcher.

- **Totals**: invoiced excl. VAT, VAT on invoices (output VAT), payments received, quote conversion (accepted ÷ accepted + declined + expired). Invoices count by issue date; drafts and cancelled invoices are left out.
- **Per month**: invoiced and received as two charts on the same scale (hover a column for the exact amount, or "Show as table").
- **Cashflow** (as of today, not limited to the period): unpaid balances of sent invoices by when they are due (overdue, 7 days, 8–30, 31–60, later) and **aged debtors** per customer (not yet due, 1–30, 31–60, 61–90, 90+ days overdue).
- **Top customers** by invoiced amount, **technicians and staff** (jobs completed by job date, time recorded) and **materials used** on jobs (quantity, at cost, at sell price, and how much has been billed).
- **CSV downloads** of the invoices and payments in the period, for your accountant or spreadsheet.

## Marketing, Google Ads and profit & loss

**Marketing** (menu, office and admins) answers "what does a customer cost us, and what do we make after advertising?" for any period.

- **Lead source**: each customer has "How they found you" (Google Ads, Facebook / Instagram, referral, …) and the ad campaign. The campaign field suggests names from your ad spend.
- **Per channel and campaign**: spend, clicks, Google's conversions and cost per conversion, leads (customers added in the period), won (accepted quote or issued invoice), cost per lead, cost per won customer, revenue excl. VAT from those customers to date, and profit after their materials and the ad spend.
- **Profit & loss** (admins only): per month, revenue excl. VAT − materials used at cost = gross profit, − advertising − expenses by category = net profit.
- **Expenses** (menu, admins): wages, fuel, rent and other costs, excl. VAT. Spend on ad channels without a live link (Facebook, flyers, radio) is entered on the same page under "Other advertising" so it counts toward cost per lead.

### Google Ads live link

Each company connects **its own** Google Ads account in **Settings → Google Ads** (Connect Google Ads, sign in, allow access, then enter the 10-digit account number). Spend, clicks and conversions per campaign per day are pulled at once (the last 13 months), every night, whenever the Marketing report is opened and the data is over 3 hours old, and with "Sync now". The last 30 days are re-read on every sync because Google keeps revising conversions. Disconnecting keeps the spend already loaded.

One-time platform setup (the Google Cloud project behind Kudu, not per company):

1. In Google Cloud (a project with billing turned on), enable the **Google Ads API**, and apply for **Explorer** access at console.cloud.google.com/google/ads-apis/overview (usually approved straight away). Test access only reaches test accounts.
2. **OAuth consent screen**: External, add the scope `https://www.googleapis.com/auth/adwords`, and set publishing status to **In production**. In "Testing" Google expires the connection after 7 days.
3. **Credentials → OAuth client ID → Web application**, authorised redirect URI `https://<your domain>/api/google-ads/callback` (one per domain you use, e.g. the preview URL too).
4. Vercel environment variables: `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET` (if left out, `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` are used), and `CRON_SECRET` (any long random string; Vercel sends it to the nightly job in `vercel.json`).
5. Optional: `GOOGLE_ADS_REDIRECT_URI` to force the callback address, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` when accounts are reached through a manager (MCC) account, `GOOGLE_ADS_API_VERSION` (default `v26`).

Refresh tokens are stored encrypted with `AUTH_SECRET` in each company's own database.

## Email campaigns

`/marketing/email` (Admin and Office). Write a campaign, preview it as a real customer will see it, send a test to yourself, then **Send now**.

**Sent from your own mailbox.** Each user connects their mailbox once on **My profile** (`/account`, click your name top right). Campaigns go out from the user's **sign-in email address**, through their own mailbox, so customers see that address, replies go back to them and copies sit in their Sent folder. Kudu can only send; it cannot read the mailbox. The mailbox must be the sign-in address: connecting Google or Microsoft as a different address is refused.

| Way to connect | Works for | Needs on the server |
| --- | --- | --- |
| Connect Google | Gmail, Google Workspace | A Google OAuth client (`GOOGLE_MAIL_CLIENT_ID` / `GOOGLE_MAIL_CLIENT_SECRET`, or the `AUTH_GOOGLE_*` one) with the Gmail API enabled and the `gmail.send` scope; redirect URI `https://<site>/api/mailbox/google/callback` |
| Connect Microsoft | Outlook.com, Microsoft 365 | A Microsoft Entra app registration (`MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`, optional `MICROSOFT_TENANT_ID`, default `common`) with delegated `Mail.Send`, `User.Read`, `offline_access`; redirect URI `https://<site>/api/mailbox/microsoft/callback` |
| SMTP | Any other mailbox: website hosting mail, Afrihost, Xneelo, Gmail with an app password | Nothing. The user types the server, port, username and password; Kudu tests it before saving |

Tokens and passwords are stored encrypted with `AUTH_SECRET`. Set `APP_URL` (e.g. `https://crm.kudusystems.co.za`) once the site has its own domain; unsubscribe links and the logo in emails use it (otherwise the address the sender is using).

**Who receives it (POPIA section 69).** Only customers marked **Opted in**, or **existing customers** (an issued invoice) who have not unsubscribed. Leads with no invoice are never emailed until consent is recorded on their customer page (Information tab → Email marketing). Archived customers and customers without an email address are skipped; each address gets one copy. Campaigns can be narrowed by branch, customer type and lead source, or to opted-in customers only.

**Unsubscribe.** Every email has the company's name, address and contact details and an unsubscribe link (`/unsubscribe/...`, a confirm button, no sign-in), plus `List-Unsubscribe` / one-click headers so Gmail, Yahoo and Outlook show their own Unsubscribe button. Unsubscribing marks every customer with that address as Unsubscribed at once, including campaigns still sending. Links are signed, so they cannot be guessed.

**Sending.** Pressing Send queues the audience. While the campaign page is open it sends in batches (one email every 0.7 s for Google, 2.1 s for Microsoft, 1 s for SMTP, to stay under their rate limits) with a progress bar. Each mailbox has a **daily limit** (default 400 for Google and SMTP, 250 for Microsoft; change it on My profile); when it is reached, the rest go out the next day. The daily job `/api/cron/email` (06:00 UTC, protected by `CRON_SECRET` like the other nightly jobs) carries on with any campaign still sending, so closing the page is safe, just slower. A rejected address is marked Failed and the rest carry on; a mailbox that stops accepting the login pauses the campaign until someone resumes it from their own mailbox. Campaigns can be paused, resumed, cancelled, duplicated and have failed addresses retried.

Not built: open and click tracking, scheduling for a later time, images in the body, sending from a shared/company address, and bounce processing (bounce emails land in the sender's inbox).

## Accounting packages

Each company links Kudu with **one** accounting package in **Settings → Accounting**:

| Package | How it links | Platform setup (Vercel env vars) | Per company |
|---|---|---|---|
| Sage Business Cloud Accounting (SA) | API, Sage user login | `SAGE_API_KEY` (`SAGE_API_URL` only for Sage's test system) | Sage username + password |
| Xero | API, OAuth | `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` | "Connect Xero" |
| QuickBooks Online | API, OAuth | `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET` (`QUICKBOOKS_ENVIRONMENT=sandbox` while testing) | "Connect QuickBooks" |
| Zoho Books | API, OAuth | `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` (`ZOHO_ACCOUNTS_URL` if the client is not on zoho.com) | "Connect Zoho Books" |
| FreshBooks | API, OAuth | `FRESHBOOKS_CLIENT_ID`, `FRESHBOOKS_CLIENT_SECRET` | "Connect FreshBooks" |
| Odoo | API, API key | none | Odoo address, database, login, API key |
| Sage Pastel Partner / Evolution | CSV files | none | GL accounts and tax types |

OAuth apps must list this redirect URI for each package, using the production domain (preview URLs change):
`https://<your-domain>/api/accounting/<xero|quickbooks|zoho|freshbooks>/callback`. Set `ACCOUNTING_REDIRECT_BASE=https://<your-domain>` if the app is reached on more than one domain. `CRON_SECRET` (shared with the Google Ads job) protects the nightly job.

What happens (online packages):

- **Kudu → package:** when an invoice is issued (marked as sent, after approval if that is on) the customer is created or updated there and the invoice is created as an approved/sent invoice with the same lines, VAT, discount and (where the package allows) number. Payments recorded in Kudu are created there against the invoice. Editing an invoice that is already there updates it. Removing a payment in Kudu removes it there.
- **Package → Kudu:** every night at 04:30 UTC (`/api/cron/accounting`) and with "Check for payments", Kudu asks the package what is still owed on open invoices it sent. Money paid there that Kudu doesn't know about (e.g. from the bank feed) is added to the Kudu invoice as a payment "from <package>".
- Drafts are never sent. Cancelling in Kudu does not touch the package: void it or issue a credit note there.
- Invoices issued before the start date (default: the day the package was chosen) are assumed to be there already. "Send to …" on an invoice sends it anyway.
- Each invoice shows its status and any error; each payment shows "in …" or "from …". Errors never block Kudu.
- IDs are kept per package *and* organisation, so switching either never sends to the wrong books.

Pastel Partner / Evolution: Settings → Accounting gives three downloads (customers, invoices batch, receipts batch) holding only what is new since the last download, in Pastel Partner's batch layout or a headed CSV for Evolution's import wizard, and an upload for receipts exported from Pastel (matched to Kudu invoices by number). Test the first import on a copy of the Pastel company.

Logins, tokens and API keys are stored encrypted with `AUTH_SECRET` in the company's own database (`AccountingLink`). Code: `src/lib/accounting/` (one adapter per package behind `types.ts`, the shared engine in `sync.ts`).

## Branches

Optional; nothing changes until you add one in **Settings → Branches** (name, address, phone, email). Then:

- Each customer can be given a branch (customer form), and its quotations, job cards and invoices belong to that branch. Moving a customer to another branch moves its history with it.
- A **branch switcher** appears in the header for office and admins. It filters the customer, quotation, job card and invoice lists, the calendar (appointments without a customer always show) and the dashboard. "All branches" shows everything. The choice is remembered in that browser; without one, each person starts on their **home branch** (Settings → Users & roles).
- A branch's address, phone and email print on its customers' quotations, invoices and job cards in place of the company's, with "<branch> branch" under the company name.
- Branches don't restrict access: anyone with access can switch to any branch. Technicians don't see the switcher (they only see their own jobs).
- Deleting a branch keeps its customers and users; they just have no branch.

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
