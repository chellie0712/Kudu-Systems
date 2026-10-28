export const JOB_TYPES = [
  "General pest control",
  "Termites / WDI",
  "Rodent control",
  "Fumigation",
  "Inspection",
  "Follow-up / re-treatment",
  "Installation",
  "Service / Maintenance",
];

/** Starting product list (editable in Settings → Products). */
export const DEFAULT_PRODUCTS = [
  { name: "Charlie Bait Box", activeIngredient: "", regNumber: "" },
  { name: "Roach Dust", activeIngredient: "Permethrin (Pyrethroid) 5g/kg", regNumber: "L4587" },
  { name: "Maxthor Turbo", activeIngredient: "Bifenthrin 100g/L; Imiprothrin 10g/L; Piperonyl Butoxide", regNumber: "L10023" },
  { name: "Sharda Roach Gel Bait", activeIngredient: "Imidacloprid 21,5g/kg", regNumber: "L10674" },
  { name: "CTX 108", activeIngredient: "Cypermethrin 10,0 g/ℓ; TCMTB (Organosulphur compound) 8,0 g/ℓ", regNumber: "L7445" },
  { name: "Dominion", activeIngredient: "Imidacloprid (chloronicotinyl) 350 g/ℓ", regNumber: "L9576" },
  { name: "Bombex", activeIngredient: "Lambda-Cyhalothrin 100g/L", regNumber: "L9435" },
  { name: "NuVan Aerosol", activeIngredient: "Dichlorvos (organophosphate) 124 g/kg, Aerosol Gas", regNumber: "L7410" },
  { name: "Prothor", activeIngredient: "Imidacloprid 200g/L", regNumber: "L8794" },
  { name: "Ultrakill Rat & Mouse Wax Blocks", activeIngredient: "Flocoumafen 0.05 g/kg", regNumber: "L9739" },
  { name: "Permadust", activeIngredient: "Permethrin (Pyrethroid) 5g/kg & Piperonyl Butoxide (Synergist) 40g/kg", regNumber: "L7999 (Act 36 of 1947)" },
];

export function productLabel(p: { name: string; activeIngredient: string; regNumber: string }) {
  return [p.name, p.activeIngredient && `— ${p.activeIngredient}`, p.regNumber && `(Reg. ${p.regNumber})`].filter(Boolean).join(" ");
}

/** Split a multi-line settings field into its non-empty lines. */
export function lines(text: string): string[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

export const MAX_EXTRA_PHOTOS = 8;
