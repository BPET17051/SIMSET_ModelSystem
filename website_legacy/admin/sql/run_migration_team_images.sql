-- ============================================================
-- Migration: Team Image Feature
-- Project  : simset-manikin-db
-- Created  : 2026-03-11
-- Desc     : Adds cover image + gallery + audit log for teams
-- ============================================================

-- -------------------------------------------------------
-- 1. ADD IMAGE COLUMNS TO teams
-- -------------------------------------------------------
-- cover_image_url : denormalized cache for fast catalog display
-- (no JOIN needed when rendering borrow catalog cards)
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS cover_image_url       TEXT,
  ADD COLUMN IF NOT EXISTS cover_image_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cover_image_updated_by UUID REFERENCES auth.users(id);

-- -------------------------------------------------------
-- 2. CREATE team_images (Gallery Table)
-- -------------------------------------------------------
-- Supports 1 cover (order=0) + up to 3 detail images (order=1,2,3)
-- Used in Team Detail modal / carousel view
CREATE TABLE IF NOT EXISTS public.team_images (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_code    TEXT        NOT NULL REFERENCES public.teams(team_code) ON DELETE CASCADE,
  image_url    TEXT        NOT NULL,
  image_order  SMALLINT    NOT NULL DEFAULT 0, -- 0 = cover, 1-3 = detail
  caption      TEXT,
  uploaded_by  UUID        REFERENCES auth.users(id),
  uploaded_at  TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT valid_image_order CHECK (image_order BETWEEN 0 AND 3)
);

CREATE INDEX IF NOT EXISTS idx_team_images_team_code
  ON public.team_images(team_code, image_order);

-- -------------------------------------------------------
-- 3. RLS FOR team_images
-- -------------------------------------------------------
ALTER TABLE public.team_images ENABLE ROW LEVEL SECURITY;

-- Admin: full access (INSERT, UPDATE, DELETE, SELECT)
DROP POLICY IF EXISTS "admin_all_team_images" ON public.team_images;
CREATE POLICY "admin_all_team_images"
  ON public.team_images
  FOR ALL
  TO authenticated
  USING  ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- Public / authenticated users: read only
DROP POLICY IF EXISTS "public_read_team_images" ON public.team_images;
CREATE POLICY "public_read_team_images"
  ON public.team_images
  FOR SELECT
  USING (true);

-- -------------------------------------------------------
-- 4. CREATE team_image_audit_log
-- -------------------------------------------------------
-- Tracks every upload / replace / delete action with who and when
CREATE TABLE IF NOT EXISTS public.team_image_audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_code   TEXT        NOT NULL,
  action      TEXT        NOT NULL CHECK (action IN ('upload', 'replace', 'delete')),
  old_url     TEXT,
  new_url     TEXT,
  changed_by  UUID        REFERENCES auth.users(id),
  changed_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.team_image_audit_log ENABLE ROW LEVEL SECURITY;

-- Admin: full access
DROP POLICY IF EXISTS "admin_all_team_image_audit" ON public.team_image_audit_log;
CREATE POLICY "admin_all_team_image_audit"
  ON public.team_image_audit_log
  FOR ALL
  TO authenticated
  USING  ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- -------------------------------------------------------
-- 5. STORAGE RLS FOR team-images BUCKET
-- -------------------------------------------------------
-- NOTE: Bucket must be created first in Supabase Dashboard (public-read)
-- Then run these policies:

-- Admin-only upload
DROP POLICY IF EXISTS "admin_upload_team_images" ON storage.objects;
CREATE POLICY "admin_upload_team_images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'team-images'
    AND (auth.jwt()->'app_metadata'->>'role') = 'admin'
  );

-- Admin-only update (replace)
DROP POLICY IF EXISTS "admin_update_team_images" ON storage.objects;
CREATE POLICY "admin_update_team_images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'team-images'
    AND (auth.jwt()->'app_metadata'->>'role') = 'admin'
  );

-- Admin-only delete
DROP POLICY IF EXISTS "admin_delete_team_images" ON storage.objects;
CREATE POLICY "admin_delete_team_images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'team-images'
    AND (auth.jwt()->'app_metadata'->>'role') = 'admin'
  );

-- Public read (redundant for public bucket, added for explicit clarity)
DROP POLICY IF EXISTS "public_read_team_images_storage" ON storage.objects;
CREATE POLICY "public_read_team_images_storage"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'team-images');

-- -------------------------------------------------------
-- VERIFICATION QUERIES (run after migration to confirm)
-- -------------------------------------------------------
/*
-- Check new columns on teams
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'teams'
  AND column_name IN ('cover_image_url', 'cover_image_updated_at', 'cover_image_updated_by');

-- Check team_images table
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'team_images';

-- Check RLS enabled
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename IN ('team_images', 'team_image_audit_log');

-- Check current teams data
SELECT team_code, display_name, cover_image_url FROM public.teams ORDER BY team_code;
*/
