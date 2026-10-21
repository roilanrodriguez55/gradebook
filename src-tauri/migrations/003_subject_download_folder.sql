ALTER TABLE subjects ADD COLUMN download_folder TEXT;
UPDATE subjects SET download_folder = (SELECT e.last_folder FROM evaluations e JOIN group_subjects gs ON gs.id = e.group_subject_id WHERE gs.subject_id = subjects.id AND e.last_folder IS NOT NULL AND e.last_folder <> '' ORDER BY e.id DESC LIMIT 1);
