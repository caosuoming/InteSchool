import { describe, expect, it } from "vitest";

import {
  documentCategory,
  isPdfDocumentResource,
  isDocumentStructureLocked,
  originalDocumentFileType,
} from "./document-resource";

describe("document resources", () => {
  it("classifies an unprocessed upload as an uploaded original", () => {
    const source = {
      id: "source-1",
      originalFileUrl: "/uploads/source.docx",
      extractStatus: "pending" as const,
    };

    expect(documentCategory(source, [source])).toBe("uploaded");
    expect(isDocumentStructureLocked(source)).toBe(true);
  });

  it("classifies an uploaded source with an extract copy as an extracted document group", () => {
    const source = {
      id: "source-1",
      originalFileUrl: "/uploads/source.docx",
      extractStatus: "pending" as const,
    };
    const copy = {
      id: "copy-1",
      isExtractCopy: true,
      sourceResourceId: source.id,
    };

    expect(documentCategory(source, [source, copy])).toBe("extracted");
    expect(documentCategory(copy, [source, copy])).toBe("extracted");
    expect(isDocumentStructureLocked(copy)).toBe(true);
  });

  it("classifies documents without upload or extract provenance as authored or copied", () => {
    const authored = { id: "authored-1" };

    expect(documentCategory(authored, [authored])).toBe("authored");
    expect(isDocumentStructureLocked(authored)).toBe(false);
  });

  it("detects Word and PDF originals from metadata or legacy file names", () => {
    expect(originalDocumentFileType({ originalFileType: "word" })).toBe("word");
    expect(originalDocumentFileType({ originalFileName: "期末试卷.DOCX" })).toBe("word");
    expect(originalDocumentFileType({ originalFileName: "函数讲义.PDF" })).toBe("pdf");
    expect(isPdfDocumentResource({ originalFileType: "pdf" })).toBe(true);
    expect(isPdfDocumentResource({ originalFileName: "函数讲义.pdf" })).toBe(true);
    expect(isPdfDocumentResource({ originalFileName: "函数讲义.docx" })).toBe(false);
  });
});
