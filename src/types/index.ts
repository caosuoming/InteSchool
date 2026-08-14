// ============ 核心实体类型 ============

export type TeacherStatus = "pending" | "active" | "rejected";

/** 教师身份角色 */
export type TeacherRole =
  | "teacher"       // 普通教师
  | "headTeacher"   // 班主任
  | "gradeLeader"   // 年级组长
  | "subjectLeader" // 学科组长
  | "prepLeader"    // 备课组长
  | "dean"          // 教务主任
  | "vicePrincipal" // 副校长
  | "principal";    // 校长

/** 教师所属单位（学校或个人） */
export interface TeacherAffiliation {
  id: string;
  teacherId: string;
  /** 学校ID，null 表示个人身份 */
  schoolId: string | null;
  /** 学校名称（冗余，用于快速展示） */
  schoolName: string | null;
  subject: string;
  subjects?: string[];
  /** 当前单位任教年级 */
  teachingGrades?: string[];
  /** 当前单位任教班级 ID */
  teachingClassIds?: string[];
  /** 当前单位担任班主任的班级 ID */
  homeroomClassIds?: string[];
  employeeNo?: string;
  position?: string;
  status: TeacherStatus;
  role: "teacher" | "school_admin" | "platform_admin";
  /** 由上级直接授予的角色；roles 还会包含所负责部门继承的角色。 */
  assignedRoles?: TeacherRole[];
  /** 教师在该单位担任的身份（可多个） */
  roles: TeacherRole[];
  /** 所属学科组ID列表 */
  subjectGroupIds: string[];
  /** 所属备课组ID列表 */
  prepGroupIds: string[];
  /** 是否为当前激活的身份 */
  isCurrent: boolean;
  joinedAt: string;
}

export type RegistrationAuthorizationKind = "admin" | "guarantee";

export interface RegistrationAuthorization {
  id: string;
  phone: string;
  kind: RegistrationAuthorizationKind;
  schoolId: string;
  createdByTeacherId: string;
  createdByName?: string;
  createdAt: string;
  consumedByTeacherId: string | null;
  consumedByName?: string | null;
  consumedAt: string | null;
  revokedAt: string | null;
}

export interface Teacher {
  id: string;
  email: string;
  name: string;
  /** 平台公开展示昵称；未设置时对外显示为匿名用户。 */
  nickname?: string;
  avatar: string;
  wechatOpenId?: string;
  wechatUnionId?: string;
  wecomUserId?: string;
  wecomCorpId?: string;
  /** @deprecated 使用 affiliations 代替 */
  schoolId: string | null;
  /** @deprecated 使用 affiliations 代替 */
  subject: string;
  /** @deprecated 使用 affiliations 代替 */
  subjects?: string[];
  /** @deprecated 使用 affiliations 代替 */
  teachingGrades?: string[];
  /** @deprecated 使用 affiliations 代替 */
  teachingClassIds?: string[];
  /** @deprecated 使用 affiliations 代替 */
  homeroomClassIds?: string[];
  /** @deprecated 使用 affiliations 代替 */
  employeeNo?: string;
  /** @deprecated 使用 affiliations 代替 */
  position?: string;
  /** @deprecated 使用 affiliations 代替 */
  status: TeacherStatus;
  /** @deprecated 使用 affiliations 代替 */
  role: "teacher" | "school_admin" | "platform_admin";
  /** @deprecated 使用 affiliations 代替 */
  roles: TeacherRole[];
  /** @deprecated 使用 affiliations 代替 */
  subjectGroupIds: string[];
  /** @deprecated 使用 affiliations 代替 */
  prepGroupIds: string[];
  /** 所属单位列表（多身份） */
  affiliations: TeacherAffiliation[];
  /** 当前激活的所属单位ID */
  currentAffiliationId: string | null;
  /** 教师在“我的上课”中维护的周课表。 */
  lessonSchedule?: TeacherLessonSchedule;
  /** 可管理的平台资源学科；仅平台超级管理员可以授予或撤销。 */
  platformModeratorSubjects?: string[];
  createdAt: string;
}

export interface School {
  id: string;
  name: string;
  code: string;
  logo: string;
  description: string;
  teacherCount: number;
  studentCount: number;
  city: string;
}

/** 学科组（如：数学组、语文组） */
export interface SubjectGroup {
  id: string;
  schoolId: string;
  name: string;
  subject: string;
  leaderId: string | null;
  memberIds: string[];
  description?: string;
  createdAt: string;
}

/** 备课组（如：高一数学备课组） */
export interface PrepGroup {
  id: string;
  schoolId: string;
  subjectGroupId: string;
  name: string;
  grade: string;
  leaderId: string | null;
  memberIds: string[];
  description?: string;
  createdAt: string;
}

/** 学校自定义部门。部门名称、层级和负责人权限均由学校管理员配置。 */
export interface OrganizationDepartment {
  id: string;
  schoolId: string;
  name: string;
  parentId: string | null;
  /** 可选年级范围；用于表达“高一年级组”等年级部门。 */
  grade?: string;
  leaderId: string | null;
  /** 负责人因担任该部门负责人而获得的角色权限。 */
  roles: TeacherRole[];
  description?: string;
  createdAt: string;
}


export interface RegistrationContext {
  authorization: {
    kind: RegistrationAuthorizationKind;
    schoolId: string;
    schoolName: string;
  };
  schools: School[];
}

