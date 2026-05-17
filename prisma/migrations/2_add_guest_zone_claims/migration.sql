ALTER TABLE "ConvenienceZone" ADD COLUMN "guest_claim_token_hash" TEXT;

CREATE UNIQUE INDEX "ConvenienceZone_guest_claim_token_hash_key" ON "ConvenienceZone"("guest_claim_token_hash");
