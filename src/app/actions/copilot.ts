"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { str } from "@/lib/form";

export async function deleteChat(fd: FormData) {
  const user = await requirePermission("ai.use");
  const db = await tenantDb();
  await db.aiChat.deleteMany({ where: { id: str(fd, "id"), userId: user.id } });
  revalidatePath("/copilot");
  redirect("/copilot");
}

export async function saveAiSettings(fd: FormData) {
  await requirePermission("settings.manage");
  const db = await tenantDb();
  const limit = Math.min(1000, Math.max(0, Math.round(Number(str(fd, "aiDailyLimit")) || 0)));
  await db.settings.update({ where: { id: 1 }, data: { aiEnabled: fd.get("aiEnabled") === "on", aiDailyLimit: limit } });
  revalidatePath("/settings");
  redirect("/settings?msg=Copilot+settings+saved#copilot");
}
