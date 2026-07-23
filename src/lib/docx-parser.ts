import JSZip from "jszip";
import katex from "katex";
import { ommlToLatex } from "./omml-to-latex";

declare const MathJax: any;

export type DocxItemType = "heading" | "paragraph" | "image" | "formula" | "list";

export interface DocxItem {
  type: DocxItemType;
  level?: number;
  text?: string;
  src?: string;
  alt?: string;
  width?: number;
  height?: number;
  latex?: string;
  displayMode?: boolean;
  omml?: string;
}

export interface ExtractedQuestion {
  type: string;
  stem: string;
  options?: string[];
  answer: string;
  analysis: string;
  difficulty: number;
}

export interface ExtractedKnowledge {
  title: string;
  content: string;
}

export interface DocxParseResult {
  items: DocxItem[];
  questions: ExtractedQuestion[];
  knowledgeBlocks: ExtractedKnowledge[];
}

const NAMESPACES = {
  w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  pic: "http://schemas.openxmlformats.org/drawingml/2006/picture",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  m: "http://schemas.openxmlformats.org/officeDocument/2006/math",
  o: "urn:schemas-microsoft-com:office:office",
  v: "urn:schemas-microsoft-com:vml",
};

export async function parseDocxFromBase64(base64Content: string): Promise<DocxParseResult> {
  try {
    const base64Data = base64Content.split(",")[1];
    const zip = await JSZip.loadAsync(base64Data, { base64: true });
    
    const contentXml = await zip.file("word/document.xml")?.async("string");
    if (!contentXml) {
      throw new Error("无法读取文档内容");
    }
    
    const relsXml = await zip.file("word/_rels/document.xml.rels")?.async("string");
    const relationships = parseRelationships(relsXml || "");
    
    const imageData: Record<string, string> = {};
    const embeddingData: Record<string, string> = {};
    for (const [relId, target] of Object.entries(relationships)) {
      if (target.startsWith("media/") || target.startsWith("image/")) {
        const zipPath = `word/${target}`;
        const mediaFile = zip.file(zipPath);
        if (mediaFile) {
          try {
            const base64 = await mediaFile.async("base64");
            const ext = target.split(".").pop()?.toLowerCase() || "png";
            const mimeType = getImageMimeType(ext);
            imageData[relId] = `data:${mimeType};base64,${base64}`;
          } catch (e) {
            console.warn("[DOCX解析] 图片读取失败:", target, e);
          }
        }
      } else if (target.startsWith("embeddings/")) {
        const zipPath = `word/${target}`;
        const embeddingFile = zip.file(zipPath);
        if (embeddingFile) {
          try {
            const base64 = await embeddingFile.async("base64");
            embeddingData[relId] = base64;
          } catch (e) {
            console.warn("[DOCX解析] embedding读取失败:", target, e);
          }
        }
      }
    }
    
    const items = await parseDocumentXml(contentXml, imageData, embeddingData);
    const plainTextItems = items
      .filter(i => i.type === "heading" || i.type === "paragraph" || i.type === "list")
      .map(i => ({ type: i.type as "heading" | "paragraph" | "list", level: i.level, text: i.text || "" }));
    
    const { questions, knowledgeBlocks } = extractFromItems(plainTextItems);
    
    return { items, questions, knowledgeBlocks };
  } catch (e) {
    console.error("[DOCX解析] 错误:", e);
    throw e;
  }
}

function getImageMimeType(ext: string): string {
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    bmp: "image/bmp",
    webp: "image/webp",
    svg: "image/svg+xml",
    tif: "image/tiff",
    tiff: "image/tiff",
    emf: "image/emf",
    wmf: "image/wmf",
  };
  return map[ext] || "image/png";
}

