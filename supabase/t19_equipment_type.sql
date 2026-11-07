-- T19 step 4 (PREPARED, NOT RUN): give each group card its sheet category so the catalog "หมวดหมู่" row
-- is filled again. The row is built from equipments.type (catalog.js renderCategoryNavigation) and hides generic
-- values; the group cards created by T15 all carry type = 'manikin', so the row came out empty once the old
-- "<type> - <patient group>" cards were removed.
-- Source: Models_Data.type per model_group (checked: uniform inside every group).
-- Touches only equipments.type of manikin-mode cards. Undo: UPDATE ... SET type = 'manikin' for the same rows
-- (or restore from t19_equipments_backup, which holds the pre-T19 rows of the survivors).
-- ONE DO statement = atomic in the Supabase editor. Run the WHOLE file.
DO $t19t$
DECLARE v_n int; v_left int;
BEGIN
  UPDATE public.equipments e
  SET type = v.cat
  FROM (
    SELECT DISTINCT m.team_code, g.cat
    FROM public.manikins m
    JOIN (VALUES
      ('A4000','ALS Manikin'), ('ALS','ALS Manikin'), ('GA','ALS Manikin'), ('MCK','ALS Manikin'), ('QCPR-D','ALS Manikin'),
      ('B','BLS Manikin'), ('BA','BLS Manikin'), ('C','BLS Manikin'), ('CPR-D','BLS Manikin'), ('FB','BLS Manikin'),
      ('GB','BLS Manikin'), ('LAQCPR','BLS Manikin'), ('LJ','BLS Manikin'), ('RA','BLS Manikin'), ('RBQCPR','BLS Manikin'),
      ('DiFE','Airway Trainer'), ('E','Airway Trainer'), ('FE','Airway Trainer'), ('H','Airway Trainer'), ('NA','Airway Trainer'),
      ('Harvey','Diagnostic Trainer'), ('PAT','Diagnostic Trainer'), ('SAM','Diagnostic Trainer'),
      ('GAUMARD NB','High-Fidelity Simulator'), ('Sim A','High-Fidelity Simulator'),
      ('SiM ALS','High-Fidelity Simulator'), ('SimJunior','High-Fidelity Simulator'),
      ('I','Skill Trainer'), ('SiMMOM','Obstetric Simulator')
    ) AS g(grp, cat) ON g.grp = m.model_group
    WHERE m.deleted_at IS NULL
  ) v
  WHERE e.source_team_code = v.team_code
    AND e.inventory_mode = 'manikin'
    AND e.type IS DISTINCT FROM v.cat;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- Self-check: no enabled manikin card may keep the generic type.
  SELECT count(*) INTO v_left FROM public.equipments
  WHERE inventory_mode = 'manikin' AND borrow_enabled AND lower(coalesce(type, '')) IN ('', 'manikin');
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'T19 step 4: % manikin cards still have a generic type (a model_group is missing from the list) -- nothing changed', v_left;
  END IF;
  RAISE NOTICE 'T19 step 4 ok: % cards updated', v_n;
END
$t19t$;
