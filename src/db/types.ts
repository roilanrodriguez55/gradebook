export type SubmissionStatus = "pendiente" | "entregado" | "no_entrego" | "tardia";

export type DownloadStatus = "sin_descargar" | "descargando" | "ok" | "error";

export interface Course {
  id: number;
  name: string;
  created_at: string;
}

export interface Group {
  id: number;
  name: string;
  period: string | null;
  archived: number;
  course_id: number | null;
  created_at: string;
}

export interface Enrollment {
  id: number;
  student_id: number;
  group_id: number;
  promoted_to_group_id: number | null;
  created_at: string;
}

export interface Carry {
  id: number;
  student_id: number;
  group_subject_id: number;
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

export interface StudentInGroup extends Student {
  promoted_to_group_id: number | null;
}

export interface CarryOption {
  group_subject_id: number;
  subject_name: string;
  group_name: string;
  course_name: string | null;
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