function generateMathTypePlaceholder(label: string, width: number, height: number): string {
  const w = Math.max(width, 80);
  const h = Math.max(height, 24);
  const displayLabel = label || "公式";
  const escapedLabel = displayLabel
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect x="0" y="0" width="${w}" height="${h}" rx="4" fill="#f8f5e9" stroke="#d4a24c" stroke-width="1"/><text x="${w / 2}" y="${h / 2 + 5}" text-anchor="middle" font-family="serif" font-size="${Math.min(h * 0.6, 16)}" fill="#8b6914">${escapedLabel}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

function parseRelationships(xml: string): Record<string, string> {
  const result: Record<string, string> = {};
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const rels = doc.getElementsByTagNameNS(NAMESPACES.r, "Relationship");
  for (let i = 0; i < rels.length; i++) {
    const rel = rels[i];
    const id = rel.getAttribute("Id");
    const target = rel.getAttribute("Target");
    if (id && target) {
      result[id] = target;
    }
  }
  return result;
}

async function parseDocumentXml(xml: string, imageData: Record<string, string>, embeddingData: Record<string, string> = {}): Promise<DocxItem[]> {
  const items: DocxItem[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  
  const body = doc.getElementsByTagNameNS(NAMESPACES.w, "body")[0];
  if (!body) return items;
  
  const children = Array.from(body.children);
  
  for (const child of children) {
    if (child.namespaceURI !== NAMESPACES.w) continue;
    const tag = child.localName;
    
    if (tag === "p") {
      const paragraphItems = await parseParagraph(child, imageData, embeddingData);
      items.push(...paragraphItems);
    } else if (tag === "tbl") {
      const tableItems = await parseTable(child, imageData, embeddingData);
      items.push(...tableItems);
    }
  }
  
  return items;
}

async function parseParagraph(p: Element, imageData: Record<string, string>, embeddingData: Record<string, string> = {}): Promise<DocxItem[]> {
  const results: DocxItem[] = [];
  
  let text = "";
  let hasImage = false;
  let hasFormula = false;
  let formulaText = "";
  const images: DocxItem[] = [];
  
  const processChild = async (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const ns = el.namespaceURI;
      const tag = el.localName;
      
      if (ns === NAMESPACES.w && tag === "t") {
        text += el.textContent || "";
        return;
      }
      
      if (ns === NAMESPACES.w && tag === "br") {
        text += "\n";
        return;
      }
      
      if (ns === NAMESPACES.w && tag === "tab") {
        text += "\t";
        return;
      }
      
      if (ns === NAMESPACES.m && (tag === "oMath" || tag === "oMathPara")) {
        hasFormula = true;
        const latex = ommlToLatex(el);
        if (latex) {
          formulaText += (formulaText ? " " : "") + latex;
          text += ` $${latex}$`;
        }
        return;
      }
      
      if (ns === NAMESPACES.w && tag === "drawing") {
        const img = extractImageFromDrawing(el, imageData);
        if (img) {
          images.push(img);
          hasImage = true;
        }
        return;
      }
      
      if (ns === NAMESPACES.v && tag === "imagedata") {
        const relId = el.getAttribute("o:title") || "";
        if (imageData[relId]) {
          images.push({
            type: "image",
            src: imageData[relId],
          });
        }
        return;
      }
      
      if (ns === NAMESPACES.w && tag === "pict") {
        const vmlShapes = el.getElementsByTagNameNS(NAMESPACES.v, "shape");
        for (let i = 0; i < vmlShapes.length; i++) {
          const shape = vmlShapes[i];
          const imagedata = shape.getElementsByTagNameNS(NAMESPACES.v, "imagedata")[0];
          if (imagedata) {
            const relId = imagedata.getAttribute("o:title") || "";
            const rId = imagedata.getAttribute("r:id") || "";
            const src = imageData[relId] || imageData[rId] || "";
            if (src) {
              const style = shape.getAttribute("style") || "";
              const widthMatch = style.match(/width:\s*([\d.]+)pt/i);
              const heightMatch = style.match(/height:\s*([\d.]+)pt/i);
              images.push({
                type: "image",
                src,
                width: widthMatch ? parseFloat(widthMatch[1]) : undefined,
                height: heightMatch ? parseFloat(heightMatch[1]) : undefined,
              });
              hasImage = true;
            }
          }
        }
        return;
      }
      
      if (ns === NAMESPACES.w && tag === "object") {
        try {
          const oleObjects = el.getElementsByTagNameNS(NAMESPACES.o, "OLEObject").length > 0
            ? el.getElementsByTagNameNS(NAMESPACES.o, "OLEObject")
            : el.getElementsByTagName("o:OLEObject");
          let isMathType = false;
          let embedRId = "";
          for (let i = 0; i < oleObjects.length; i++) {
            const progId = oleObjects[i].getAttribute("ProgID") || "";
            embedRId = oleObjects[i].getAttribute("r:id") || embedRId;
            if (progId.includes("Equation") || progId.includes("MathType") || progId.includes("Math")) {
              isMathType = true;
            }
          }
          
          const oWidth = el.getAttribute("w:dxaOrig") || el.getAttribute("dxaOrig") || "";
          const oHeight = el.getAttribute("w:dyaOrig") || el.getAttribute("dyaOrig") || "";
          const objWidth = oWidth ? Math.round(parseInt(oWidth) / 20) : 200;
          const objHeight = oHeight ? Math.round(parseInt(oHeight) / 20) : 40;
          
          let latexFromEmbedding = "";
          if (embedRId && embeddingData[embedRId]) {
            try {
              const embedBase64 = embeddingData[embedRId];
              const embedBytes = new Uint8Array(atob(embedBase64).split("").map(c => c.charCodeAt(0)));
              const embedZip = await JSZip.loadAsync(embedBytes);
              
              let embedDoc = await embedZip.file("MML/math.mml")?.async("string");
              if (!embedDoc) {
                embedDoc = await embedZip.file("math.mml")?.async("string");
              }
              if (!embedDoc) {
                embedDoc = await embedZip.file("MML/*.mml")?.async("string");
              }
              
              if (embedDoc) {
                latexFromEmbedding = ommlToLatex(embedDoc);
              }
            } catch (embedError) {
              console.warn("[DOCX解析] MathType embedding解析失败:", embedError);
            }
          }
          
          if (latexFromEmbedding) {
            hasFormula = true;
            formulaText = latexFromEmbedding;
            text += ` $${latexFromEmbedding}$`;
            return;
          }
          
          const vmlImagedata = el.getElementsByTagNameNS(NAMESPACES.v, "imagedata");
          let foundImage = false;
          for (let i = 0; i < vmlImagedata.length; i++) {
            const imagedata = vmlImagedata[i];
            const relId = imagedata.getAttribute("o:title") || "";
            const rId = imagedata.getAttribute("r:id") || "";
            const src = imageData[relId] || imageData[rId] || "";
            if (src) {
              images.push({
                type: "image",
                src,
                width: objWidth,
                height: objHeight,
              });
              hasImage = true;
              foundImage = true;
              break;
            }
          }
          
          if (!foundImage && isMathType) {
            images.push({
              type: "image",
              src: generateMathTypePlaceholder("公式", objWidth, objHeight),
              width: objWidth,
              height: objHeight,
            });
            hasImage = true;
          }
        } catch (e) {
          console.warn("[DOCX解析] 对象解析失败:", e);
        }
        return;
      }
      
      for (const childNode of Array.from(node.childNodes)) {
        await processChild(childNode);
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || "";
    }
  };
  
  for (const child of Array.from(p.children)) {
    await processChild(child);
  }
  
  const headingLevel = getHeadingLevel(p);
  
  // 始终返回段落/标题类型的item，确保文本内容不丢失
  // text字段已经包含了公式转换后的LaTeX（用$...$包裹）
  if (text.trim()) {
    results.push({
      type: headingLevel > 0 ? "heading" : "paragraph",
      level: headingLevel,
      text,
    });
  }
  
  // 如果有图片，也添加图片item
  if (hasImage) {
    results.push(...images);
  }
  
  // 单独的公式item（用于特殊渲染）
  if (hasFormula && formulaText) {
    results.push({
      type: "formula",
      latex: formulaText,
      text: text,
      displayMode: headingLevel === 0,
    });
  }
  
  return results;
}

function getHeadingLevel(p: Element): number {
  const pPr = p.getElementsByTagNameNS(NAMESPACES.w, "pPr")[0];
  if (!pPr) return 0;
  
  const pStyle = pPr.getElementsByTagNameNS(NAMESPACES.w, "pStyle")[0];
  if (!pStyle) return 0;
  
  const styleId = pStyle.getAttributeNS(NAMESPACES.w, "val");
  if (!styleId) return 0;
  
  const match = styleId.match(/^Heading(\d)$/);
  if (match) {
    return parseInt(match[1]);
  }
  
  return 0;
}

function extractImageFromDrawing(drawing: Element, imageData: Record<string, string>): DocxItem | null {
  const blips = drawing.getElementsByTagNameNS(NAMESPACES.a, "blip");
  for (let i = 0; i < blips.length; i++) {
    const blip = blips[i];
    const embedAttr = blip.getAttribute("r:embed");
    const linkAttr = blip.getAttribute("r:link");
    const relId = embedAttr || linkAttr || "";
    
    if (imageData[relId]) {
      let width: number | undefined;
      let height: number | undefined;
      
      const extents = drawing.getElementsByTagNameNS(NAMESPACES.a, "extent");
      if (extents.length > 0) {
        const cx = extents[0].getAttribute("cx");
        const cy = extents[0].getAttribute("cy");
        if (cx) width = parseFloat(cx) / 9525;
        if (cy) height = parseFloat(cy) / 9525;
      }
      
      return {
        type: "image",
        src: imageData[relId],
        width,
        height,
      };
    }
  }
  
  return null;
}

async function parseTable(tbl: Element, imageData: Record<string, string>, embeddingData: Record<string, string>): Promise<DocxItem[]> {
  const results: DocxItem[] = [];
  const rows = tbl.getElementsByTagNameNS(NAMESPACES.w, "tr");
  
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].getElementsByTagNameNS(NAMESPACES.w, "tc");
    const rowText: string[] = [];
    
    for (let j = 0; j < cells.length; j++) {
      const cellParagraphs = cells[j].getElementsByTagNameNS(NAMESPACES.w, "p");
      const cellText: string[] = [];
      
      for (let k = 0; k < cellParagraphs.length; k++) {
        const paragraphItems = await parseParagraph(cellParagraphs[k], imageData, embeddingData);
        for (const item of paragraphItems) {
          if (item.text) {
            cellText.push(item.text);
          }
        }
      }
      
      rowText.push(cellText.join("\n"));
    }
    
    if (rowText.length > 0) {
      results.push({
        type: "paragraph",
        text: rowText.join("\t"),
      });
    }
  }
  
  return results;
}

