import { getDb } from "../db/client";
import * as courses from "../db/courses";
import * as evaluations from "../db/evaluations";
import * as groupSubjects from "../db/groupSubjects";
import * as groups from "../db/groups";
import * as subjects from "../db/subjects";
import type { Course, Evaluation, Group, Subject } from "../db/types";

export interface GroupSubjectView {
  id: number;
  subject: Subject;
  evaluations: Evaluation[];
}

export interface GroupView {
  group: Group;
  course: Course | null;
  subjects: GroupSubjectView[];
  studentCount: number;
}

// Grupos con sus asignaturas (y evaluaciones) y cantidad de estudiantes. Sirve al arbol y a Inicio.
export async function loadGroupViews(includeArchived: boolean): Promise<GroupView[]> {
  const [allGroups, allSubjects, allCourses] = await Promise.all([
    groups.list(true),
    subjects.list(),
    courses.list(),
  ]);
  const subjectById = new Map(allSubjects.map((s) => [s.id, s]));
  const courseById = new Map(allCourses.map((c) => [c.id, c]));
  const visible = includeArchived ? allGroups : allGroups.filter((g) => g.archived === 0);
  const db = await getDb();

  return Promise.all(
    visible.map(async (group): Promise<GroupView> => {
      const [links, countRows] = await Promise.all([
        groupSubjects.listByGroup(group.id),
        db.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM enrollments WHERE group_id = ?", [
          group.id,
        ]),
      ]);
      const subjectViews = await Promise.all(
        links.map(async (link): Promise<GroupSubjectView | null> => {
          const subject = subjectById.get(link.subject_id);
          if (!subject) return null;
          return {
            id: link.id,
            subject,
            evaluations: await evaluations.listByGroupSubject(link.id),
          };
        }),
      );
      return {
        group,
        course: group.course_id === null ? null : (courseById.get(group.course_id) ?? null),
        subjects: subjectViews.filter((v): v is GroupSubjectView => v !== null),
        studentCount: countRows[0]?.n ?? 0,
      };
    }),
  );
}
