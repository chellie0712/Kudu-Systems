# Kudu Systems – CRM & BPA Online System

Customer management and job workflow for Kudu Systems: customer profiles with quotations, job cards and invoices, one-click conversion from quotation to job card or invoice, payments, and a calendar that syncs with Google Calendar.

## What it does

| Area | Features |
| --- | --- |
| **Customers** | Business or individual, any number of contacts (one primary), billing and site addresses, VAT/reg numbers, notes, archive. Profile tabs: Information, Contacts, Quotations, Job Cards, Invoices, Calendar, with invoiced / outstanding totals. |
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

### Custom roles

**Settings → Users & roles → Set up custom roles** (`/settings/roles`, admins only): create roles such as *Sales rep*, *Supervisor* or *Bookkeeper* and tick exactly which of the 44 permissions each has, grouped by area (customers, quotations, job cards, calendar, invoices, inventory, reports, email marketing, administration). **Start from** ticks what Office or Technician has, as a starting point. Give a role to a user in the role list under Users & roles, where custom roles appear under *Custom roles*.

- A user with a custom role has exactly its ticked permissions; the menu, pages and actions follow them, and changes apply on their next click. Without *See all job cards* they see only jobs assigned to them, like a technician.
- Each custom role **falls back to** Office or Technician: its users get that built-in role if the role is deleted, and are listed that way when assigning jobs. Admin is never a custom role and always has everything.
- Someone given *Manage users* through a custom role cannot make anyone an admin, change an admin's role, password or access, change their own role, or set up roles.

## Job statuses, forms and checklists

**Custom job statuses** (Settings → Job statuses): your own names and colours, e.g. "Awaiting parts". Each belongs to one of the four stages (Scheduled, In progress, Completed, Cancelled). The stage drives the dashboard, the calendar and Google sync; the custom name is what people see on the job card, the job list and the filter. Pick one in the job card's Status list, or with "Other status…" on the job card page. Deleting a status puts its job cards back on their stage. Three examples are added on first deploy; rename or delete them.

**Forms & checklists** (Settings → Forms & checklists): a checklist is a list of items, one per line. It can be added to every job card, to job cards of one job type, or by hand on the job card. Technicians tick items and add notes on their own job cards; the checklist prints on the job card. "All items must be ticked to complete the job" stops a job being marked Completed (in the form and on the server) until every item is ticked. Job cards keep their own copy, so editing or deleting a template never changes past jobs. A "Safety checklist" example is added on first deploy.

## Process monitor

**Process monitor** (menu; needs Reports and See all job cards) shows where every job is in its process and what is waiting on someone:

- **Job pipeline**: a column per status (Scheduled, In progress and your custom statuses), with each open job, how long it has been in that status, the average and the oldest.
- **Stuck jobs**: open jobs that have spent longer than the limit in one status, are more than a day late to start, have no booking date for longer than the limit, or start within 2 days with nobody assigned.
- **How long each step takes** (last 30 / 90 / 365 days): average, median and longest time jobs spent in each status before moving on, plus the average time from job created to completed.
- **Waiting on someone**: completed jobs with no invoice, sent quotes with no answer, accepted quotes nobody has started, invoices waiting for approval, overdue invoices and overdue queries.

Every job card status change is recorded with who made it and when (from the job card form, the status buttons, client sign-off, offline sync, and job cards created from a quotation or query). The job card shows this **Status history**. History starts when this feature is installed: for older jobs, the time in their current status is a lower bound, marked "≥".

Limits are in **Settings → Job statuses**: days in one status before a job is stuck (default 3, and each custom status can have its own), days before a sent quote needs a follow-up (7), and days a completed job may wait for its invoice (2). The dashboard links to the monitor when jobs are stuck.

## Job time tracking and labour billing

**Time on a job card** (the "Time on this job" box on the job card page): anyone who can open the job card can start and stop a timer (one running timer per person; starting another stops the first) or add time by hand (date, from, to, note). Technicians record only their own time and never see rates or amounts. Office and admins can record time for anyone, mark entries billable or not, stop someone's timer and delete unbilled entries.

