import type { FileAdapter } from "./types";

// Sage Pastel Partner and Sage Evolution (Sage 200 Evolution) run on the company's own computer
// and have no cloud API, so Kudu exchanges files with them instead (see pastelFiles.ts):
//  - Kudu → Pastel: customers CSV, invoices batch and receipts batch, imported in Pastel
//  - Pastel → Kudu: a receipts CSV exported from Pastel, uploaded in Settings → Accounting
// Every file holds only what changed since the last export, unless "everything" is ticked.

export const pastelAdapter: FileAdapter = {
  id: "pastel",
  name: "Sage Pastel Partner / Evolution (file import)",
  blurb: "For Pastel Partner and Sage Evolution installed on your own PC or server. They have no online link, so Kudu gives you files to import there, and reads receipts you export from Pastel.",
  kind: "file",
  envVars: [],
  configured: () => true,
  pickers: () => [
    { key: "salesAccount", label: "Sales GL account", required: true, placeholder: "1000000", help: "Pastel general-ledger account number for sales, as typed in Pastel (Partner often 1000000 or 1000/000)." },
    { key: "bankAccount", label: "Bank GL account for receipts", required: true, placeholder: "8400000" },
    { key: "taxType", label: "Pastel tax type for 15% VAT", required: true, placeholder: "1", suggested: "1" },
    { key: "zeroTaxType", label: "Pastel tax type for 0% invoices", placeholder: "0", suggested: "0" },
    { key: "yearStartMonth", label: "First month of your Pastel financial year (1-12)", placeholder: "3", suggested: "3", help: "Used to work out the Pastel period (1-12) of each line. March = 3." },
  ],
};