function extractFromItems(items: Array<{ type: "heading" | "paragraph" | "list"; level?: number; text: string }>): {
  questions: ExtractedQuestion[];
  knowledgeBlocks: ExtractedKnowledge[];
} {
  const questions: ExtractedQuestion[] = [];
  const knowledgeBlocks: ExtractedKnowledge[] = [];
  
  let currentKnowledge: ExtractedKnowledge | null = null;
  let currentQuestion: Partial<ExtractedQuestion> = {};
  let inQuestion = false;
  const optionsBuffer: string[] = [];
  const optionLetters: string[] = [];
  
  // 判断是否为标题
  const isKnowledgeHeading = (text: string): boolean => {
    const trimmedText = text.trim();
    const isCapitalNumberHeading = /^[一二三四五六七八九十]+[、．.）)\s]/.test(trimmedText) && 
                                   trimmedText.length < 100 && 
                                   !trimmedText.includes("\n");
    return isCapitalNumberHeading ||
           /^第[一二三四五六七八九十\d]+[章节编]/i.test(text) ||
           /^(知识点|知识要点|学习目标|教学重点|教学难点|核心结论|题型总结)/i.test(text);
  };
  
  // 判断是否为题目开头
  const isQuestionStart = (text: string): boolean => {
    if (/^(例|例题|习题|练习|选择题|填空题|判断题|解答题)\s*[\d一二三四五六七八九十]+[、．.）)]/.test(text)) {
      return true;
    }
    if (/^\s*[\d一二三四五六七八九十]+[、．.）)]/.test(text) && text.length > 5) {
      return !isKnowledgeHeading(text);
    }
    return false;
  };
  
  // 判断是否为解答题的小题
  const isSubQuestion = (text: string): boolean => {
    return /^\s*\(\d+\)\s*/.test(text) ||
           /^\s*[(（]\d+[)）]\s*/.test(text) ||
           /^\s*[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]\s*/.test(text);
  };
  
  const isEssayQuestion = (type: string): boolean => {
    return type === "essay";
  };
  
  // 从文本中提取所有选项（处理同一行中有多个选项的情况）
  const extractOptionsFromText = (text: string): { options: string[]; letters: string[] } => {
    const options: string[] = [];
    const letters: string[] = [];
    
    // 匹配选项模式：A. 内容 B. 内容 C. 内容 D. 内容
    const optionPattern = /([ABCDabcd][、．.）)\s]+)([^ABCDabcd①②③④⑤⑥⑦⑧⑨⑩]+?)(?=[ABCDabcd①②③④⑤⑥⑦⑧⑨⑩][、．.）)\s]+|$)/g;
    
    let match;
    while ((match = optionPattern.exec(text)) !== null) {
      const letterMatch = match[1].match(/([ABCDabcd])/);
      if (letterMatch) {
        const letter = letterMatch[1].toUpperCase();
        const content = match[2].trim();
        if (content) {
          letters.push(letter);
          options.push(content);
        }
      }
    }
    
    return { options, letters };
  };
  
  const isAnswer = (text: string): boolean => {
    return /^(【答案】|答案[：:])/.test(text);
  };
  
  const isAnalysis = (text: string): boolean => {
    return /^(【解析】|解析[：:]|【说明】|说明[：:]|【解题思路】|解题思路[：:]|【简析】|简析[：:])/.test(text);
  };
  
  // 根据答案判断是单选还是多选
  const guessQuestionTypeByAnswer = (answer: string): string => {
    const answerLetters = answer.match(/[ABCDabcd]/g);
    if (answerLetters && answerLetters.length > 1) {
      return "multiple";
    }
    return "single";
  };
  
  // 提交当前题目
  const submitQuestion = () => {
    if (!inQuestion || !currentQuestion.stem) return;
    
    let finalOptions = optionsBuffer;
    let finalType = currentQuestion.type || "short";
    
    // 智能判断题目类型
    if (optionsBuffer.length >= 2) {
      // 有多个选项，是选择题
      if (currentQuestion.answer) {
        finalType = guessQuestionTypeByAnswer(currentQuestion.answer);
      } else {
        finalType = "single";
      }
    } else if (optionsBuffer.length === 1) {
      // 只有一个选项，合并到题干中
      if (currentQuestion.stem && optionLetters[0]) {
        currentQuestion.stem += "\n" + optionLetters[0] + ". " + optionsBuffer[0];
      }
      finalOptions = [];
      finalType = currentQuestion.type || "short";
    } else {
      // 没有选项，根据题干内容判断类型
      if (currentQuestion.type === "essay" || 
          /(证明|求证|求解|计算|化简|求值|讨论|解答)/.test(currentQuestion.stem || "")) {
        finalType = "essay";
      }
      finalOptions = [];
    }
    
    questions.push({
      type: finalType,
      stem: currentQuestion.stem || "",
      options: finalOptions.length > 0 ? finalOptions : undefined,
      answer: currentQuestion.answer || "",
      analysis: currentQuestion.analysis || "",
      difficulty: (currentQuestion.difficulty as number) || 3,
    });
    
    currentQuestion = {};
    optionsBuffer.length = 0;
    optionLetters.length = 0;
    inQuestion = false;
  };
  
  for (const item of items) {
    const text = item.text;
    
    if (!text.trim()) continue;
    
    if (isKnowledgeHeading(text)) {
      submitQuestion();
      if (currentKnowledge && currentKnowledge.content.trim()) {
        knowledgeBlocks.push(currentKnowledge);
      }
      currentKnowledge = { title: text.replace(/^[一二三四五六七八九十]+[、．.）)]/, "").trim(), content: "" };
      continue;
    }
    
    if (isQuestionStart(text)) {
      submitQuestion();
      if (currentKnowledge && currentKnowledge.content.trim()) {
        knowledgeBlocks.push(currentKnowledge);
        currentKnowledge = null;
      }
      
      currentQuestion = {
        type: guessQuestionType(text),
        stem: text.replace(/^[\d一二三四五六七八九十]+[、．.）)]/, "").replace(/^(例|例题|习题|练习)\s*/, "").trim(),
        options: undefined,
        answer: "",
        analysis: "",
        difficulty: 3,
      };
      inQuestion = true;
      continue;
    }
    
    if (inQuestion) {
      // 尝试从文本中提取所有选项（处理同一行中有多个选项的情况）
      const { options, letters } = extractOptionsFromText(text);
      
      if (options.length > 0) {
        // 找到了选项，添加到选项缓冲区
        // 检查选项字母是否连续
        for (let i = 0; i < options.length; i++) {
          const expectedLetter = String.fromCharCode(65 + optionLetters.length);
          if (letters[i] === expectedLetter) {
            optionLetters.push(letters[i]);
            optionsBuffer.push(options[i]);
          } else {
            // 字母不连续，可能不是选项，合并到题干中
            currentQuestion.stem += (currentQuestion.stem ? "\n" : "") + text;
            break;
          }
        }
        continue;
      }
      
      if (isAnswer(text)) {
        currentQuestion.answer = text.replace(/^(【答案】|答案[：:])/, "").trim();
        continue;
      }
      
      if (isAnalysis(text)) {
        // 如果已经有解析内容，追加
        if (currentQuestion.analysis) {
          currentQuestion.analysis += "\n" + text.replace(/^(【解析】|解析[：:]|【说明】|说明[：:]|【解题思路】|解题思路[：:]|【简析】|简析[：:])/, "").trim();
        } else {
          currentQuestion.analysis = text.replace(/^(【解析】|解析[：:]|【说明】|说明[：:]|【解题思路】|解题思路[：:]|【简析】|简析[：:])/, "").trim();
        }
        continue;
      }
      
      // 处理解答题的小题
      if (isSubQuestion(text) && isEssayQuestion(currentQuestion.type as string)) {
        currentQuestion.stem += (currentQuestion.stem ? "\n" : "") + text;
        continue;
      }
      
      // 如果正在收集选项，且当前文本不是选项，可能是选项内容的延续
      if (optionsBuffer.length > 0) {
        optionsBuffer[optionsBuffer.length - 1] += " " + text.trim();
      } else if (currentQuestion.answer && !currentQuestion.analysis) {
        currentQuestion.analysis += (currentQuestion.analysis ? "\n" : "") + text;
      } else {
        currentQuestion.stem += (currentQuestion.stem ? "\n" : "") + text;
      }
    } else {
      if (!currentKnowledge) {
        currentKnowledge = { title: "知识内容", content: "" };
      }
      currentKnowledge.content += (currentKnowledge.content ? "\n" : "") + text;
    }
  }
  
  // 提交最后一个题目
  submitQuestion();
  
  if (currentKnowledge && currentKnowledge.content.trim()) {
    knowledgeBlocks.push(currentKnowledge);
  }
  
  return { questions, knowledgeBlocks };
}

