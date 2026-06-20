-- Add the `saved` flag to SimData.
-- New runs default to false (unsaved). Existing runs are grandfathered to true
-- so nothing already in "Visit a Previous Run" disappears when this deploys.
ALTER TABLE "SimData" ADD COLUMN "saved" BOOLEAN NOT NULL DEFAULT false;
UPDATE "SimData" SET "saved" = true;
