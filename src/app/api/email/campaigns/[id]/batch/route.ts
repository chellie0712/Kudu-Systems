import { NextResponse } from "next/server";
import { getUser } from "@/auth";
import { can } from "@/lib/permissions";
import { currentCompany } from "@/lib/db";
import { sendCampaignBatch } from "@/lib/email/sender";

export const maxDuration = 60;

/** The campaign page calls this again and again while a campaign is sending. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || !can(user.role, "campaigns.send")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { id } = await params;
  const { company, db } = await currentCompany();
  const r = await sendCampaignBatch(db, company, id, 45_000);
  return NextResponse.json(r);
}
