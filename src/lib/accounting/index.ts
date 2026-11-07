import { freshbooksAdapter } from "./freshbooks";
import { odooAdapter } from "./odoo";
import { pastelAdapter } from "./pastel";
import { quickbooksAdapter } from "./quickbooks";
import { sageAdapter } from "./sage";
import { xeroAdapter } from "./xero";
import { zohoAdapter } from "./zoho";
import type { Adapter, ApiAdapter, ProviderId } from "./types";

export const ADAPTERS: Adapter[] = [sageAdapter, xeroAdapter, quickbooksAdapter, zohoAdapter, freshbooksAdapter, odooAdapter, pastelAdapter];

export function adapter(id: string | null | undefined): Adapter | null {
  return ADAPTERS.find((a) => a.id === id) ?? null;
}

export function apiAdapter(id: string | null | undefined): ApiAdapter | null {
  const a = adapter(id);
  return a && a.kind === "api" ? a : null;
}

export const isProvider = (id: string): id is ProviderId => ADAPTERS.some((a) => a.id === id);

/** Short name for status lines: "Sage", "Xero", "QuickBooks"... */
export function shortName(id: string | null | undefined): string {
  const map: Record<string, string> = { sage: "Sage", xero: "Xero", quickbooks: "QuickBooks", zoho: "Zoho Books", freshbooks: "FreshBooks", odoo: "Odoo", pastel: "Pastel" };
  return (id && map[id.split(":")[0]]) || "the accounting package";
}
