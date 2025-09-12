-- Add unique index on tgPaymentId for strict idempotency
CREATE UNIQUE INDEX IF NOT EXISTS "BillingPurchase_tgPaymentId_key" ON "BillingPurchase"("tgPaymentId");