**Labour billing** (Settings → Labour billing): a company hourly rate excl. VAT, the invoice line wording, and rounding (time is rounded up per person, default 15 minutes; 0 bills exact minutes). A person can have their own rate in Settings → Users & roles. "Create invoice" on a job card now adds the unbilled time as labour lines (one per rate) after the quotation's lines, and marks that time billed. Time recorded later can be added to the job's draft invoice with "Add labour to draft invoice". Deleting an invoice makes its time unbilled again.

## Approvals

**Approvals** (menu, for anyone who approves something) lists everything waiting for you, oldest first: quotations, invoices, purchase orders, expense claims and leave requests, each with **Approve** or **Send back / Reject / Decline** with a reason. The menu shows how many are waiting and the dashboard has a banner. Who approves: admins by default; a custom role can be given any of the approve permissions (Settings → Roles). Approval is in-app only, there is no email.

Settings → **Approvals** (0 as an amount means "all"):
- **Invoices** (off by default), optionally only from a set total incl. VAT. While an invoice needs approval it cannot be marked as sent (the button is hidden and the server refuses). Office staff press **Submit for approval**; the approver approves or sends it back with a reason, which the office sees on the invoice. If the total changes after approval, it needs approving again (an already-sent invoice stays sent, but shows up to re-approve). Payments can be recorded at any time. The **AWAITING APPROVAL** filter on Invoices still works.
- **Quotations** (off by default), the same way: a quotation that needs approval stays a draft and can't be marked Sent or Accepted (and so is not shown in the customer portal) until approved. A changed total needs approving again.
- **Purchase orders** (on by default), the same way: a purchase order can't be marked as ordered until approved.
- **Expense claims** always need approval, except claims under the auto-approve amount.
- **Leave** always needs approval. **Annual leave per person** (default 15 working days, the BCEA minimum) drives the "left this year" figure.
- Nobody approves their own expense claim or leave, except a built-in Admin (so a company with one admin still works).

### Expense claims

**Expense claims** (menu, everyone) is for money staff paid out of their own pocket: date, category, what for, where, the amount paid and whether the slip includes VAT, plus a photo of the slip (taken with the phone camera; it is shrunk before upload). A claim can be changed or withdrawn until it is approved; a rejected claim shows the reason and can be changed and resubmitted. Approved claims become expenses (excl. VAT) in the profit & loss on their date, show on the Expenses page with the claimant's name, and are listed under "Approved, not paid back" until someone marks them **paid back**. Approvers see everyone's claims and the total owed to staff.

### Purchase orders

