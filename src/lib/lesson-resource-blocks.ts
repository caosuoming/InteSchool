import type { ExamPaper, Lecture, LessonDocumentBlock } from "@/types";
import { extractStoredFile } from "@/services/api";
import { parseDocumentBlocks, type DocumentBlock } from "@/lib/document-block-parser";
import { currentParseConfig } from "@/stores/extractTasks";
import { genId } from "@/lib/service-utils";

function hasLectureLessonBody(sections: Lecture["sections"] | null | undefined): boolean {
  return Array.isArray(sections) && sections.some((section) =>
    section.type === "question"
    || section.type === "knowledge"
    || hasLectureLessonBody(section.children));
}

function plainTextLessonBlocks(text: string, title: string): LessonDocumentBlock[] {
  // Preserve unstructured Word documents as editable content rather than a title-only courseware.
  const paragraphs = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const pages: string[] = [];
  let page = "";
  for (const paragraph of paragraphs) {
    for (let offset = 0; offset < paragraph.length; offset += 1200) {
      const part = paragraph.slice(offset, offset + 1200);
      if (page && page.length + part.length > 1200) {
        pages.push(page);
        page = "";
      }
      page += (page ? "\n\n" : "") + part;
    }
  }
  if (page) pages.push(page);
  return pages.map((content, index) => ({
    id: genId("lesson-block"),
    type: "knowledge" as const,
    title: pages.length === 1 ? title : `${title}（${index + 1}）`,
    content: content.replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/\n/g, "<br>"),
  }));
}

function lessonDocumentBlocks(blocks: DocumentBlock[]): LessonDocumentBlock[] {
  return blocks.flatMap<LessonDocumentBlock>((block) => {
    if (
      block.type === "documentTitle"
      || block.type === "documentInfo"
      || block.type === "groupTitle"
    ) {
      return [{
        id: block.id,
        type: block.type,
        content: block.content,
      }];
    }
    if (block.type === "knowledge") {
      return [{
        id: block.id,
        type: "knowledge" as const,
        title: block.knowledgeTitle,
        content: block.content,
        inlineAnswers: block.inlineAnswers,
      }];
    }
    if (block.type !== "question") return [];
    return [{
      id: block.id,
      type: "question" as const,
      content: block.content,
      questionType: block.questionType,
      options: block.options,
      answer: block.answer,
      analysis: block.analysis,
    }];
  });
}

export async function fallbackLessonBlocks(
  resource: ExamPaper | Lecture,
  resourceType: "examPaper" | "lecture",
  subject?: string,
): Promise<LessonDocumentBlock[]> {
  const hasBody = resourceType === "examPaper"
    ? (Boolean((resource as ExamPaper).questions?.length)
      || Boolean((resource as ExamPaper).contentBlocks?.some((block) =>
        block.type === "question" || block.type === "knowledge")))
    : hasLectureLessonBody((resource as Lecture).sections);
  if (hasBody || !resource.originalFileUrl) return [];

  // Creating slides only needs text. Full HTML extraction can fail for complex DOCX
  // preview content and is unnecessarily expensive.
  const extracted = await extractStoredFile(resource.originalFileUrl, { textOnly: true });
  const text = typeof extracted.text === "string" ? extracted.text.trim() : "";
  if (!text) throw new Error("原稿没有可读取的文字内容，请检查文档或先进行文档拆解");

  // Some legacy Word documents cannot be classified into structured blocks.
  // Keep their extracted text available in the lesson even when parsing fails.
  try {
    const blocks = lessonDocumentBlocks(parseDocumentBlocks(text, currentParseConfig(subject)));
    if (blocks.some((block) => block.type === "question" || block.type === "knowledge")) {
      return blocks;
    }
  } catch {
    // Text extraction succeeded, so a plain-text slide is still useful.
  }
  return plainTextLessonBlocks(text, resource.title);
}
