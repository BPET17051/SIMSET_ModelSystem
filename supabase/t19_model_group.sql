-- T19 step 1 (additive + idempotent): manikins.model_group = "same family" key (e.g. RA = 15 units).
-- Source of truth is the sheet column Models_Data.model_group. Until T14 carries it, derive it
-- from model_id by stripping the trailing unit number (RA12 -> RA, A4000-5 -> A4000, SiM ALS3 -> SiM ALS).
-- ponytail: derived, not synced; a unit whose id breaks the pattern needs a manual UPDATE. Upgrade path:
--           send model_group in the T14 payload and drop the regexp.
-- Touches ONLY the new column. Does not change team_code, equipments, status or borrow data.
BEGIN;

ALTER TABLE public.manikins ADD COLUMN IF NOT EXISTS model_group text;

-- Self-check: the rule must reproduce the sheet's model_group on the awkward ids.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(t.id || ' -> ' || t.got || ' (want ' || t.want || ')', ', ') INTO bad
  FROM (
    SELECT v.id, v.want, regexp_replace(v.id, '[-[:space:]]?[0-9]+$', '') AS got
    FROM (VALUES
      ('RA1','RA'), ('RA15','RA'), ('QCPR-D3','QCPR-D'), ('CPR-D2','CPR-D'), ('RBQCPR6','RBQCPR'),
      ('SiM ALS3','SiM ALS'), ('Sim A2','Sim A'), ('A4000-5','A4000'), ('GAUMARD NB1','GAUMARD NB'),
      ('DiFE10','DiFE'), ('LAQCPR6','LAQCPR'), ('NA10','NA'), ('C18','C'), ('B11','B'),
      ('SiMMAN 3G','SiMMAN 3G'), ('Sim Baby','Sim Baby'), ('SimJunior','SimJunior'), ('Harvey','Harvey')
    ) AS v(id, want)
  ) t
  WHERE t.got <> t.want;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'model_group rule mismatch: %', bad; END IF;
END $$;

UPDATE public.manikins
SET model_group = regexp_replace(btrim(model_id), '[-[:space:]]?[0-9]+$', '')
WHERE model_group IS NULL
  AND NULLIF(btrim(model_id), '') IS NOT NULL;

COMMIT;

-- Read-only preview (run after the block above). RA should show 15 units, 2 names, and which
-- team_code(s) each group sits in today -- that is what decides how step 2 (regroup) is written.
SELECT model_group,
       count(*)                          AS units,
       count(*) FILTER (WHERE is_active) AS active,
       string_agg(DISTINCT team_code, ', ')    AS team_codes,
       string_agg(DISTINCT display_name, ' | ') AS names
FROM public.manikins
WHERE deleted_at IS NULL
GROUP BY model_group
ORDER BY model_group;