**Purchase orders** (menu, office and admins): order from a supplier with lines picked from your stock items (price defaults to the item's cost price) or typed in for things you don't stock, VAT and a delivery location. Numbers are `PO-0001` (prefix in Settings → Approvals). Draft → submit for approval → approved → **Mark as ordered** → **Book in a delivery**: enter how many of each line arrived and where they go; stock items are received into that location (same as Inventory → Receive, noted with the PO number) and the order's price becomes the item's cost price. Part deliveries are fine; the order shows Partly received until everything is in. The purchase order prints as a clean page to email or hand to the supplier (Print / Save PDF). Low-stock items on Inventory have an **Order more** link. A received order can't be deleted, only cancelled.

### Leave

**Leave** (menu, everyone): request annual, sick, family responsibility, study, unpaid or other leave for a range of days or a half day. Days are counted as working days (Monday to Friday) without South African public holidays (including Good Friday, Family Day and Sunday holidays moved to Monday). You see your annual leave left this year, sick and family leave taken, and the next public holidays. You can cancel a request, or approved leave that has not started. Office and admins see who is off in the next 90 days and leave taken per person this year. An approver can also record leave for someone else (e.g. a sick day phoned in), which is approved straight away. Approved leave and public holidays show on the **Calendar**, and a job card warns when its technician is on leave on the booked day.

## Inventory and van stock

**Inventory** (menu, office and admins): add stock items with a unit (each, ml, L, kg…), cost and sell price excl. VAT, and a reorder level. A "Warehouse" location is created on first deploy; add vans under **Locations** and give each van its driver. Move stock with **Receive** (into a location, optionally at a new cost price), **Transfer** (e.g. warehouse to van) and **Stock count** (sets the quantity at a location to what was counted and records the difference). Every change is kept in the history on the item page. Items at or below their reorder level are flagged on the Inventory page and on the dashboard. Levels may go below zero (product used before it was booked in); they show in red until corrected.

**Stock used on a job card** (the "Stock used" box on the job card page): technicians record what they used, from their own van only, and can remove their own entries until they are billed. They never see prices. Office staff can book stock out of any location. Materials are **not** added automatically when an invoice is created, because quoted prices often already include the chemicals; use **Add materials to draft invoice** on the job card to add them (one line per product at the sell price). Technicians see their van's stock under **My van**. Only admins can delete items; an item that has been billed can't be deleted, only made inactive.

## Customer contacts

**Contacts tab** on the customer profile: add every person you deal with at the customer, with name, role / title, email, phone, mobile and notes. One contact is **primary**; the first one added is primary automatically, and **Make primary** moves it. The contact fields on the customer form edit the primary contact, and the customer's own contact person, email and phone always show the primary contact, so accounting sync, email campaigns and the portal invite use it.

- Quotations, job cards and invoices have a **Contact** select next to the customer. It starts on the primary contact; pick anyone else at the customer. The printed quotation and invoice show that contact (Attn, phone, email). On a job card, picking a contact fills the site contact and contact number, which you can still overwrite.
- A job card or invoice created from a quotation, or an invoice created from a job card, keeps the same contact.
- A contact that is on any document can't be deleted; **Archive** it instead. Archived contacts are left out of the selects but still print on their documents. Archiving the primary passes it to the next contact.
- Customer search also finds customers by any of their contacts' names, emails or numbers.
- Existing data: each customer's contact person, email, phone and alternative phone became its primary contact (migration `20261109180000_customer_contacts`). Existing documents keep printing the primary contact, as before.

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

## Tasks, auto-assignment and escalation

**Tasks** (menu, everyone) is work for one person with a deadline, e.g. "Call Thandi about the follow-up visit". Each task gets a number (`TSK-0001`), a title, details, a type (Follow-up call, Chase payment, Site visit…, or your own), a priority (Low to Urgent), a deadline (date and time), the person it is for, and optionally the customer, job card, quotation, invoice or query it is about.

- **Where to add one:** Tasks → New task, or "+ Task" on a customer's Tasks tab, a job card, quotation, invoice or query. Those pages list their open tasks.
- **Views:** My tasks, I gave out, Everyone's open, Overdue, Escalated, Nobody assigned and Done, with search and a status filter. "✓ Done" closes a task in one click. Each task has a timeline of notes and every change (status, deadline, reassignment, escalation) with who and when.
- **Who sees what:** Admins and office see and assign everyone's tasks. Technicians see the tasks given to them, the ones they created and the ones escalated to them, and can only give tasks to themselves (or let the rules choose). Only admins delete tasks. Custom roles have the same five task permissions to tick (existing custom roles were given "see and work on own tasks", and office-based ones also "see everyone's" and "give tasks to others").
- The menu shows your open task count, in red when one is overdue or escalated to you. The dashboard shows the same.

**Auto-assignment** (Settings → Tasks): when a task is added with "Assign to: Automatically", the first active rule that matches its type and priority (blank = any) picks the person:
- *Always this person*: one named user.
- *Take turns*: round the active users of a role (built-in or custom) in name order.
- *Fewest open tasks*: whoever in the role has the fewest tasks still to do.
- Optionally only users from the customer's branch. If no rule matches or nobody is available, the task is left with nobody and shows under "Nobody assigned". Rules run in the order shown; the assignment note on the task names the rule.

**Escalation** (Settings → Tasks): an open task more than *N* hours past its deadline (default 24, 0 = off) is escalated once: it gets an "Escalated" label and a note, and shows on the dashboard and under Escalated for the chosen person (or, if none is chosen, for everyone who sees all tasks). Optionally the task is also handed to that person. Kudu checks when Tasks or the dashboard is opened and every day at 05:00 UTC (`/api/cron/tasks`, protected by `CRON_SECRET`). Escalation is in-app only, there is no email or SMS. Setting a new deadline in the future clears the escalation.

## Forms and web forms

**Forms** lets an admin build their own forms (permission `forms.manage`) without code. Drag fields into order and choose from headings, short and long text, email, phone, number, date, drop-downs, radio buttons, tick boxes, yes/no and signatures. Four starting templates are included: quote request, contact us, site inspection and blank.

Each form can be used in two places:

- **Inside Kudu.** Staff fill it in on its own, from a customer's Forms tab, or from a job card (for example a site inspection a technician completes on site). Anyone with `forms.fill` can fill in forms. Only people with `forms.view` see everyone's answers; others see what they filled in themselves.
- **On your website.** Switch on "Web form" to get a public link (`/f/<company code>/<form>`) and an embed code for your site. A web submission finds the customer by email or phone, or creates a new one with lead source "Website". It can also open a query and create a follow-up task due in 24 hours, which is auto-assigned using the task rules.

Spam protection on web forms uses a hidden honeypot field, a signed time stamp (submissions faster than 3 seconds or older than a day are ignored) and a limit of 10 submissions an hour per visitor. Visitor IP addresses are stored only as a one-way hash.

New submissions show as a badge on Forms in the menu until someone marks them as dealt with. Each form's submissions can be searched and exported to CSV.

## Workflows (automations)

**Workflows** (permission `workflows.manage`, admins) let Kudu do routine steps by itself. Each workflow is built without code in four parts:

1. **When**, what starts it. This is either something happening (a customer, quotation, job card, invoice, query or form submission is added or changes status, a payment is recorded, the client signs off a job) or a point in time that is checked every morning (a quotation with no answer for N days, an invoice overdue by N days, a job coming up in N days, a warranty ending in N days, a customer with no job for N days).
2. **Only if**, optional conditions: for example the quotation total is more than R50 000, the customer is an individual, or the client's rating is below 4.
3. **Wait**, optionally, a number of minutes, hours or days. After the wait the conditions are checked again, and a status trigger must still be in that status.
4. **Then**, one or more steps in order:
   - create a task (assigned by the task rules, to the job's technician, or to a chosen person)
   - send an email from a person's own connected mailbox
   - log a customer query
   - change the job's or quotation's status
   - make a job card from the quotation
   - make a draft invoice from the job card

Titles and messages can use words in braces such as `{customer}`, `{number}`, `{total}`, `{date}` and `{link}`.

Ten ready-made recipes are included, for example "Accepted quotation → job card", "Completed job → draft invoice", "Chase overdue invoices" and "Remind the customer before a job". A recipe is added switched off so it can be checked first.

**How it behaves**

- Each workflow page shows what the workflow did and when, with links to what it created.
- "Only once for each …" stops a workflow repeating for the same record, for example when a job is reopened and completed again.
- Timed workflows only pick up records that reach their point after the workflow is switched on, so switching one on does not act on old records.
- A workflow started by another workflow's step counts as one level deeper. Nothing starts beyond 3 levels, so two workflows that undo each other stop.
- A failed step is shown in the history and never stops the action that triggered it.

The daily job `/api/cron/workflows` (05:30 UTC) checks the timed triggers, finishes waits that are due, and deletes history older than 180 days. Waits that are due also finish when anyone opens the dashboard.

Not covered yet: status changes that come from the accounting packages (payments synced from Xero, Sage and the others) do not trigger workflows.

## Document templates

**Documents → Templates** (permission `documents.templates`, admins) holds the company's own documents: certificates, agreements and letters. Each template is written once with fields such as `{{customer.name}}`, `{{job.date}}` or `{{quote.total}}`, and Kudu fills them in each time a document is made. The editor has a field list (click a field to insert it) and a live preview.

**What a template can contain**

- Layout: `# Heading`, `## Section`, `- bullet`, `**bold**`, `> highlighted note`, and `---` for a line.
- Blocks: `[[items]]` (the line items), `[[signatures]]` (client and company signature lines) and `[[pagebreak]]`.

**Starting templates.** Five are included:

- Certificate of treatment, made from a job card
- Warranty certificate, made from a job card
- Service agreement, made from a quotation
- Letter to a customer
- Payment reminder letter, made from an invoice

**Making documents**

- **Where.** A document is made from the Documents section on a job card, quotation, invoice or customer (Documents tab), or by the workflow step "Make a document from a template". Technicians can make documents only for their own jobs (`documents.create`).
- **Numbering.** Each template has its own numbering, e.g. CERT-0001.
- **Fixed once made.** The text is filled in when the document is made and stored, so it does not change if the record changes later.
- **Signing.** The client can sign on screen.
- **Company signature.** The company signature is the PCO signature from Settings.
- **Printing.** Documents print or save as PDF from the browser.
- **Customer portal.** Templates marked "Customers see it in the customer portal" appear under Documents in the portal.

## API keys and webhooks

Settings → API & webhooks (admins; permission `integrations.manage`) connects Kudu to other systems such as Zapier, Make, a website or a reporting tool. The full guide for developers is at Settings → API & webhooks → How to use the API.

**API keys.** Each key has a name and is read only or read and write. The key (`kudu_<company code>_<secret>`) is shown once; only its SHA-256 hash is stored. The company code in the key picks the company's database. Keys can be revoked, and show when they were last used. Requests go to `/api/v1` with `Authorization: Bearer <key>`:

- `GET /api/v1`: which company and what the key may do.
- `GET /api/v1/customers`, `/quotations`, `/job-cards`, `/invoices`, `/queries` and `/<…>/{id}`. Newest first, `?limit=` (up to 100), `?cursor=`, `?updatedSince=`, `?customerId=`, `?status=`; customers also `?search=` and `?email=`.
- `POST /api/v1/customers`, `PATCH /api/v1/customers/{id}` (write keys). The contact fields are the primary contact, as on the customer form.
- `POST /api/v1/queries` (write keys): logs a query or website lead; with customer details instead of `customerId` the customer is found by email or added.

New customers and queries made through the API start workflows and webhooks like ones made on screen. Amounts are rands with decimals, dates ISO 8601 UTC. At most 120 requests a minute per key (counted per server, so a rough limit).

**Webhooks.** A webhook has an address (https only, on the public internet) and a list of events: the workflow triggers that happen at a moment (customer added, quotation/job/invoice/query created or status changed, payment recorded, sign-off, form filled in). Kudu POSTs `{ id, event, createdAt, company, link, data }`, where `data` holds the record in the API's shape, with headers `Kudu-Event`, `Kudu-Delivery` and `Kudu-Signature: t=<unix time>,v1=<hex HMAC-SHA256 of "<t>.<body>" with the webhook's signing secret>`. Messages are stored first and sent after the page has answered. One that gets no 2xx answer within 10 seconds is tried again after 1 minute, 10 minutes, 1 hour, 6 hours and 1 day (retries run when the dashboard loads and in the daily `/api/cron/workflows` job, so with nobody using Kudu a retry can come later). After 50 failed tries in a row the webhook is switched off. Each webhook page shows the last 50 messages (kept 30 days) with what was sent and the answer, and has Send test, Try again now and New secret. Signing secrets are stored encrypted with `AUTH_SECRET`.

Workflows have a step **Send it to another system (webhook)**, which sends the record the workflow ran for to a chosen webhook (`event: "workflow"`).

For testing on your own computer only, `WEBHOOKS_ALLOW_PRIVATE=1` allows `http://` and local addresses. Never set it on Vercel.

## AI copilot

The copilot (menu: **Copilot**) is a chat with Claude that can look things up in Kudu: customers, quotations, job cards, invoices, queries, tasks, staff and a business summary for a date range. It can also draft text (emails, payment reminders, replies to complaints, quotation wording) for you to copy. The only thing it can change is adding a task, and only when asked. It cannot send messages or edit customers, quotations, job cards or invoices. Record pages have an **Ask Copilot** button with a question already written.

It answers as the person asking: every look-up checks that person's permissions, so a technician only sees their own job cards and someone without invoice access is told so. Chats are private to the person who started them.

**Setup**

1. Make an API key at [platform.claude.com](https://platform.claude.com) (Settings, API keys) and add credit to the account.
2. In Vercel: Settings, Environment Variables, add `ANTHROPIC_API_KEY`, then redeploy.
3. In Kudu: Settings, AI copilot. Switch it on or off and set the daily limit of questions per person (default 60, 0 means nobody can ask).

**Who can use it:** the "Use the AI copilot" permission (`ai.use`). Administrators and office staff have it; technicians do not unless you give it to them in a custom role.

**Cost:** Claude charges per word read and written (tokens). A typical question with a few look-ups costs roughly US$0.03–0.15 (about R0.50–R3). Settings shows this month's questions, estimated cost and the top users. Long chats cost more per question, so a chat closes after 60 messages and asks you to start a new one.

If Claude declines a request, the API automatically retries it on a fallback model in the same call; if that also declines, the copilot says it can't help and the question is not kept in the chat history.

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
