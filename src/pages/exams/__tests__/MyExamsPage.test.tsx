import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyExamsPage from "@/pages/exams/MyExamsPage";
import { examArrangementService } from "@/services/examArrangement";
import { gradeService } from "@/services/grade";
import { quotaService } from "@/services/quota";
import { useAuthStore } from "@/stores/auth";
import type { ExamArrangement, GradeCohort, Teacher, TeacherAffiliation } from "@/types";

vi.mock("@/services/examArrangement", () => ({
  examArrangementService: {
    listArrangements: vi.fn(),
    getContext: vi.fn(),
    getInvigilationProfile: vi.fn(),
    saveInvigilationConfig: vi.fn(),
  },
}));

vi.mock("@/services/grade", () => ({
  gradeService: {
    listCohorts: vi.fn(),
    getImportContext: vi.fn(),
    getCohortSettings: vi.fn(),
    listExams: vi.fn(),
  },
}));

vi.mock("@/services/quota", () => ({
  quotaService: {
    getQuota: vi.fn(),
  },
}));

vi.mock("@/pages/students/GradeSettingsEditor", () => ({
  GradeSettingsEditor: ({ section }: { section?: string }) => (
    <div data-testid="grade-settings-editor" data-section={section} />
  ),
}));

const affiliation: TeacherAffiliation = {
  id: "affiliation-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  schoolName: "测试学校",
  subject: "数学",
  role: "teacher",
  roles: ["gradeLeader"],
  subjectGroupIds: [],
  prepGroupIds: [],
  status: "active",
  isCurrent: true,
  joinedAt: "2026-08-01T00:00:00.000Z",
};

const cohort: GradeCohort = {
  key: "grad-2026",
  label: "2026届高三",
  grade: "高三",
  gradYear: 2026,
  classIds: ["class-1"],
  studentCount: 40,
};

