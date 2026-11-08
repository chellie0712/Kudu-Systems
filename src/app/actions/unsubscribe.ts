"use server";

import { redirect } from "next/navigation";
import { getCompany } from "@/lib/platform";
import { clientForCompany } from "@/lib/tenant";
import { str } from "@/lib/form";
import { readUnsubscribeToken } from "@/lib/email/links";
import { unsubscribeRecipient } from "@/lib/email/unsubscribe";

/** Public: the button on the unsubscribe page. The signed token is the only key needed. */
export async function confirmUnsubscribe(fd: FormData) {
  const companyId = str(fd, "company");
  const token = str(fd, "token");
  const company = await getCompany(companyId);
  const recipientId = company ? readUnsubscribeToken(company.id, token) : null;
  if (!company || !recipientId) redirect(`/unsubscribe/${encodeURIComponent(companyId)}/${encodeURIComponent(token)}`);
  await unsubscribeRecipient(clientForCompany(company), recipientId, "Unsubscribe link");
  redirect(`/unsubscribe/${encodeURIComponent(companyId)}/${encodeURIComponent(token)}?done=1`);
}
