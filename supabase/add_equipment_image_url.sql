-- Add optional real-photo support for the public equipment catalog.
-- Run once on projects that already ran supabase/current_mvp_release.sql.

BEGIN;

ALTER TABLE public.equipments
    ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN public.equipments.image_url IS
    'Optional HTTPS image URL for catalog cards. Frontend falls back to generated SVG when blank or broken.';

COMMIT;