describe("MyExamsPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      teacher: {
        id: "teacher-1",
        name: "测试教师",
        schoolId: "school-1",
        subject: "数学",
        role: "teacher",
        roles: ["gradeLeader"],
      } as Teacher,
      loading: false,
      error: null,
      getCurrentAffiliation: () => affiliation,
    });
    vi.mocked(gradeService.listCohorts).mockResolvedValue([cohort]);
    vi.mocked(gradeService.getImportContext).mockResolvedValue({
      cohort,
      classes: [],
      students: [],
      teachers: [],
    });
    vi.mocked(gradeService.getCohortSettings).mockResolvedValue(null);
    vi.mocked(gradeService.listExams).mockResolvedValue([]);
    vi.mocked(examArrangementService.listArrangements).mockResolvedValue([]);
    vi.mocked(examArrangementService.getInvigilationProfile).mockResolvedValue(null);
    vi.mocked(examArrangementService.getContext).mockResolvedValue({
      cohort,
      classes: [],
      students: [],
      teachers: [],
    });
    vi.mocked(quotaService.getQuota).mockResolvedValue({
      teacherId: "teacher-1",
      resources: {
        question: { key: "question", used: 0, baseCapacity: 10_000, effectiveDonations: 0, donationBonus: 0, capacity: 10_000, remaining: 10_000 },
        examPaper: { key: "examPaper", used: 0, baseCapacity: 1_000, effectiveDonations: 0, donationBonus: 0, capacity: 1_000, remaining: 1_000 },
        lecture: { key: "lecture", used: 0, baseCapacity: 1_000, effectiveDonations: 0, donationBonus: 0, capacity: 1_000, remaining: 1_000 },
        courseware: { key: "courseware", used: 0, baseCapacity: 1_000, effectiveDonations: 0, donationBonus: 0, capacity: 1_000, remaining: 1_000 },
        material: { key: "material", used: 0, baseCapacity: 1_000, effectiveDonations: 0, donationBonus: 0, capacity: 1_000, remaining: 1_000 },
      },
      exam: {
        examRoom: { key: "examRoom", remaining: 50 },
        invigilation: { key: "invigilation", remaining: 50 },
        gradeStatistics: { key: "gradeStatistics", remaining: 50 },
      },
    });
  });

  it("shows only configurations 1-3 in grade statistics", async () => {
    render(
      <MemoryRouter initialEntries={["/my-exams/grades"]}>
        <MyExamsPage section="grades" />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("grade-settings-editor")).toHaveAttribute("data-section", "settings");
  });

  it("shows the invigilation tab between room setup and grade statistics", async () => {
    render(
      <MemoryRouter initialEntries={["/my-exams/invigilation"]}>
        <MyExamsPage section="invigilation" />
      </MemoryRouter>,
    );

    expect(await screen.findByText("暂无监考表")).toBeInTheDocument();
    const tabLinks = screen.getAllByRole("link").slice(0, 3);
    expect(tabLinks.map((link) => link.textContent?.trim())).toEqual([
      "考场布置剩余 50 次",
      "监考表剩余 50 次",
      "成绩统计剩余 50 次",
    ]);
    expect(screen.queryByText("成绩处理")).not.toBeInTheDocument();
  });

  it("builds a print-room statistics table from a saved room arrangement", async () => {
    const observers: Array<{ callback: IntersectionObserverCallback; targets: Element[] }> = [];
    class MockPointerEvent extends MouseEvent {
      readonly pointerId: number;
      constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    }
    class MockIntersectionObserver {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds = [0.08];
      readonly callback: IntersectionObserverCallback;
      readonly targets: Element[] = [];
      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
        observers.push(this);
      }
      disconnect() {}
      observe(target: Element) { this.targets.push(target); }
      takeRecords(): IntersectionObserverEntry[] { return []; }
      unobserve() {}
    }
    vi.stubGlobal("PointerEvent", MockPointerEvent);
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    const savedArrangement: ExamArrangement = {
      id: "arrangement-1",
      schoolId: "school-1",
      teacherId: "teacher-1",
      cohortKey: cohort.key,
      cohortLabel: cohort.label,
      name: "高三期中考试",
      examDate: "2026-10-20",
      mode: "combination",
      subjectSetupMode: "selection",
      subjects: ["语文", "数学", "英语", "物理", "化学", "生物"],
      separateSubjects: [],
      rooms: [
        { id: "room-1", name: "1考场", number: "1考场", location: "高三1班教室", capacity: 40 },
        { id: "room-2", name: "2考场", number: "2考场", location: "高三1班教室", capacity: 40 },
      ],
      classRules: [],
      studentSubjects: [
        { studentId: "student-1", subjects: ["语文", "数学", "英语", "物理", "化学", "生物"] },
        { studentId: "student-2", subjects: ["语文", "数学", "英语", "物理", "化学", "生物"] },
      ],
      assignments: [{
        id: "combined:student-1",
        studentId: "student-1",
        studentName: "学生甲",
        studentNo: "001",
        classId: "class-1",
        className: "高三（1）班",
        subjectLabel: "语文 / 数学 / 英语 / 物理 / 化学 / 生物",
        sessionKey: "combined",
        roomId: "room-1",
        roomName: "1考场",
        roomNumber: "1考场",
        roomLocation: "高三1班教室",
        seatNo: 1,
        admissionNo: "20261020010001",
      }, {
        id: "combined:student-2",
        studentId: "student-2",
        studentName: "学生乙",
        studentNo: "002",
        classId: "class-1",
        className: "高三（1）班",
        subjectLabel: "语文 / 数学 / 英语 / 物理 / 化学 / 生物",
        sessionKey: "combined",
        roomId: "room-2",
        roomName: "2考场",
        roomNumber: "2考场",
        roomLocation: "高三1班教室",
        seatNo: 1,
        admissionNo: "20261020020001",
      }],
      invigilation: {
        teachers: [
          { id: "teacher-chinese-1", name: "语文教师甲", subject: "语文" },
          { id: "teacher-chinese-2", name: "语文教师乙", subject: "语文" },
          { id: "teacher-leader", name: "年级领导", subject: "数学", isLeader: true },
        ],
        subjectTimes: [{
          subject: "语文",
          date: "2026-10-20",
          period: "evening",
          time: "18:30",
          durationMinutes: 120,
        }, {
          subject: "数学",
          date: "2026-10-20",
          period: "evening",
          time: "20:40",
          durationMinutes: 60,
        }],
        patrolTeacherIds: ["teacher-leader"],
        overrides: {},
      },
      createdAt: "2026-08-16T00:00:00.000Z",
      updatedAt: "2026-08-16T00:00:00.000Z",
    };
    vi.mocked(examArrangementService.listArrangements).mockResolvedValue([savedArrangement]);

    render(
      <MemoryRouter initialEntries={[`/my-exams/invigilation?cohort=${cohort.key}`]}>
        <MyExamsPage section="invigilation" />
      </MemoryRouter>,
    );

    const tableOneHeading = await screen.findByRole("heading", { name: "表一、文印室统计表" });
    expect(screen.getByLabelText("选择文印室统计表考试")).toHaveDisplayValue("高三期中考试 · 2026-10-20");
    expect(screen.getAllByText("高三1班教室").length).toBeGreaterThan(0);
    expect(screen.getAllByText("物化生").length).toBeGreaterThan(0);
    expect(screen.getAllByText("语数外").length).toBeGreaterThan(0);
    const tableTwoHeading = screen.getByRole("heading", { name: "表二、监考表" });
    const invigilationCard = tableTwoHeading.closest(".card-base");
    expect(invigilationCard).not.toBeNull();
    const invigilationTable = within(invigilationCard as HTMLElement);
    const wrappedLocationHeader = invigilationTable.getByRole("columnheader", { name: "高三1班教室" });
    expect(wrappedLocationHeader).not.toHaveAttribute("colspan");
    expect(within(wrappedLocationHeader).getByText("高三1班")).toBeInTheDocument();
    expect(within(wrappedLocationHeader).getByText("教室")).toBeInTheDocument();
    expect(invigilationTable.getByRole("columnheader", { name: "1考场、2考场" })).toBeInTheDocument();
    expect(invigilationTable.getByRole("columnheader", { name: "巡考" })).toHaveAttribute("rowspan", "3");
    expect(invigilationTable.getByRole("cell", { name: "2026-10-20 星期二" })).toHaveAttribute("rowspan", "2");
    expect(invigilationTable.getByRole("cell", { name: "晚上" })).toHaveAttribute("rowspan", "2");
    expect(invigilationTable.getByRole("cell", { name: "18:30–20:30" })).toBeInTheDocument();
    expect(invigilationTable.getAllByRole("checkbox", { name: /高三1班教室监考单元格/ })).toHaveLength(2);
    expect(invigilationTable.getByRole("button", { name: "年级领导" })).toBeInTheDocument();
    const durationHeading = screen.getByRole("heading", { name: "监考时长" });
    const teachersHeading = screen.getByRole("heading", { name: "配置一、监考老师名单" });
    const teacherConfigCard = teachersHeading.closest(".card-base");
    const durationCard = durationHeading.closest(".card-base");
    expect(teacherConfigCard).not.toBeNull();
    expect(durationCard).not.toBeNull();
    const teacherConfig = within(teacherConfigCard as HTMLElement);
    const durationTable = within(durationCard as HTMLElement);
    expect(teacherConfig.getAllByRole("checkbox", { name: /场外$/ })).toHaveLength(3);
    expect(teacherConfig.getAllByRole("checkbox", { name: /巡考$/ })).toHaveLength(3);
    expect(teacherConfig.queryByText("备课组长")).not.toBeInTheDocument();
    expect(teacherConfig.queryByText("领导", { exact: true })).not.toBeInTheDocument();
    expect(teacherConfig.getByText("累计范围（勾选往期监考表）")).toBeInTheDocument();
    expect(durationTable.queryByText("累计范围（勾选往期监考表）")).not.toBeInTheDocument();

    const timesHeading = screen.getByRole("heading", { name: "配置二、考试时间配置" });
    const timesCard = timesHeading.closest(".card-base");
    expect(timesCard).not.toBeNull();
    const timesConfig = within(timesCard as HTMLElement);
    const chineseSubjectBefore = timesConfig.getByText("语文");
    const mathSubjectBefore = timesConfig.getByText("数学");
    expect(chineseSubjectBefore.compareDocumentPosition(mathSubjectBefore) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.change(timesConfig.getByLabelText("数学考试时刻"), { target: { value: "17:00" } });
    const chineseSubjectAfter = timesConfig.getByText("语文");
    const mathSubjectAfter = timesConfig.getByText("数学");
    expect(mathSubjectAfter.compareDocumentPosition(chineseSubjectAfter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "下载导入模板" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上传 Excel" })).toBeInTheDocument();
    expect(screen.queryByLabelText("批量添加")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "批量加入" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "本学科优先" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "时长优先" })).toBeInTheDocument();
    expect(tableOneHeading.compareDocumentPosition(tableTwoHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tableOneHeading.compareDocumentPosition(teachersHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(teachersHeading.compareDocumentPosition(timesHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(timesHeading.compareDocumentPosition(tableTwoHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tableTwoHeading.compareDocumentPosition(durationHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(teacherConfig.getByRole("columnheader", { name: "往期累计" })).toBeInTheDocument();
    expect(teacherConfig.queryByLabelText("教师姓名 1")).not.toBeInTheDocument();
    fireEvent.click(teacherConfig.getByRole("button", { name: "增加老师" }));
    expect(screen.getByRole("heading", { name: "增加老师" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("老师姓名"), { target: { value: "地理老师乙" } });
    fireEvent.change(screen.getByLabelText("任教学科"), { target: { value: "地理" } });
    fireEvent.click(screen.getByRole("button", { name: "确认增加" }));
    expect(teacherConfig.getByLabelText("监考老师人数统计")).toHaveTextContent("共有老师 4 名");
    expect(teacherConfig.getByText("地理老师乙")).toBeInTheDocument();
    expect(teacherConfig.getByText("语文教师甲")).toBeInTheDocument();
    expect(teacherConfig.getByRole("columnheader", { name: "是否在同一天" })).toBeInTheDocument();
    expect(teacherConfig.getByRole("columnheader", { name: "是否请假" })).toBeInTheDocument();
    expect(teacherConfig.getByRole("columnheader", { name: "备注" })).toBeInTheDocument();
    expect(teacherConfig.getByLabelText("语文教师甲是否在同一天")).toHaveValue("any");
    expect(teacherConfig.getByLabelText("语文教师甲是否请假")).not.toBeChecked();
    expect(durationTable.queryByLabelText("语文教师甲是否在同一天")).not.toBeInTheDocument();
    const footerNote = invigilationTable.getByLabelText("监考表年级说明");
    fireEvent.change(footerNote, { target: { value: "第一行\n第二行" } });
    expect(footerNote).toHaveValue("第一行\n第二行");
    fireEvent.change(teacherConfig.getByLabelText("语文教师甲监考备注"), { target: { value: "第一场后换教室" } });
    expect(durationTable.getByText("第一场后换教室")).toBeInTheDocument();
    const chineseRoomCell = invigilationTable.getByRole("checkbox", { name: "选择 语文 高三1班教室监考单元格" }).closest("td");
    expect(chineseRoomCell).toHaveTextContent("1考场：语1人");
    expect(chineseRoomCell).toHaveTextContent("2考场：语1人");

    const tableObserver = observers.find((observer) => observer.targets.some((target) => target.contains(tableTwoHeading)));
    const tableObserverTarget = tableObserver?.targets.find((target) => target.contains(tableTwoHeading));
    expect(tableObserver).toBeDefined();
    expect(tableObserverTarget).toBeDefined();
    act(() => {
      tableObserver?.callback([
        { isIntersecting: true, target: tableObserverTarget } as IntersectionObserverEntry,
      ], tableObserver as unknown as IntersectionObserver);
    });
    const leftDragHandle = await screen.findByRole("button", { name: "从左上角拖动监考时长面板" });
    const rightDragHandle = screen.getByRole("button", { name: "从右上角拖动监考时长面板" });
    const floatingPanel = durationHeading.closest(".fixed") as HTMLElement | null;
    expect(floatingPanel).not.toBeNull();
    expect(floatingPanel).toHaveClass("z-50");
    expect(leftDragHandle.parentElement).toBe(floatingPanel);
    expect(rightDragHandle.parentElement).toBe(floatingPanel);

    Object.defineProperties(leftDragHandle, {
      setPointerCapture: { value: vi.fn(), configurable: true },
      hasPointerCapture: { value: vi.fn(() => true), configurable: true },
      releasePointerCapture: { value: vi.fn(), configurable: true },
    });
    const originalLeft = floatingPanel?.style.left;
    fireEvent.pointerDown(leftDragHandle, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(leftDragHandle, { pointerId: 1, clientX: 140, clientY: 125 });
    expect(floatingPanel?.style.left).not.toBe(originalLeft);
    fireEvent.pointerUp(leftDragHandle, { pointerId: 1, clientX: 140, clientY: 125 });

    const collapseButton = within(durationCard as HTMLElement).getByRole("button", { name: "收起名单" });
    expect(collapseButton).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(collapseButton);
    expect(within(durationCard as HTMLElement).queryByRole("columnheader", { name: "姓名" })).not.toBeInTheDocument();
    const expandButton = within(durationCard as HTMLElement).getByRole("button", { name: "展开名单" });
    expect(expandButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(expandButton);
    expect(within(durationCard as HTMLElement).getByRole("columnheader", { name: "姓名" })).toBeInTheDocument();
  });

  it("accumulates selected previous invigilation durations", async () => {
    const baseArrangement: ExamArrangement = {
      id: "current",
      schoolId: "school-1",
      teacherId: "teacher-1",
      cohortKey: cohort.key,
      cohortLabel: cohort.label,
      name: "十月月考",
      examDate: "2026-10-20",
      mode: "subject",
      subjectSetupMode: "all",
      subjects: ["数学"],
      separateSubjects: ["数学"],
      rooms: [{ id: "room-1", name: "1考场", number: "1考场", location: "一楼", capacity: 40 }],
      classRules: [],
      studentSubjects: [{ studentId: "student-1", subjects: ["数学"] }],
      assignments: [{
        id: "math:student-1",
        studentId: "student-1",
        studentName: "学生甲",
        studentNo: "001",
        classId: "class-1",
        className: "高三（1）班",
        subjectLabel: "数学",
        sessionKey: "数学",
        roomId: "room-1",
        roomName: "1考场",
        roomNumber: "1考场",
        roomLocation: "一楼",
        seatNo: 1,
        admissionNo: "001",
      }],
      invigilation: {
        teachers: [{ id: "teacher-math", name: "张老师", subject: "数学" }],
        subjectTimes: [{ subject: "数学", date: "2026-10-20", period: "morning", time: "08:00", durationMinutes: 90 }],
        overrides: {},
      },
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    };
    const previousArrangement: ExamArrangement = {
      ...baseArrangement,
      id: "previous",
      name: "九月月考",
      examDate: "2026-09-20",
      invigilation: {
        teachers: [
          { id: "teacher-math", name: "张老师", subject: "数学" },
          { id: "teacher-math-2", name: "李老师", subject: "数学" },
        ],
        subjectTimes: [{ subject: "数学", date: "2026-09-20", period: "morning", time: "08:00", durationMinutes: 120 }],
        overrides: {},
      },
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    vi.mocked(examArrangementService.listArrangements).mockResolvedValue([baseArrangement, previousArrangement]);

    render(
      <MemoryRouter initialEntries={[`/my-exams/invigilation?cohort=${cohort.key}`]}>
        <MyExamsPage section="invigilation" />
      </MemoryRouter>,
    );

    const teachersHeading = await screen.findByRole("heading", { name: "配置一、监考老师名单" });
    const durationHeading = screen.getByRole("heading", { name: "监考时长" });
    const teachersCard = teachersHeading.closest(".card-base");
    const durationCard = durationHeading.closest(".card-base");
    expect(teachersCard).not.toBeNull();
    expect(durationCard).not.toBeNull();
    expect(examArrangementService.getInvigilationProfile).not.toHaveBeenCalled();
    expect(within(teachersCard as HTMLElement).getByLabelText("监考老师人数统计")).toHaveTextContent("共有老师 1 名");
    expect(within(teachersCard as HTMLElement).queryByText("李老师")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复用名单" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "复用时间配置" })).toBeEnabled();
    expect(within(teachersCard as HTMLElement).getByLabelText("累计 九月月考")).toBeInTheDocument();
    expect(within(durationCard as HTMLElement).queryByLabelText("累计 九月月考")).not.toBeInTheDocument();
    expect(await screen.findAllByText("1 小时 30 分钟")).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("累计 九月月考"));
    expect(await within(teachersCard as HTMLElement).findByText("2 小时")).toBeInTheDocument();
    expect(await screen.findByText("3 小时 30 分钟")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "复用名单" }));
    expect(screen.getByRole("heading", { name: "复用监考老师名单" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /九月月考/ }));
    expect(within(teachersCard as HTMLElement).getByLabelText("监考老师人数统计")).toHaveTextContent("共有老师 2 名");
    expect(within(teachersCard as HTMLElement).getByText("李老师")).toBeInTheDocument();

    expect(screen.getByLabelText("数学考试日期")).toHaveValue("2026-10-20");
    fireEvent.click(screen.getByRole("button", { name: "复用时间配置" }));
    expect(screen.getByRole("heading", { name: "复用考试时间配置" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /九月月考/ }));
    expect(screen.getByLabelText("数学考试日期")).toHaveValue("2026-09-20");
    expect(screen.getByLabelText("数学考试时长")).toHaveClass("[appearance:textfield]");
  });

  it("assigns teachers by selecting cells and can swap two existing assignments", async () => {
    const user = userEvent.setup();
    const arrangement: ExamArrangement = {
      id: "arrangement-invigilation-1",
      schoolId: "school-1",
      teacherId: "teacher-1",
      cohortKey: cohort.key,
      cohortLabel: cohort.label,
      name: "高三期中考试",
      examDate: "2026-10-20",
      mode: "combination",
      subjectSetupMode: "selection",
      subjects: ["数学"],
      separateSubjects: [],
      rooms: [
        { id: "room-1", name: "1考场", number: "1考场", location: "4107", capacity: 40 },
        { id: "room-2", name: "2考场", number: "2考场", location: "4108", capacity: 40 },
      ],
      classRules: [],
      studentSubjects: [
        { studentId: "student-1", subjects: ["数学"] },
        { studentId: "student-2", subjects: ["数学"] },
      ],
      assignments: [
        {
          id: "combined:student-1",
          studentId: "student-1",
          studentName: "学生甲",
          studentNo: "001",
          classId: "class-1",
          className: "高三（1）班",
          subjectLabel: "数学",
          sessionKey: "combined",
          roomId: "room-1",
          roomName: "1考场",
          roomNumber: "1考场",
          roomLocation: "4107",
          seatNo: 1,
          admissionNo: "20261020010001",
        },
        {
          id: "combined:student-2",
          studentId: "student-2",
          studentName: "学生乙",
          studentNo: "002",
          classId: "class-1",
          className: "高三（1）班",
          subjectLabel: "数学",
          sessionKey: "combined",
          roomId: "room-2",
          roomName: "2考场",
          roomNumber: "2考场",
          roomLocation: "4108",
          seatNo: 1,
          admissionNo: "20261020020001",
        },
      ],
      invigilation: {
        teachers: [
          { id: "invigilator-1", name: "张老师", subject: "数学" },
          { id: "invigilator-2", name: "李老师", subject: "数学" },
        ],
        subjectTimes: [{ subject: "数学", date: "2026-10-20", period: "morning", time: "08:00", durationMinutes: 120 }],
        overrides: {
          "2026-10-20|morning|08:00|数学": {
            roomTeacherIds: { "room-1": null },
            outsideTeacherId: null,
          },
        },
      },
      createdAt: "2026-08-16T00:00:00.000Z",
      updatedAt: "2026-08-16T00:00:00.000Z",
    };
    vi.mocked(examArrangementService.listArrangements).mockResolvedValue([arrangement]);

    render(
      <MemoryRouter initialEntries={[`/my-exams/invigilation?cohort=${cohort.key}`]}>
        <MyExamsPage section="invigilation" />
      </MemoryRouter>,
    );

    const roomOne = await screen.findByRole("checkbox", { name: "选择 数学 4107监考单元格" });
    const roomTwo = screen.getByRole("checkbox", { name: "选择 数学 4108监考单元格" });
    expect(screen.queryByRole("combobox", { name: "数学 1考场监考教师" })).not.toBeInTheDocument();

    expect(roomOne.closest("td")).toHaveTextContent("空缺");
    expect(roomTwo.closest("td")).toHaveTextContent("李老师");
    await user.click(screen.getByRole("button", { name: "选择监考教师 李老师" }));
    expect(roomTwo.closest("td")).toHaveClass("bg-[#fff86b]");

    await user.click(roomOne);
    await user.click(screen.getByRole("button", { name: "选择监考教师 张老师" }));
    expect(roomOne.closest("td")).toHaveTextContent("张老师");
    expect(roomTwo.closest("td")).toHaveTextContent("李老师");

    await user.click(screen.getByRole("button", { name: "时长优先" }));
    expect(roomOne.closest("td")).toHaveTextContent("李老师");
    expect(roomTwo.closest("td")).toHaveTextContent("张老师");

    await user.click(roomOne);
    await user.click(roomTwo);
    await user.click(screen.getByRole("button", { name: "是否交换" }));

    expect(roomOne.closest("td")).toHaveTextContent("张老师");
    expect(roomTwo.closest("td")).toHaveTextContent("李老师");
  });
});
