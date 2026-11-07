import Link from "next/link";
import { InvoiceStatus } from "@prisma/client";
import { requirePermission } from "@/auth";
import { can } from "@/lib/permissions";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDate, fmtDateTime, money } from "@/lib/format";
import { byMonth, monthLabel, monthsOf, periodFrom } from "@/lib/reports";
import { GOOGLE_ADS, campaignKey } from "@/lib/marketing";
import { cleanCustomerId, googleAdsConfigured, syncGoogleAds } from "@/lib/googleAds";
import { syncGoogleAdsNow } from "@/app/actions/marketing";
import { Flash, PageHeader, SectionTitle } from "@/components/ui";
import { MonthBars } from "@/components/MonthBars";
import { PeriodPicker } from "@/components/PeriodPicker";

export const metadata = { title: "Marketing" };

/** Spend older than this is refreshed when someone opens the report (the daily job does the rest). */
const STALE_MS = 3 * 60 * 60 * 1000;

const NOT_RECORDED = "Not recorded";
const NO_CAMPAIGN = "(campaign not recorded)";

type Row = {
  channel: string;
  campaign: string;
  spend: number;
  clicks: number;
  conversions: number;
  leads: number;
  won: number;
  revenue: number;
  materials: number;
};
const blank = (channel: string, campaign: string): Row => ({ channel, campaign, spend: 0, clicks: 0, conversions: 0, leads: 0, won: 0, revenue: 0, materials: 0 });

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; preset?: string; msg?: string; err?: string }>;
}) {
  const user = await requirePermission("reports.view");
  const showProfit = can(user.role, "profit.view");
  const db = await tenantDb();
  const sp = await searchParams;
  const p = periodFrom(sp);
  let settings = await getSettings();

  // Keep Google Ads figures fresh without waiting for the daily job.
  const connected = googleAdsConfigured() && !!settings.googleAdsRefreshToken && cleanCustomerId(settings.googleAdsCustomerId).length === 10;
  if (connected && !settings.googleAdsLastError && (!settings.googleAdsLastSyncAt || Date.now() - settings.googleAdsLastSyncAt.getTime() > STALE_MS)) {
    await Promise.race([syncGoogleAds(db).catch(() => undefined), new Promise((r) => setTimeout(r, 20000))]);
    settings = await getSettings();
  }

  const m = (c: number) => money(Math.round(c), settings.currencySymbol);
  const inRange = { gte: p.from, lt: p.to };
  const notDraft = { status: { notIn: [InvoiceStatus.DRAFT, InvoiceStatus.CANCELLED] } };

  const [spend, leads, invoices, materials, expenses] = await Promise.all([
    db.adSpend.findMany({ where: { date: inRange } }),
    // A lead is a customer added in the period. Their sales are counted to date, so a campaign gets
    // credit for work that came in after the period ended.
    db.customer.findMany({
      where: { createdAt: inRange },
      select: {
        id: true,
        leadSource: true,
        leadCampaign: true,
        quotations: { where: { status: "ACCEPTED" }, select: { id: true } },
        invoices: { where: notDraft, select: { total: true, vatAmount: true } },
        jobCards: { select: { stockMovements: { where: { kind: "USE" }, select: { quantity: true, item: { select: { costPrice: true } } } } } },
      },
    }),
    showProfit ? db.invoice.findMany({ where: { issueDate: inRange, ...notDraft }, select: { issueDate: true, total: true, vatAmount: true } }) : [],
    showProfit
      ? db.stockMovement.findMany({ where: { kind: "USE", createdAt: inRange }, select: { createdAt: true, quantity: true, item: { select: { costPrice: true } } } })
      : [],
    showProfit ? db.expense.findMany({ where: { date: inRange }, select: { date: true, category: true, amount: true } }) : [],
  ]);

  // ----- Per channel and campaign -----
  const rows = new Map<string, Row>();
  const row = (channel: string, campaign: string) => {
    const k = `${channel}|${campaignKey(campaign)}`;
    let r = rows.get(k);
    if (!r) rows.set(k, (r = blank(channel, campaign)));
    return r;
  };
  for (const s of spend) {
    const r = row(s.channel, s.campaign === s.channel ? "" : s.campaign);
    r.spend += s.cost;
    r.clicks += s.clicks;
    r.conversions += s.conversions;
  }
  for (const c of leads) {
    const r = row(c.leadSource || NOT_RECORDED, c.leadSource ? c.leadCampaign : "");
    r.leads++;
    const revenue = c.invoices.reduce((s, i) => s + i.total - i.vatAmount, 0);
    if (c.quotations.length > 0 || c.invoices.length > 0) r.won++;
    r.revenue += revenue;
    r.materials += c.jobCards.reduce((s, j) => s + j.stockMovements.reduce((t, x) => t + x.quantity * x.item.costPrice, 0), 0);
  }
  const channels = new Map<string, { total: Row; campaigns: Row[] }>();
  for (const r of rows.values()) {
    const ch = channels.get(r.channel) ?? { total: blank(r.channel, ""), campaigns: [] };
    for (const k of ["spend", "clicks", "conversions", "leads", "won", "revenue", "materials"] as const) ch.total[k] += r[k];
    ch.campaigns.push(r);
    channels.set(r.channel, ch);
  }
  const channelList = [...channels.values()].sort(
    (a, b) => b.total.spend - a.total.spend || b.total.leads - a.total.leads || a.total.channel.localeCompare(b.total.channel),
  );
  for (const ch of channelList) ch.campaigns.sort((a, b) => b.spend - a.spend || b.leads - a.leads);
  const paid = channelList.filter((c) => c.total.spend > 0).map((c) => c.total);
  const sum = (k: keyof Omit<Row, "channel" | "campaign">) => paid.reduce((s, r) => s + r[k], 0);
  const adSpend = sum("spend");
  const adLeads = sum("leads");
  const adWon = sum("won");
  const adRevenue = sum("revenue");
  const google = channels.get(GOOGLE_ADS)?.total;
  const per = (a: number, b: number) => (b > 0 ? m(a / b) : "—");

  // ----- Monthly profit & loss -----
  const months = monthsOf(p);
  const revByMonth = byMonth(invoices, (i) => i.issueDate, (i) => i.total - i.vatAmount);
  const matByMonth = byMonth(materials, (x) => x.createdAt, (x) => x.quantity * x.item.costPrice);
  const adsByMonth = byMonth(spend, (s) => s.date, (s) => s.cost);
  const categories = [...new Set(expenses.map((e) => e.category))].sort();
  const expByCat = new Map(categories.map((c) => [c, byMonth(expenses.filter((e) => e.category === c), (e) => e.date, (e) => e.amount)]));
  const at = (map: Map<string, number>, k: string) => map.get(k) ?? 0;
  const expensesAt = (k: string) => categories.reduce((s, c) => s + at(expByCat.get(c)!, k), 0);
  const gross = (k: string) => at(revByMonth, k) - at(matByMonth, k);
  const netAt = (k: string) => gross(k) - at(adsByMonth, k) - expensesAt(k);
  const total = (f: (k: string) => number) => months.reduce((s, k) => s + f(k), 0);
  const revenueTotal = total((k) => at(revByMonth, k));
  const netTotal = total(netAt);

  const tiles: [string, string, string?][] = [
    ["Advertising spend", m(adSpend), `${paid.length} paid channel${paid.length === 1 ? "" : "s"}`],
    ["Cost per lead", per(adSpend, adLeads), `${adLeads} new customer${adLeads === 1 ? "" : "s"} from paid ads`],
    ["Cost per won customer", per(adSpend, adWon), `${adWon} with an accepted quote or invoice`],
    google && google.spend > 0
      ? ["Google Ads cost per conversion", per(google.spend, google.conversions), `${google.conversions.toFixed(google.conversions % 1 ? 1 : 0)} conversions counted by Google`]
      : ["Return on ad spend", adSpend > 0 ? `${(adRevenue / adSpend).toFixed(1)}×` : "—", "revenue from ad customers ÷ spend"],
  ];
  if (showProfit) tiles.push(["Net profit", m(netTotal), revenueTotal > 0 ? `${Math.round((netTotal / revenueTotal) * 100)}% of revenue excl. VAT` : "after materials, ads and expenses"]);

  const qs = `from=${p.fromInput}&to=${p.toInput}`;
  const cell = "py-1.5 text-right tabular-nums";

  return (
    <div>
      <PageHeader
        title="Marketing & profit"
        subtitle={`${fmtDate(p.from)} – ${fmtDate(new Date(p.to.getTime() - 1))} · all branches`}
        actions={can(user.role, "expenses.manage") ? <Link href={`/expenses?${qs}`} className="btn-outline">Expenses &amp; other ad spend</Link> : undefined}
      />
      <Flash message={sp.msg} />
      <Flash message={sp.err} tone="error" />

      <div className="no-print mb-4 flex flex-wrap items-center gap-3 rounded-md border border-charcoal-200 bg-white p-3 text-sm">
        {connected ? (
          <>
            <span>
              <strong>Google Ads</strong> live link: {settings.googleAdsLastSyncAt ? `updated ${fmtDateTime(settings.googleAdsLastSyncAt)}` : "not synced yet"}.
            </span>
            {settings.googleAdsLastError && <span className="text-kudu-700">Problem: {settings.googleAdsLastError}</span>}
            <form action={syncGoogleAdsNow} className="ml-auto">
              <input type="hidden" name="back" value={`/marketing?${qs}`} />
              <button className="btn-outline py-1 text-xs">Sync now</button>
            </form>
          </>
        ) : (
          <span>
            Google Ads is not connected.{" "}
            {can(user.role, "settings.manage") ? <Link href="/settings#google-ads" className="text-kudu-600 hover:underline">Connect it in Settings</Link> : "An admin can connect it in Settings."}
          </span>
        )}
      </div>

      <PeriodPicker path="/marketing" p={p} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {tiles.map(([label, value, sub]) => (
          <div key={label} className="card border-l-4 border-l-kudu-600 p-5">
            <div className="text-xs font-semibold tracking-wide text-charcoal-500 uppercase">{label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
            {sub && <div className="mt-1 text-xs text-charcoal-500">{sub}</div>}
          </div>
        ))}
      </div>

      <div className="card mb-3 overflow-x-auto p-5">
        <SectionTitle>Where customers came from, and what they cost</SectionTitle>
        <table className="table [&_td]:whitespace-nowrap">
          <thead>
            <tr>
              <th>Channel / campaign</th>
              <th className="text-right">Spend</th>
              <th className="text-right">Clicks</th>
              <th className="text-right">Google conv.</th>
              <th className="text-right">Cost / conv.</th>
              <th className="text-right">Leads</th>
              <th className="text-right">Won</th>
              <th className="text-right">Cost / lead</th>
              <th className="text-right">Cost / won</th>
              <th className="text-right">Revenue excl. VAT</th>
              <th className="text-right">Profit after materials &amp; ads</th>
            </tr>
          </thead>
          <tbody>
            {channelList.length === 0 && (
              <tr><td colSpan={11} className="py-4 text-center text-charcoal-500">No ad spend and no new customers in this period.</td></tr>
            )}
            {channelList.map(({ total: t, campaigns }) => {
              const line = (r: Row, sub: boolean) => (
                <tr key={`${r.channel}|${r.campaign}|${sub}`} className={sub ? "text-charcoal-600" : "bg-charcoal-50 font-semibold"}>
                  <td className={sub ? "pl-6" : ""}>{sub ? r.campaign || (r.channel === NOT_RECORDED ? "" : NO_CAMPAIGN) : r.channel}</td>
                  <td className={cell}>{r.spend ? m(r.spend) : "—"}</td>
                  <td className={cell}>{r.clicks || "—"}</td>
                  <td className={cell}>{r.conversions ? r.conversions.toFixed(r.conversions % 1 ? 1 : 0) : "—"}</td>
                  <td className={cell}>{r.spend && r.conversions ? per(r.spend, r.conversions) : "—"}</td>
                  <td className={cell}>{r.leads}</td>
                  <td className={cell}>{r.won}</td>
                  <td className={cell}>{r.spend ? per(r.spend, r.leads) : "—"}</td>
                  <td className={cell}>{r.spend ? per(r.spend, r.won) : "—"}</td>
                  <td className={cell}>{m(r.revenue)}</td>
                  <td className={`${cell} ${r.revenue - r.materials - r.spend < 0 ? "text-kudu-700" : ""}`}>{m(r.revenue - r.materials - r.spend)}</td>
                </tr>
              );
              const showCampaigns = campaigns.length > 1 || (campaigns[0] && campaigns[0].campaign);
              return [line(t, false), ...(showCampaigns ? campaigns.map((c) => line(c, true)) : [])];
            })}
          </tbody>
        </table>
      </div>
      <p className="mb-8 text-xs text-charcoal-500">
        <strong>Leads</strong> are customers added in this period, by the lead source and campaign on their customer record. <strong>Won</strong> means they have an accepted
        quotation or an issued invoice. Revenue and materials are those customers&apos; invoices and materials to date, so recent campaigns grow as work comes in.
        Spend is in the period only. <strong>Google conv.</strong> is Google&apos;s own count (form fills, calls) and can differ from leads you recorded.
        {leads.some((c) => !c.leadSource) && " Customers without a lead source show under “Not recorded”; fill it in on the customer to sharpen these numbers."}
      </p>

      {showProfit && (
        <>
          <div className="mb-3 grid gap-4 lg:grid-cols-2">
            <MonthBars title="Revenue per month (excl. VAT)" months={months} values={revByMonth} max={Math.max(0, ...revByMonth.values())} format={m} />
            <MonthBars title="Advertising per month" months={months} values={adsByMonth} max={Math.max(0, ...adsByMonth.values())} format={m} />
          </div>
          <div className="card mb-3 overflow-x-auto p-5">
            <SectionTitle>Profit &amp; loss</SectionTitle>
            <table className="table [&_td]:whitespace-nowrap">
              <thead>
                <tr>
                  <th />
                  {months.map((k) => <th key={k} className="text-right">{monthLabel(k)}</th>)}
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Revenue (invoiced excl. VAT)", (k: string) => at(revByMonth, k), "font-semibold"],
                    ["Less materials used (at cost)", (k: string) => 0 - at(matByMonth, k), ""],
                    ["Gross profit", gross, "font-semibold bg-charcoal-50"],
                    ["Less advertising", (k: string) => 0 - at(adsByMonth, k), ""],
                    ...categories.map((c) => [`Less ${c.toLowerCase()}`, (k: string) => 0 - at(expByCat.get(c)!, k), ""] as const),
                    ["Net profit", netAt, "font-bold bg-charcoal-50"],
                  ] as const
                ).map(([label, f, cls]) => (
                  <tr key={label} className={cls}>
                    <td>{label}</td>
                    {months.map((k) => <td key={k} className={`${cell} ${f(k) < 0 && cls ? "text-kudu-700" : ""}`}>{m(f(k))}</td>)}
                    <td className={`${cell} font-semibold ${total(f) < 0 && cls ? "text-kudu-700" : ""}`}>{m(total(f))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mb-8 text-xs text-charcoal-500">
            Revenue is invoices issued in each month (not drafts or cancelled), excluding VAT. Materials are stock used on jobs at today&apos;s cost price.
            Advertising is Google Ads plus other ad spend entered on the Expenses page. Expenses are what you{" "}
            {can(user.role, "expenses.manage") ? <Link href={`/expenses?${qs}`} className="text-kudu-600 hover:underline">record on the Expenses page</Link> : "record on the Expenses page"}.
            Labour is only included if you record wages there.
          </p>
        </>
      )}
    </div>
  );
}
