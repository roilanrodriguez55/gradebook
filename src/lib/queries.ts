import * as evaluations from "../db/evaluations";
import * as groupSubjects from "../db/groupSubjects";
import * as groups from "../db/groups";
import * as students from "../db/students";
import * as subjects from "../db/subjects";
import type { Evaluation, Group, Subject } from "../db/types";

export interface GroupSubjectView {
  id: number;
  subject: Subject;
  evaluations: Evaluation[];
}

export interface GroupView {
  group: Group;
  subjects: GroupSubjectView[];
  studentCount: number;
}

// Grupos con sus asignaturas (y evaluaciones) y cantidad de estudiantes. Sirve al arbol y a Inicio.
export async function loadGroupViews(includeArchived: boolean): Promise<GroupView[]> {
  const [allGroups, allSubjects] = await Promise.all([groups.list(true), subjects.list()]);
  const subjectById = new Map(allSubjects.map((s) => [s.id, s]));
  const visible = includeArchived ? allGroups : allGroups.filter((g) => g.archived === 0);

  return Promise.all(
    visible.map(async (group): Promise<GroupView> => {
      const [links, groupStudents] = await Promise.all([
        groupSubjects.listByGroup(group.id),
        students.listByGroup(group.id),
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
        subjects: subjectViews.filter((v): v is GroupSubjectView => v !== null),
        studentCount: groupStudents.length,
      };
    }),
  );
}
