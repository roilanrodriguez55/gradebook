CREATE TABLE courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  name TEXT NOT NULL UNIQUE
);

ALTER TABLE groups ADD COLUMN course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL;

CREATE INDEX idx_groups_course_id ON groups(course_id);

-- Matricula de estudiante en grupo. Un estudiante puede estar en varios grupos (p. ej. tras un arrastre).
-- promoted_to_group_id registra el grupo al que fue promovido al cerrar el grupo origen.
CREATE TABLE enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  promoted_to_group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
  UNIQUE(student_id, group_id)
);

CREATE INDEX idx_enrollments_group_id ON enrollments(group_id);
CREATE INDEX idx_enrollments_student_id ON enrollments(student_id);

INSERT INTO enrollments (student_id, group_id) SELECT id, group_id FROM students;

-- Arrastre: estudiante que debe volver a cursar una asignatura (group_subject) de un grupo anterior.
CREATE TABLE carries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  group_subject_id INTEGER NOT NULL REFERENCES group_subjects(id) ON DELETE CASCADE,
  UNIQUE(student_id, group_subject_id)
);

CREATE INDEX idx_carries_student_id ON carries(student_id);
CREATE INDEX idx_carries_group_subject_id ON carries(group_subject_id);

-- students.group_id queda como columna legada: la fuente de verdad de matriculas es enrollments.
