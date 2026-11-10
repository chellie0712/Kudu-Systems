import { tenantDb } from "@/lib/db";
import { aiConfigured, costUsd, MODEL } from "@/lib/ai/copilot";
import { saveAiSettings } from "@/app/actions/copilot";
import { SectionTitle } from "@/components/ui";

/** Settings → AI copilot: on/off, daily limit per person, and this month's use and cost. */
export async function CopilotSettings({ enabled, dailyLimit }: { enabled: boolean; dailyLimit: number }) {
  const db = await tenantDb();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [total, byUser, users] = await Promise.all([
    db.aiUsage.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { inputTokens: true, outputTokens: true, cacheRead: true, cacheWrite: true }, _count: true }),
    db.aiUsage.groupBy({ by: ["userId"], where: { createdAt: { gte: monthStart } }, _count: true, orderBy: { _count: { userId: "desc" } }, take: 5 }),
    db.user.findMany({ select: { id: true, name: true } }),
  ]);
  const name = (id: string) => users.find((u) => u.id === id)?.name ?? "Removed user";
  const cost = costUsd({ inputTokens: total._sum.inputTokens ?? 0, outputTokens: total._sum.outputTokens ?? 0, cacheRead: total._sum.cacheRead ?? 0, cacheWrite: total._sum.cacheWrite ?? 0 });

  return (
    <div id="copilot" className="card mt-6 p-6">
      <SectionTitle>AI copilot</SectionTitle>
      <p className="mb-3 text-sm text-charcoal-500">
        The copilot answers questions about your records and drafts messages, using Claude ({MODEL}) from Anthropic. It sees only what the person asking may see, and the only thing it changes is adding a
        task when asked. Who may use it is set by the permission “Use the AI copilot” (Admin and Office by default).
      </p>
      {!aiConfigured() && (
        <p className="mb-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Not set up: make an API key at platform.claude.com (Settings → API keys), add it in Vercel → your project → Settings → Environment Variables as <code>ANTHROPIC_API_KEY</code>, then redeploy. Use is
          billed to that Claude account.
        </p>
      )}
      <form action={saveAiSettings} className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="aiEnabled" defaultChecked={enabled} /> Copilot switched on
        </label>
        <label className="block">
          <span className="label">Questions per person per day (0 = no limit)</span>
          <input name="aiDailyLimit" type="number" min={0} max={1000} className="input w-32" defaultValue={dailyLimit} />
        </label>
        <button className="btn-outline">Save</button>
      </form>
      <div className="mt-4 rounded-md bg-charcoal-50 p-3 text-sm">
        <b>This month:</b> {total._count} question{total._count === 1 ? "" : "s"}, about <b>US${cost.toFixed(2)}</b> (≈ R{(cost * 18.5).toFixed(0)}) at Anthropic&apos;s list prices.
        {byUser.length > 0 && <span className="text-charcoal-500"> Most used by {byUser.map((u) => `${name(u.userId)} (${u._count})`).join(", ")}.</span>}
        <div className="mt-1 text-xs text-charcoal-500">An estimate from the tokens Kudu recorded; the bill at platform.claude.com is what counts. The rand figure uses R18,50 to the dollar.</div>
      </div>
    </div>
  );
}
