import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCompany, MAIN_COMPANY_ID } from "@/lib/platform";
import { clientForCompany } from "@/lib/tenant";

/**
 * The company logo as a normal image, for emails: mail apps do not show logos embedded as data
 * URLs. Public on purpose (the logo is printed on every document anyway).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ company: string }> }) {
  const { company: id } = await params;
  const company = await getCompany(id);
  if (!company?.active) return new Response("Not found", { status: 404 });
  const s = await clientForCompany(company).settings.findUnique({ where: { id: 1 }, select: { logo: true } });
  const headers = { "Cache-Control": "public, max-age=3600" };
  const m = s?.logo?.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (m) return new Response(Buffer.from(m[2], "base64"), { headers: { ...headers, "Content-Type": m[1] } });
  if (company.id === MAIN_COMPANY_ID) {
    const file = await readFile(path.join(process.cwd(), "public", "kudu-logo-sm.png"));
    return new Response(file, { headers: { ...headers, "Content-Type": "image/png" } });
  }
  return new Response("Not found", { status: 404 });
}
