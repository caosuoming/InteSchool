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
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#0b1020;color:#eef2ff;font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif}button{font:inherit}.app{height:100%;display:grid;grid-template-rows:52px minmax(0,1fr) 58px}.topbar,.bottombar{display:flex;align-items:center;gap:10px;padding:8px 14px;background:rgba(11,16,32,.96);border-color:#27324d;z-index:20}.topbar{border-bottom:1px solid #27324d}.bottombar{border-top:1px solid #27324d;justify-content:center}.brand{font-weight:700;white-space:nowrap}.title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#cbd5e1}.spacer{flex:1}.stage-shell{min-height:0;display:flex;position:relative}.sidebar{width:220px;min-width:220px;overflow:auto;border-right:1px solid #27324d;background:#11182b;padding:10px;transition:.18s}.sidebar.hidden{display:none}.thumb{display:block;width:100%;text-align:left;background:#172036;color:#cbd5e1;border:1px solid transparent;border-radius:10px;padding:9px 10px;margin-bottom:8px;cursor:pointer}.thumb:hover{border-color:#52617f}.thumb.active{border-color:#d6aa4b;background:#23243a;color:#fff}.thumb-number{font-size:11px;color:#93a4c4}.thumb-title{margin-top:3px;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.stage{min-width:0;min-height:0;flex:1;display:flex;align-items:center;justify-content:center;padding:18px;position:relative}.slide{position:relative;width:min(100%,calc((100vh - 164px)*16/9));aspect-ratio:16/9;background:#fffef8;color:#111827;overflow:hidden;box-shadow:0 16px 50px rgba(0,0,0,.38)}.layer{position:absolute;inset:0}.element{position:absolute;overflow:hidden}.element.text{white-space:pre-wrap;line-height:1.45}.element.text a{color:#a16207}.element img,.element video{width:100%;height:100%;object-fit:contain}.element audio{width:100%}.rich img{max-width:100%;max-height:100%;object-fit:contain}.rich table{border-collapse:collapse;max-width:100%}.rich td,.rich th{border:1px solid #94a3b8;padding:.25em .45em}.katex-html{display:none!important}.katex-mathml{display:inline!important}.katex-formula-block .katex-mathml{display:block!important;text-align:center;margin:.35em 0}.courseware-file{position:absolute;inset:7%;border:1px solid #d7dce6;border-radius:18px;background:white;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:28px;gap:16px}.courseware-file iframe,.courseware-file img,.courseware-file video{width:100%;height:100%;border:0;object-fit:contain}.file-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}.action,.tool{border:1px solid #3c4967;background:#172036;color:#eef2ff;border-radius:9px;padding:8px 12px;cursor:pointer}.action:hover,.tool:hover{background:#23304c}.action.active,.tool.active{border-color:#d6aa4b;background:#4b3c19}.action:disabled,.tool:disabled{opacity:.45;cursor:not-allowed}.page{min-width:90px;text-align:center;color:#cbd5e1}.answer-controls{display:flex;gap:7px}.annotation{position:absolute;inset:0;z-index:8;touch-action:none;pointer-events:none}.annotation.enabled{pointer-events:auto;cursor:crosshair}.empty{color:#94a3b8;text-align:center;padding:40px}.offline-badge{font-size:11px;color:#d6aa4b;border:1px solid #6f5825;border-radius:999px;padding:3px 8px}.enter-fade{animation:fade .35s ease-out both}.enter-rise{animation:rise .4s cubic-bezier(.16,1,.3,1) both}.enter-zoom{animation:zoom .32s ease-out both}@keyframes fade{from{opacity:0}to{opacity:1}}@keyframes rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}@keyframes zoom{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}@media(max-width:800px){.sidebar{position:absolute;z-index:15;left:0;top:0;bottom:0;width:190px}.stage{padding:8px}.topbar{padding:7px 9px}.brand{display:none}.action,.tool{padding:7px 9px}.bottombar{padding:7px;gap:6px}.answer-controls{display:none}}
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
      <canvas id="annotation" class="annotation"></canvas>
    </section>
  </main>
  <footer class="bottombar">
    <button id="prev" class="action" type="button">上一页</button>
    <div id="page" class="page"></div>
    <button id="next" class="action" type="button">下一步</button>
    <div class="answer-controls">
      <button id="toggleOptions" class="tool active" type="button">选项</button>
      <button id="toggleAnswer" class="tool" type="button">答案</button>
      <button id="toggleAnalysis" class="tool" type="button">解析</button>
      <button id="toggleSupplementary" class="tool" type="button">补充</button>
    </div>
    <button id="pen" class="tool" type="button">画笔</button>
    <button id="eraser" class="tool" type="button">橡皮</button>
    <button id="clearInk" class="tool" type="button">清屏</button>
  </footer>
