import { z } from "zod";
import { fromLocalInput, toCents } from "./format";
import type { LineItemInput } from "./totals";

export const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
export const optDate = (fd: FormData, key: string) => fromLocalInput(str(fd, key));
export const num = (fd: FormData, key: string, fallback = 0) => {
  const n = Number(str(fd, key).replace(",", "."));
  return Number.isFinite(n) && str(fd, key) !== "" ? n : fallback;
};
export const cents = (fd: FormData, key: string) => toCents(str(fd, key));

const itemSchema = z.array(
  z.object({
    description: z.string().min(1),
    quantity: z.number().finite(),
    unit: z.string().default(""),
    unitPrice: z.number().int(),
  }),
);

export function parseItems(fd: FormData): LineItemInput[] {
  try {
    return itemSchema.parse(JSON.parse(str(fd, "items") || "[]"));
  } catch {
    return [];
  }
}

export function parseJson<T>(fd: FormData, key: string, fallback: T): T {
  try {
    return JSON.parse(str(fd, key) || "") as T;
  } catch {
    return fallback;
  }
}
