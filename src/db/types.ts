export type SubmissionStatus = "pendiente" | "entregado" | "no_entrego" | "tardia";

export type DownloadStatus = "sin_descargar" | "descargando" | "ok" | "error";

export interface Group {
  id: number;
  name: string;
  period: string | null;
  archived: number;
  created_at: string;
}

export interface Subject {
  id: number;
  name: string;
  grade_min: number;
  grade_max: number;
  download_folder: string | null;
  created_at: string;
}

export interface GroupSubject {
  id: number;
  group_id: number;
  subject_id: number;
  created_at: string;
}

export interface Student {
  id: number;
  group_id: number;
  first_names: string;
  last_names: string;
  github_user: string | null;
  created_at: string;
}

export interface Evaluation {
  id: number;
  group_subject_id: number;
  title: string;
  topic: string;
  due_date: string | null;
  created_at: string;
}

export interface Submission {
  id: number;
  evaluation_id: number;
  student_id: number;
  repo_url: string | null;
  status: SubmissionStatus;
  download_status: DownloadStatus;
  download_error: string | null;
  local_path: string | null;
  last_commit_sha: string | null;
  last_commit_date: string | null;
  grade: number | null;
  comment: string | null;
  created_at: string;
}
