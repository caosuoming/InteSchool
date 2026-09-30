import type {
  Courseware,
  LessonCourseware,
  LessonSlide,
  LessonSlideElement,
} from "@/types";
import { renderMathHtml } from "@/lib/math-html";

export interface OfflineCoursewareExportResult {
  fileName: string;
  warnings: string[];
}

interface PreparedOfflineCourseware {
  title: string;
  slides: LessonSlide[];
}

function safeFileStem(value: string): string {
  return Array.from(value.trim() || "未命名课件")
    .map((character) => character.charCodeAt(0) < 32 ? "_" : character)
    .join("")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 100) || "未命名课件";
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("资源读取失败"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

function isInlineDataUrl(value: string): boolean {
  return /^data:/i.test(value);
}

function isFetchableAssetUrl(value: string): boolean {
  return /^(?:https?:\/\/|blob:|\/|\.\/|\.\.\/)/i.test(value);
}

function displayAssetName(value: string): string {
  try {
    const url = new URL(value, window.location.href);
    return decodeURIComponent(url.pathname.split("/").pop() || url.pathname || value);
  } catch {
    return value;
  }
}

function coursewareAsOfflineLesson(courseware: Courseware): LessonCourseware {
  const slide: LessonSlide = courseware.fileUrl
    ? {
        id: `offline-courseware-${courseware.id}`,
        type: "courseware",
        title: courseware.title,
        content: courseware.content,
        coursewareType: courseware.type,
        fileUrl: courseware.fileUrl,
        fileName: courseware.fileName,
        onlineAccessToken: courseware.onlineAccessToken,
        editorUrl: courseware.editorUrl,
        openInWps: courseware.type === "ppt",
        elements: [],
      }
    : {
        id: `offline-courseware-${courseware.id}`,
        type: "knowledge",
        title: courseware.title,
        content: courseware.content || courseware.description || "该课件暂无可离线展示的文件内容。",
        relatedQuestionIds: [],
        askableStudentIds: [],
      };

  return {
    id: `offline-${courseware.id}`,
    teacherId: courseware.teacherId,
    schoolId: courseware.schoolId,
    title: courseware.title,
    description: courseware.description,
    chapterIds: [...courseware.chapterIds],
    knowledgePointIds: [...courseware.knowledgePointIds],
    grade: courseware.grade,
    schoolYear: courseware.schoolYear,
    semester: courseware.semester,
    sourceType: "courseware",
    sourceId: courseware.id,
    sourceTitle: courseware.title,
    libraryCoursewareId: courseware.id,
    slides: [slide],
    classIds: [],
    status: "draft",
    lifecycleStatus: "active",
    createdAt: courseware.createdAt,
    updatedAt: courseware.updatedAt,
  };
}

export function offlineLessonFromLibraryCourseware(courseware: Courseware): LessonCourseware {
  return coursewareAsOfflineLesson(courseware);
}

async function prepareOfflineCourseware(
  courseware: LessonCourseware,
): Promise<{ courseware: PreparedOfflineCourseware; warnings: string[] }> {
  const warnings: string[] = [];
  const assetCache = new Map<string, Promise<string>>();

  const inlineAsset = async (source: string | undefined): Promise<string | undefined> => {
    if (!source || isInlineDataUrl(source)) return source;
    if (!isFetchableAssetUrl(source)) {
      warnings.push(`未打包外部资源：${source}`);
      return source;
    }

    let pending = assetCache.get(source);
    if (!pending) {
      pending = (async () => {
        try {
          const absolute = new URL(source, window.location.href);
          const response = await fetch(absolute.href, {
            credentials: absolute.origin === window.location.origin ? "include" : "omit",
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return await blobToDataUrl(await response.blob());
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          warnings.push(`资源“${displayAssetName(source)}”未能打包（${detail}）`);
          return source;
        }
      })();
      assetCache.set(source, pending);
    }
    return pending;
  };

  const renderRichText = async (value: string | undefined): Promise<string | undefined> => {
    if (!value) return value;
    const template = document.createElement("template");
    template.innerHTML = renderMathHtml(value);
    const images = Array.from(template.content.querySelectorAll<HTMLImageElement>("img[src]"));
    await Promise.all(images.map(async (image) => {
      const source = image.getAttribute("src");
      if (!source) return;
      image.src = await inlineAsset(source) || source;
      image.removeAttribute("loading");
    }));
    return template.innerHTML;
  };

  const prepareElement = async (element: LessonSlideElement): Promise<LessonSlideElement> => {
    if (element.kind === "text") {
      return {
        ...element,
        content: await renderRichText(element.content) || "",
      };
    }
    return {
      ...element,
      src: await inlineAsset(element.src) || element.src,
    };
  };

  const slides = await Promise.all(courseware.slides.map(async (slide): Promise<LessonSlide> => {
    const questionSnapshot = slide.questionSnapshot
      ? {
          ...slide.questionSnapshot,
          stem: await renderRichText(slide.questionSnapshot.stem) || "",
          options: slide.questionSnapshot.options
            ? await Promise.all(slide.questionSnapshot.options.map(async (option) => await renderRichText(option) || ""))
            : undefined,
          answer: await renderRichText(slide.questionSnapshot.answer) || "",
          analysis: await renderRichText(slide.questionSnapshot.analysis) || "",
          summary: await renderRichText(slide.questionSnapshot.summary),
          board: await renderRichText(slide.questionSnapshot.board),
          boardImages: slide.questionSnapshot.boardImages
            ? await Promise.all(slide.questionSnapshot.boardImages.map(async (source) => await inlineAsset(source) || source))
            : undefined,
          explanationVideo: slide.questionSnapshot.explanationVideo
            ? {
                ...slide.questionSnapshot.explanationVideo,
                fileUrl: await inlineAsset(slide.questionSnapshot.explanationVideo.fileUrl),
              }
            : slide.questionSnapshot.explanationVideo,
        }
      : undefined;

    return {
      ...slide,
      title: await renderRichText(slide.title) || "",
      content: await renderRichText(slide.content),
      fileUrl: await inlineAsset(slide.fileUrl),
      questionSnapshot,
      elements: slide.elements
        ? await Promise.all(slide.elements.map(prepareElement))
        : undefined,
    };
  }));

  return {
    courseware: {
      title: courseware.title,
      slides,
    },
    warnings: Array.from(new Set(warnings)),
  };
}

export async function buildOfflineLessonCoursewareHtml(
  courseware: LessonCourseware,
): Promise<{ html: string; warnings: string[] }> {
  const prepared = await prepareOfflineCourseware(courseware);
  const data = safeJsonForScript(prepared.courseware);
  const title = escapeHtmlText(courseware.title || "脱机课件");

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>${title} · InteSchool 脱机课件</title>
<style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#eef1f5;color:#18212f;font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif}button,input,select{font:inherit}.app{height:100%;display:grid;grid-template-rows:50px minmax(0,1fr) 64px}.topbar,.bottombar{display:flex;align-items:center;gap:8px;padding:7px 12px;background:rgba(255,255,255,.96);border-color:#d8dee8;z-index:30;box-shadow:0 1px 10px rgba(15,23,42,.08)}.topbar{border-bottom:1px solid #d8dee8}.bottombar{border-top:1px solid #d8dee8;justify-content:center;overflow:visible}.brand{font-weight:800;white-space:nowrap;color:#111827}.title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569}.spacer{flex:1}.stage-shell{min-height:0;display:flex;position:relative}.sidebar{width:220px;min-width:220px;overflow:auto;border-right:1px solid #d8dee8;background:#f8fafc;padding:10px;transition:.18s;z-index:18}.sidebar.hidden{display:none}.thumb{display:block;width:100%;text-align:left;background:#fff;color:#475569;border:1px solid #e2e8f0;border-radius:10px;padding:9px 10px;margin-bottom:8px;cursor:pointer}.thumb:hover{border-color:#d6aa4b}.thumb.active{border-color:#d6aa4b;background:#fff8e7;color:#111827;box-shadow:0 0 0 1px #d6aa4b inset}.thumb-number{font-size:11px;color:#94a3b8}.thumb-title{margin-top:3px;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.stage{min-width:0;min-height:0;flex:1;display:flex;align-items:center;justify-content:center;padding:18px;position:relative;overflow:hidden}.slide{position:relative;width:min(100%,calc((100vh - 164px)*16/9));aspect-ratio:16/9;background:#fffef8;color:#111827;overflow:hidden;box-shadow:0 16px 50px rgba(15,23,42,.18)}.layer{position:absolute;inset:0}.element{position:absolute;overflow:hidden}.element.selected{outline:2px solid #d6aa4b;outline-offset:2px}.element.text{white-space:pre-wrap;line-height:1.45}.element.text a{color:#a16207}.element img,.element video{width:100%;height:100%;object-fit:contain}.element audio{width:100%}.rich img{max-width:100%;max-height:100%;object-fit:contain}.rich table{border-collapse:collapse;max-width:100%}.rich td,.rich th{border:1px solid #94a3b8;padding:.25em .45em}.katex-html{display:none!important}.katex-mathml{display:inline!important}.katex-formula-block .katex-mathml{display:block!important;text-align:center;margin:.35em 0}.courseware-file{position:absolute;inset:7%;border:1px solid #d7dce6;border-radius:18px;background:white;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:28px;gap:16px}.courseware-file iframe,.courseware-file img,.courseware-file video{width:100%;height:100%;border:0;object-fit:contain}.file-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}.action,.tool{border:1px solid #d8dee8;background:#fff;color:#334155;border-radius:9px;padding:7px 10px;cursor:pointer;white-space:nowrap}.action:hover,.tool:hover{border-color:#d6aa4b;background:#fff8e7}.action.active,.tool.active{border-color:#d6aa4b;background:#fff1c9;color:#111827;box-shadow:0 0 0 1px #d6aa4b inset}.action:disabled,.tool:disabled{opacity:.4;cursor:not-allowed}.page{min-width:72px;text-align:center;color:#64748b}.answer-controls,.drawing-tools,.tool-group{display:flex;align-items:center;gap:5px}.separator{width:1px;height:30px;background:#d8dee8;margin:0 2px}.annotation{position:absolute;inset:0;z-index:8;touch-action:none;pointer-events:none}.annotation.enabled{pointer-events:auto;cursor:crosshair}.empty{color:#94a3b8;text-align:center;padding:40px}.offline-badge{font-size:11px;color:#8a6518;border:1px solid #d6aa4b;border-radius:999px;padding:3px 8px;background:#fff8e7}.preset-wrap,.popup-wrap{position:relative}.swatch{display:inline-block;width:12px;height:12px;border-radius:999px;border:1px solid rgba(15,23,42,.18);vertical-align:-1px;margin-right:5px}.settings-toggle{position:absolute;right:-4px;top:-5px;width:16px;height:16px;border:0;border-radius:999px;background:#334155;color:#fff;font-size:10px;line-height:16px;padding:0;cursor:pointer}.popup{position:absolute;bottom:calc(100% + 9px);left:50%;transform:translateX(-50%);min-width:220px;border:1px solid #d8dee8;border-radius:12px;background:#fff;padding:10px;color:#334155;box-shadow:0 18px 40px rgba(15,23,42,.2);z-index:80}.popup.right{left:auto;right:0;transform:none}.popup.hidden{display:none}.popup-row{display:flex;align-items:center;gap:8px;margin-top:7px}.popup-row:first-child{margin-top:0}.popup label{font-size:11px;color:#64748b}.popup input[type=color]{width:34px;height:26px;padding:1px;border:1px solid #d8dee8;border-radius:6px;background:#fff}.popup input[type=range]{width:130px}.mini{font-size:11px;padding:5px 7px}.board-panel{position:absolute;z-index:22;right:2%;top:5%;width:min(42%,620px);height:80%;min-width:360px;min-height:260px;border:1px solid #cbd5e1;border-radius:16px;background:#fff;box-shadow:0 18px 50px rgba(15,23,42,.25);display:flex;flex-direction:column;overflow:hidden;resize:both}.board-panel.board-fullscreen{inset:1%!important;width:auto!important;height:auto!important;min-width:0;min-height:0;resize:none}.board-panel.hidden{display:none}.board-header{display:flex;align-items:center;gap:6px;padding:7px 9px;border-bottom:1px solid #e2e8f0;background:#f8fafc}.board-title{font-size:13px;font-weight:700}.board-tabs{display:flex;gap:4px;min-width:0;overflow:auto;flex:1}.board-tab{border:1px solid #d8dee8;background:#fff;border-radius:7px;padding:4px 7px;font-size:11px;cursor:pointer}.board-tab.active{border-color:#d6aa4b;background:#fff1c9}.board-area{position:relative;flex:1;min-height:0;background:#fffef8}.board-canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair}.color-grid{display:grid;grid-template-columns:auto auto;gap:8px;align-items:center}.font-control{display:flex;align-items:center;gap:4px;border:1px solid #d8dee8;border-radius:9px;padding:3px 6px;background:#fff;color:#64748b;font-size:11px}.font-control select{border:0;background:transparent;color:#334155;outline:none}.enter-fade{animation:fade .35s ease-out both}.enter-rise{animation:rise .4s cubic-bezier(.16,1,.3,1) both}.enter-zoom{animation:zoom .32s ease-out both}@keyframes fade{from{opacity:0}to{opacity:1}}@keyframes rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}@keyframes zoom{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}@media(max-width:1050px){.answer-controls{display:none}.bottombar{justify-content:flex-start;overflow-x:auto}.board-panel{left:4%;right:4%;width:auto;min-width:0}}@media(max-width:800px){.sidebar{position:absolute;z-index:25;left:0;top:0;bottom:0;width:190px}.stage{padding:8px}.topbar{padding:7px 9px}.brand{display:none}.action,.tool{padding:6px 8px}.bottombar{padding:7px;gap:5px}.drawing-tools{gap:4px}}
</style>
</head>
<body>
<div class="app">
  <header class="topbar">
    <div class="brand">InteSchool</div>
    <div class="offline-badge">脱机课件</div>
    <div id="deckTitle" class="title"></div>
    <div class="spacer"></div>
    <button id="toggleSidebar" class="action" type="button">缩略页</button>
    <button id="fullscreen" class="action" type="button">全屏</button>
  </header>
  <main class="stage-shell">
    <aside id="sidebar" class="sidebar"></aside>
    <section class="stage">
      <div id="slide" class="slide" aria-live="polite"></div>
      <canvas id="annotation" class="annotation" aria-label="课件批注画布"></canvas>
      <section id="boardPanel" class="board-panel hidden" aria-label="板书 1">
        <header class="board-header">
          <span class="board-title">板书 1</span>
          <div id="boardTabs" class="board-tabs"></div>
          <button id="addBoardArea" class="tool mini" type="button">+ 书写区</button>
          <button id="removeBoardArea" class="tool mini" type="button">删除</button>
          <button id="boardFullscreen" class="tool mini" type="button" aria-label="从左侧全屏板书 1">全屏</button>
          <button id="boardScreenshot" class="tool mini" type="button" aria-label="从左侧截图板书 1">截图</button>
          <button id="closeBoard" class="tool mini" type="button">收起</button>
        </header>
        <div id="boardArea" class="board-area">
          <canvas id="boardCanvas" class="board-canvas" aria-label="板书 1书写区 1"></canvas>
        </div>
      </section>
    </section>
  </main>
  <footer class="bottombar">
    <div class="tool-group">
      <button id="prev" class="action" type="button">上一页</button>
      <div id="page" class="page"></div>
      <button id="next" class="action" type="button">下一步</button>
    </div>
    <div class="answer-controls">
      <button id="toggleOptions" class="tool active" type="button">选项</button>
      <button id="toggleAnswer" class="tool" type="button">答案</button>
      <button id="toggleAnalysis" class="tool" type="button">解析</button>
      <button id="toggleSupplementary" class="tool" type="button">补充</button>
    </div>
    <div class="separator"></div>
    <div id="drawingTools" class="drawing-tools" aria-label="书写工具">
      <button id="selectTool" class="tool" type="button" aria-label="选择工具">选择</button>
      <div class="separator"></div>
      <div class="preset-wrap">
        <button id="pen-red" class="tool preset-tool" type="button" aria-label="红色画笔"><span class="swatch"></span>红笔</button>
        <button class="settings-toggle" data-settings-for="pen-red" type="button" aria-label="设置红色画笔">⌃</button>
        <div id="settings-pen-red" class="popup hidden"></div>
      </div>
      <div class="preset-wrap">
        <button id="pen-blue" class="tool preset-tool" type="button" aria-label="蓝色画笔"><span class="swatch"></span>蓝笔</button>
        <button class="settings-toggle" data-settings-for="pen-blue" type="button" aria-label="设置蓝色画笔">⌃</button>
        <div id="settings-pen-blue" class="popup hidden"></div>
      </div>
      <div class="preset-wrap">
        <button id="pen-black" class="tool preset-tool" type="button" aria-label="黑色画笔"><span class="swatch"></span>黑笔</button>
        <button class="settings-toggle" data-settings-for="pen-black" type="button" aria-label="设置黑色画笔">⌃</button>
        <div id="settings-pen-black" class="popup hidden"></div>
      </div>
      <div class="preset-wrap">
        <button id="highlighter-yellow" class="tool preset-tool" type="button" aria-label="黄色荧光笔"><span class="swatch"></span>黄荧光</button>
        <button class="settings-toggle" data-settings-for="highlighter-yellow" type="button" aria-label="设置黄色荧光笔">⌃</button>
        <div id="settings-highlighter-yellow" class="popup hidden"></div>
      </div>
      <div class="preset-wrap">
        <button id="highlighter-green" class="tool preset-tool" type="button" aria-label="绿色荧光笔"><span class="swatch"></span>绿荧光</button>
        <button class="settings-toggle" data-settings-for="highlighter-green" type="button" aria-label="设置绿色荧光笔">⌃</button>
        <div id="settings-highlighter-green" class="popup hidden"></div>
      </div>
      <div class="separator"></div>
      <div class="popup-wrap">
        <button id="eraser" class="tool" type="button" aria-label="橡皮擦">橡皮</button>
        <button id="eraserSettingsToggle" class="settings-toggle" type="button" aria-label="橡皮擦设置与撤销">⌃</button>
        <div id="eraserSettings" class="popup hidden">
          <div class="popup-row"><button id="undoEraser" class="tool mini" type="button">撤销擦除</button></div>
          <div class="popup-row"><label>擦除范围</label><button class="tool mini eraser-size" data-width="12" type="button">12</button><button class="tool mini eraser-size" data-width="24" type="button">24</button><button class="tool mini eraser-size" data-width="48" type="button">48</button></div>
        </div>
      </div>
      <div class="popup-wrap">
        <button id="clearInk" class="tool" type="button">清屏</button>
        <button id="clearSettingsToggle" class="settings-toggle" type="button" aria-label="清屏操作">⌃</button>
        <div id="clearSettings" class="popup hidden"><button id="undoClear" class="tool mini" type="button">撤销清屏</button></div>
      </div>
      <button id="toggleBoard" class="tool" type="button" aria-label="打开板书">板书</button>
      <div class="popup-wrap">
        <button id="colorSettingsToggle" class="tool" type="button" aria-label="页面与板书颜色设置">颜色</button>
        <div id="colorSettings" class="popup right hidden">
          <div class="color-grid">
            <label for="pageColor">页面颜色</label><input id="pageColor" type="color" value="#fffef8" aria-label="页面颜色">
            <label for="textColor">文字颜色</label><input id="textColor" type="color" value="#111827" aria-label="文字颜色">
            <label for="boardColor">板书背景颜色</label><input id="boardColor" type="color" value="#fffef8" aria-label="板书背景颜色">
          </div>
          <div class="popup-row"><button id="resetColors" class="tool mini" type="button">恢复默认颜色</button></div>
        </div>
      </div>
      <label class="font-control">字号
        <select id="fontSize" aria-label="课件字号">
          <option>18</option><option>20</option><option>22</option><option selected>24</option><option>26</option><option>28</option><option>32</option><option>36</option><option>40</option>
        </select>
      </label>
      <button id="shrinkSelectedText" class="tool" type="button" aria-label="缩小所选文本" disabled>字−</button>
      <button id="growSelectedText" class="tool" type="button" aria-label="放大所选文本" disabled>字＋</button>
    </div>
  </footer>
</div>
<script>
(function(){
"use strict";
var deck=${data};
var index=0;
var animationProgress=Object.create(null);
var visibility={options:true,answer:false,analysis:false,supplementary:false};
var drawingPresets={
  "pen-red":{kind:"pen",label:"红色画笔",color:"#dc2626",width:3},
  "pen-blue":{kind:"pen",label:"蓝色画笔",color:"#2563eb",width:3},
  "pen-black":{kind:"pen",label:"黑色画笔",color:"#111827",width:3},
  "highlighter-yellow":{kind:"highlighter",label:"黄色荧光笔",color:"#facc15",width:18},
  "highlighter-green":{kind:"highlighter",label:"绿色荧光笔",color:"#4ade80",width:18}
};
var drawingMode="none";
var eraserWidth=24;
var drawing=false;
var inkBySlide=Object.create(null);
var clearUndoBySurface=Object.create(null);
var boardAreas=[{id:"board-area-1",strokes:[]}];
var activeBoardArea=0;
var activeSurface="slide";
var boardVisible=false;
var positionOverrides=Object.create(null);
var textScaleOverrides=Object.create(null);
var selectedElementId=null;
var selectDrag=null;
var boardFullscreen=false;
var colorPreferences={pageBackgroundColor:"#fffef8",textColor:"#111827",boardBackgroundColor:"#fffef8"};
var presentationFontSize=24;
var $=function(id){return document.getElementById(id);};
var slideEl=$("slide"), sidebar=$("sidebar"), canvas=$("annotation"), ctx=canvas.getContext("2d");
var boardPanel=$("boardPanel"), boardArea=$("boardArea"), boardCanvas=$("boardCanvas"), boardCtx=boardCanvas.getContext("2d");
$("deckTitle").textContent=deck.title || "脱机课件";

function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function esc(value){return String(value==null?"":value).replace(/[&<>"]/g,function(ch){if(ch==="&")return "&amp;";if(ch==="<")return "&lt;";if(ch===">")return "&gt;";return "&quot;";});}
function isVisibleQuestionElement(element){
  if(!element.questionSection || element.questionSection==="stem") return true;
  return visibility[element.questionSection] !== false;
}
function animationOrder(element){
  var has=(element.enterAnimation&&element.enterAnimation!=="none")||(element.animation&&element.animation!=="none")||(element.actionAnimation&&element.actionAnimation!=="none")||(element.exitAnimation&&element.exitAnimation!=="none");
  var order=Number(element.animationOrder);
  return has && Number.isFinite(order) && order>0 ? order : null;
}
function presentationElements(slide){
  var existing=slide.elements||[];
  if(slide.freeformLayout || slide.type==="courseware") return existing;
  if(slide.type==="section"){
    var items=[{id:"built-title",kind:"text",content:slide.title||"",x:10,y:18,width:80,height:24,fontSize:(slide.textStyles&&slide.textStyles.title&&slide.textStyles.title.fontSize)||38,textAlign:"center"}];
    if(slide.content) items.push({id:"built-content",kind:"text",content:slide.content,x:14,y:48,width:72,height:28,fontSize:(slide.textStyles&&slide.textStyles.content&&slide.textStyles.content.fontSize)||22,textAlign:"center"});
    return items.concat(existing);
  }
  if(slide.type==="question" && slide.questionSnapshot){
    var q=slide.questionSnapshot, items=[];
    items.push({id:"built-stem",kind:"text",content:q.stem||"",x:5,y:5,width:90,height:23,fontSize:(slide.textStyles&&slide.textStyles.stem&&slide.textStyles.stem.fontSize)||26,questionSection:"stem"});
    (q.options||[]).forEach(function(option,i){
      items.push({id:"built-option-"+i,kind:"text",content:"<strong>"+String.fromCharCode(65+i)+".</strong> "+option,x:5+(i%2)*47,y:32+Math.floor(i/2)*15,width:(q.options&&q.options.length>1)?43:90,height:12,fontSize:(slide.textStyles&&slide.textStyles.options&&slide.textStyles.options.fontSize)||20,questionSection:"options"});
    });
    if(q.answer) items.push({id:"built-answer",kind:"text",content:"<strong>参考答案</strong><br>"+q.answer,x:5,y:68,width:42,height:24,fontSize:18,questionSection:"answer"});
    if(q.analysis||q.summary||q.board){
      var body=(q.analysis||"")+(q.summary?"<br><strong>总结</strong><br>"+q.summary:"")+(q.board?"<br><strong>板书</strong><br>"+q.board:"");
      items.push({id:"built-analysis",kind:"text",content:"<strong>解析</strong><br>"+body,x:53,y:68,width:42,height:24,fontSize:18,questionSection:"analysis"});
    }
    return items.concat(existing);
  }
  var result=[];
  if(slide.content) result.push({id:"built-content",kind:"text",content:slide.content,x:5,y:6,width:90,height:88,fontSize:(slide.textStyles&&slide.textStyles.content&&slide.textStyles.content.fontSize)||24});
  return result.concat(existing);
}
function animationSteps(slide){
  var set={};
  presentationElements(slide).forEach(function(element){var order=animationOrder(element);if(order!==null)set[order]=true;});
  return Object.keys(set).map(Number).sort(function(a,b){return a-b;});
}
function shownElements(slide){
  var all=presentationElements(slide).filter(isVisibleQuestionElement);
  var steps=animationSteps(slide), progress=animationProgress[slide.id]||0;
  if(!steps.length) return all;
  var last=progress>0?steps[Math.min(progress,steps.length)-1]:null;
  return all.filter(function(element){var order=animationOrder(element);return order===null||(last!==null&&order<=last);});
}
function styleElement(node,element){
  var slide=deck.slides[index], override=slide&&positionOverrides[slide.id]&&positionOverrides[slide.id][element.id];
  var textScale=slide&&textScaleOverrides[slide.id]&&textScaleOverrides[slide.id][element.id]||1;
  node.style.left=(override?override.x:element.x)+"%"; node.style.top=(override?override.y:element.y)+"%"; node.style.width=element.width+"%"; node.style.height=element.height+"%";
  if(element.fontSize) node.style.fontSize=(element.fontSize*(presentationFontSize/24)*textScale)+"px";
  if(element.fontFamily) node.style.fontFamily=element.fontFamily;
  if(element.fontWeight) node.style.fontWeight=element.fontWeight;
  if(element.fontStyle) node.style.fontStyle=element.fontStyle;
  if(element.textDecoration) node.style.textDecoration=element.textDecoration;
  if(element.color) node.style.color=element.color;
  if(element.kind==="text") node.style.color=colorPreferences.textColor;
  if(element.backgroundColor) node.style.backgroundColor=element.backgroundColor;
  if(element.padding!=null) node.style.padding=element.padding+"px";
  if(element.textAlign) node.style.textAlign=element.textAlign;
  var enter=element.enterAnimation||element.animation;
  if(enter==="fade") node.classList.add("enter-fade");
  if(enter==="rise") node.classList.add("enter-rise");
  if(enter==="zoom") node.classList.add("enter-zoom");
}
function appendRich(node,html){node.classList.add("rich");node.innerHTML=html||"";}
function renderCoursewareSlide(slide){
  var box=document.createElement("div"); box.className="courseware-file";
  var type=slide.coursewareType||"other", url=slide.fileUrl||"";
  if(type==="image"&&url){var img=document.createElement("img");img.src=url;img.alt=slide.title||"课件图片";box.appendChild(img);}
  else if(type==="video"&&url){var video=document.createElement("video");video.src=url;video.controls=true;video.preload="metadata";box.appendChild(video);}
  else if(type==="pdf"&&url){var frame=document.createElement("iframe");frame.src=url;frame.title=slide.title||"PDF课件";box.appendChild(frame);}
  else {
    var heading=document.createElement("h2");heading.textContent=slide.title||"课件文件";box.appendChild(heading);
    var note=document.createElement("div");note.textContent=url?"当前格式请使用对应的本地软件打开。文件已随脱机课件一并嵌入。":"该页没有可离线打开的原始文件。";box.appendChild(note);
  }
  if(url){
    var actions=document.createElement("div");actions.className="file-actions";
    var a=document.createElement("a");a.className="action";a.href=url;a.download=slide.fileName||slide.title||"课件文件";a.textContent="保存原文件";actions.appendChild(a);
    if(type==="pdf"||type==="image"||type==="video"){var open=document.createElement("a");open.className="action";open.href=url;open.target="_blank";open.rel="noopener";open.textContent="新窗口打开";actions.appendChild(open);}
    box.appendChild(actions);
  }
  slideEl.appendChild(box);
}
function appendSupplementary(slide){
  if(slide.type!=="question" || !slide.questionSnapshot || !visibility.supplementary) return;
  var q=slide.questionSnapshot, wrap=document.createElement("div");
  wrap.style.cssText="position:absolute;left:5%;right:5%;bottom:3%;z-index:4;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:13px";
  (q.boardImages||[]).forEach(function(src){var img=document.createElement("img");img.src=src;img.style.cssText="max-width:140px;max-height:90px;border:1px solid #cbd5e1;background:#fff";wrap.appendChild(img);});
  if(q.explanationVideo&&q.explanationVideo.fileUrl){var video=document.createElement("video");video.src=q.explanationVideo.fileUrl;video.controls=true;video.style.cssText="max-width:260px;max-height:110px";wrap.appendChild(video);}
  (q.links||[]).forEach(function(link){var a=document.createElement("a");a.href=link.url;a.target="_blank";a.rel="noopener";a.textContent=link.name||link.url;a.style.color="#a16207";wrap.appendChild(a);});
  slideEl.appendChild(wrap);
}
function renderSlide(){
  slideEl.innerHTML="";
  var slide=deck.slides[index];
  if(!slide){slideEl.innerHTML='<div class="empty">暂无课件页面</div>';updateUi();resizeCanvas();return;}
  slideEl.style.background=colorPreferences.pageBackgroundColor||slide.backgroundColor||"#fffef8";
  if(slide.type==="courseware"){renderCoursewareSlide(slide);}
  else {
    shownElements(slide).forEach(function(element){
      var node=document.createElement("div");node.className="element "+element.kind+(selectedElementId===element.id?" selected":"");node.setAttribute("data-element-id",element.id||"");styleElement(node,element);
      if(element.kind==="text"){
        if(element.href){var a=document.createElement("a");a.href=element.href;a.target="_blank";a.rel="noopener";appendRich(a,element.content);node.appendChild(a);}
        else appendRich(node,element.content);
      } else if(element.kind==="image"){
        var img=document.createElement("img");img.src=element.src;img.alt=element.alt||"";node.appendChild(img);
      } else if(element.kind==="video"){
        var video=document.createElement("video");video.src=element.src;video.controls=true;video.preload="metadata";node.appendChild(video);
      } else if(element.kind==="audio"){
        var audio=document.createElement("audio");audio.src=element.src;audio.controls=true;audio.preload="metadata";node.appendChild(audio);
      }
      slideEl.appendChild(node);
    });
    appendSupplementary(slide);
  }
  updateUi(); resizeCanvas(); redrawInk(); applyColors();
}
function surfaceKey(){
  var slide=deck.slides[index];
  return activeSurface==="board" ? boardAreas[activeBoardArea].id : "slide:"+(slide?slide.id:"none");
}
function currentStrokes(){
  if(activeSurface==="board") return boardAreas[activeBoardArea].strokes;
  var slide=deck.slides[index];if(!slide)return[];
  return inkBySlide[slide.id]||(inkBySlide[slide.id]=[]);
}
function setCurrentStrokes(value){
  if(activeSurface==="board"){boardAreas[activeBoardArea].strokes=value;return;}
  var slide=deck.slides[index];if(slide)inkBySlide[slide.id]=value;
}
function closePopups(except){
  ["eraserSettings","clearSettings","colorSettings"].forEach(function(id){if(id!==except)$(id).classList.add("hidden");});
  Object.keys(drawingPresets).forEach(function(id){var popup=$("settings-"+id);if(popup&&("settings-"+id)!==except)popup.classList.add("hidden");});
}
function togglePopup(id){var popup=$(id),open=popup.classList.contains("hidden");closePopups(open?id:null);popup.classList.toggle("hidden",!open);}
function updatePresetUi(){
  Object.keys(drawingPresets).forEach(function(id){
    var preset=drawingPresets[id],button=$(id),swatch=button&&button.querySelector(".swatch");
    if(swatch)swatch.style.backgroundColor=preset.color;
    if(button){button.classList.toggle("active",drawingMode===id);button.title=preset.label+" · "+preset.width+"px";}
  });
}
function buildPresetSettings(){
  Object.keys(drawingPresets).forEach(function(id){
    var preset=drawingPresets[id],popup=$("settings-"+id);if(!popup)return;
    popup.innerHTML='<div class="popup-row"><label>颜色</label><input class="preset-color" type="color" value="'+preset.color+'" aria-label="'+preset.label+'颜色"></div><div class="popup-row"><label>粗细</label><input class="preset-width" type="range" min="'+(preset.kind==="pen"?1:6)+'" max="'+(preset.kind==="pen"?12:36)+'" step="1" value="'+preset.width+'" aria-label="'+preset.label+'粗细"><span class="width-value">'+preset.width+'px</span></div>';
    popup.querySelector(".preset-color").addEventListener("input",function(event){preset.color=event.target.value;drawingMode=id;updateUi();});
    popup.querySelector(".preset-width").addEventListener("input",function(event){preset.width=Number(event.target.value);popup.querySelector(".width-value").textContent=preset.width+"px";drawingMode=id;updateUi();});
  });
  updatePresetUi();
}
function buildBoardTabs(){
  var tabs=$("boardTabs");tabs.innerHTML="";
  boardAreas.forEach(function(area,i){
    var button=document.createElement("button");button.type="button";button.className="board-tab"+(i===activeBoardArea?" active":"");button.textContent="书写区 "+(i+1);
    button.setAttribute("role","tab");button.setAttribute("aria-selected",i===activeBoardArea?"true":"false");
    button.addEventListener("click",function(){activeBoardArea=i;activeSurface="board";buildBoardTabs();resizeBoardCanvas();redrawBoard();updateUi();});
    tabs.appendChild(button);
  });
  boardCanvas.setAttribute("aria-label","板书 1书写区 "+(activeBoardArea+1));
  $("removeBoardArea").disabled=boardAreas.length<=1;
}
function updateUi(){
  var total=deck.slides.length;
  $("page").textContent=total?(index+1)+" / "+total:"0 / 0";
  $("prev").disabled=index<=0 && (!deck.slides[index] || (animationProgress[deck.slides[index].id]||0)<=0);
  $("next").disabled=!total;
  ["options","answer","analysis","supplementary"].forEach(function(key){
    var button=$("toggle"+key.charAt(0).toUpperCase()+key.slice(1));if(button)button.classList.toggle("active",!!visibility[key]);
  });
  Array.from(sidebar.children).forEach(function(node,i){node.classList.toggle("active",i===index);});
  updatePresetUi();
  $("selectTool").classList.toggle("active",drawingMode==="select");
  $("eraser").classList.toggle("active",drawingMode==="eraser");
  $("toggleBoard").classList.toggle("active",boardVisible);
  $("toggleBoard").setAttribute("aria-label",boardVisible?"收起板书":"打开板书");
  canvas.classList.toggle("enabled",drawingMode!=="none"&&drawingMode!=="select");
  $("undoEraser").disabled=!currentStrokes().some(function(stroke){return stroke.kind==="eraser";});
  $("undoClear").disabled=!clearUndoBySurface[surfaceKey()];
  var slide=deck.slides[index],selected=slide&&selectedElementId&&presentationElements(slide).find(function(item){return item.id===selectedElementId;});
  $("shrinkSelectedText").disabled=!selected||selected.kind!=="text";
  $("growSelectedText").disabled=!selected||selected.kind!=="text";
  Array.from(document.querySelectorAll(".eraser-size")).forEach(function(button){button.classList.toggle("active",Number(button.getAttribute("data-width"))===eraserWidth);});
}
function next(){
  var slide=deck.slides[index]; if(!slide)return;
  var steps=animationSteps(slide), progress=animationProgress[slide.id]||0;
  if(progress<steps.length){animationProgress[slide.id]=progress+1;renderSlide();return;}
  if(index<deck.slides.length-1){index++;activeSurface="slide";renderSlide();}
}
function prev(){
  var slide=deck.slides[index]; if(!slide)return;
  var progress=animationProgress[slide.id]||0;
  if(progress>0){animationProgress[slide.id]=progress-1;renderSlide();return;}
  if(index>0){index--;activeSurface="slide";renderSlide();}
}
function go(i){index=clamp(i,0,Math.max(0,deck.slides.length-1));activeSurface="slide";renderSlide();}
function buildSidebar(){
  sidebar.innerHTML="";
  deck.slides.forEach(function(slide,i){
    var button=document.createElement("button");button.type="button";button.className="thumb";
    button.innerHTML='<div class="thumb-number">第 '+(i+1)+' 页</div><div class="thumb-title">'+esc((slide.title||"").replace(/<[^>]*>/g,""))+'</div>';
    button.addEventListener("click",function(){go(i);});sidebar.appendChild(button);
  });
}
function toggleVisibility(key){visibility[key]=!visibility[key];renderSlide();}
function prepareContext(context,dpr){if(!context)return;context.setTransform(dpr,0,0,dpr,0,0);context.lineCap="round";context.lineJoin="round";}
function resizeCanvas(){
  var rect=slideEl.getBoundingClientRect(), parentRect=canvas.parentElement.getBoundingClientRect(), dpr=window.devicePixelRatio||1;
  canvas.style.left=(rect.left-parentRect.left)+"px";canvas.style.top=(rect.top-parentRect.top)+"px";canvas.style.width=rect.width+"px";canvas.style.height=rect.height+"px";
  canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));prepareContext(ctx,dpr);
}
function resizeBoardCanvas(){
  if(!boardVisible)return;
  var rect=boardArea.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
  boardCanvas.width=Math.max(1,Math.round(rect.width*dpr));boardCanvas.height=Math.max(1,Math.round(rect.height*dpr));prepareContext(boardCtx,dpr);
}
function canvasPoint(event,target){
  var rect=target.getBoundingClientRect();
  return {x:clamp((event.clientX-rect.left)/Math.max(1,rect.width),0,1),y:clamp((event.clientY-rect.top)/Math.max(1,rect.height),0,1)};
}
function drawStroke(context,target,stroke){
  if(!context||!stroke.points.length)return;
  var rect=target.getBoundingClientRect();context.save();context.beginPath();context.lineCap="round";context.lineJoin="round";
  if(stroke.kind==="eraser"){context.globalCompositeOperation="destination-out";context.globalAlpha=1;}
  else{context.globalCompositeOperation="source-over";context.globalAlpha=stroke.kind==="highlighter"?0.45:1;context.strokeStyle=stroke.color;}
  context.lineWidth=stroke.width;
  stroke.points.forEach(function(p,i){var x=p.x*rect.width,y=p.y*rect.height;if(i===0)context.moveTo(x,y);else context.lineTo(x,y);});
  if(stroke.points.length===1){var p=stroke.points[0],x=p.x*rect.width,y=p.y*rect.height;context.lineTo(x+0.01,y+0.01);}
  context.stroke();context.restore();
}
function redrawCanvas(context,target,list){
  if(!context)return;var rect=target.getBoundingClientRect();context.clearRect(0,0,rect.width,rect.height);list.forEach(function(stroke){drawStroke(context,target,stroke);});
}
function slideStrokes(){var slide=deck.slides[index];if(!slide)return[];return inkBySlide[slide.id]||(inkBySlide[slide.id]=[]);}
function redrawInk(){redrawCanvas(ctx,canvas,slideStrokes());}
function redrawBoard(){if(boardVisible)redrawCanvas(boardCtx,boardCanvas,boardAreas[activeBoardArea].strokes);}
function redrawAll(){redrawInk();redrawBoard();}
function beginDrawing(event,target,surface){
  if(drawingMode==="none"||drawingMode==="select")return;
  activeSurface=surface;drawing=true;
  var preset=drawingPresets[drawingMode],kind=drawingMode==="eraser"?"eraser":preset.kind;
  var stroke={kind:kind,color:preset?preset.color:"#111827",width:drawingMode==="eraser"?eraserWidth:preset.width,points:[canvasPoint(event,target)]};
  currentStrokes().push(stroke);target.setPointerCapture&&target.setPointerCapture(event.pointerId);updateUi();
}
function moveDrawing(event,target){
  if(!drawing||drawingMode==="none"||drawingMode==="select")return;
  var list=currentStrokes(),stroke=list[list.length-1];if(!stroke)return;stroke.points.push(canvasPoint(event,target));redrawAll();
}
function endDrawing(event,target){drawing=false;if(target.hasPointerCapture&&target.hasPointerCapture(event.pointerId))target.releasePointerCapture(event.pointerId);}
function bindDrawingCanvas(target,surface){
  target.addEventListener("pointerdown",function(event){beginDrawing(event,target,surface);});
  target.addEventListener("pointermove",function(event){moveDrawing(event,target);});
  target.addEventListener("pointerup",function(event){endDrawing(event,target);});
  target.addEventListener("pointercancel",function(event){endDrawing(event,target);});
}
function undoLastEraser(){
  var list=currentStrokes();for(var i=list.length-1;i>=0;i--){if(list[i].kind==="eraser"){list.splice(i,1);break;}}redrawAll();updateUi();
}
function clearCurrentSurface(){
  var list=currentStrokes();if(!list.length)return;clearUndoBySurface[surfaceKey()]=list.slice();setCurrentStrokes([]);redrawAll();updateUi();
}
function undoClear(){
  var key=surfaceKey(),previous=clearUndoBySurface[key];if(!previous)return;setCurrentStrokes(previous);delete clearUndoBySurface[key];redrawAll();updateUi();
}
function setBoardVisible(value){
  boardVisible=value;boardPanel.classList.toggle("hidden",!value);
  if(value){activeSurface="board";buildBoardTabs();requestAnimationFrame(function(){resizeBoardCanvas();redrawBoard();});}
  else activeSurface="slide";
  updateUi();
}
function toggleBoardFullscreen(){
  boardFullscreen=!boardFullscreen;boardPanel.classList.toggle("board-fullscreen",boardFullscreen);
  $("boardFullscreen").textContent=boardFullscreen?"退出全屏":"全屏";
  $("boardFullscreen").setAttribute("aria-label",boardFullscreen?"从左侧退出全屏板书 1":"从左侧全屏板书 1");
  requestAnimationFrame(function(){resizeBoardCanvas();redrawBoard();});
}
function downloadBoardScreenshot(){
  var rect=boardCanvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
  var output=document.createElement("canvas");output.width=Math.max(1,Math.round(rect.width*dpr));output.height=Math.max(1,Math.round(rect.height*dpr));
  var out=output.getContext("2d");if(!out)return;
  out.fillStyle=colorPreferences.boardBackgroundColor;out.fillRect(0,0,output.width,output.height);out.drawImage(boardCanvas,0,0,output.width,output.height);
  var anchor=document.createElement("a");anchor.href=output.toDataURL("image/png");anchor.download="板书-1-"+(activeBoardArea+1)+".png";anchor.click();
}
function scaleSelectedText(factor){
  var slide=deck.slides[index];if(!slide||!selectedElementId)return;
  var selected=presentationElements(slide).find(function(item){return item.id===selectedElementId;});if(!selected||selected.kind!=="text")return;
  var map=textScaleOverrides[slide.id]||(textScaleOverrides[slide.id]=Object.create(null));
  map[selectedElementId]=clamp((map[selectedElementId]||1)*factor,0.5,3);renderSlide();
}
function applyColors(){
  slideEl.style.background=colorPreferences.pageBackgroundColor;boardArea.style.background=colorPreferences.boardBackgroundColor;
  Array.from(slideEl.querySelectorAll(".element.text")).forEach(function(node){node.style.color=colorPreferences.textColor;});
}
function resetColors(){
  colorPreferences={pageBackgroundColor:"#fffef8",textColor:"#111827",boardBackgroundColor:"#fffef8"};
  $("pageColor").value=colorPreferences.pageBackgroundColor;$("textColor").value=colorPreferences.textColor;$("boardColor").value=colorPreferences.boardBackgroundColor;renderSlide();applyColors();
}
function beginSelect(event){
  if(drawingMode!=="select")return;
  var node=event.target.closest&&event.target.closest(".element");if(!node||!slideEl.contains(node))return;
  var slide=deck.slides[index],elementId=node.getAttribute("data-element-id");
  selectedElementId=elementId||null;Array.from(slideEl.querySelectorAll(".element")).forEach(function(item){item.classList.toggle("selected",item===node);});updateUi();
  var rect=slideEl.getBoundingClientRect();
  selectDrag={node:node,slideId:slide.id,elementId:elementId||null,startX:event.clientX,startY:event.clientY,left:parseFloat(node.style.left)||0,top:parseFloat(node.style.top)||0,width:rect.width,height:rect.height};
  node.setPointerCapture&&node.setPointerCapture(event.pointerId);event.preventDefault();
}
function moveSelect(event){
  if(!selectDrag)return;
  var x=clamp(selectDrag.left+(event.clientX-selectDrag.startX)/Math.max(1,selectDrag.width)*100,0,95);
  var y=clamp(selectDrag.top+(event.clientY-selectDrag.startY)/Math.max(1,selectDrag.height)*100,0,95);
  selectDrag.node.style.left=x+"%";selectDrag.node.style.top=y+"%";
  if(selectDrag.elementId){var map=positionOverrides[selectDrag.slideId]||(positionOverrides[selectDrag.slideId]=Object.create(null));map[selectDrag.elementId]={x:x,y:y};}
}
function endSelect(){selectDrag=null;}
$("prev").addEventListener("click",prev);$("next").addEventListener("click",next);
$("toggleOptions").addEventListener("click",function(){toggleVisibility("options");});
$("toggleAnswer").addEventListener("click",function(){toggleVisibility("answer");});
$("toggleAnalysis").addEventListener("click",function(){toggleVisibility("analysis");});
$("toggleSupplementary").addEventListener("click",function(){toggleVisibility("supplementary");});
$("toggleSidebar").addEventListener("click",function(){sidebar.classList.toggle("hidden");});
$("fullscreen").addEventListener("click",function(){if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen();});
$("selectTool").addEventListener("click",function(){drawingMode=drawingMode==="select"?"none":"select";activeSurface="slide";closePopups();updateUi();});
Object.keys(drawingPresets).forEach(function(id){
  $(id).addEventListener("click",function(){drawingMode=drawingMode===id?"none":id;closePopups();updateUi();});
});
Array.from(document.querySelectorAll("[data-settings-for]")).forEach(function(button){button.addEventListener("click",function(event){event.stopPropagation();var id=button.getAttribute("data-settings-for");drawingMode=id;togglePopup("settings-"+id);updateUi();});});
$("eraser").addEventListener("click",function(){drawingMode=drawingMode==="eraser"?"none":"eraser";closePopups();updateUi();});
$("eraserSettingsToggle").addEventListener("click",function(event){event.stopPropagation();drawingMode="eraser";togglePopup("eraserSettings");updateUi();});
Array.from(document.querySelectorAll(".eraser-size")).forEach(function(button){button.addEventListener("click",function(){eraserWidth=Number(button.getAttribute("data-width"));drawingMode="eraser";updateUi();});});
$("undoEraser").addEventListener("click",undoLastEraser);
$("clearInk").addEventListener("click",clearCurrentSurface);
$("clearSettingsToggle").addEventListener("click",function(event){event.stopPropagation();togglePopup("clearSettings");updateUi();});
$("undoClear").addEventListener("click",undoClear);
$("toggleBoard").addEventListener("click",function(){setBoardVisible(!boardVisible);});
$("closeBoard").addEventListener("click",function(){setBoardVisible(false);});
$("boardFullscreen").addEventListener("click",toggleBoardFullscreen);
$("boardScreenshot").addEventListener("click",downloadBoardScreenshot);
$("addBoardArea").addEventListener("click",function(){boardAreas.push({id:"board-area-"+(boardAreas.length+1)+"-"+Date.now(),strokes:[]});activeBoardArea=boardAreas.length-1;activeSurface="board";buildBoardTabs();resizeBoardCanvas();redrawBoard();updateUi();});
$("removeBoardArea").addEventListener("click",function(){if(boardAreas.length<=1)return;boardAreas.splice(activeBoardArea,1);activeBoardArea=Math.max(0,Math.min(activeBoardArea,boardAreas.length-1));buildBoardTabs();resizeBoardCanvas();redrawBoard();updateUi();});
$("colorSettingsToggle").addEventListener("click",function(event){event.stopPropagation();togglePopup("colorSettings");});
[["pageColor","pageBackgroundColor"],["textColor","textColor"],["boardColor","boardBackgroundColor"]].forEach(function(pair){$(pair[0]).addEventListener("input",function(event){colorPreferences[pair[1]]=event.target.value;renderSlide();applyColors();});});
$("resetColors").addEventListener("click",resetColors);
$("fontSize").addEventListener("change",function(event){presentationFontSize=Number(event.target.value)||24;renderSlide();});
$("shrinkSelectedText").addEventListener("click",function(){scaleSelectedText(0.9);});
$("growSelectedText").addEventListener("click",function(){scaleSelectedText(1.1);});
slideEl.addEventListener("pointerdown",beginSelect);
slideEl.addEventListener("pointermove",moveSelect);
slideEl.addEventListener("pointerup",endSelect);
slideEl.addEventListener("pointercancel",endSelect);
bindDrawingCanvas(canvas,"slide");bindDrawingCanvas(boardCanvas,"board");
if(typeof ResizeObserver!=="undefined"){new ResizeObserver(function(){resizeBoardCanvas();redrawBoard();}).observe(boardPanel);}
window.addEventListener("resize",function(){resizeCanvas();resizeBoardCanvas();redrawAll();});
document.addEventListener("keydown",function(event){
  if(event.key==="ArrowRight"||event.key==="PageDown"||event.key===" "){event.preventDefault();next();}
  else if(event.key==="ArrowLeft"||event.key==="PageUp"){event.preventDefault();prev();}
  else if(event.key==="Home"){event.preventDefault();go(0);}
  else if(event.key==="End"){event.preventDefault();go(deck.slides.length-1);}
  else if(event.key.toLowerCase()==="f"){event.preventDefault();$("fullscreen").click();}
});
buildPresetSettings();buildBoardTabs();buildSidebar();renderSlide();
})();
</script>
</body>
</html>`;

  return { html, warnings: prepared.warnings };
}

export async function downloadOfflineLessonCourseware(
  courseware: LessonCourseware,
): Promise<OfflineCoursewareExportResult> {
  const { html, warnings } = await buildOfflineLessonCoursewareHtml(courseware);
  const fileName = `${safeFileStem(courseware.title)}-脱机课件.html`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
  return { fileName, warnings };
}
