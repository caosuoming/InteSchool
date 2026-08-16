import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExamRoomArrangementPage from "@/pages/students/ExamRoomArrangementPage";
import { examArrangementService } from "@/services/examArrangement";
import { useAuthStore } from "@/stores/auth";
import type {
  ExamArrangement,
  ExamArrangementContext,
  GradeCohort,
  Teacher,
  TeacherAffiliation,
} from "@/types";

vi.mock("@/services/examArrangement", () => ({
  examArrangementService: {
    listCohorts: vi.fn(),
    getContext: vi.fn(),
    listArrangements: vi.fn(),
    saveArrangement: vi.fn(),
    deleteArrangement: vi.fn(),
  },
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
  studentCount: 1,
};

const context: ExamArrangementContext = {
  cohort,
  classes: [{
    id: "class-1",
    type: "school",
    schoolId: "school-1",
    name: "高三（1）班",
    grade: "高三",
    studentCount: 1,
    createdBy: "teacher-1",
    createdAt: "2026-08-01T00:00:00.000Z",
  }],
  students: [{
    id: "student-1",
    name: "张同学",
    studentNo: "001",
    classId: "class-1",
    schoolId: "school-1",
    grade: "高三",
    subjectSelection: "物化生",
    status: "active",
  }],
  previousGradeRanks: { "student-1": 1 },
};

const savedArrangement: ExamArrangement = {
  id: "arrangement-1",
  schoolId: "school-1",
  teacherId: "teacher-1",
  cohortKey: cohort.key,
  cohortLabel: cohort.label,
  name: "第一次模拟考试",
  examDate: "2026-05-10",
  mode: "combination",
  subjectSetupMode: "selection",
  subjects: ["语文", "数学", "英语", "物理", "化学", "生物"],
  selectionSubjects: { 物化生: ["语文", "数学", "英语", "物理", "化学", "生物"] },
  separateSubjects: ["物理"],
  seatOrder: "previousRank",
  rooms: [{
    id: "room-1",
    name: "高三（1）班",
    number: "高三（1）班",
    location: "教学楼 301",
    capacity: 30,
  }],
  classRules: [{
    classId: "class-1",
    defaultSubjects: ["语文", "数学", "英语", "物理", "化学", "生物"],
    subjectRoomIds: {
      语文: ["room-1"],
      数学: ["room-1"],
      英语: ["room-1"],
      物理: ["room-1"],
      化学: ["room-1"],
      生物: ["room-1"],
    },
  }],
  studentSubjects: [{
    studentId: "student-1",
    subjects: ["语文", "数学", "英语", "物理", "化学", "生物"],
    absent: false,
  }],
  assignments: [{
    id: "combined:student-1",
    studentId: "student-1",
    studentName: "张同学",
    studentNo: "001",
    classId: "class-1",
    className: "高三（1）班",
    subjectLabel: "语文 / 数学 / 英语 / 化学 / 生物",
    sessionKey: "combined",
    roomId: "room-1",
    roomName: "高三（1）班",
    roomNumber: "高三（1）班",
    roomLocation: "教学楼 301",
    seatNo: 1,
    admissionNo: "20260510010001",
  }, {
    id: "subject:物理:student-1",
    studentId: "student-1",
    studentName: "张同学",
    studentNo: "001",
    classId: "class-1",
    className: "高三（1）班",
    subjectLabel: "物理",
    sessionKey: "subject:物理",
    roomId: "room-1",
    roomName: "高三（1）班",
    roomNumber: "高三（1）班",
    roomLocation: "教学楼 301",
    seatNo: 1,
    admissionNo: "20260510040001",
  }],
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ExamRoomArrangementPage embedded />
    </MemoryRouter>,
  );
}

describe("ExamRoomArrangementPage", () => {
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
    vi.mocked(examArrangementService.listCohorts).mockResolvedValue([cohort]);
    vi.mocked(examArrangementService.getContext).mockResolvedValue(context);
    vi.mocked(examArrangementService.listArrangements).mockResolvedValue([]);
  });

  it("shows the exam setup sections in execution order", async () => {
    renderPage();

    const stepTitles = await screen.findAllByText(/^第[一二三四]步：/);
    expect(stepTitles.map((title) => title.textContent)).toEqual([
      "第一步：选择考试科目",
      "第二步：学生考试科目",
      "第三步：设置可用考场",
      "第四步：排考场规则",
    ]);
    expect(screen.getByText("本届学生 1 人")).toBeInTheDocument();
  });

  it("asks for an exam name before creating a new arrangement", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "新建方案" }));
    expect(screen.getByRole("heading", { name: "新建考场安排" })).toBeInTheDocument();

    const nameInput = screen.getAllByLabelText("考试名称").at(-1);
    expect(nameInput).toBeDefined();
    await user.clear(nameInput!);
    expect(screen.getByRole("button", { name: "创建方案" })).toBeDisabled();
    await user.type(nameInput!, "高三期末考试");
    await user.click(screen.getByRole("button", { name: "创建方案" }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "新建考场安排" })).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("考试名称")).toHaveValue("高三期末考试");
  });

  it("shows the new arrangement option, subject setup modes, and editable room defaults", async () => {
    const user = userEvent.setup();
    renderPage();

    const arrangementSelect = await screen.findByLabelText("选择考场安排");
    expect(arrangementSelect).toHaveDisplayValue("新建考场安排");
    expect(screen.getAllByRole("option")[1]).toHaveTextContent("新建考场安排");

    const selectionMode = screen.getByRole("radio", { name: /高考六门.*语数外 \+ 选科/ });
    expect(selectionMode).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("物化生")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /学测科目中非选修科目/ }));
    expect(screen.getByRole("radio", { name: /学测科目中非选修科目/ })).toHaveAttribute("aria-checked", "true");
    const selectionSection = screen.getByText("物化生").closest<HTMLElement>("div.rounded-lg");
    expect(selectionSection).not.toBeNull();
    expect(within(selectionSection!).getByRole("button", { name: "政治" })).toHaveAttribute("aria-pressed", "true");
    expect(within(selectionSection!).getByRole("button", { name: "历史" })).toHaveAttribute("aria-pressed", "true");
    expect(within(selectionSection!).getByRole("button", { name: "地理" })).toHaveAttribute("aria-pressed", "true");
    expect(within(selectionSection!).getByRole("button", { name: "物理" })).toHaveAttribute("aria-pressed", "false");
    expect(within(selectionSection!).getByRole("button", { name: "化学" })).toHaveAttribute("aria-pressed", "false");
    expect(within(selectionSection!).getByRole("button", { name: "生物" })).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("radio", { name: /所有学科/ }));
    expect(screen.getByRole("radio", { name: /所有学科/ })).toHaveAttribute("aria-checked", "true");

    expect(screen.getByLabelText("考场号")).toHaveValue("1考场");
    expect(screen.getByLabelText("考场位置")).toHaveValue("高三1班教室");
    expect(screen.getByLabelText("考场可安排人数")).toHaveValue(1);
    expect(screen.getByText("最多可安排 1 个位置")).toBeInTheDocument();
    expect(screen.getAllByText(/所选考场最多可安排 1 个位置/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /1考场（物化生） · 高三1班教室/ }).length).toBeGreaterThan(0);
    expect(screen.queryByText("实际考试组合人数")).not.toBeInTheDocument();
    expect(screen.queryByText("考试组合对应考场")).not.toBeInTheDocument();
    expect(screen.getByText("考试组合使用考场")).toBeInTheDocument();
    expect(screen.getByText("同时考试组合")).toBeInTheDocument();
    const simultaneousCard = screen.getByText("同时场次 1").closest<HTMLElement>("div.rounded-lg");
    expect(simultaneousCard).not.toBeNull();
    expect(within(simultaneousCard!).getByRole("button", { name: "物理" })).toHaveAttribute("aria-pressed", "true");
    expect(within(simultaneousCard!).getByRole("button", { name: "历史" })).toHaveAttribute("aria-pressed", "true");

    await user.clear(screen.getByLabelText("批量考场容量"));
    await user.type(screen.getByLabelText("批量考场容量"), "32");
    await user.click(screen.getByRole("button", { name: "批量设置容量" }));
    expect(screen.getByLabelText("考场可安排人数")).toHaveValue(32);
    expect(screen.getByText("最多可安排 32 个位置")).toBeInTheDocument();
    expect(screen.getAllByText(/所选考场最多可安排 32 个位置/).length).toBeGreaterThan(0);
  });

  it("allows an individual student to be marked absent", async () => {
    const user = userEvent.setup();
    renderPage();

    const absent = await screen.findByLabelText("张同学弃考");
    expect(absent).not.toBeChecked();
    await user.click(absent);
    expect(absent).toBeChecked();
  });

  it("keeps fixed-room and student class tabs independent", async () => {
    const user = userEvent.setup();
    const secondClass = {
      ...context.classes[0],
      id: "class-2",
      name: "高三（2）班",
    };
    const secondStudent = {
      ...context.students[0],
      id: "student-2",
      name: "李同学",
      studentNo: "002",
      classId: "class-2",
    };
    vi.mocked(examArrangementService.getContext).mockResolvedValue({
      ...context,
      cohort: {
        ...cohort,
        classIds: ["class-1", "class-2"],
        studentCount: 2,
      },
      classes: [context.classes[0], secondClass],
      students: [context.students[0], secondStudent],
    });
    renderPage();

    const fixedRoomTabs = await screen.findByRole("tablist", { name: "班级学科固定考场班级" });
    const studentTabs = screen.getByRole("tablist", { name: "学生考试科目班级" });
    expect(within(fixedRoomTabs).getByRole("tab", { name: "高三（1）班" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("高三（1）班语文固定考场")).toBeInTheDocument();
    expect(screen.queryByLabelText("高三（2）班语文固定考场")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "张同学考试设置" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "李同学考试设置" })).not.toBeInTheDocument();

    await user.click(within(fixedRoomTabs).getByRole("tab", { name: "高三（2）班" }));

    expect(within(fixedRoomTabs).getByRole("tab", { name: "高三（2）班" })).toHaveAttribute("aria-selected", "true");
    expect(within(studentTabs).getByRole("tab", { name: "高三（1）班" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByLabelText("高三（1）班语文固定考场")).not.toBeInTheDocument();
    expect(screen.getByLabelText("高三（2）班语文固定考场")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "张同学考试设置" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "李同学考试设置" })).not.toBeInTheDocument();

    await user.click(within(studentTabs).getByRole("tab", { name: "高三（2）班" }));
    await user.click(within(fixedRoomTabs).getByRole("tab", { name: "高三（1）班" }));

    expect(within(studentTabs).getByRole("tab", { name: "高三（2）班" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("高三（1）班语文固定考场")).toBeInTheDocument();
    expect(screen.queryByLabelText("高三（2）班语文固定考场")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "张同学考试设置" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "李同学考试设置" })).toBeInTheDocument();
  });

  it("supports class batch subjects, fixed rooms, special students, and external-student labels", async () => {
    const user = userEvent.setup();
    vi.mocked(examArrangementService.getContext).mockResolvedValue({
      ...context,
      cohort: { ...cohort, studentCount: 3 },
      classes: [{ ...context.classes[0], studentCount: 3 }],
      students: [
        context.students[0],
        {
          ...context.students[0],
          id: "student-2",
          name: "李同学",
          studentNo: "002",
          isExternal: true,
        },
        {
          ...context.students[0],
          id: "student-3",
          name: "王同学",
          studentNo: "003",
        },
      ],
    });
    renderPage();

    const batchSubjects = await screen.findByRole("group", { name: "高三（1）班批量考试科目" });
    const zhang = screen.getByRole("group", { name: "张同学考试设置" });
    const li = screen.getByRole("group", { name: "李同学考试设置" });
    const wang = screen.getByRole("group", { name: "王同学考试设置" });
    expect(within(li).getByText("借读生")).toBeInTheDocument();

    await user.click(within(batchSubjects).getByRole("button", { name: "物理" }));
    expect(within(zhang).getByRole("button", { name: "物理" })).toHaveAttribute("aria-pressed", "false");
    expect(within(li).getByRole("button", { name: "物理" })).toHaveAttribute("aria-pressed", "false");
    expect(within(wang).getByRole("button", { name: "物理" })).toHaveAttribute("aria-pressed", "false");

    await user.click(within(li).getByRole("button", { name: "物理" }));
    expect(li).toHaveAttribute("title", "与本班多数学生的考试科目不同");

    await user.selectOptions(screen.getByLabelText("李同学特殊要求"), "last");
    expect(screen.getByLabelText("李同学特殊要求")).toHaveValue("last");

    const fixedRoom = screen.getByLabelText("高三（1）班语文固定考场");
    expect(fixedRoom).toHaveValue("");
    await user.selectOptions(fixedRoom, "room-class-1");
    expect(fixedRoom).toHaveValue("room-class-1");
  });

  it("shows the student's actual combined electives as a selectable room group", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("第四步：排考场规则");
    for (const subject of ["语文", "数学", "英语", "物理"]) {
      await user.click(screen.getByRole("button", { name: `${subject}单独排` }));
    }

    expect(screen.getByText("化学、生物")).toBeInTheDocument();
    expect(screen.getByText(/合并场次 · 1 人/)).toBeInTheDocument();
  });

  it("summarizes and reuses a saved arrangement without overwriting it", async () => {
    const user = userEvent.setup();
    vi.mocked(examArrangementService.listArrangements).mockResolvedValue([savedArrangement]);
    renderPage();

    const arrangementSelect = await screen.findByLabelText("选择考场安排");
    await user.selectOptions(arrangementSelect, savedArrangement.id);

    expect((await screen.findAllByText("第一次模拟考试")).length).toBeGreaterThan(0);
    expect(screen.getByText(/按上次名次排/)).toBeInTheDocument();
    expect(screen.getByText(/弃考 0 人/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "复用此考场安排" }));
    expect(screen.getByLabelText("考试名称")).toHaveValue("第一次模拟考试（复用）");
    expect(arrangementSelect).toHaveValue("new");
  });

  it("shows one class row per student and selectable desk-label rooms", async () => {
    const user = userEvent.setup();
    vi.mocked(examArrangementService.listArrangements).mockResolvedValue([savedArrangement]);
    renderPage();

    const arrangementSelect = await screen.findByLabelText("选择考场安排");
    await user.selectOptions(arrangementSelect, savedArrangement.id);

    const classTab = await screen.findByRole("tab", { name: "班级考场安排预览" });
    expect(classTab).toHaveAttribute("aria-selected", "true");
    const classTable = screen.getByRole("table");
    expect(within(classTable).getAllByRole("row")).toHaveLength(2);
    expect(within(classTable).getByText("物理")).toBeInTheDocument();
    expect(screen.getByLabelText("选择高三（1）班")).toBeChecked();
    expect(screen.getByRole("button", { name: "打印已选班级" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "下载班级 PDF" })).toBeEnabled();
    expect(screen.getAllByTestId("class-arrangement-print-page")).toHaveLength(1);
    const classPrintPage = screen.getByTestId("class-arrangement-print-page");
    expect(classPrintPage).toHaveAttribute("data-columns", "3");
    const classGrid = classPrintPage.querySelector<HTMLElement>(".exam-class-arrangement-grid");
    expect(classGrid?.style.gridAutoRows).toBe("max-content");
    expect(classGrid?.style.alignItems).toBe("start");
    expect([...classPrintPage.querySelectorAll(".exam-class-arrangement-subject span")].map((node) => node.textContent)).toEqual([
      "语文、数学、英语",
      "化学、生物",
      "物理",
    ]);

    await user.click(screen.getByRole("tab", { name: "桌贴预览" }));
    expect(screen.getByRole("tab", { name: "桌贴预览" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("1 张桌贴")).toBeInTheDocument();
    expect(screen.getAllByTestId("desk-label-card")).toHaveLength(1);
    expect(screen.getByLabelText("桌贴显示学号")).toBeChecked();
    expect(screen.getByLabelText("桌贴显示准考证号")).toBeChecked();
    expect(screen.getAllByTestId("desk-label-print-page")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "下载桌贴 PDF" })).toBeEnabled();
    const deskPrintPage = screen.getByTestId("desk-label-print-page");
    expect(deskPrintPage.style.gridAutoRows).toBe("max-content");
    expect(deskPrintPage.style.alignItems).toBe("stretch");
    expect(deskPrintPage.querySelector(".exam-desk-label-assignment-main")).toHaveTextContent("张同学");
    expect(deskPrintPage.querySelector(".exam-desk-label-assignment-main")).toHaveTextContent("高三（1）班");
    expect(deskPrintPage.querySelector(".exam-desk-label-meta")?.children[0]).toHaveTextContent("教学楼 301");
    expect(deskPrintPage.querySelector(".exam-desk-label-meta")?.children[1]).toHaveTextContent("2026-05-10");

    await user.click(screen.getByLabelText("桌贴显示学号"));
    expect(screen.queryByText("学号：001")).not.toBeInTheDocument();
    expect(screen.queryByText("学号 001")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("桌贴显示准考证号"));
    expect(screen.queryByText("准考证号：20260510010001")).not.toBeInTheDocument();
    expect(screen.queryByText("准考证号 20260510010001")).not.toBeInTheDocument();

    const roomCheckbox = screen.getByLabelText("选择高三（1）班");
    expect(roomCheckbox).toBeChecked();

    await user.click(roomCheckbox);
    expect(screen.getByRole("button", { name: "下载已选桌贴" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下载桌贴 PDF" })).toBeDisabled();
    expect(screen.getByText("已选择 0 / 1 个考场，共 0 张桌贴")).toBeInTheDocument();
  });

  it("switches result previews one class and one room at a time", async () => {
    const user = userEvent.setup();
    const secondClass = {
      ...context.classes[0],
      id: "class-2",
      name: "高三（2）班",
    };
    const secondStudent = {
      ...context.students[0],
      id: "student-2",
      name: "李同学",
      studentNo: "002",
      classId: "class-2",
    };
    const secondRoom = {
      id: "room-2",
      name: "2考场",
      number: "2考场",
      location: "教学楼 302",
      capacity: 30,
    };
    const secondAssignment = {
      ...savedArrangement.assignments[0],
      id: "combined:student-2",
      studentId: "student-2",
      studentName: "李同学",
      studentNo: "002",
      classId: "class-2",
      className: "高三（2）班",
      roomId: secondRoom.id,
      roomName: secondRoom.name,
      roomNumber: secondRoom.number,
      roomLocation: secondRoom.location,
      admissionNo: "20260510020001",
    };
    const arrangement = {
      ...savedArrangement,
      rooms: [...savedArrangement.rooms, secondRoom],
      assignments: [...savedArrangement.assignments, secondAssignment],
    };
    vi.mocked(examArrangementService.getContext).mockResolvedValue({
      ...context,
      cohort: {
        ...cohort,
        classIds: ["class-1", "class-2"],
        studentCount: 2,
      },
      classes: [context.classes[0], secondClass],
      students: [context.students[0], secondStudent],
    });
    vi.mocked(examArrangementService.listArrangements).mockResolvedValue([arrangement]);
    renderPage();

    await user.selectOptions(await screen.findByLabelText("选择考场安排"), savedArrangement.id);

    const classSwitch = await screen.findByRole("tablist", { name: "班级考场安排班级" });
    const classOne = within(classSwitch).getByRole("tab", { name: "高三（1）班" });
    const classTwo = within(classSwitch).getByRole("tab", { name: "高三（2）班" });
    expect(classOne).toHaveAttribute("aria-selected", "true");
    expect(classTwo).toHaveAttribute("aria-selected", "false");
    expect(within(screen.getByRole("table")).getByText("张同学")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).queryByText("李同学")).not.toBeInTheDocument();

    await user.click(classTwo);
    expect(classTwo).toHaveAttribute("aria-selected", "true");
    expect(within(screen.getByRole("table")).getByText("李同学")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).queryByText("张同学")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "桌贴预览" }));
    const roomSwitch = await screen.findByRole("tablist", { name: "桌贴预览考场" });
    const roomOne = within(roomSwitch).getByRole("tab", { name: "高三（1）班" });
    const roomTwo = within(roomSwitch).getByRole("tab", { name: "2考场" });
    expect([roomOne, roomTwo].filter((tab) => tab.getAttribute("aria-selected") === "true")).toHaveLength(1);

    await user.click(roomOne);
    expect(roomOne).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByTestId("desk-label-card")).toHaveLength(1);
    expect(screen.getByTestId("desk-label-card")).toHaveTextContent("张同学");

    await user.click(roomTwo);
    expect(roomTwo).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByTestId("desk-label-card")).toHaveLength(1);
    expect(screen.getByTestId("desk-label-card")).toHaveTextContent("李同学");
  });

  it("uses a readable five-column 8K desk-label layout", async () => {
    const user = userEvent.setup();
    const assignments = Array.from({ length: 21 }, (_, index) => ({
      ...savedArrangement.assignments[0],
      id: `combined:student-${index + 1}`,
      studentId: `student-${index + 1}`,
      studentName: `学生${index + 1}`,
      studentNo: String(index + 1).padStart(3, "0"),
      seatNo: index + 1,
      admissionNo: `20260510${String(index + 1).padStart(6, "0")}`,
    }));
    vi.mocked(examArrangementService.listArrangements).mockResolvedValue([{ ...savedArrangement, assignments }]);
    renderPage();

    await user.selectOptions(await screen.findByLabelText("选择考场安排"), savedArrangement.id);
    await user.click(await screen.findByRole("tab", { name: "桌贴预览" }));

    expect(screen.getAllByTestId("desk-label-card")).toHaveLength(21);
    const [printPage] = screen.getAllByTestId("desk-label-print-page");
    expect(screen.getAllByTestId("desk-label-print-page")).toHaveLength(1);
    expect(printPage).toHaveAttribute("data-density", "normal");
    expect(printPage).toHaveAttribute("data-columns", "5");
    expect(printPage.querySelectorAll(".exam-desk-label")).toHaveLength(21);
    expect(printPage.style.gridAutoRows).toBe("max-content");
    expect(printPage.style.alignItems).toBe("stretch");
    expect(printPage.style.alignContent).toBe("start");
    expect(printPage.style.padding).toBe("12.7mm");
  });

  it("repaginates desk labels from their measured 8K row heights", async () => {
    const pxPerMm = 96 / 25.4;
    const rect = (width: number, height: number): DOMRect => ({
      x: 0,
      y: 0,
      width,
      height,
      top: 0,
      right: width,
      bottom: height,
      left: 0,
      toJSON: () => ({}),
    });
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getBoundingClientRect() {
      if (this.classList.contains("exam-desk-label-measure")) return rect(234.6 * pxPerMm, 0);
      if (this.hasAttribute("data-desk-measure-row")) return rect(234.6 * pxPerMm, 25 * pxPerMm);
      return originalGetBoundingClientRect.call(this);
    });

    try {
      const user = userEvent.setup();
      const assignments = Array.from({ length: 60 }, (_, index) => ({
        ...savedArrangement.assignments[0],
        id: `combined:student-${index + 1}`,
        studentId: `student-${index + 1}`,
        studentName: `学生${index + 1}`,
        studentNo: String(index + 1).padStart(3, "0"),
        seatNo: index + 1,
        admissionNo: `20260510${String(index + 1).padStart(6, "0")}`,
      }));
      vi.mocked(examArrangementService.listArrangements).mockResolvedValue([{
        ...savedArrangement,
        rooms: [{ ...savedArrangement.rooms[0], capacity: 60 }],
        assignments,
      }]);
      renderPage();

      await user.selectOptions(await screen.findByLabelText("选择考场安排"), savedArrangement.id);
      await user.click(await screen.findByRole("tab", { name: "桌贴预览" }));

      await waitFor(() => expect(screen.getAllByTestId("desk-label-print-page")).toHaveLength(1));
      const printPage = screen.getByTestId("desk-label-print-page");
      expect(printPage).toHaveAttribute("data-rows", "12");
      expect(printPage.querySelectorAll(".exam-desk-label")).toHaveLength(60);
    } finally {
      rectSpy.mockRestore();
    }
  });

  it("splits a large class over multiple readable A4 pages", async () => {
    const user = userEvent.setup();
    const students = Array.from({ length: 67 }, (_, index) => ({
      ...context.students[0],
      id: `student-${index + 1}`,
      name: `学生${index + 1}`,
      studentNo: String(index + 1).padStart(3, "0"),
    }));
    const assignments = students.map((student, index) => ({
      ...savedArrangement.assignments[0],
      id: `combined:${student.id}`,
      studentId: student.id,
      studentName: student.name,
      studentNo: student.studentNo,
      seatNo: index + 1,
      admissionNo: `20260510${String(index + 1).padStart(6, "0")}`,
    }));
    vi.mocked(examArrangementService.getContext).mockResolvedValue({
      ...context,
      cohort: { ...cohort, studentCount: 67 },
      classes: [{ ...context.classes[0], studentCount: 67 }],
      students,
    });
    vi.mocked(examArrangementService.listArrangements).mockResolvedValue([{
      ...savedArrangement,
      rooms: [{ ...savedArrangement.rooms[0], capacity: 60 }],
      assignments,
    }]);
    renderPage();

    await user.selectOptions(await screen.findByLabelText("选择考场安排"), savedArrangement.id);

    const pages = screen.getAllByTestId("class-arrangement-print-page");
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveAttribute("data-columns", "3");
    expect(pages[0].querySelectorAll(".exam-class-arrangement-student")).toHaveLength(36);
    expect(pages[1].querySelectorAll(".exam-class-arrangement-student")).toHaveLength(31);
    expect(pages[0].querySelector(".exam-class-arrangement-header-meta")).toHaveTextContent("高三（1）班 · 67 名学生 · 第 1/2 页");
  });

  it("continues desk labels across rooms and 8K pages", async () => {
    const user = userEvent.setup();
    const secondRoom = {
      id: "room-2",
      name: "高三（2）班",
      number: "高三（2）班",
      location: "教学楼 302",
      capacity: 30,
    };
    const assignments = Array.from({ length: 58 }, (_, index) => {
      const firstRoomCount = 28;
      const room = index < firstRoomCount ? savedArrangement.rooms[0] : secondRoom;
      const seatNo = index < firstRoomCount ? index + 1 : index - firstRoomCount + 1;
      return {
        ...savedArrangement.assignments[0],
        id: `combined:student-${index + 1}`,
        studentId: `student-${index + 1}`,
        studentName: `学生${index + 1}`,
        studentNo: String(index + 1).padStart(3, "0"),
        roomId: room.id,
        roomName: room.name,
        roomNumber: room.number,
        roomLocation: room.location,
        seatNo,
        admissionNo: `20260510${String(index + 1).padStart(6, "0")}`,
      };
    });
    vi.mocked(examArrangementService.listArrangements).mockResolvedValue([{
      ...savedArrangement,
      rooms: [{ ...savedArrangement.rooms[0], capacity: 30 }, secondRoom],
      assignments,
    }]);
    renderPage();

    await user.selectOptions(await screen.findByLabelText("选择考场安排"), savedArrangement.id);
    await user.click(await screen.findByRole("tab", { name: "桌贴预览" }));

    const pages = screen.getAllByTestId("desk-label-print-page");
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveAttribute("data-columns", "5");
    expect(pages[0].querySelectorAll(".exam-desk-label")).toHaveLength(53);
    expect(pages[1].querySelectorAll(".exam-desk-label")).toHaveLength(5);
    expect(pages[0]).toHaveTextContent("教学楼 301");
    expect(pages[0]).toHaveTextContent("教学楼 302");
    const firstPageLabels = [...pages[0].querySelectorAll<HTMLElement>(".exam-desk-label")];
    expect(firstPageLabels[28].style.gridColumnStart).toBe("1");
  });
});
