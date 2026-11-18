-- Add staff-facing manikin fields needed by the current borrow/return system.
-- Run this once in Supabase SQL Editor before importing manikins.csv.

BEGIN;

ALTER TABLE public.manikins
    ADD COLUMN IF NOT EXISTS model_id text,
    ADD COLUMN IF NOT EXISTS display_name text,
    ADD COLUMN IF NOT EXISTS asset_code text,
    ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.manikins
    DROP CONSTRAINT IF EXISTS manikins_status_check;

ALTER TABLE public.manikins
    ADD CONSTRAINT manikins_status_check
    CHECK (status IN ('ready', 'in_use', 'maintenance', 'retired'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_manikins_model_id_unique
ON public.manikins (model_id)
WHERE model_id IS NOT NULL;

COMMIT;

-- Verification query:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'manikins'
--   AND column_name IN ('sap_id', 'model_id', 'team_code', 'display_name', 'asset_code', 'status', 'is_active', 'needs_review', 'notes')
-- ORDER BY column_name;
