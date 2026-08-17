import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamPaper, Lecture, Question } from "@/types";

const saveAsMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("file-saver", () => ({
  saveAs: saveAsMock,
}));

import {
  buildExamPaperDocxBlob,
  buildLectureDocxBlob,
  downloadExamPaperDocxVariants,
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

function optionParagraphs(documentXml: string): Element[] {
  const xml = new DOMParser().parseFromString(documentXml, "application/xml");
  return Array.from(xml.getElementsByTagName("w:p")).filter((paragraph) => {
    const text = Array.from(paragraph.getElementsByTagName("w:t"))
      .map((node) => node.textContent || "")
      .join("");
    return /A\. |B\. |C\. |D\. /.test(text);
  });
}

beforeEach(() => {
  saveAsMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("generateExamPaperDocx", () => {
  it("supports student, normal, and answer-only paper variants", async () => {
    const multiplePaper: ExamPaper = {
      ...structuredPaper,
      layoutMode: "flat",
      questions: [{
        ...structuredPaper.questions[0],
        type: "multiple",
        answer: "AC",
        analysis: "A、C 均满足条件。",
      }],
    };

    const studentBlob = await buildExamPaperDocxBlob(
      multiplePaper,
      { [linkedQuestion.id]: linkedQuestion },
      { mode: "student" },
    );
    const studentZip = await JSZip.loadAsync(await blobToArrayBuffer(studentBlob));
    const studentXml = await studentZip.file("word/document.xml")!.async("string");
    expect(studentXml).toContain("函数 f(x) 的定义域是？");
    expect(studentXml).toContain("（多选）");
    expect(studentXml).not.toContain("【答案】");
    expect(studentXml).not.toContain("A、C 均满足条件。");

    const normalBlob = await buildExamPaperDocxBlob(
      multiplePaper,
      { [linkedQuestion.id]: linkedQuestion },
      { mode: "normal" },
    );
    const normalZip = await JSZip.loadAsync(await blobToArrayBuffer(normalBlob));
    const normalXml = await normalZip.file("word/document.xml")!.async("string");
    expect(normalXml).toContain("答案解析");
    expect(normalXml).not.toContain("【答案】");
    expect(normalXml.indexOf("答案解析")).toBeGreaterThan(normalXml.indexOf("函数 f(x) 的定义域是？"));
    expect(normalXml.indexOf("A、C 均满足条件。")).toBeGreaterThan(normalXml.indexOf("答案解析"));

    const answersBlob = await buildExamPaperDocxBlob(
      multiplePaper,
      { [linkedQuestion.id]: linkedQuestion },
      { mode: "answers" },
    );
    const answersZip = await JSZip.loadAsync(await blobToArrayBuffer(answersBlob));
    const answersXml = await answersZip.file("word/document.xml")!.async("string");
    expect(answersXml).toContain("答案");
    expect(answersXml).toContain("AC");
    expect(answersXml).not.toContain("函数 f(x) 的定义域是？");
    expect(answersXml).not.toContain("A、C 均满足条件。");
  });

  it("only marks multiple-choice questions in flat paper layout", async () => {
    const groupedPaper: ExamPaper = {
      ...structuredPaper,
      layoutMode: "grouped",
      questions: [{ ...structuredPaper.questions[0], type: "multiple" }],
    };
    const blob = await buildExamPaperDocxBlob(groupedPaper, {}, { mode: "student" });
    const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));
    const documentXml = await zip.file("word/document.xml")!.async("string");

    expect(documentXml).not.toContain("（多选）");
  });

  it("bundles multiple selected paper variants into one zip download", async () => {
    await downloadExamPaperDocxVariants(
      structuredPaper,
      { [linkedQuestion.id]: linkedQuestion },
      ["student", "teacher"],
    );

    expect(saveAsMock).toHaveBeenCalledOnce();
    expect(saveAsMock.mock.calls[0][1]).toBe("函数_测试试卷_下载版本.zip");
    const archive = await JSZip.loadAsync(await blobToArrayBuffer(saveAsMock.mock.calls[0][0] as Blob));
    expect(archive.file("函数_测试试卷_学生用卷.docx")).not.toBeNull();
    expect(archive.file("函数_测试试卷_教师用卷.docx")).not.toBeNull();
  });

  it("lays out short choice options evenly on one line", async () => {
    const paper: ExamPaper = {
      ...structuredPaper,
      questions: [{
        ...structuredPaper.questions[0],
        options: ["甲", "乙", "丙", "丁"],
      }],
    };

    const blob = await buildExamPaperDocxBlob(paper, { [linkedQuestion.id]: linkedQuestion });
    const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));
    const documentXml = await zip.file("word/document.xml")!.async("string");
    const paragraphs = optionParagraphs(documentXml);

    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].getElementsByTagName("w:tab")).toHaveLength(6);
    expect(paragraphs[0].textContent).toContain("A. 甲B. 乙C. 丙D. 丁");
  });

  it("falls back to two choice options per line when four columns are too narrow", async () => {
    const paper: ExamPaper = {
      ...structuredPaper,
      questions: [{
        ...structuredPaper.questions[0],
        options: ["这是八个汉字选项", "也是八个汉字选项", "仍是八个汉字选项", "最后八个汉字选项"],
      }],
    };

    const blob = await buildExamPaperDocxBlob(paper, { [linkedQuestion.id]: linkedQuestion });
    const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));
    const documentXml = await zip.file("word/document.xml")!.async("string");
    const paragraphs = optionParagraphs(documentXml);

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].textContent).toContain("A. 这是八个汉字选项B. 也是八个汉字选项");
    expect(paragraphs[1].textContent).toContain("C. 仍是八个汉字选项D. 最后八个汉字选项");
    expect(paragraphs.every((paragraph) => paragraph.getElementsByTagName("w:tab").length === 2)).toBe(true);
  });

  it("falls back to one choice option per line when two columns are too narrow", async () => {
    const paper: ExamPaper = {
      ...structuredPaper,
      questions: [{
        ...structuredPaper.questions[0],
        options: [
          "这是一个明显超过半行宽度的很长中文选择题选项",
          "这是另一个明显超过半行宽度的很长中文选择题选项",
          "这是第三个明显超过半行宽度的很长中文选择题选项",
          "这是最后一个明显超过半行宽度的很长中文选择题选项",
        ],
      }],
    };

    const blob = await buildExamPaperDocxBlob(paper, { [linkedQuestion.id]: linkedQuestion });
    const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));
    const documentXml = await zip.file("word/document.xml")!.async("string");
    const paragraphs = optionParagraphs(documentXml);

    expect(paragraphs).toHaveLength(4);
    expect(paragraphs.map((paragraph) => paragraph.textContent?.slice(0, 3))).toEqual(["A. ", "B. ", "C. ", "D. "]);
    expect(paragraphs.every((paragraph) => paragraph.getElementsByTagName("w:tab").length === 0)).toBe(true);
  });

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
    expect(documentXml).toContain("A. ");
    expect(documentXml).toContain("B. ");
    expect(documentXml).not.toContain("<w:tbl");
    expect(documentXml).not.toContain("（5 分）");
    expect(documentXml).not.toContain("题库中的旧题干");
  });

  it("preserves rich-text images in the generated DOCX and keeps body paragraphs left-aligned", async () => {
    const png = Uint8Array.from(atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n0sAAAAASUVORK5CYII=",
    ), (character) => character.charCodeAt(0));
    fetchMock.mockResolvedValue(new Response(png, {
      status: 200,
      headers: { "content-type": "image/png" },
    }));

    const illustratedPaper: ExamPaper = {
      ...structuredPaper,
      questions: [],
      contentBlocks: [{
        id: "illustrated-knowledge",
        type: "knowledge",
        content: [
          "观察下图并计算 $x^2+1$：",
          "![函数图像](/api/files/file-1/assets/rId5?officeWidth=200&officeHeight=100)",
        ].join("\n"),
      }],
    };

    const blob = await buildExamPaperDocxBlob(illustratedPaper);
    const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));
    const documentXml = await zip.file("word/document.xml")!.async("string");
    const mediaFiles = Object.keys(zip.files).filter((name) => name.startsWith("word/media/") && !name.endsWith("/"));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/files/file-1/assets/rId5?officeWidth=200&officeHeight=100",
      { credentials: "same-origin" },
    );
    expect(mediaFiles).toHaveLength(1);
    expect(documentXml).toContain("<w:drawing>");
    expect(documentXml).toContain("<m:oMath");
    expect(documentXml).toMatch(/<w:jc w:val="left"\s*\/>/);
    expect(documentXml).not.toMatch(/<w:jc w:val="(?:both|distribute)"/);
    expect(documentXml).not.toContain("<img");
  });

  it("keeps comparison-heavy set formulas intact before converting them to Office Math", async () => {
    const setPaper: ExamPaper = {
      ...structuredPaper,
      questions: [{
        ...structuredPaper.questions[0],
        stem: "设 $B=\\{x|{x}^{2}-5x<0\\}$，选择正确的集合。",
        options: [
          "$\\{x|0<x<5\\}$",
          "$\\{x|1\\leq x<5\\}$",
          "$\\{x|0\\leq x<1\\}$",
          "$\\{x|1<x<5\\}$",
        ],
      }],
      contentBlocks: [{
        ...structuredPaper.contentBlocks![2],
        content: "设 $B=\\{x|{x}^{2}-5x<0\\}$，选择正确的集合。",
      }],
    };

    const blob = await buildExamPaperDocxBlob(setPaper, { [linkedQuestion.id]: linkedQuestion });
    const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));
    const documentXml = await zip.file("word/document.xml")!.async("string");

    expect(documentXml.match(/<m:oMath/g)).toHaveLength(5);
    expect(documentXml).not.toContain("$B=");
    expect(documentXml).not.toContain("$\\{x|");
    expect(documentXml).not.toContain("<w:tbl");
    expect(documentXml).not.toContain("（5 分）");
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

  it("coalesces fragmented imported scripts before converting them to Office math", async () => {
    const formulaPaper: ExamPaper = {
      ...structuredPaper,
      questions: [],
      contentBlocks: [{
        id: "fragmented-script-formula",
        type: "knowledge",
        content: [
          "由数列",
          '<i class="math-variable">a</i><sub><i class="math-variable">n</i></sub>',
          "定义得：",
          '<i class="math-variable">b</i><sub><i class="math-variable">n</i></sub>',
          "=",
          '<i class="math-variable">a</i>',
          "<sub>2</sub><sub>n</sub><sub>−</sub><sub>1</sub>",
          "=",
          '<i class="math-variable">q</i>',
          "<sup>n</sup><sup>−</sup><sup>1</sup>。",
        ].join(""),
      }],
    };

    const blob = await buildExamPaperDocxBlob(formulaPaper);
    const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));
    const documentXml = await zip.file("word/document.xml")!.async("string");

    expect(documentXml.match(/<m:oMath\b/g)?.length).toBeGreaterThanOrEqual(2);
    expect(documentXml).toContain("<m:sSub>");
    expect(documentXml).toContain("<m:sSup>");
    expect(documentXml).not.toContain("$_{");
    expect(documentXml).not.toContain("$b_");
    expect(documentXml).not.toContain("a_{2}_{n}");
    expect(documentXml).not.toContain("q^{n}^{-");
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

  it("supports lecture download modes and marks multiple-choice questions", async () => {
    const lectureQuestion: Question = {
      ...linkedQuestion,
      type: "multiple",
      stem: "下列结论正确的是？",
      answer: "AC",
      analysis: "逐项判断可得 A、C 正确。",
    };
    const lecture: Lecture = {
      id: "lecture-modes",
      teacherId: "teacher-1",
      schoolId: "school-1",
      title: "多选讲义",
      description: "",
      chapterIds: [],
      knowledgePointIds: [],
      grade: "高一",
      schoolYear: "2026-2027",
      semester: "上学期",
      classIds: [],
      studentIds: [],
      sections: [{
        id: "knowledge",
        title: "知识块",
        type: "knowledge",
        content: "先复习概念。",
        children: [{
          id: "question",
          title: "例题",
          type: "question",
          content: "",
          questionId: lectureQuestion.id,
          children: [],
        }],
      }],
      version: 1,
      status: "draft",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const studentBlob = await buildLectureDocxBlob(
      lecture,
      { [lectureQuestion.id]: lectureQuestion },
      { mode: "student" },
    );
    const studentZip = await JSZip.loadAsync(await blobToArrayBuffer(studentBlob));
    const studentXml = await studentZip.file("word/document.xml")!.async("string");
    expect(studentXml).toContain("（多选）");
    expect(studentXml).toContain("下列结论正确的是？");
    expect(studentXml).not.toContain("【答案】");

    const normalBlob = await buildLectureDocxBlob(
      lecture,
      { [lectureQuestion.id]: lectureQuestion },
      { mode: "normal" },
    );
    const normalZip = await JSZip.loadAsync(await blobToArrayBuffer(normalBlob));
    const normalXml = await normalZip.file("word/document.xml")!.async("string");
    expect(normalXml.indexOf("答案解析")).toBeGreaterThan(normalXml.indexOf("下列结论正确的是？"));
    expect(normalXml).toContain("逐项判断可得 A、C 正确。");

    const answersBlob = await buildLectureDocxBlob(
      lecture,
      { [lectureQuestion.id]: lectureQuestion },
      { mode: "answers" },
    );
    const answersZip = await JSZip.loadAsync(await blobToArrayBuffer(answersBlob));
    const answersXml = await answersZip.file("word/document.xml")!.async("string");
    expect(answersXml).toContain("AC");
    expect(answersXml).not.toContain("下列结论正确的是？");
    expect(answersXml).not.toContain("先复习概念。");
    expect(answersXml).not.toContain("逐项判断可得 A、C 正确。");
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
