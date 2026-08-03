import { rpcCall } from "./api";

import type {
  SchoolClass,
  SchoolGrade,
  PersonalClass,
  Student,
  AnyClass,
  ClassroomChoice,
  StudentRosterImportRow,
  StudentRosterImportResult,
  SchoolRosterRecycleBin,
} from "@/types";

export interface StudentInput {
  name: string;
  studentNo: string;
  grade?: string;
  gender?: "male" | "female";
  isExternal?: boolean;
  externalSchool?: string;
}

export const classService = {
  async listSchoolGrades(schoolId: string): Promise<SchoolGrade[]> {
    return rpcCall("class", "listSchoolGrades", [schoolId]) as any;
  },

  async createSchoolGrade(schoolId: string, teacherId: string, gradYear: number, grade: string): Promise<SchoolGrade> {
    return rpcCall("class", "createSchoolGrade", [schoolId, teacherId, gradYear, grade]) as any;
  },

  async advanceSchoolGrade(gradeId: string): Promise<{ grade: SchoolGrade; updatedClasses: number; updatedStudents: number }> {
    return rpcCall("class", "advanceSchoolGrade", [gradeId]) as any;
  },

  async bulkCreateSchoolClasses(gradeId: string, teacherId: string, names: string[]): Promise<SchoolClass[]> {
    return rpcCall("class", "bulkCreateSchoolClasses", [gradeId, teacherId, names]) as any;
  },

  async bulkImportStudents(gradeId: string, teacherId: string, rows: StudentRosterImportRow[]): Promise<StudentRosterImportResult> {
    return rpcCall("class", "bulkImportStudents", [gradeId, teacherId, rows]) as any;
  },

  async listSchoolRosterRecycleBin(schoolId: string): Promise<SchoolRosterRecycleBin> {
    return rpcCall("class", "listSchoolRosterRecycleBin", [schoolId]) as any;
  },

  async deleteStudent(studentId: string): Promise<Student | null> {
    return rpcCall("class", "deleteStudent", [studentId]) as any;
  },

  async restoreStudent(studentId: string): Promise<Student | null> {
    return rpcCall("class", "restoreStudent", [studentId]) as any;
  },

  async restoreSchoolClass(classId: string): Promise<{ class: SchoolClass; restoredStudents: number }> {
    return rpcCall("class", "restoreSchoolClass", [classId]) as any;
  },

  async listClassroomChoices(): Promise<ClassroomChoice[]> {
    return rpcCall("class", "listClassroomChoices", []) as any;
  },

  async listSchoolClasses(schoolId: string): Promise<SchoolClass[]> {
    return rpcCall("class", "listSchoolClasses", [schoolId]) as any;
  },

  async listPersonalClasses(teacherId: string): Promise<PersonalClass[]> {
    return rpcCall("class", "listPersonalClasses", [teacherId]) as any;
  },

  async listAllClasses(schoolId: string, teacherId: string): Promise<AnyClass[]> {
    return rpcCall("class", "listAllClasses", [schoolId, teacherId]) as any;
  },

  async createSchoolClass(schoolId: string, teacherId: string, name: string, grade: string, options?: { classTypeId?: string; gradeYear?: number; gradeId?: string }): Promise<SchoolClass> {
    return rpcCall("class", "createSchoolClass", [schoolId, teacherId, name, grade, options]) as any;
  },

  async createPersonalClass(teacherId: string, name: string, description: string): Promise<PersonalClass> {
    return rpcCall("class", "createPersonalClass", [teacherId, name, description]) as any;
  },

  async addStudent(classId: string, schoolId: string, input: StudentInput): Promise<Student> {
    return rpcCall("class", "addStudent", [classId, schoolId, input]) as any;
  },

  async addExternalStudentToPersonalClass(classId: string, input: Omit<StudentInput, "isExternal"> & { externalSchool: string }): Promise<Student> {
    return rpcCall("class", "addExternalStudentToPersonalClass", [classId, input]) as any;
  },

  async listStudentsByClass(classId: string): Promise<Student[]> {
    return rpcCall("class", "listStudentsByClass", [classId]) as any;
  },

  async listSuspendedStudents(schoolIdOrTeacherId: string, scope: "school" | "personal" = "school"): Promise<Student[]> {
    return rpcCall("class", "listSuspendedStudents", [schoolIdOrTeacherId, scope]) as any;
  },

  async listStudentsBySchool(schoolId: string): Promise<Student[]> {
    return rpcCall("class", "listStudentsBySchool", [schoolId]) as any;
  },

  async listDepartedStudents(schoolIdOrTeacherId: string, scope: "school" | "personal" = "school"): Promise<Student[]> {
    return rpcCall("class", "listDepartedStudents", [schoolIdOrTeacherId, scope]) as any;
  },

  async listMyClasses(schoolId: string | null, teacherId: string): Promise<AnyClass[]> {
    return rpcCall("class", "listMyClasses", [schoolId, teacherId]) as any;
  },

  async listMyStudents(schoolId: string | null, teacherId: string): Promise<Student[]> {
    return rpcCall("class", "listMyStudents", [schoolId, teacherId]) as any;
  },

  async listMyClassIds(schoolId: string | null, teacherId: string): Promise<Set<string>> {
    return rpcCall("class", "listMyClassIds", [schoolId, teacherId]) as any;
  },

  async getClassesByIds(ids: string[]): Promise<AnyClass[]> {
    return rpcCall("class", "getClassesByIds", [ids]) as any;
  },

  async addStudentToPersonalClass(classId: string, studentId: string): Promise<void> {
    return rpcCall("class", "addStudentToPersonalClass", [classId, studentId]) as any;
  },

  async removeStudentFromPersonalClass(classId: string, studentId: string): Promise<void> {
    return rpcCall("class", "removeStudentFromPersonalClass", [classId, studentId]) as any;
  },

  async deleteClass(classId: string, isPersonal: boolean): Promise<void> {
    return rpcCall("class", "deleteClass", [classId, isPersonal]) as any;
  },

  async updateSchoolClass(classId: string, patch: Partial<Pick<SchoolClass, "name" | "grade" | "classTypeId" | "gradeYear">>): Promise<SchoolClass | null> {
    return rpcCall("class", "updateSchoolClass", [classId, patch]) as any;
  },

  async updatePersonalClass(classId: string, patch: Pick<PersonalClass, "name">): Promise<PersonalClass | null> {
    return rpcCall("class", "updatePersonalClass", [classId, patch]) as any;
  },

  async getStudent(studentId: string): Promise<Student | null> {
    return rpcCall("class", "getStudent", [studentId]) as any;
  },

  async updateStudent(studentId: string, patch: Partial<Pick<Student, "name" | "studentNo" | "grade" | "gender" | "subjectSelection" | "externalSchool">>): Promise<Student | null> {
    return rpcCall("class", "updateStudent", [studentId, patch]) as any;
  },

  async transferStudent(studentId: string, toClassId: string, options?: { newStudentNo?: string }): Promise<Student | null> {
    return rpcCall("class", "transferStudent", [studentId, toClassId, options]) as any;
  },

  async suspendStudent(studentId: string): Promise<Student | null> {
    return rpcCall("class", "suspendStudent", [studentId]) as any;
  },

  async graduateStudent(studentId: string): Promise<Student | null> {
    return rpcCall("class", "graduateStudent", [studentId]) as any;
  },

  async transferOutStudent(studentId: string): Promise<Student | null> {
    return rpcCall("class", "transferOutStudent", [studentId]) as any;
  },

  async graduateClass(classId: string): Promise<{ class: SchoolClass; graduatedCount: number }> {
    return rpcCall("class", "graduateClass", [classId]) as any;
  },

  async resumeStudent(studentId: string, toClassId?: string): Promise<Student | null> {
    return rpcCall("class", "resumeStudent", [studentId, toClassId]) as any;
  }
};