function guessQuestionType(text: string): string {
  if (/选择题/.test(text)) return "single";
  if (/多选/.test(text)) return "multiple";
  if (/判断题/.test(text)) return "judge";
  if (/填空题/.test(text)) return "short";
  if (/解答题/.test(text)) return "essay";
  if (/计算题/.test(text)) return "essay";
  if (/证明题/.test(text)) return "essay";
  return "short";
}

export function renderInlineMath(text: string): string {
  const cleanText = text.replace(/\[公式\]/g, "");
  
  const parts: string[] = [];
  let lastIndex = 0;
  
  const mathPattern = /\$((?:[^$]|[\r\n])*?)\$/g;
  let match;
  
  while ((match = mathPattern.exec(cleanText)) !== null) {
    if (match.index > lastIndex) {
      parts.push(escapeHtml(cleanText.substring(lastIndex, match.index)));
    }
    
    const latex = match[1].trim();
    if (latex) {
      try {
        const formulaHtml = katex.renderToString(latex, {
          throwOnError: false,
          displayMode: false,
          output: "html",
          strict: false,
        });
        parts.push(`<span class="formula-inline" style="display: inline-flex; margin: 0 2px; vertical-align: 0.1em;">${formulaHtml}</span>`);
      } catch (error) {
        parts.push(`<span style="display: inline-flex; margin: 0 2px; vertical-align: 0.1em; font-family: monospace; color: #475569; background-color: #f8fafc; padding: 0 4px; border-radius: 4px;">${escapeHtml(latex)}</span>`);
      }
    }
    lastIndex = mathPattern.lastIndex;
  }
  
  if (lastIndex < cleanText.length) {
    parts.push(escapeHtml(cleanText.substring(lastIndex)));
  }
  
  return parts.join("");
}

