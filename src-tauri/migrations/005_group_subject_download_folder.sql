ALTER TABLE group_subjects ADD COLUMN download_folder TEXT;
UPDATE group_subjects SET download_folder = (SELECT s.download_folder FROM subjects s WHERE s.id = group_subjects.subject_id);
