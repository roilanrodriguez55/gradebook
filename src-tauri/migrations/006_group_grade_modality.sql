-- Grado y modalidad del grupo. Modalidad: CRD (curso regular diurno, 1 a 4) o CPE (curso por encuentros, 1 a 5).
ALTER TABLE groups ADD COLUMN grade INTEGER;
ALTER TABLE groups ADD COLUMN modality TEXT CHECK (modality IN ('CRD', 'CPE'));

-- Grupos existentes: se deducen del nombre ("3ro CPE" = grado 3, modalidad CPE).
UPDATE groups SET modality = 'CPE' WHERE upper(name) LIKE '%CPE%';
UPDATE groups SET modality = 'CRD' WHERE modality IS NULL AND upper(name) LIKE '%CRD%';
UPDATE groups
SET grade = CAST(substr(trim(name), 1, 1) AS INTEGER)
WHERE modality IS NOT NULL
  AND substr(trim(name), 1, 1) IN ('1', '2', '3', '4', '5')
  AND NOT (modality = 'CRD' AND substr(trim(name), 1, 1) = '5');
-- Sin grado valido no se deja modalidad a medias.
UPDATE groups SET modality = NULL WHERE grade IS NULL;

-- El periodo (texto libre) pasa a ser semestre (1 o 2). Segundo semestre si el periodo termina en 2
-- ("2026-2", "2do", "II"); cualquier otro valor o vacio queda en 1.
ALTER TABLE groups ADD COLUMN semester INTEGER NOT NULL DEFAULT 1 CHECK (semester IN (1, 2));
UPDATE groups SET semester = 2
WHERE period IS NOT NULL
  AND (trim(period) LIKE '%2' OR lower(trim(period)) LIKE '%2do%' OR upper(trim(period)) LIKE '%II' AND upper(trim(period)) NOT LIKE '%III');
ALTER TABLE groups DROP COLUMN period;

CREATE INDEX idx_groups_grade_modality ON groups(course_id, modality, grade);
