import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamPaper, Question } from "@/types";

const saveAsMock = vi.hoisted(() => vi.fn());

vi.mock("file-saver", () => ({
  saveAs: saveAsMock,
}));

import { generateExamPaperDocx } from "@/lib/docx";

const timestamp = "2026-08-04T00:00:00.000Z";

const linkedQuestion: Question = {
  id: "question-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  type: "single",
  stem: "题库中的旧题干",
  options: ["旧选项 A", "旧选项 B"],
  answer: "B",
  analysis: "题库解析",
  chapterIds: [],
  knowledgePointIds: ["knowledge-1"],
  difficulty: 3,
  recommendation: 3,
  usageCount: 0,
  remark: "",
  isShared: false,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const structuredPaper: ExamPaper = {
  id: "paper-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  title: "函数/测试试卷",
  description: "",
  chapterIds: [],
  knowledgePointIds: ["knowledge-1"],
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  duration: 90,
  totalScore: 5,
  status: "draft",
  isExtractCopy: true,
  questions: [{
    id: "paper-question-1",
    questionId: "question-1",
    type: "single",
    stem: "<p>函数 <strong>f(x)</strong> 的定义域是？</p>",
    options: ["<p>实数集</p>", "<p>正实数集</p>"],
    answer: "A",
    analysis: "<p>根据函数定义判断。</p>",
    score: 5,
  }],
  contentBlocks: [
    {
      id: "title-1",
      type: "documentTitle",
      content: "2026 年函数单元测试",
    },
    {
      id: "heading-1",
      type: "groupTitle",
      content: "一、选择题",
    },
    {
      id: "question-block-1",
      type: "question",
      content: "<p>函数 <strong>f(x)</strong> 的定义域是？</p>",
      questionId: "question-1",
      examPaperQuestionId: "paper-question-1",
    },
  ],
  createdAt: timestamp,
  updatedAt: timestamp,
};

async function capturedDocumentXml(): Promise<string> {
  const [blob] = saveAsMock.mock.calls.at(-1) || [];
  expect(blob).toBeInstanceOf(Blob);
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("读取文档失败"));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob as Blob);
  });
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = zip.file("word/document.xml");
  expect(documentXml).not.toBeNull();
  return documentXml!.async("string");
}

beforeEach(() => {
  saveAsMock.mockReset();
});

describe("generateExamPaperDocx", () => {
  it("downloads the structured document with the edited question content", async () => {
    await generateExamPaperDocx(structuredPaper, { [linkedQuestion.id]: linkedQuestion });

    expect(saveAsMock).toHaveBeenCalledOnce();
    expect(saveAsMock.mock.calls[0][1]).toBe("函数_测试试卷.docx");

    const documentXml = await capturedDocumentXml();
    expect(documentXml).toContain("2026 年函数单元测试");
    expect(documentXml).toContain("一、选择题");
    expect(documentXml).toContain("函数 f(x) 的定义域是？");
    expect(documentXml).toContain("【答案】");
    expect(documentXml).toContain("A");
    expect(documentXml).toContain("根据函数定义判断。");
    expect(documentXml).not.toContain("题库中的旧题干");
  });
});