</div>
<script>
(function(){
"use strict";
var deck=${data};
var index=0;
var animationProgress=Object.create(null);
var visibility={options:true,answer:false,analysis:false,supplementary:false};
var drawingMode="none";
var drawing=false;
var lastPoint=null;
var inkBySlide=Object.create(null);
var $=function(id){return document.getElementById(id);};
var slideEl=$("slide"), sidebar=$("sidebar"), canvas=$("annotation"), ctx=canvas.getContext("2d");
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
  node.style.left=element.x+"%"; node.style.top=element.y+"%"; node.style.width=element.width+"%"; node.style.height=element.height+"%";
  if(element.fontSize) node.style.fontSize=element.fontSize+"px";
  if(element.fontFamily) node.style.fontFamily=element.fontFamily;
  if(element.fontWeight) node.style.fontWeight=element.fontWeight;
  if(element.fontStyle) node.style.fontStyle=element.fontStyle;
  if(element.textDecoration) node.style.textDecoration=element.textDecoration;
  if(element.color) node.style.color=element.color;
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
  slideEl.style.background=slide.backgroundColor||"#fffef8";
  if(slide.type==="courseware"){renderCoursewareSlide(slide);}
  else {
    shownElements(slide).forEach(function(element){
      var node=document.createElement("div");node.className="element "+element.kind;styleElement(node,element);
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
  updateUi(); resizeCanvas(); redrawInk();
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
  $("pen").classList.toggle("active",drawingMode==="pen");$("eraser").classList.toggle("active",drawingMode==="eraser");
  canvas.classList.toggle("enabled",drawingMode!=="none");
}
function next(){
  var slide=deck.slides[index]; if(!slide)return;
  var steps=animationSteps(slide), progress=animationProgress[slide.id]||0;
  if(progress<steps.length){animationProgress[slide.id]=progress+1;renderSlide();return;}
  if(index<deck.slides.length-1){index++;renderSlide();}
}
function prev(){
  var slide=deck.slides[index]; if(!slide)return;
  var progress=animationProgress[slide.id]||0;
  if(progress>0){animationProgress[slide.id]=progress-1;renderSlide();return;}
  if(index>0){index--;renderSlide();}
}
function go(i){index=clamp(i,0,Math.max(0,deck.slides.length-1));renderSlide();}
function buildSidebar(){
  sidebar.innerHTML="";
  deck.slides.forEach(function(slide,i){
    var button=document.createElement("button");button.type="button";button.className="thumb";
    button.innerHTML='<div class="thumb-number">第 '+(i+1)+' 页</div><div class="thumb-title">'+esc((slide.title||"").replace(/<[^>]*>/g,""))+'</div>';
    button.addEventListener("click",function(){go(i);});sidebar.appendChild(button);
  });
}
function toggleVisibility(key){visibility[key]=!visibility[key];renderSlide();}
function resizeCanvas(){
  var rect=slideEl.getBoundingClientRect(), parentRect=canvas.parentElement.getBoundingClientRect(), dpr=window.devicePixelRatio||1;
  canvas.style.left=(rect.left-parentRect.left)+"px";canvas.style.top=(rect.top-parentRect.top)+"px";canvas.style.width=rect.width+"px";canvas.style.height=rect.height+"px";
  canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));
  if(ctx){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.lineCap="round";ctx.lineJoin="round";}
}
function point(event){
  var rect=canvas.getBoundingClientRect();
  return {x:clamp((event.clientX-rect.left)/rect.width,0,1),y:clamp((event.clientY-rect.top)/rect.height,0,1)};
}
function strokes(){var slide=deck.slides[index];if(!slide)return[];return inkBySlide[slide.id]||(inkBySlide[slide.id]=[]);}
function redrawInk(){
  if(!ctx)return;var rect=canvas.getBoundingClientRect();ctx.clearRect(0,0,rect.width,rect.height);
  strokes().forEach(function(stroke){
    if(stroke.points.length<1)return;ctx.beginPath();ctx.globalCompositeOperation=stroke.mode==="eraser"?"destination-out":"source-over";ctx.strokeStyle="#dc2626";ctx.lineWidth=stroke.mode==="eraser"?28:3;
    stroke.points.forEach(function(p,i){var x=p.x*rect.width,y=p.y*rect.height;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();
  });ctx.globalCompositeOperation="source-over";
}
function beginInk(event){if(drawingMode==="none")return;drawing=true;lastPoint=point(event);strokes().push({mode:drawingMode,points:[lastPoint]});canvas.setPointerCapture&&canvas.setPointerCapture(event.pointerId);}
function moveInk(event){if(!drawing||drawingMode==="none")return;var p=point(event), list=strokes(), stroke=list[list.length-1];stroke.points.push(p);lastPoint=p;redrawInk();}
function endInk(event){drawing=false;lastPoint=null;if(canvas.hasPointerCapture&&canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);}
$("prev").addEventListener("click",prev);$("next").addEventListener("click",next);
$("toggleOptions").addEventListener("click",function(){toggleVisibility("options");});
$("toggleAnswer").addEventListener("click",function(){toggleVisibility("answer");});
$("toggleAnalysis").addEventListener("click",function(){toggleVisibility("analysis");});
$("toggleSupplementary").addEventListener("click",function(){toggleVisibility("supplementary");});
$("toggleSidebar").addEventListener("click",function(){sidebar.classList.toggle("hidden");});
$("fullscreen").addEventListener("click",function(){if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen();});
$("pen").addEventListener("click",function(){drawingMode=drawingMode==="pen"?"none":"pen";updateUi();});
$("eraser").addEventListener("click",function(){drawingMode=drawingMode==="eraser"?"none":"eraser";updateUi();});
$("clearInk").addEventListener("click",function(){var slide=deck.slides[index];if(slide)inkBySlide[slide.id]=[];redrawInk();});
canvas.addEventListener("pointerdown",beginInk);canvas.addEventListener("pointermove",moveInk);canvas.addEventListener("pointerup",endInk);canvas.addEventListener("pointercancel",endInk);
window.addEventListener("resize",function(){resizeCanvas();redrawInk();});
document.addEventListener("keydown",function(event){
  if(event.key==="ArrowRight"||event.key==="PageDown"||event.key===" "){event.preventDefault();next();}
  else if(event.key==="ArrowLeft"||event.key==="PageUp"){event.preventDefault();prev();}
  else if(event.key==="Home"){event.preventDefault();go(0);}
  else if(event.key==="End"){event.preventDefault();go(deck.slides.length-1);}
  else if(event.key.toLowerCase()==="f"){event.preventDefault();$("fullscreen").click();}
});
buildSidebar();renderSlide();
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
