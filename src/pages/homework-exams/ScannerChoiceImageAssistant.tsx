import { useRef, useState, type PointerEvent } from "react";
import { Button } from "@/components/ui/Button";
import { analyzeChoiceStrip, type ChoiceStripDirection, type NormalizedScanRect } from "@/lib/scanner-choice-omr";
import type { ScannerGradingQuestion } from "@/lib/scanner-grading";

interface Props {
  fileId: string;
  question: ScannerGradingQuestion;
  onAdopt: (candidate: string) => void;
}

function clamp(value: number) { return Math.max(0, Math.min(1, value)); }

export function ScannerChoiceImageAssistant({ fileId, question, onAdopt }: Props) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const anchor = useRef<{ x: number; y: number } | null>(null);
  const [direction, setDirection] = useState<ChoiceStripDirection>("horizontal");
  const [selection, setSelection] = useState<NormalizedScanRect | null>(null);
  const [result, setResult] = useState<ReturnType<typeof analyzeChoiceStrip> | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const count = Math.min(8, Math.max(2, question.optionCount || 4));

  const coordinates = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height) };
  };
  const region = (start: { x: number; y: number }, end: { x: number; y: number }) => ({
    x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
    width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y),
  });

  const finish = (event: PointerEvent<HTMLDivElement>) => {
    const start = anchor.current;
    if (!start) return;
    anchor.current = null;
    setDragging(false);
    const crop = region(start, coordinates(event));
    setSelection(crop);
    setResult(null);
    setError("");
    const image = imageRef.current;
    if (!image?.complete || !image.naturalWidth) {
      setError("扫描图像尚未加载完成"); return;
    }
    try {
      const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) { setError("浏览器不支持像素分析"); return; }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      setResult(analyzeChoiceStrip(pixels, crop, count, direction));
    } catch {
      setError("图像无法分析，请检查文件并手动录入选项");
    }
  };

  return (
    <section className="space-y-2 rounded-md border border-ink-200 bg-paper p-3" aria-label="选择题图像识别辅助">
      <p className="font-medium text-sm">第 {question.number} 题 · 扫描图像辅助识别</p>
      <p className="text-xs text-ink-600">在图中拖框，仅框住该题从 A 到最后一个选项的完整填涂区域，不包含题号。各选项须等间距排列；旋转、错位或多处涂改时请手动录入。识别仅给出候选，需人工比对。</p>
      <label className="flex items-center gap-2 text-xs">填涂方向
        <select aria-label="选项排列方向" value={direction} onChange={(event) => {
          setDirection(event.target.value as ChoiceStripDirection);
          setSelection(null); setResult(null);
        }} className="rounded border border-ink-200 px-2 py-1">
          <option value="horizontal">水平（A B C D）</option>
          <option value="vertical">垂直（A / B / C / D）</option>
        </select>
      </label>
      <div
        className="relative w-full max-w-2xl touch-none select-none cursor-crosshair"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          anchor.current = coordinates(event);
          event.currentTarget.setPointerCapture(event.pointerId);
          setSelection(null); setResult(null); setDragging(true);
        }}
        onPointerMove={(event) => {
          if (anchor.current) setSelection(region(anchor.current, coordinates(event)));
        }}
        onPointerUp={finish}
        onPointerCancel={() => { anchor.current = null; setDragging(false); setSelection(null); setResult(null); }}
      >
        <img ref={imageRef} src={"/api/files/" + encodeURIComponent(fileId)}
          alt="用于标注选项范围的扫描原图" draggable={false}
          className="block h-auto w-full border border-ink-100" />
        {selection && <div aria-hidden="true" className="absolute border-2 border-sky-600 bg-sky-400/20 pointer-events-none"
          style={{ left: (selection.x * 100) + "%", top: (selection.y * 100) + "%",
            width: (selection.width * 100) + "%", height: (selection.height * 100) + "%" }} />}
      </div>
      {dragging && <p className="text-xs">松开指针后分析涂卡范围</p>}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {result && <div className="space-y-2 text-xs">
        <p>{result.candidate ? "候选选项：" + result.candidate : "无法确定候选"} · {result.reason}</p>
        {result.inkRatios.length > 0 && <p>各选项墨迹比例：{result.inkRatios.map((density, index) =>
          String.fromCharCode(65 + index) + " " + Math.round(density * 100) + "%"
        ).join("，")}</p>}
        {result.candidate && <Button size="sm" variant="outline" onClick={() => onAdopt(result.candidate!)}>人工核对后采用候选</Button>}
      </div>}
    </section>
  );
}