export function renderDocxItems(items: DocxItem[]): string {
  let html = "";
  for (const item of items) {
    if (item.type === "heading") {
      const tag = `h${Math.min(item.level || 2, 6)}`;
      const text = item.text || "";
      html += `<${tag} class="font-serif font-semibold text-ink-900 mb-2 mt-4">${renderInlineMath(text)}</${tag}>`;
    } else if (item.type === "paragraph") {
      const text = item.text || "";
      html += `<p class="text-sm text-ink-700 mb-2 leading-relaxed whitespace-pre-wrap">${renderInlineMath(text)}</p>`;
    } else if (item.type === "image") {
      const width = item.width ? `max-width: ${Math.min(item.width, 600)}px;` : "max-width: 100%;";
      html += `<div class="my-4 text-center"><img src="${item.src}" alt="${escapeHtml(item.alt || "图片")}" style="${width} height: auto;" class="inline-block rounded border border-ink-200" /></div>`;
    } else if (item.type === "formula") {
      const latex = item.latex || item.text || "";
      const isDisplayMode = item.displayMode !== false;
      if (latex) {
        try {
          const formulaHtml = katex.renderToString(latex, {
            throwOnError: false,
            displayMode: isDisplayMode,
            output: "html",
          });
          if (isDisplayMode) {
            html += `<div class="my-3 text-center overflow-x-auto formula-display">${formulaHtml}</div>`;
          } else {
            html += `<span class="formula-inline" style="display: inline-flex; margin: 0 2px; vertical-align: 0.1em;">${formulaHtml}</span>`;
          }
        } catch {
          html += `<div class="my-2 px-3 py-2 bg-ink-50 rounded text-ink-700 text-sm font-mono">${escapeHtml(latex)}</div>`;
        }
      } else {
        html += `<div class="my-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-amber-700 text-sm">${escapeHtml(item.text || "[公式]")}</div>`;
      }
    } else if (item.type === "list") {
      const text = item.text || "";
      html += `<li class="text-sm text-ink-700 ml-4 mb-1">${renderInlineMath(text)}</li>`;
    }
  }
  return html;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}