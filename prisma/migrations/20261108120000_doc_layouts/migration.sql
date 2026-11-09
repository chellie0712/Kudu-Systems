-- Quotation and invoice layouts chosen per company (Settings → Quote & invoice layout).
ALTER TABLE "Settings" ADD COLUMN "quoteLayout" TEXT NOT NULL DEFAULT 'classic',
ADD COLUMN "invoiceLayout" TEXT NOT NULL DEFAULT 'classic',
ADD COLUMN "docStyle" JSONB NOT NULL DEFAULT '{}';