export interface SchoolAdminApplication {
  id: string;
  teacherId: string;
  teacherName: string;
  schoolId: string;
  schoolName: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface TeacherRoleApplication {
  id: string;
  teacherId: string;
  teacherName: string;
  schoolId: string;
  schoolName: string;
  requestedRoles: TeacherRole[];
  reason: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface SchoolCreationApplication {
  id: string;
  requesterId: string;
  requesterName: string;
  name: string;
  code: string;
  city: string;
  description: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  schoolId?: string;
}

export interface SchoolApplication {
  id: string;
  teacherId: string;
  teacherName?: string;
  schoolId: string;
  schoolName?: string;
  employeeNo?: string;
  subject: string;
  subjects: string[];
  teachingGrades?: string[];
  position?: string;
  /** 申请加入学校时希望获得的教师身份；旧申请可能缺少该字段 */
  roles?: TeacherRole[];
  proofFileId?: string | null;
  proofFileName?: string;
  requestSchoolAdmin?: boolean;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export type ClassType = "school" | "personal";

export interface ClassTypeCategory {
  id: string;
  schoolId: string;
  name: string;
  description?: string;
  color?: string;
  sortOrder: number;
  enabled: boolean;
  createdAt: string;
}

/** 试卷类型格式 */
export type ExamPaperFormat = "simple" | "gaokao";

export interface ExamPaperType {
  id: string;
  schoolId: string;
  name: string;
  description?: string;
  /** 上级类型ID；为空时为一级类型。仅支持两级。 */
  parentId?: string | null;
  /** 格式类型：simple=无题型分组（午间练/晚间作业），gaokao=高考格式（考试） */
  format: ExamPaperFormat;
  sortOrder: number;
  enabled: boolean;
  createdAt: string;
}

/** 讲义类型格式 */
export type LectureFormat = "table" | "mixed";

export interface LectureType {
  id: string;
  schoolId: string;
  name: string;
  description?: string;
  /** 上级类型ID；为空时为一级类型。仅支持两级。 */
  parentId?: string | null;
  /** 格式类型：table=表格形式（教案），mixed=知识块+题目混合（学案/辅导训练） */
  format: LectureFormat;
  sortOrder: number;
  enabled: boolean;
  createdAt: string;
}

export interface SchoolGrade {
  id: string;
  schoolId: string;
  /** 展示名称，例如“2027届高二”。 */
  name: string;
  /** 当前学段年级，例如“高一”“高二”“高三”。 */
  grade: string;
  /** 毕业年份届，例如 2027。 */
  gradYear: number;
  status: "active" | "graduated";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchoolClass {
  id: string;
  type: "school";
  schoolId: string;
  /** 所属年级实体；旧数据可能暂时缺失，由迁移自动补齐。 */
  gradeId?: string;
  name: string;
  grade: string;
  /** 入学年份级（如2026级） */
  gradeYear?: number;
  /** 毕业年份届（如2029届），由gradeYear+3自动计算 */
  gradYear?: number;
  classTypeId?: string | null;
  studentCount: number;
  /** 班级状态；旧数据未设置时按在读班级处理。 */
  status?: "active" | "graduated" | "deleted";
  /** 整班毕业时间 */
  graduatedAt?: string;
  /** 移入回收站时间。 */
  deletedAt?: string;
  /** 从回收站恢复时使用的原状态。 */
  deletedFromStatus?: "active" | "graduated";
  createdBy: string;
  createdAt: string;
}

export interface PersonalClass {
  id: string;
  type: "personal";
  teacherId: string;
  name: string;
  description: string;
  studentIds: string[];
  createdAt: string;
}

export type AnyClass = SchoolClass | PersonalClass;

export interface ClassroomChoice {
  id: string;
  schoolId: string;
  schoolName: string;
  name: string;
  grade: string;
}

export type StudentStatus = "active" | "suspended" | "graduated" | "transferred" | "deleted";

export type StudentArchiveStatus =
  | "attending"
  | "studyAway"
  | "visiting"
  | "leave"
  | "suspended"
  | "transferred"
  | "graduated";

export interface StudentContactInfo {
  studentPhone?: string;
  guardianName?: string;
  guardianPhone?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
}

export interface StudentArchiveRecord {
  id: string;
  studentId: string;
  schoolId: string;
  classId: string;
  type: "contact" | "status";
  previousStatus?: StudentArchiveStatus;
  status?: StudentArchiveStatus;
  contacts?: StudentContactInfo;
  externalSchool?: string;
  startDate?: string;
  endDate?: string;
  note?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface StudentArchiveStatusInput {
  status: Exclude<StudentArchiveStatus, "graduated">;
  externalSchool?: string;
  startDate?: string;
  endDate?: string;
  note?: string;
}

export interface StudentArchiveOverview {
  classes: AnyClass[];
  students: Student[];
  records: StudentArchiveRecord[];
}

export interface Student {
  id: string;
  name: string;
  studentNo: string;
  classId: string;
  schoolId: string;
  grade: string;
  gender?: "male" | "female";
  /** 学生的选科组合，例如“物化生”。 */
  subjectSelection?: string;
  isExternal?: boolean;
  externalSchool?: string;
  /** 学生状态：在读 / 挂起 / 已毕业 / 已转校 */
  status: StudentStatus;
  /** “我的学生-档案记录”中的当前状态；旧数据会由 status/isExternal 推导。 */
  archiveStatus?: StudentArchiveStatus;
  /** 请假前的就读状态，用于结束请假时准确恢复借读关系。 */
  archiveStatusBeforeLeave?: Exclude<StudentArchiveStatus, "leave">;
  /** 学生及监护人联系方式。 */
  contacts?: StudentContactInfo;
  /** 挂起时间 */
  suspendedAt?: string;
  /** 恢复时间 */
  resumedAt?: string;
  /** 毕业时间 */
  graduatedAt?: string;
  /** 毕业类型：正常毕业 / 提前毕业 */
  graduationType?: "regular" | "early";
  /** 转校时间 */
  transferredAt?: string;
  /** 移入回收站时间。 */
  deletedAt?: string;
  /** 从回收站恢复时使用的原状态。 */
  deletedFromStatus?: Exclude<StudentStatus, "deleted">;
  /** 历史班级记录（换班时追加） */
  classHistory?: Array<{
    fromClassId: string;
    toClassId: string;
    changedAt: string;
    studentNoChanged: boolean;
  }>;
}

export interface StudentRosterImportRow {
  className: string;
  name: string;
  studentNo?: string;
  subjectSelection?: string;
  isExternal?: boolean;
  gender?: "male" | "female";
}

export interface StudentRosterImportOptions {
  missingStudents?: "keep" | "delete";
}

export interface StudentRosterImportResult {
  createdClasses: number;
  createdStudents: number;
  updatedStudents: number;
  deletedStudents: number;
  skippedStudents: number;
}

export interface SchoolRosterRecycleBin {
  classes: SchoolClass[];
  students: Student[];
}

// ============ 学生成绩 ============

export interface GradeCohort {
  /** 稳定标识：优先使用毕业年份，旧班级数据则退化为年级名称。 */
  key: string;
  label: string;
  grade: string;
  gradYear?: number;
  classIds: string[];
  studentCount: number;
}

// ============ 考场安排 ============

export type ExamArrangementMode = "combination" | "subject";
export type ExamSubjectSetupMode = "all" | "selection" | "academicNonSelection";
export type ExamSeatOrder = "random" | "previousRank";
export type ExamStudentSeatPreference = "first" | "last";

export interface ExamRoomConfig {
  id: string;
  /** 兼容旧方案；新方案中与 number 保持一致。 */
  name: string;
  /** 展示在座位表和桌贴上的考场号。 */
  number?: string;
  /** 实际考试地点，例如教学楼与教室。 */
  location?: string;
  /** 由班级自动生成的考场所对应的班级；教室外考场不填写。 */
  classroomClassId?: string;
  capacity: number;
}

export interface ExamClassRoomRule {
  classId: string;
  /** 该班默认参加的科目，可按学生继续微调。 */
  defaultSubjects: string[];
  /** 每个科目允许使用的考场 ID。 */
  subjectRoomIds: Record<string, string[]>;
  /** 显式固定的单一考场；未设置时按 subjectRoomIds 自动分配。 */
  fixedSubjectRoomIds?: Record<string, string>;
}

export interface ExamStudentSubjectSelection {
  studentId: string;
  subjects: string[];
  /** 弃考学生不生成任何座位。 */
  absent?: boolean;
  /** 特殊学生可要求排在场次首部或尾部。 */
  seatPreference?: ExamStudentSeatPreference;
}

export interface ExamSeatAssignment {
  id: string;
  studentId: string;
  studentName: string;
  studentNo: string;
  classId: string;
  className: string;
  /** 单科模式为科目，选科模式为科目组合。 */
  subjectLabel: string;
  /** 同一 sessionKey 内考场容量不能重复使用。 */
  sessionKey: string;
  roomId: string;
  roomName: string;
  roomNumber?: string;
  roomLocation?: string;
  seatNo: number;
  admissionNo: string;
}

export interface ExamArrangementInput {
  id?: string;
  cohortKey: string;
  name: string;
  examDate?: string;
  /** 旧方案兼容字段；新方案使用 separateSubjects 表达混合编排。 */
  mode: ExamArrangementMode;
  /** 全部学科、高考六门（语数外加选科），或学测科目中的非选科。 */
  subjectSetupMode?: ExamSubjectSetupMode;
  subjects: string[];
  /** 学生选科名称对应的实际考试科目。 */
  selectionSubjects?: Record<string, string[]>;
  /** 勾选的科目单独排考场，其余科目合并为一个场次。 */
  separateSubjects?: string[];
  /** 随机排座或按最近一次考试年级名次排座。 */
  seatOrder?: ExamSeatOrder;
  rooms: ExamRoomConfig[];
  /** 每个实际考试组合允许使用的考场 ID，未配置时默认使用全部考场。 */
  groupRoomIds?: Record<string, string[]>;
  classRules: ExamClassRoomRule[];
  studentSubjects: ExamStudentSubjectSelection[];
}

export interface ExamArrangement extends Omit<ExamArrangementInput, "id"> {
  id: string;
  schoolId: string;
  teacherId: string;
  cohortLabel: string;
  assignments: ExamSeatAssignment[];
  createdAt: string;
  updatedAt: string;
}

export interface ExamArrangementContext {
  cohort: GradeCohort;
  classes: SchoolClass[];
  students: Student[];
  /** 最近一次同年级考试的年级名次。 */
  previousGradeRanks?: Record<string, number>;
}

export interface GradeTeacherOption {
  id: string;
  name: string;
  subject: string;
  teachingClassIds?: string[];
  homeroomClassIds?: string[];
}

export interface GradeImportContext {
  cohort: GradeCohort;
  classes: SchoolClass[];
  students: Student[];
  teachers: GradeTeacherOption[];
  /** 班级在成绩统计页面展示的班型、选科与最近一次完整成绩科目。 */
  classProfiles?: Record<string, {
    classTypeName?: string;
    subjectSelections: string[];
    scoreSubjects: string[];
    hasImportedScores: boolean;
  }>;
  /** 最近一次已导入考试的少量记录，用于在线公式表实时预览。 */
  sampleRecords?: GradeScoreRecord[];
  /** 年级管理员发布的默认输出模板；新导入考试会自动继承。 */
  templateProfile?: GradeTemplateProfile;
}

/**
 * 赋分区间。percentileFrom/percentileTo 表示从高分到低分的累计百分位，
 * 例如 A 档 0-15、B 档 15-50。
 */
export interface GradeBandRule {
  label: string;
  percentileFrom: number;
  percentileTo: number;
  assignedMin: number;
  assignedMax: number;
}

export interface GradeClassSubjectSetting {
  classId: string;
  /** 该班实际参加考试的科目。 */
  examSubjects: string[];
  /** 参与总分、排名和班级统计的科目。 */
  statisticSubjects: string[];
  /** 该班使用单独试卷、仅在班内排名的科目。 */
  separateRankSubjects?: string[];
}

export type GradeSubjectRankScope = "cohort" | "class";

export type GradeTemplateKind =
  | "studentRanking"
  | "classAverage"
  | "totalScoreSegment"
  | "coreAndBestElectiveSegment"
  | "electiveGradeSegment"
  | "customTable";

export type GradeScoreMode = "raw" | "assigned";
export type GradeClassAverageSubjectScoreMode = GradeScoreMode | "both";

export interface GradeTemplateColumn {
  id: string;
  /** 输出列名。 */
  name: string;
  /**
   * 安全公式表达式。支持字段、四则运算、IF，以及 RAW/SCORE/SCORES、
   * SUM/AVERAGE/MAX/MIN/BEST/ROUND 等函数，不执行任意 JavaScript。
   */
  formula: string;
  width?: number;
}

export interface GradeClassAverageOptions {
  /** 报表标题；为空时根据年级和考试名称自动生成。 */
  title?: string;
  /** 报表日期，格式为 YYYY-MM-DD。 */
  reportDate?: string;
  /** 班级展示顺序。未列出的新班级会自动追加。 */
  classOrder?: string[];
  /** 不在报表中展示的班级。 */
  hiddenClassIds?: string[];
  /** 可由用户调整的班级类别。 */
  classCategories?: Record<string, string>;
  /** 可由用户调整的班级简称。 */
  classLabels?: Record<string, string>;
  /** 每个班级、每个学科在班级平均分表中的分数显示方式。 */
  subjectScoreModes?: Record<string, Record<string, GradeClassAverageSubjectScoreMode>>;
  /** 班级总分平均显示原始总分还是赋分总分。 */
  totalScoreMode?: GradeScoreMode;
  showTeacherRows?: boolean;
  showGroupDifference?: boolean;
  showGroupAverage?: boolean;
  showOverallAverage?: boolean;
}

export type GradeTotalScoreTargetKey = "highScore1" | "highScore2" | "firstTier" | "undergraduate";
export type GradeAcademicTrack = "science" | "arts";

export interface GradeTotalScoreClassTargets {
  highScore1?: number;
  highScore2?: number;
  firstTier?: number;
  undergraduate?: number;
}

export interface GradeTotalScoreTrackThresholds {
  highScore1?: number;
  highScore2?: number;
  firstTier?: number;
  undergraduate?: number;
}

export interface GradeTotalScoreSegmentOptions {
  /** 旧数据使用的统一高分 1 达线标准；新数据优先使用 trackThresholds。 */
  highScore1Threshold?: number;
  /** 旧数据使用的统一高分 2 达线标准；新数据优先使用 trackThresholds。 */
  highScore2Threshold?: number;
  /** 旧数据使用的统一一本达线标准；新数据优先使用 trackThresholds。 */
  firstTierThreshold?: number;
  /** 旧数据使用的统一二本达线标准；新数据优先使用 trackThresholds。 */
  undergraduateThreshold?: number;
  /** 物理类（理科）和历史类（文科）分别使用的总分达线标准。 */
  trackThresholds?: Partial<Record<GradeAcademicTrack, GradeTotalScoreTrackThresholds>>;
  /** 表三、表四各单科累计分数段，可按学科独立调整。 */
  subjectScoreSegmentThresholds?: Record<string, number[]>;
  /** 各班级随届保存的高分、一本和本科目标人数。 */
  classTargets?: Record<string, GradeTotalScoreClassTargets>;
}

export interface GradeStatisticsTemplate {
  id: string;
  kind: GradeTemplateKind;
  name: string;
  enabled: boolean;
  scoreMode: GradeScoreMode;
  subjects: string[];
  /** 分数段宽度，仅分数段模板使用。 */
  segmentSize?: number;
  /** 总分分数段汇总表的最高统计阈值。 */
  segmentMax?: number;
  /** 总分分数段汇总表的最低统计阈值。 */
  segmentMin?: number;
  /** 选取最高分的选修科目数量。 */
  bestElectiveCount?: number;
  /** 自定义在线表格列，仅 customTable 模板使用。 */
  columns?: GradeTemplateColumn[];
  /** 班级平均分表的布局和汇总选项。 */
  classAverageOptions?: GradeClassAverageOptions;
  /** 总分分数段表的达线标准和班级目标。 */
  totalScoreSegmentOptions?: GradeTotalScoreSegmentOptions;
}

export interface GradeTemplateProfile {
  id: string;
  schoolId: string;
  cohortKey: string;
  templates: GradeStatisticsTemplate[];
  updatedByTeacherId: string;
  createdAt: string;
  updatedAt: string;
}

export interface GradeExamSettings {
  /** 学科对应的任课教师，可配置多人。 */
  subjectTeacherIds: Record<string, string[]>;
  /** 班级和学科对应的任课教师；旧数据缺失时从 subjectTeacherIds 迁移。 */
  classSubjectTeacherIds?: Record<string, Record<string, string[]>>;
  /** 无平台账号或尚未维护教学关系的任课教师姓名，可按班级和学科手动补录。 */
  classSubjectTeacherNames?: Record<string, Record<string, string[]>>;
  /** 仅需要赋分的学科配置规则；未配置的科目沿用原始分。 */
  assignmentRules: Record<string, GradeBandRule[]>;
  classSubjects: GradeClassSubjectSetting[];
  templates: GradeStatisticsTemplate[];
}

/** 同一年级的成绩预处理配置，导入不同考试时复用。 */
export interface GradeCohortSettings {
  id: string;
  schoolId: string;
  cohortKey: string;
  cohortLabel: string;
  subjects: string[];
  settings: GradeExamSettings;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface GradeScoreRecord {
  id: string;
  studentId: string;
  studentName: string;
  studentNo: string;
  classId: string;
  className: string;
  /** 成绩表中的学生选科组合或科类。 */
  subjectSelection?: string;
  /** 成绩表中的班型描述。 */
  classType?: string;
  scores: Record<string, number | null>;
  /** 成绩表直接提供的赋分；重算设置时继续保留，不由规则覆盖。 */
  sourceAssignedScores?: Record<string, number | null>;
  assignedScores: Record<string, number | null>;
  rawTotal: number;
  assignedTotal: number;
  gradeRank: number;
  classRank: number;
  /** 每个科目的名次；统考科目按年级排名，非统考科目按班级单独排名。 */
  subjectRanks?: Record<string, number | null>;
  subjectRankScopes?: Record<string, GradeSubjectRankScope>;
}

export type GradeScoreAdjustmentKind = "raw" | "assigned";

export interface GradeScoreAdjustment {
  id: string;
  studentId: string;
  studentName: string;
  studentNo: string;
  classId: string;
  className: string;
  subject: string;
  kind: GradeScoreAdjustmentKind;
  previousValue: number | null;
  nextValue: number | null;
  changedByTeacherId: string;
  changedByName: string;
  changedAt: string;
}

export interface GradeExamMetadataPatch {
  name: string;
  examDate?: string;
}

export interface GradeExamPublication {
  shareToken: string;
  publishedAt: string;
  publishedByTeacherId: string;
  publishedByName: string;
}

export interface GradeExam {
  id: string;
  schoolId: string;
  teacherId: string;
  cohortKey: string;
  cohortLabel: string;
  name: string;
  examDate?: string;
  sourceFileName: string;
  sourceSheetName: string;
  subjects: string[];
  records: GradeScoreRecord[];
  /** 成绩统计页手工微调的审计记录，按修改时间追加。 */
  scoreAdjustments?: GradeScoreAdjustment[];
  /** 当前有效的成绩发布；撤回后清空，重新发布会生成新链接。 */
  publication?: GradeExamPublication;
  settings: GradeExamSettings;
  createdAt: string;
  updatedAt: string;
}

export type GradeQueryScope = "teacher" | "homeroom" | "grade" | "school";

export interface GradeQueryClass {
  id: string;
  name: string;
  grade: string;
  cohortKey: string;
  access: "subject" | "all" | "aggregate";
}

export interface GradeQueryClassSummary {
  classId: string;
  className: string;
  studentCount: number;
  subjectAverages: Record<string, number | null>;
  rawTotalAverage: number | null;
  assignedTotalAverage: number | null;
}

export interface GradeQueryRecord {
  id: string;
  studentId: string;
  studentName: string;
  studentNo: string;
  classId: string;
  className: string;
  subjectSelection?: string;
  classType?: string;
  scores: Record<string, number | null>;
  assignedScores: Record<string, number | null>;
  rawTotal: number | null;
  assignedTotal: number | null;
  gradeRank: number;
  classRank: number;
  subjectRanks?: Record<string, number | null>;
  subjectRankScopes?: Record<string, GradeSubjectRankScope>;
}

export interface GradeQueryExam {
  id: string;
  cohortKey: string;
  cohortLabel: string;
  name: string;
  examDate?: string;
  subjects: string[];
  subjectAverages: Record<string, number | null>;
  classSummaries: GradeQueryClassSummary[];
  records: GradeQueryRecord[];
  /** 已发布统计表的只读分享令牌，仅对有权查看该考试的登录教师返回。 */
  reportToken?: string;
  createdAt: string;
}

export interface GradeQueryData {
  scope: GradeQueryScope;
  scopeLabel: string;
  subject: string;
  roles: TeacherRole[];
  teachingClassIds: string[];
  homeroomClassIds: string[];
  fullClassIds: string[];
  grades: string[];
  classes: GradeQueryClass[];
  exams: GradeQueryExam[];
}

export interface GradeImportRow {
  rowKey: string;
  sourceRowNumber: number;
  sourceName: string;
  sourceStudentNo: string;
  sourceClassName: string;
  subjectSelection?: string;
  classType?: string;
  scores: Record<string, number | null>;
  /** 原始表格直接提供的赋分列。 */
  assignedScores?: Record<string, number | null>;
  /** 已有学生匹配。 */
  studentId?: string;
  /** 表格姓名为学生改名后的姓名时，同步更新学生档案。 */
  updateStudentName?: boolean;
  /** 新增学生；classId 必须属于所选年级。 */
  createStudent?: {
    name: string;
    studentNo: string;
    classId: string;
  };
}

export interface GradeExamImportInput {
  cohortKey: string;
  name: string;
  examDate?: string;
  sourceFileName: string;
  sourceSheetName: string;
  subjects: string[];
  rows: GradeImportRow[];
  settings?: GradeExamSettings;
}

export type TreeNodeType = "chapter" | "knowledge";

export interface Chapter {
  id: string;
  schoolId: string;
  parentId: string | null;
  name: string;
  order: number;
  level: number;
  questionCount?: number;
}

export interface KnowledgePoint {
  id: string;
  schoolId: string;
  parentId: string | null;
  /** 旧数据可能保留该字段；知识点目录本身不依赖章节目录。 */
  chapterId?: string;
  name: string;
  description?: string;
  order: number;
  level: number;
  questionCount?: number;
}

export interface TreeNode {
  id: string;
  name: string;
  type: TreeNodeType;
  count: number;
  doneCount?: number;
  children: TreeNode[];
  expanded?: boolean;
  description?: string;
  /** 同级排序号 */
  order?: number;
  /** 父节点 ID（null 表示顶级） */
  parentId?: string | null;
  /** 兼容旧数据的章节 ID；知识点树不使用该字段建立关系。 */
  chapterId?: string;
  /** 层级深度（根=0） */
  level?: number;
}

export type BuiltInQuestionType =
  | "single"
  | "multiple"
  | "short"
  | "essay"
  | "judge"
  | "conceptFill";

/** 学校可在后台增加自定义题型；内置题型保留字面量提示。 */
export type QuestionType = BuiltInQuestionType | (string & {});

export const DEFAULT_QUESTION_TYPES = [
  { value: "single", label: "单选题" },
  { value: "multiple", label: "多选题" },
  { value: "short", label: "填空题" },
  { value: "essay", label: "解答题" },
  { value: "judge", label: "判断题" },
  { value: "conceptFill", label: "概念填空" },
] as const satisfies ReadonlyArray<{ value: BuiltInQuestionType; label: string }>;

export type ResourceSemester = "上学期" | "下学期" | "寒假" | "暑假";

export interface QuestionRemark {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionLink {
  id: string;
  name: string;
  url: string;
}

export interface QuestionVideoReference {
  materialId: string;
  title: string;
  fileUrl?: string;
  content?: string;
}

export interface QuestionAdaptationInput {
  stem: string;
  answer: string;
  analysis: string;
  summary: string;
}

export interface Question {
  id: string;
  teacherId: string;
  schoolId: string;
  type: QuestionType;
  stem: string;
  options?: string[];
  answer: string;
  analysis: string;
  summary?: string;
  /** 板书内容；课堂手写板书保存后为图片文件地址，也可保存为文本。 */
  board?: string;
  /** 课堂板书中各书写区保存的截图，按书写区顺序排列。 */
  boardImages?: string[];
  /** 课堂中可直接调用的相关链接。 */
  links?: QuestionLink[];
  /** 关联到素材库中的讲解视频。 */
  explanationVideo?: QuestionVideoReference | null;
  chapterIds: string[];
  knowledgePointIds: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  recommendation: 1 | 2 | 3 | 4 | 5;
  usageCount: number;
  lastUsedAt?: string;
  remark: string;
  remarks?: QuestionRemark[];
  /** 属性区块显示顺序：chapter=章节目录，knowledge=知识点目录，remark=备注 */
  sectionOrder?: string[];
  sourceDocId?: string;
  /** 学校“来源”设置中的值。 */
  sourceType?: string;
  /** 从平台资源创建副本时记录来源；此类副本不可再次捐赠。 */
  platformSourceDonationIds?: string[];
  /** 从校本资源另存时记录备份来源，用于阻止重复创建副本。 */
  schoolSourceBackupIds?: string[];
  grade?: string;
  schoolYear?: string;
  semester?: ResourceSemester;
  /** 学校“题类”设置中的值。 */
  category?: string;
  isShared: boolean;
  /** 查重哈希：基于题干+选项+答案计算，用于入库查重 */
  duplicateHash?: string;
  /** 被哪些已发布的考试隐藏（考试到期前题库中不展示） */
  hiddenByExamIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SimilarQuestionCandidate {
  question: Question;
  similarity: number;
}

export interface SchoolSetting {
  id: string;
  schoolId: string;
  type: "grade" | "schoolYear" | "source" | "questionType" | "category";
  name: string;
  value: string;
  sortOrder: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============ 资源库 ============

/** 试卷状态 */
export type ExamPaperStatus = "draft" | "published";

/** 试卷题目项 */
export interface ExamPaperQuestion {
  id: string;
  questionId?: string; // 关联题库中的题目（拆解后填入）
  stem: string;
  options?: string[];
  answer: string;
  analysis: string;
  score: number;
  type: QuestionType;
}

/** 拆解正稿中的有序文档块，用于保留原文标题、知识块和题目位置。 */
export interface ExtractedDocumentBlock {
  id: string;
  type:
    | "question"
    | "knowledge"
    | "documentTitle"
    | "documentInfo"
    | "groupTitle"
    | "heading"
    | "text";
  content: string;
  title?: string;
  questionType?: QuestionType;
  questionId?: string;
  materialId?: string;
  examPaperQuestionId?: string;
}

/** 试卷 */
export interface ExamPaper {
  id: string;
  teacherId: string;
  schoolId: string;
  title: string;
  description?: string;
  chapterIds: string[];
  knowledgePointIds: string[];
  grade: string;
  schoolYear: string;
  semester?: ResourceSemester;
  duration: number; // 考试时长（分钟）
  totalScore: number;
  questions: ExamPaperQuestion[];
  /** 文档拆解生成的有序正文结构。普通组卷可不设置。 */
  contentBlocks?: ExtractedDocumentBlock[];
  status: ExamPaperStatus;
  /** 试卷类型ID */
  typeId?: string;
  /** 上传文档拆解为题目时使用的来源。 */
  questionSourceType?: string;
  /** 上传文档拆解为题目时使用的题类。 */
  questionCategory?: string;
  /** 题目编排方式：按题型分组或不分题型 */
  layoutMode?: "grouped" | "flat";
  /** 使用班级 ID；文档级使用对象只精确到班级。 */
  classIds?: string[];
  /** 旧数据兼容字段；新的文档级使用对象以 classIds 为准。 */
  studentIds?: string[];
  /** 原稿文件信息（Word/PDF上传的原件） */
  originalFileUrl?: string;
  originalFileName?: string;
  originalFileType?: "word" | "pdf";
  originalFileSize?: number;
  /** 是否为拆解副本（从源文件文档拆解生成，保持原结构） */
  isExtractCopy?: boolean;
  /** 源资源ID（拆解副本关联的源试卷ID） */
  sourceResourceId?: string;
  /** 从平台资源创建副本时记录来源；此类副本不可再次捐赠。 */
  platformSourceDonationIds?: string[];
  /** 从校本资源另存时记录备份来源，用于阻止重复创建副本。 */
  schoolSourceBackupIds?: string[];
  /** 拆解状态：pending=待拆解，extracting=拆解中，done=已拆解 */
  extractStatus?: "pending" | "extracting" | "done";
  createdAt: string;
  updatedAt: string;
}

/** 课件类型 */
export type CoursewareType = "ppt" | "ggb" | "pdf" | "video" | "image" | "other";

/** 课件 */
export interface Courseware {
  id: string;
  teacherId: string;
  schoolId: string;
  title: string;
  description?: string;
  chapterIds: string[];
  knowledgePointIds: string[];
  grade: string;
  schoolYear: string;
  semester?: ResourceSemester;
  type: CoursewareType;
  content: string; // 课件内容摘要或文本内容
  fileUrl?: string; // 文件地址（如有上传）
  fileName?: string;
  fileSize?: number;
  /** PPT/PPTX 的页面数；上传时解析，旧数据可在首次推送时补齐。 */
  pageCount?: number;
  /** 可公开访问的高熵文件令牌，供外部在线预览器读取。 */
  onlineAccessToken?: string;
  /** 绑定后的在线编辑地址，例如 WPS 在线文档共享链接。 */
  editorUrl?: string;
  /** 从试卷或讲义生成的上课课件所对应的“我的上课”课件。 */
  lessonCoursewareId?: string;
  /** 生成该课件的源文档类型。 */
  sourceResourceType?: "examPaper" | "lecture";
  /** 生成该课件的源文档 ID；拆解文档指向正稿。 */
  sourceResourceId?: string;
  /** 源文档标题冗余，便于课件库直接展示原稿链接。 */
  sourceResourceTitle?: string;
  tags: string[];
  /** 从平台资源创建副本时记录来源；此类副本不可再次捐赠。 */
  platformSourceDonationIds?: string[];
  /** 从校本资源另存时记录备份来源，用于阻止重复创建副本。 */
  schoolSourceBackupIds?: string[];
  createdAt: string;
  updatedAt: string;
}

/** 素材类型 */
export type MaterialType = "text" | "image" | "audio" | "video" | "link" | "file" | "knowledgeBlock";

/** 素材 */
export interface Material {
  id: string;
  teacherId: string;
  schoolId: string;
  title: string;
  description?: string;
  chapterIds: string[];
  knowledgePointIds: string[];
  grade: string;
  schoolYear: string;
  semester?: ResourceSemester;
  type: MaterialType;
  content: string; // 素材内容
  fileUrl?: string;
  fileSize?: number;
  /** 知识块可关联素材库中的讲解视频。 */
  explanationVideo?: QuestionVideoReference | null;
  tags: string[];
  /** 查重哈希：用于知识块查重 */
  duplicateHash?: string;
  /** 源资源ID（从哪个试卷/讲义拆解而来） */
  sourceResourceId?: string;
  /** 从平台资源创建副本时记录来源；此类副本不可再次捐赠。 */
  platformSourceDonationIds?: string[];
  /** 从校本资源另存时记录备份来源，用于阻止重复创建副本。 */
  schoolSourceBackupIds?: string[];
  createdAt: string;
  updatedAt: string;
}

/** 资源库统一筛选器 */
export interface ResourceFilter {
  keyword?: string;
  chapterIds?: string[];
  chapterLogic?: FilterLogic;
  knowledgePointIds?: string[];
  knowledgeLogic?: FilterLogic;
  grade?: string;
  schoolYear?: string;
  semester?: ResourceSemester;
  teacherId?: string;
  schoolId?: string;
  /** 试卷等资源的学校配置类型 ID。 */
  typeId?: string;
  /** 按ID列表筛选 */
  ids?: string[];
}

// ============ 资源分享 ============

/** 资源类型（用于分享/发布） */
export type ShareableResourceType = "question" | "examPaper" | "lecture" | "courseware" | "material";

/** 我的资源中支持专辑整理的资源类型。 */
export type ResourceFolderType = "examPaper" | "lecture" | "courseware";

export interface ResourceFolder {
  id: string;
  teacherId: string;
  schoolId: string;
  resourceType: ResourceFolderType;
  name: string;
  resourceIds: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 捐赠到平台时保存的专辑快照。 */
export interface DonationAlbumSnapshot {
  id: string;
  name: string;
  resourceType: ResourceFolderType;
  libraryLabel: "试卷库" | "讲义库" | "课件库";
}

/** 分享目标范围 */
export type ShareScope = "school" | "friends" | "public";

/** 分享状态 */
export type ShareStatus = "pending" | "accepted" | "rejected" | "expired";

export type DonationMergeField = "stem" | "answer" | "analysis" | "summary";
export type DonationMergeChoice = "source" | "existing" | "both";

export interface DonationDirectoryEntry {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  selected: boolean;
  chapterId?: string;
  chapterPath?: string;
}

export interface DonationDirectorySnapshot {
  chapters: DonationDirectoryEntry[];
  knowledgePoints: DonationDirectoryEntry[];
}

export interface DonationRequest {
  resourceType: ShareableResourceType;
  resourceId: string;
  /** 从专辑发起捐赠时携带专辑 ID；服务端会校验并补全快照。 */
  albumId?: string;
  duplicateAction?: "add" | "merge";
  duplicateTargetDonationId?: string;
  mergeFields?: Partial<Record<DonationMergeField, DonationMergeChoice>>;
}

export interface DonationDuplicateCandidate {
  donationId: string;
  similarity: number;
  question: Question;
  contributorNickname: string;
}

export interface DonationPreview {
  resourceType: ShareableResourceType;
  resourceId: string;
  resourceTitle: string;
  alreadyDonated: boolean;
  duplicates: DonationDuplicateCandidate[];
}

export interface DonationContributor {
  teacherId: string;
  nickname: string;
  donationCount: number;
  rank: number;
  isTopContributor: boolean;
  /** 该教师实际捐赠过资源的学科。 */
  subjects: string[];
  /** 该教师担任平台资源版主的学科。 */
  moderatorSubjects: string[];
}

export interface DonationPrivileges {
  donationCount: number;
  rank: number | null;
  isTopContributor: boolean;
  canManagePlatformSettings: boolean;
  canManageAllSubjects: boolean;
  moderatedSubjects: string[];
}

export type PlatformResourceSettingType =
  | "grade"
  | "schoolYear"
  | "source"
  | "questionType"
  | "category";

export interface PlatformResourceSetting {
  id: string;
  type: PlatformResourceSettingType;
  values: string[];
  updatedAt: string;
  updatedByTeacherId?: string;
}

export interface PlatformResourceCorrectionAttachment {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
}

export type PlatformResourceCorrectionStatus = "pending" | "resolved";

/** 教师针对平台资源提交的纠错反馈。 */
export interface PlatformResourceCorrection {
  id: string;
  donationId: string;
  resourceType: ShareableResourceType;
  resourceTitle: string;
  reporterTeacherId: string;
  reporterNickname: string;
  recipientTeacherId: string;
  message?: string;
  attachments: PlatformResourceCorrectionAttachment[];
  status: PlatformResourceCorrectionStatus;
  createdAt: string;
  resolvedAt?: string;
  resolvedByTeacherId?: string;
}

export interface PlatformResourceCorrectionInput {
  donationId: string;
  message?: string;
  attachments?: PlatformResourceCorrectionAttachment[];
}

/** 资源分享记录 */
export interface ShareRecord {
  id: string;
  /** 批量分享批次 ID；用于通过一个链接聚合多个普通分享记录 */
  batchId?: string;
  fromTeacherId: string;
  fromSchoolId: string;
  /** 接收者教师ID（好友时指定，不确定对象时为空） */
  toTeacherId?: string;
  /** 接收者学校ID（校际分享时指定） */
  toSchoolId?: string;
  scope: ShareScope;
  /** 普通分享或面向平台的资源捐赠 */
  kind?: "share" | "donation";
  resourceType: ShareableResourceType;
  resourceId: string;
  /** 捐赠时原始私人资源 ID；平台资源使用独立快照，不反向修改原件 */
  sourceResourceId?: string;
  /** 资源快照（分享时的标题等元数据） */
  resourceTitle: string;
  /** 捐赠资源快照 */
  resourceSnapshot?: Question | ExamPaper | Lecture | Courseware | Material;
  /** 捐赠时同步的章节与知识点路径 */
  directorySnapshot?: DonationDirectorySnapshot;
  /** 捐赠时所属学科；平台资源按该字段隔离和管理。 */
  platformSubject?: string;
  /** 同一学科内的平台展示顺序。 */
  platformOrder?: number;
  /** 合并贡献指向的主捐赠记录；该记录只计贡献，不重复展示资源 */
  mergedIntoDonationId?: string;
  /** 专辑捐赠时保存专辑名称、来源资源库等信息。 */
  donationAlbum?: DonationAlbumSnapshot;
  /** 分享附言 */
  message?: string;
  status: ShareStatus;
  /** 接受分享后生成的新资源ID */
  acceptedResourceId?: string;
  createdAt: string;
  acceptedAt?: string;
  /** 过期时间（可选） */
  expiresAt?: string;
}

// ============ 平台资源捐赠 ============

/** 可被捐赠到平台资源库的完整资源快照。 */
export type PlatformResourceSnapshot = Question | ExamPaper | Lecture | Courseware | Material;

export interface DonationItem {
  resourceType: ShareableResourceType;
  resourceId: string;
  /** 从专辑发起捐赠时携带专辑 ID。 */
  albumId?: string;
}

export type DonationMergeFieldSource = "source" | "target" | "both";

export interface DonationDecision {
  sourceResourceId: string;
  action: "new" | "merge";
  targetDonationId?: string;
  fields: {
    stem: DonationMergeFieldSource;
    answer: DonationMergeFieldSource;
    analysis: DonationMergeFieldSource;
    summary: DonationMergeFieldSource;
  };
}

export interface PlatformDonation {
  id: string;
  donorTeacherId: string;
  donorSchoolId: string;
  donorNickname: string;
  resourceType: ShareableResourceType;
  sourceResourceId: string;
  subject: string;
  order: number;
  status: "active" | "merged";
  mergedIntoDonationId?: string;
  snapshot: PlatformResourceSnapshot;
  donationAlbum?: DonationAlbumSnapshot;
  contributorTeacherIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DonationConflict {
  item: DonationItem;
  similarity: number;
  sourceQuestion: Question;
  targetDonationId: string;
  targetQuestion: Question;
  targetDonorNickname: string;
}

export interface DonationCheckResult {
  alreadyDonated: DonationItem[];
  conflicts: DonationConflict[];
}

export interface PlatformSaveConflict {
  similarity: number;
  sourceQuestion: Question;
  targetResourceId: string;
  targetQuestion: Question;
}

export interface PlatformSaveCheckResult {
  donationId: string;
  resourceType: ShareableResourceType;
  canSave: boolean;
  reason?: string;
  alreadySaved: boolean;
  conflict?: PlatformSaveConflict;
}

export interface PlatformSaveDecision {
  action: "new" | "merge";
  targetResourceId?: string;
  fields: {
    stem: DonationMergeFieldSource;
    answer: DonationMergeFieldSource;
    analysis: DonationMergeFieldSource;
    summary: DonationMergeFieldSource;
  };
}

export interface PlatformSaveResult {
  resourceType: ShareableResourceType;
  resourceId: string;
  merged: boolean;
}

export interface DonorStatus {
  donationCount: number;
  rank: number | null;
  isTopTen: boolean;
}

export type PlatformAttributeOptionType =
  | "grade"
  | "schoolYear"
  | "questionType"
  | "coursewareType"
  | "materialType";

export interface PlatformAttributeOption {
  id: string;
  type: PlatformAttributeOptionType;
  values: string[];
  updatedByTeacherId: string;
  createdAt: string;
  updatedAt: string;
}

// ============ 试卷发布（校际统一考试） ============

/** 试卷发布范围 */
export type ExamPublishTarget = "schoolClass" | "otherSchool";

/** 试卷发布记录 */
export interface ExamPublication {
  id: string;
  examPaperId: string;
  publisherId: string;
  publisherSchoolId: string;
  title: string;
  /** 发布目标类型 */
  targetType: ExamPublishTarget;
  /** 目标班级ID列表（targetType=schoolClass时） */
  targetClassIds: string[];
  /** 直接发布到的学生 ID 列表 */
  targetStudentIds?: string[];
  /** 目标学校ID列表（targetType=otherSchool时） */
  targetSchoolIds: string[];
  /** 是否为正规考试（正规考试支持密码保护和到期日期） */
  isFormalExam: boolean;
  /** 查看密码（正规考试可设置） */
  viewPassword?: string;
  /** 服务端返回值：正式考试是否已设置查看密码。 */
  hasViewPassword?: boolean;
  /** 到期日期（此日期前其他老师无法查看试卷内容和题目） */
  unlockAt?: string;
  /** 关联的题目ID列表（发布时这些题目会被隐藏） */
  questionIds: string[];
  status: "active" | "expired" | "revoked";
  createdAt: string;
  updatedAt: string;
}

// ============ 资源分类（未分类支持） ============

/** 资源可见范围 */
export type ResourceVisibility = "private" | "school" | "platform";

/** 扩展资源基础字段：支持未分类和可见范围 */
export interface ResourceBase {
  /** 是否未分类（未关联任何章节/知识点） */
  uncategorized?: boolean;
  /** 可见范围 */
  visibility?: ResourceVisibility;
}

export type FilterLogic = "or" | "and";
export type QuestionSearchField = "stem" | "analysis" | "summary" | "remark";

export interface QuestionFilter {
  keyword?: string;
  /** 关键词搜索范围；未设置或为空时搜索全部支持字段 */
  searchFields?: QuestionSearchField[];
  chapterIds?: string[];
  chapterLogic?: FilterLogic;
  knowledgePointIds?: string[];
  knowledgeLogic?: FilterLogic;
  noChapter?: boolean;
  noKnowledge?: boolean;
  difficulty?: number[];
  recommendation?: number[];
  type?: QuestionType[];
  teacherId?: string;
  schoolId?: string;
  grade?: string;
  schoolYear?: string;
  semester?: ResourceSemester;
  sourceType?: string[];
  category?: string[];
  excludeQuestionIds?: string[];
  /** 按ID列表筛选 */
  ids?: string[];
}

export type LectureSectionType = "chapter" | "knowledge" | "question" | "text";

export interface LectureSection {
  id: string;
  title: string;
  type: LectureSectionType;
  content: string;
  questionId?: string;
  children: LectureSection[];
  /** 个性化编号标签（如"例1""变式2"），为空时使用默认序号 */
  customLabel?: string;
  /** 拆解正稿只展示题干，答案、解析和选项仍保留在题库中。 */
  displayMode?: "stem-only";
}

export interface LectureColumnTemplateItem {
  title: string;
  content: string;
}

/** 教师保存的讲义栏目模板，可在不同讲义间复用。 */
export interface LectureColumnTemplate {
  id: string;
  teacherId: string;
  schoolId: string;
  name: string;
  description?: string;
  columns: LectureColumnTemplateItem[];
  createdAt: string;
  updatedAt: string;
}

export type LectureStatus = "draft" | "published";

export interface Lecture {
  id: string;
  teacherId: string;
  schoolId: string;
  title: string;
  description?: string;
  chapterIds: string[];
  knowledgePointIds: string[];
  grade: string;
  schoolYear: string;
  semester?: ResourceSemester;
  classIds: string[];
  studentIds: string[];
  sections: LectureSection[];
  /** 文档拆解生成的有序正文结构，供正稿预览和上课课件生成使用。 */
  contentBlocks?: ExtractedDocumentBlock[];
  version: number;
  status: LectureStatus;
  /** 讲义类型ID */
  typeId?: string;
  /** 上传文档拆解为题目时使用的来源。 */
  questionSourceType?: string;
  /** 上传文档拆解为题目时使用的题类。 */
  questionCategory?: string;
  /** 原稿文件信息（Word/PDF上传的原件） */
  originalFileUrl?: string;
  originalFileName?: string;
  originalFileType?: "word" | "pdf";
  originalFileSize?: number;
  /** 是否为拆解副本（从源文件文档拆解生成，保持原结构） */
  isExtractCopy?: boolean;
  /** 源资源ID（拆解副本关联的源讲义ID） */
  sourceResourceId?: string;
  /** 从平台资源创建副本时记录来源；此类副本不可再次捐赠。 */
  platformSourceDonationIds?: string[];
  /** 从校本资源另存时记录备份来源，用于阻止重复创建副本。 */
  schoolSourceBackupIds?: string[];
  /** 拆解状态：pending=待拆解，extracting=拆解中，done=已拆解 */
  extractStatus?: "pending" | "extracting" | "done";
  /** 版本类型：
   * - origin: 原稿（未拆解的上传文件）
   * - extract: 正稿/解析稿（文档拆解后可编辑的版本）
   * - preview: 预览稿（排版后的版本）
   * - answer-sheet: 答题卡版
   */
  versionType?: "origin" | "extract" | "preview" | "answer-sheet";
  /** 是否有原稿（用于判断是否显示原稿入口） */
  hasOrigin?: boolean;
  /** 是否有预览稿 */
  hasPreview?: boolean;
  /** 是否有答题卡 */
  hasAnswerSheet?: boolean;
  /** 排版设置 */
  layoutSettings?: {
    paperSize: "A4" | "8K";
    showSummary: boolean;
    questionSpacing: number;
    knowledgeSpacing: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface LectureFilter {
  keyword?: string;
  chapterIds?: string[];
  chapterLogic?: FilterLogic;
  knowledgePointIds?: string[];
  knowledgeLogic?: FilterLogic;
  grade?: string;
  schoolYear?: string;
  semester?: ResourceSemester;
  status?: LectureStatus;
  teacherId?: string;
  schoolId?: string;
  typeId?: string;
}

export interface Basket {
  id: string;
  teacherId: string;
  name: string;
  description?: string;
  questionIds: string[];
  /** 素材ID列表 */
  materialIds: string[];
  /** 整班使用对象 */
  classIds?: string[];
  /** 额外指定的学生使用对象 */
  studentIds?: string[];
  /** 是否为默认试题篮 */
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type DocumentFileType = "word" | "pdf" | "markdown";
export type DocumentStatus = "uploaded" | "recognizing" | "recognized" | "confirmed";

export interface DocumentSection {
  id: string;
  title: string;
  content: string;
  level: number;
  children: DocumentSection[];
}

export interface DocumentRecord {
  id: string;
  teacherId: string;
  schoolId: string;
  fileId?: string;
  fileUrl?: string;
  fileName: string;
  fileType: DocumentFileType;
  fileSize: number;
  sections: DocumentSection[];
  status: DocumentStatus;
  createdAt: string;
}

export type RecognitionStatus = "pending" | "confirmed" | "rejected";

export interface WebAnnotationStats {
  totalSources: number;
  topChapters: { chapter: string; count: number }[];
  topKnowledgePoints: { point: string; count: number }[];
}

export interface RecognitionResult {
  id: string;
  documentId: string;
  sectionId?: string;
  question: Omit<Question, "id" | "teacherId" | "schoolId" | "createdAt" | "updatedAt">;
  confidence: number;
  webAnnotations: WebAnnotationStats;
  status: RecognitionStatus;
  feedback?: string;
}

export type AnswerScore = "correct" | "partial" | "wrong" | "done";

/** 答题记录来源：manual=手动录入，scanner=扫描仪识别（预留），import=批量导入 */
export type AnswerSource = "manual" | "scanner" | "import";

export interface AnswerRecord {
  id: string;
  studentId: string;
  questionId: string;
  lectureId: string;
  isCorrect: boolean;
  /** 得分情况：全对 / 半对 / 做错（兼容旧数据，未设置时根据 isCorrect 推断） */
  score?: AnswerScore;
  /** 答题记录来源（预留扫描仪等未来扩展） */
  source?: AnswerSource;
  answeredAt: string;
}

// ============ AI 拆解类型 ============

export type DuplicateQuestionFieldChoice = "existing" | "incoming" | "both";

export interface DuplicateQuestionMergeFields {
  stem: Exclude<DuplicateQuestionFieldChoice, "both">;
  answer: DuplicateQuestionFieldChoice;
  analysis: DuplicateQuestionFieldChoice;
  summary: DuplicateQuestionFieldChoice;
}

/** 拆解出的题目项（用于审阅确认） */
export interface ExtractedQuestionItem {
  id: string;
  type: QuestionType;
  stem: string;
  options?: string[];
  answer: string;
  analysis: string;
  summary?: string;
  difficulty: number;
  status: "new" | "duplicate" | "confirmed" | "edited";
  duplicateOf?: Question;
  duplicateAction?: "merge" | "add";
  duplicateTargetId?: string;
  duplicateFields?: DuplicateQuestionMergeFields;
  createdQuestion?: Question;
}

/** 拆解出的知识块项（用于审阅确认） */
export interface ExtractedKnowledgeItem {
  id: string;
  title: string;
  content: string;
  status: "new" | "duplicate" | "confirmed" | "edited";
  duplicateOf?: Material;
  createdMaterial?: Material;
}

/** AI 拆解结果 */
export interface ExtractResult {
  questions: ExtractedQuestionItem[];
  knowledgeBlocks: ExtractedKnowledgeItem[];
}

// ============ UI 类型 ============

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

export interface ModalConfig {
  open: boolean;
  title?: string;
  description?: string;
}

// ============ 在线资源类型 ============

/** 在线资源类型 */
export type OnlineResourceType = "paper" | "lecture" | "exercise";

/** 在线资源状态 */
export type OnlineResourceStatus = "pending" | "parsing" | "parsed" | "imported" | "failed";

/** 在线试卷/讲义资源（来自网络搜索） */
export interface OnlineResource {
  id: string;
  title: string;
  type: OnlineResourceType;
  source: string;
  sourceUrl: string;
  subject: string;
  grade: string;
  year: string;
  region: string;
  description: string;
  /** 试卷包含的题目数量（解析后） */
  questionCount: number;
  /** 热度（搜索排名/下载量） */
  hotness: number;
  /** 发布时间 */
  publishedAt: string;
  /** 解析状态 */
  status: OnlineResourceStatus;
  /** AI 解析后的题目预览 */
  parsedQuestions?: OnlineParsedQuestion[];
  /** 标签 */
  tags: string[];
}

/** 在线资源解析后的题目 */
export interface OnlineParsedQuestion {
  id: string;
  resourceId: string;
  type: QuestionType;
  stem: string;
  options?: string[];
  answer: string;
  analysis: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  chapterNames: string[];
  knowledgePointNames: string[];
  confidence: number;
  selected: boolean;
}

/** 在线资源搜索参数 */
export interface OnlineResourceSearchParams {
  keyword?: string;
  subject?: string;
  grade?: string;
  year?: string;
  region?: string;
  type?: OnlineResourceType;
}

// ============ 集体备课任务类型 ============

/** 备课任务流程类型 */
export type PrepTaskType =
  | "paper"
  | "lecture"
  | "exercise"
  | "review"
  | "literatureReview"
  | "examAnalysis"
  | "research"
  | "gradeAnalysis";

/** 任务状态 */
export type PrepTaskStatus = "created" | "in_progress" | "completed" | "cancelled";

/** 任务分配状态 */
export type AssignmentStatus = "pending" | "accepted" | "in_progress" | "completed" | "rejected";

/** 集体备课任务成果类型 */
export type PrepSubmissionKind = "document" | "resource" | "images";

/** 可关联的“我的资源”类型 */
export type PrepSubmissionResourceType = "lecture" | "examPaper";

/** 上传成果中的单个文件 */
export interface PrepSubmissionAsset {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
}

/** 批注点坐标使用相对预览容器的 0-1 比例。 */
export interface PrepAnnotationPoint {
  x: number;
  y: number;
}

/** 集体备课成果批注笔迹 */
export interface PrepAnnotationStroke {
  id: string;
  targetId: string;
  tool: "pen" | "highlighter";
  color: "black" | "red" | "blue" | "yellow" | "green";
  points: PrepAnnotationPoint[];
  createdBy: string;
  createdAt: string;
}

/** 集体备课直接协作编辑的资源。 */
export interface PrepLinkedResource {
  type: PrepSubmissionResourceType;
  id: string;
  title: string;
}

/** 试卷题目、正文块或讲义栏目旁的文字批注。 */
export interface PrepResourceComment {
  id: string;
  targetId: string;
  content: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** 从试卷库或讲义库创建协作任务时提交的参数。 */
export interface PrepResourceTaskInput {
  resourceType: PrepSubmissionResourceType;
  resourceId: string;
  collaboratorIds: string[];
  password?: string;
  passwordExpiresAt?: string;
}

/** 已提交的任务成果。资源关联会保存标题、原稿地址和文本快照，避免源资源后续变更影响看板。 */
export interface PrepSubmission {
  id: string;
  kind: PrepSubmissionKind;
  title: string;
  submittedBy: string;
  submittedAt: string;
  updatedAt: string;
  assets: PrepSubmissionAsset[];
  resourceType?: PrepSubmissionResourceType;
  resourceId?: string;
  resourceTitle?: string;
  resourceFileUrl?: string;
  resourceFileName?: string;
  resourcePreviewText?: string;
  annotations: PrepAnnotationStroke[];
}

/** 提交成果时由前端传给服务端的输入。 */
export type PrepSubmissionInput =
  | {
      kind: "document";
      assets: PrepSubmissionAsset[];
    }
  | {
      kind: "images";
      assets: PrepSubmissionAsset[];
    }
  | {
      kind: "resource";
      resourceType: PrepSubmissionResourceType;
      resourceId: string;
    };

/** 备课流程节点 */
export interface PrepWorkflow {
  id: string;
  type: PrepTaskType;
  name: string;
  description?: string;
  order: number;
  status: PrepTaskStatus;
  assigneeIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** 备课任务分配 */
export interface PrepAssignment {
  id: string;
  taskId: string;
  workflowId: string;
  teacherId: string;
  status: AssignmentStatus;
  submission?: PrepSubmission;
  createdAt: string;
  updatedAt: string;
}

/** 备课任务 */
export interface PrepTask {
  id: string;
  schoolId: string;
  subjectGroupId: string;
  prepGroupId?: string;
  title: string;
  description?: string;
  grade: string;
  subject: string;
  workflows: PrepWorkflow[];
  assignments: PrepAssignment[];
  status: PrepTaskStatus;
  createdBy: string;
  /** 由试卷库或讲义库直接发起的协作任务。 */
  linkedResource?: PrepLinkedResource;
  /** 仅用于前端展示，真实密码哈希由 RPC 层过滤。 */
  accessProtected?: boolean;
  passwordExpiresAt?: string;
  resourceComments?: PrepResourceComment[];
  /** 服务端持久化字段；RPC 响应会移除。 */
  viewPasswordHash?: string;
  createdAt: string;
  updatedAt: string;
}

/** 题目引用记录（用于查重和合并） */
export interface QuestionReference {
  id: string;
  questionId: string;
  teacherId: string;
  sourceTaskId?: string;
  sourceType: "personal" | "prep" | "subject";
  usedInStudentIds: string[];
  usageCount: number;
  markedAsUsed: boolean;
}

// ============ 上课课件 ============

/** 课件页类型 */
export type LessonSlideType = "question" | "knowledge" | "section" | "courseware";

/** 从尚未入库的原始文档直接生成上课页面时使用的有序内容块。 */
export interface LessonDocumentBlock {
  id: string;
  type: "documentTitle" | "documentInfo" | "knowledge" | "groupTitle" | "question";
  title?: string;
  content: string;
  questionType?: QuestionType;
  options?: string[];
  answer?: string;
  analysis?: string;
}

/** 课件元素入场动画 */
export type LessonElementAnimation = "none" | "fade" | "rise" | "zoom";

/** 课件元素强调动画 */
export type LessonElementActionAnimation = "none" | "pulse" | "sway" | "spin";

/** 课件元素退场动画 */
export type LessonElementExitAnimation = "none" | "fade" | "shrink" | "drop";

/** 课件内置文本区域。 */
export type LessonSlideTextRegion = "title" | "content" | "stem" | "options";

/** 题目页中可在上课时按需显示的内容区域。 */
export type LessonQuestionContentSection = "stem" | "options" | "answer" | "analysis" | "supplementary";

interface LessonSlideElementBase {
  id: string;
  /** 坐标和尺寸均使用相对课件画布的百分比，便于不同屏幕等比展示。 */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 兼容旧课件的入场动画字段。 */
  animation?: LessonElementAnimation;
  enterAnimation?: LessonElementAnimation;
  actionAnimation?: LessonElementActionAnimation;
  exitAnimation?: LessonElementExitAnimation;
  animationOrder?: number;
  /** 从题目内容抽取出的元素所属区域；手工添加的元素不设置该字段。 */
  questionSection?: LessonQuestionContentSection;
}

export interface LessonSlideTextElement extends LessonSlideElementBase {
  kind: "text";
  content: string;
  fontSize?: number;
  textAlign?: "left" | "center" | "right";
  href?: string;
}

export interface LessonSlideImageElement extends LessonSlideElementBase {
  kind: "image";
  src: string;
  alt?: string;
}

/** 可在课件画布中自由移动、缩放的元素。 */
export type LessonSlideElement = LessonSlideTextElement | LessonSlideImageElement;

/** 课件页 - 每一页内容 */
export interface LessonSlide {
  id: string;
  type: LessonSlideType;
  title: string;
  /** 使用自由画布布局时，页面正文完全由 elements 渲染。 */
  freeformLayout?: boolean;
  /** 题目ID（type=question时） */
  questionId?: string;
  /** 题目快照（保存时的题目内容，防止后续题目修改影响课件） */
  questionSnapshot?: {
    stem: string;
    type: QuestionType;
    options?: string[];
    answer: string;
    analysis: string;
    summary?: string;
    board?: string;
    boardImages?: string[];
    links?: QuestionLink[];
    explanationVideo?: QuestionVideoReference | null;
  };
  /** 知识块内容（type=knowledge时） */
  content?: string;
  /** 相关题ID列表 */
  relatedQuestionIds?: string[];
  /** 可提问的学生ID列表 */
  askableStudentIds?: string[];
  /** 备注 */
  note?: string;
  /** 外部课件信息（type=courseware 时） */
  coursewareType?: CoursewareType;
  fileUrl?: string;
  fileName?: string;
  onlineAccessToken?: string;
  editorUrl?: string;
  /** 从 PPT 拆页生成的原始页码（从 1 开始）。 */
  pptSlideNumber?: number;
  /** 该页应交由本机 WPS 打开，而不是在网页中嵌入。 */
  openInWps?: boolean;
  /** 页面上额外添加的文本框、题图等自由布局元素。 */
  elements?: LessonSlideElement[];
  /** 内置标题、正文、题干和选项的展示样式。 */
  textStyles?: Partial<Record<LessonSlideTextRegion, { fontSize?: number }>>;
}

/** 课件来源类型 */
export type LessonSourceType = "examPaper" | "lecture" | "courseware" | "manual";

/** 上课课件在“我的上课”中的生命周期状态。 */
export type LessonCoursewareLifecycleStatus = "active" | "completed" | "trashed";

/** 周课表中的星期，1 表示星期一，7 表示星期日。 */
export type TeacherLessonScheduleDay = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** 周课表的周次范围；工作日使用 all，周末按单双周分别维护。 */
export type TeacherLessonScheduleWeekParity = "all" | "odd" | "even";

/**
 * 周课表时段编码。
 * -2/-1 分别表示早早读、早读，0 表示午间练；
 * 1—8 表示正常课时，9—12 表示晚一至晚四。
 */
export type TeacherLessonSchedulePeriod =
  | -2 | -1 | 0
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  | 9 | 10 | 11 | 12;

/** 教师周课表中的一个上课时段。 */
export interface TeacherLessonScheduleEntry {
  day: TeacherLessonScheduleDay;
  period: TeacherLessonSchedulePeriod;
  /** 工作日固定为 all；周六、周日分别使用 odd/even。旧数据缺失时按工作日 all 兼容。 */
  weekParity?: TeacherLessonScheduleWeekParity;
  classId: string;
}

/** 教师课表中一个时段的起止时间。 */
export interface TeacherLessonScheduleTimeRange {
  period: TeacherLessonSchedulePeriod;
  /** 24 小时制 HH:mm。 */
  startTime: string;
  /** 24 小时制 HH:mm。 */
  endTime: string;
}

/** 教师个人周课表。 */
export interface TeacherLessonSchedule {
  entries: TeacherLessonScheduleEntry[];
  /** 旧课表可能缺失，读取时会补齐默认作息。 */
  timeRanges?: TeacherLessonScheduleTimeRange[];
  updatedAt?: string;
}

/** 上课课件 */
export interface LessonCourseware {
  id: string;
  teacherId: string;
  schoolId: string;
  title: string;
  description?: string;
  chapterIds: string[];
  knowledgePointIds: string[];
  grade: string;
  schoolYear: string;
  semester?: ResourceSemester;
  /** 课件来源 */
  sourceType: LessonSourceType;
  /** 来源资源ID */
  sourceId?: string;
  /** 来源资源标题（冗余） */
  sourceTitle?: string;
  /** 同步保存在课件库中的资源 ID。 */
  libraryCoursewareId?: string;
  /** 课件库 PPT 的导入方式。 */
  coursewareMode?: "editable" | "direct";
  /** 课件页面列表 */
  slides: LessonSlide[];
  /** 班级ID */
  classIds: string[];
  /** 发布时展示的学科与教师信息 */
  subject?: string;
  teacherName?: string;
  /** 发布状态 */
  status: "draft" | "published";
  /** 列表生命周期；旧数据未设置时按 active 处理。 */
  lifecycleStatus?: LessonCoursewareLifecycleStatus;
  /** 发布时间 */
  publishedAt?: string;
  /** 标记“已上完”的时间。 */
  completedAt?: string | null;
  /** 移入课件回收站的时间。 */
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 课件筛选条件 */
export interface LessonCoursewareFilter {
  keyword?: string;
  grade?: string;
  schoolYear?: string;
  semester?: ResourceSemester;
  sourceType?: LessonSourceType;
  sourceId?: string;
  chapterIds?: string[];
  knowledgePointIds?: string[];
  status?: "draft" | "published";
  lifecycleStatus?: LessonCoursewareLifecycleStatus;
  classId?: string;
  teacherId?: string;
  schoolId?: string;
}

// ============ 班级作业 ============

/** 班级作业中附带的图片或文档。 */
export interface ClassroomHomeworkAttachment {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
}

/** 教师发布到“我要上课”教室屏的作业。 */
export interface ClassroomHomework {
  id: string;
  teacherId: string;
  teacherName: string;
  schoolId: string;
  subject: string;
  content: string;
  attachments?: ClassroomHomeworkAttachment[];
  classIds: string[];
  /** 作业归属日期，格式为 YYYY-MM-DD。 */
  assignedDate: string;
  /** 到达该时间后才会在教室屏显示。 */
  publishAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClassroomHomeworkFilter {
  schoolId?: string;
  teacherId?: string;
  classId?: string;
  assignedDate?: string;
  /** 为 true 时仅返回已经到达发布时间的作业。 */
  publishedOnly?: boolean;
}

// ============ 教室通知 ============

/** 教师发布到“我要上课”页面顶部的滚动通知。 */
export interface ClassroomNotice {
  id: string;
  teacherId: string;
  teacherName: string;
  schoolId: string;
  content: string;
  classIds: string[];
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClassroomNoticeFilter {
  schoolId?: string;
  teacherId?: string;
  classId?: string;
  /** 为 true 时仅返回当前处于起止时间范围内的通知。 */
  activeOnly?: boolean;
}

// ============ 消息中心 ============

export type AppNotificationType = "system" | "admin" | "approval" | "reward";

/** 面向单个教师账号的持久化站内消息。 */
export interface AppNotification {
  id: string;
  recipientTeacherId: string;
  type: AppNotificationType;
  title: string;
  content: string;
  actionUrl?: string;
  createdAt: string;
  readAt: string | null;
}

// ============ 课后反思 ============

/** 反思关联的资源类型 */
export type ReflectionTargetType = "lessonCourseware" | "examPaper" | "lecture" | "courseware";

/** 课后反思 */
export interface Reflection {
  id: string;
  teacherId: string;
  schoolId: string;
  /** 关联的课件ID */
  lessonCoursewareId: string;
  /** 关联的源资源ID（试卷/讲义/课件） */
  targetId: string;
  /** 关联的源资源类型 */
  targetType: ReflectionTargetType;
  /** 反思内容 */
  content: string;
  /** 课堂效果评分（1-5） */
  rating?: number;
  createdAt: string;
  updatedAt: string;
}

/** 学生互动记录类型 */
export type InteractionType = "chat" | "attitude" | "status";

/** 学生互动记录 */
export interface StudentInteraction {
  id: string;
  teacherId: string;
  schoolId: string;
  studentId: string;
  /** 记录类型 */
  type: InteractionType;
  /** 内容 */
  content: string;
  /** 学习态度评分（1-5），type=attitude 时使用 */
  attitude?: number;
  /** 学习状态标签 */
  statusTag?: string;
  /** 是否匿名分享给该学生所在班级的班主任。旧记录默认不分享。 */
  sharedWithHomeroom?: boolean;
  createdAt: string;
}

/** 师生互动页面使用的可见记录；匿名分享不会暴露来源教师 ID。 */
export interface StudentInteractionView extends Omit<StudentInteraction, "teacherId"> {
  teacherId?: string;
  isAnonymous: boolean;
  canDelete: boolean;
}

// ============ 校本资源备份 ============

/** 校本资源备份类型 */
export type SchoolBackupResourceType =
  | "question"
  | "examPaper"
  | "lecture"
  | "courseware"
  | "material";

/**
 * 校本资源备份记录
 *
 * 当教师将资源（试卷/讲义/课件等）发布或分享给非自己所教班级时，
 * 系统自动在校本资源库中创建一份快照备份。
 * 备份是只读的，仅备课组长（prepLeader）及以上权限可修改其属性（章节/知识点/年级等）。
 */
export interface SchoolResourceBackup {
  id: string;
  /** 学校ID */
  schoolId: string;
  /** 资源类型 */
  resourceType: SchoolBackupResourceType;
  /** 源资源ID（原始资源的 ID） */
  sourceResourceId: string;
  /** 源资源标题/题干 */
  title: string;
  /** 源资源描述 */
  description?: string;
  /** 资源内容快照（题目内容、讲义 sections 序列化、课件文本等） */
  contentSnapshot: string;
  /** 原始提供教师ID */
  fromTeacherId: string;
  /** 触发备份的发布/分享场景描述 */
  backupReason: string;
  /** 发布到的班级ID列表（用于追溯） */
  targetClassIds: string[];
  /** 发布到的学生ID列表（用于追溯） */
  targetStudentIds?: string[];
  /** 关联的章节ID */
  chapterIds: string[];
  /** 关联的知识点ID */
  knowledgePointIds: string[];
  /** 年级 */
  grade?: string;
  /** 学年 */
  schoolYear?: string;
  /** 学期 */
  semester?: ResourceSemester;
  /** 元数据（题型/总分/时长等） */
  meta: Record<string, string>;
  /** 题目查重哈希（仅题目备份使用） */
  duplicateHash?: string;
  /** 备份时间 */
  createdAt: string;
  /** 最后更新时间（备课组长修改属性时更新） */
  updatedAt: string;
}
