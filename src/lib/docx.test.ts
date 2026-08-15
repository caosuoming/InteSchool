import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamPaper, Lecture, Question } from "@/types";

const saveAsMock = vi.hoisted(() => vi.fn());

vi.mock("file-saver", () => ({
  saveAs: saveAsMock,
}));

import {
  buildExamPaperDocxBlob,
  buildLectureDocxBlob,
  generateExamPaperDocx,
  generateQuestionsDocx,
} from "@/lib/docx";

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
  const buffer = await blobToArrayBuffer(blob as Blob);
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = zip.file("word/document.xml");
  expect(documentXml).not.toBeNull();
  return documentXml!.async("string");
}

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("读取文档失败"));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
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

  it("emits editable Office math with the surrounding text size and a complete math font", async () => {
    const formulaPaper: ExamPaper = {
      ...structuredPaper,
      questions: [{
        ...structuredPaper.questions[0],
        stem: "求 $f(x)=x^2+\\frac{1}{x}$ 的定义域。",
      }],
      contentBlocks: [{
        ...structuredPaper.contentBlocks![2],
        content: "求 $f(x)=x^2+\\frac{1}{x}$ 的定义域。",
      }],
    };

    const blob = await buildExamPaperDocxBlob(formulaPaper, { [linkedQuestion.id]: linkedQuestion });
    const buffer = await blobToArrayBuffer(blob);
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file("word/document.xml")!.async("string");

    expect(documentXml).toContain("<m:oMath");
    expect(documentXml).toContain("<m:sSup>");
    expect(documentXml).toContain("<m:f>");
    expect(documentXml).toContain("Cambria Math");
    expect(documentXml).toMatch(/<w:sz w:val="24"\s*\/>/);
    expect(documentXml).toMatch(/<w:position w:val="0"\s*\/>/);
    expect(documentXml).not.toContain("$f(x)");
  });

  it("restores imported rich-text scripts as editable Office math", async () => {
    const formulaPaper: ExamPaper = {
      ...structuredPaper,
      questions: [{
        ...structuredPaper.questions[0],
        stem: [
          "设",
          '<i class="math-variable">S</i><sub><i class="math-variable">n</i></sub>',
          "为数列{",
          '<i class="math-variable">a</i><sub><i class="math-variable">n</i></sub>',
          "}的前",
          '<i class="math-variable">n</i>',
          "项和，已知4",
          '<i class="math-variable">S</i><sub><i class="math-variable">n</i></sub>',
          "=3",
          '<i class="math-variable">a</i><sub><i class="math-variable">n</i></sub>',
          "+4。",
        ].join(""),
        analysis: [
          "令(-1)",
          '<sup><i class="math-variable">n</i>-1</sup>',
          '<i class="math-variable">n</i>',
          '<i class="math-variable">a</i><sub><i class="math-variable">n</i></sub>',
          "，再计算。",
        ].join(""),
      }],
      contentBlocks: [{
        ...structuredPaper.contentBlocks![2],
        content: [
          "设",
          '<i class="math-variable">S</i><sub><i class="math-variable">n</i></sub>',
          "为数列{",
          '<i class="math-variable">a</i><sub><i class="math-variable">n</i></sub>',
          "}的前",
          '<i class="math-variable">n</i>',
          "项和，已知4",
          '<i class="math-variable">S</i><sub><i class="math-variable">n</i></sub>',
          "=3",
          '<i class="math-variable">a</i><sub><i class="math-variable">n</i></sub>',
          "+4。",
        ].join(""),
      }],
    };

    const blob = await buildExamPaperDocxBlob(formulaPaper, { [linkedQuestion.id]: linkedQuestion });
    const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));
    const documentXml = await zip.file("word/document.xml")!.async("string");

    expect(documentXml).toContain("<m:sSub>");
    expect(documentXml).toContain("<m:sSup>");
    expect(documentXml).toMatch(/<m:t(?: [^>]*)?>4<\/m:t>/);
    expect(documentXml).toMatch(/<m:t(?: [^>]*)?>S<\/m:t>/);
    expect(documentXml).toMatch(/<m:t(?: [^>]*)?>a<\/m:t>/);
    expect(documentXml).not.toContain("4Sn=3an+4");
    expect(documentXml).not.toContain("(-1)n-1nan");
  });

  it("merges consecutive imported formula fragments into one Office Math expression", async () => {
    const formulaPaper: ExamPaper = {
      ...structuredPaper,
      questions: [],
      contentBlocks: [{
        id: "knowledge-formula",
        type: "knowledge",
        content: [
          "<p>通项放缩：</p><p>(1)",
          '<span class="katex-formula" data-latex="a_n"></span>',
          "&gt;",
          '<span class="katex-formula" data-latex="b_n"></span>',
          "＝",
          '<span class="katex-formula" data-latex="c_n"></span>',
          "－",
          '<span class="katex-formula" data-latex="d_n"></span>',
          "；</p>",
        ].join(""),
      }],
    };

    const blob = await buildExamPaperDocxBlob(formulaPaper);
    const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));
    const documentXml = await zip.file("word/document.xml")!.async("string");

    expect(documentXml.match(/<m:oMath\b/g)).toHaveLength(1);
    expect(documentXml).toContain("<m:sSub>");
    expect(documentXml).toMatch(/<w:t(?: [^>]*)?>\(1\)<\/w:t>/);
    expect(documentXml).toMatch(/<m:t(?: [^>]*)?>&gt;<\/m:t>/);
    expect(documentXml).toMatch(/<m:t(?: [^>]*)?>=<\/m:t>/);
    expect(documentXml).toMatch(/<m:t(?: [^>]*)?>[−-]<\/m:t>/);
  });

  it("writes rich-text paragraph boundaries as explicit Word line breaks", async () => {
    const paragraphPaper: ExamPaper = {
      ...structuredPaper,
      questions: [],
      contentBlocks: [{
        id: "knowledge-paragraphs",
        type: "knowledge",
        content: "<p>第一段</p><p>第二段<br>第三行</p>",
      }],
    };

    const blob = await buildExamPaperDocxBlob(paragraphPaper);
    const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));
    const documentXml = await zip.file("word/document.xml")!.async("string");

    expect(documentXml.match(/<w:br\b[^>]*\/>/g)).toHaveLength(2);
    expect(documentXml).not.toContain("&#10;");
  });

  it("downloads generated documents as OMML without creating MathType OLE objects", async () => {
    const formulaPaper: ExamPaper = {
      ...structuredPaper,
      questions: [{
        ...structuredPaper.questions[0],
        stem: "求 $x^2+1$。",
      }],
      contentBlocks: [{
        ...structuredPaper.contentBlocks![2],
        content: "求 $x^2+1$。",
      }],
    };

    await generateExamPaperDocx(formulaPaper, { [linkedQuestion.id]: linkedQuestion });

    expect(saveAsMock).toHaveBeenCalledOnce();
    const documentXml = await capturedDocumentXml();
    expect(documentXml).toContain("<m:oMath");
    expect(documentXml).toContain("<m:sSup>");
    expect(documentXml).not.toContain("<w:object");
    expect(documentXml).not.toContain("Equation.DSMT4");
  });

  it("keeps formulas in batch-exported answers and analyses as native OMML", async () => {
    const question: Question = {
      ...linkedQuestion,
      answer: "$x^2+1$",
      analysis: "圆 $\\odot O$ 的半径为 $r$。",
    };

    await generateQuestionsDocx([question], { title: "公式题" });

    const documentXml = await capturedDocumentXml();
    expect(documentXml.match(/<m:oMath\b/g)?.length).toBeGreaterThanOrEqual(3);
    expect(documentXml).toContain("<m:sSup>");
    expect(documentXml).toContain("⊙");
    expect(documentXml).not.toContain("$x^2+1$");
    expect(documentXml).not.toContain("$\\odot O$");
  });

  it("builds lecture downloads from preview sections with editable formulas", async () => {
    const lectureQuestion: Question = {
      ...linkedQuestion,
      stem: "已知 $f(x)=x^2$，求函数值。",
      options: ["$0$", "$1$"],
      answer: "$1$",
    };
    const lecture: Lecture = {
      id: "lecture-1",
      teacherId: "teacher-1",
      schoolId: "school-1",
      title: "函数讲义",
      description: "公式练习",
      chapterIds: [],
      knowledgePointIds: [],
      grade: "高一",
      schoolYear: "2026-2027",
      semester: "上学期",
      classIds: [],
      studentIds: [],
      sections: [
        { id: "title", title: "函数讲义", type: "chapter", content: "", children: [] },
        {
          id: "question",
          title: "例题",
          type: "question",
          content: "",
          questionId: lectureQuestion.id,
          customLabel: "例1",
          children: [],
        },
      ],
      contentBlocks: [{ id: "document-title", type: "documentTitle", content: "函数讲义" }],
      version: 1,
      status: "draft",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const blob = await buildLectureDocxBlob(lecture, { [lectureQuestion.id]: lectureQuestion });
    const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));
    const documentXml = await zip.file("word/document.xml")!.async("string");

    expect(documentXml).toContain("函数讲义");
    expect(documentXml).toContain("例1");
    expect(documentXml).toContain("<m:oMath");
    expect(documentXml).toContain("<m:sSup>");
  });

  it("restores imported rich-text scripts in lecture downloads", async () => {
    const lectureQuestion: Question = {
      ...linkedQuestion,
      stem: '已知4<i class="math-variable">S</i><sub><i class="math-variable">n</i></sub>=3<i class="math-variable">a</i><sub><i class="math-variable">n</i></sub>+4。',
      analysis: '所以<i class="math-variable">a</i><sub><i class="math-variable">n</i></sub>=4×(-3)<sup><i class="math-variable">n</i>-1</sup>。',
    };
    const lecture: Lecture = {
      id: "lecture-rich-math",
      teacherId: "teacher-1",
      schoolId: "school-1",
      title: "数列讲义",
      description: "",
      chapterIds: [],
      knowledgePointIds: [],
      grade: "高一",
      schoolYear: "2026-2027",
      semester: "上学期",
      classIds: [],
      studentIds: [],
      sections: [{
        id: "question",
        title: "例题",
        type: "question",
        content: "",
        questionId: lectureQuestion.id,
        children: [],
      }],
      version: 1,
      status: "draft",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const blob = await buildLectureDocxBlob(lecture, { [lectureQuestion.id]: lectureQuestion });
    const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));
    const documentXml = await zip.file("word/document.xml")!.async("string");

    expect(documentXml).toContain("<m:sSub>");
    expect(documentXml).toContain("<m:sSup>");
    expect(documentXml).not.toContain("4Sn=3an+4");
  });
});
