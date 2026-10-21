CREATE TABLE groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  name TEXT NOT NULL,
  period TEXT,
  archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE group_subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  UNIQUE(group_id, subject_id)
);

CREATE TABLE students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  first_names TEXT NOT NULL,
  last_names TEXT NOT NULL,
  github_user TEXT
);

CREATE TABLE evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  group_subject_id INTEGER NOT NULL REFERENCES group_subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  topic TEXT NOT NULL,
  due_date TEXT,
  max_score REAL NOT NULL DEFAULT 100,
  last_folder TEXT
);

CREATE TABLE submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  evaluation_id INTEGER NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  repo_url TEXT,
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK(status IN ('pendiente','entregado','no_entrego','tardia')),
  download_status TEXT NOT NULL DEFAULT 'sin_descargar' CHECK(download_status IN ('sin_descargar','descargando','ok','error')),
  download_error TEXT,
  local_path TEXT,
  last_commit_sha TEXT,
  last_commit_date TEXT,
  grade REAL,
  comment TEXT,
  UNIQUE(evaluation_id, student_id)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX idx_group_subjects_group_id ON group_subjects(group_id);
CREATE INDEX idx_group_subjects_subject_id ON group_subjects(subject_id);
CREATE INDEX idx_students_group_id ON students(group_id);
CREATE INDEX idx_evaluations_group_subject_id ON evaluations(group_subject_id);
CREATE INDEX idx_submissions_evaluation_id ON submissions(evaluation_id);
CREATE INDEX idx_submissions_student_id ON submissions(student_id);
