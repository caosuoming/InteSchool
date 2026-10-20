import { useRef, useState, type PointerEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { ExamPaper } from "@/types";
import type { CardRegion, CardRegionType, ThirdPartyCard } from "@/services/scanner";

const REGION_LABELS: Record<CardRegionType, string> = {
  name: "姓名区",
  studentNumber: "学号填涂区",
  barcode: "条码区",
  qrCode: "答题卡二维码区",
  choice: "选择题区",
  fill: "填空题区",
  essay: "解答题区",
};

interface Props {
  card: ThirdPartyCard;
  papers: ExamPaper[];
  saving: boolean;
  onClose: () => void;
  onSave: (patch: { fileName: string; paperId: string | null; regions: CardRegion[] }) => void;
}

const fraction = (value: number) => Math.max(0, Math.min(1, value));

export function ThirdPartyCardEditor({ card, papers, saving, onClose, onSave }: Props) {
  const [fileName, setFileName] = useState(card.fileName);
  const [paperId, setPaperId] = useState(card.paperId || "");
  const [regionType, setRegionType] = useState<CardRegionType>("name");
  const [regions, setRegions] = useState<CardRegion[]>(card.regions);
  const [draft, setDraft] = useState<CardRegion | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const point = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: fraction((event.clientX - bounds.left) / (bounds.width || 1)),
      y: fraction((event.clientY - bounds.top) / (bounds.height || 1)),
    };
  };
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const at = point(event);
    origin.current = at;
    setDraft({ id: crypto.randomUUID(), type: regionType, x: at.x, y: at.y, width: 0, height: 0 });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const from = origin.current;
    if (!from) return;
    const to = point(event);
    setDraft((previous) => previous ? {
      ...previous, x: Math.min(from.x, to.x), y: Math.min(from.y, to.y),
      width: Math.abs(from.x - to.x), height: Math.abs(from.y - to.y),
    } : null);
  };
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    const from = origin.current;
    if (!from) return;
    const to = point(event);
    const width = Math.abs(from.x - to.x);
    const height = Math.abs(from.y - to.y);
    if (width >= 0.01 && height >= 0.01) {
      setRegions((previous) => [...previous, {
        id: crypto.randomUUID(), type: regionType,
        x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), width, height,
      }]);
    }
    origin.current = null;
    setDraft(null);
  };

  return (
    <Modal open onClose={() => { if (!saving) onClose(); }} title={`编辑第三方答题卡 · ${card.fileName}`} description="在图片上拖动鼠标框选区域，标注类型和关联试卷将一并保存。" size="xl"
      footer={<>
        <Button variant="outline" disabled={saving} onClick={onClose}>取消</Button>
        <Button loading={saving} disabled={!fileName.trim()} onClick={() => onSave({ fileName: fileName.trim(), paperId: paperId || null, regions })}>保存标注</Button>
      </>}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-ink-700">文件名
            <input aria-label="编辑第三方卡文件名" className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2" value={fileName} maxLength={160} onChange={(event) => setFileName(event.target.value)} />
          </label>
          <label className="text-sm font-medium text-ink-700">关联试卷
            <select aria-label="关联试卷" className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2" value={paperId} onChange={(event) => setPaperId(event.target.value)}>
              <option value="">暂不关联</option>
              {papers.map((paper) => <option key={paper.id} value={paper.id}>{paper.title}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm font-medium text-ink-700">当前标注类型
          <select aria-label="区域类型" className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2" value={regionType} onChange={(event) => setRegionType(event.target.value as CardRegionType)}>
            {(Object.entries(REGION_LABELS) as Array<[CardRegionType, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <div className="overflow-hidden rounded-lg border border-ink-100 bg-mist">
          <div className="relative w-full select-none" style={{ touchAction: "none" }}>
            <img src={card.imageUrl} alt="待标注的第三方答题卡" className="block w-full pointer-events-none" draggable={false} />
            {([...regions, ...(draft ? [draft] : [])]).map((region) => (
              <div key={region.id} className="pointer-events-none absolute border-2 border-amber-500 bg-amber-300/25" style={{
                left: `${region.x * 100}%`, top: `${region.y * 100}%`,
                width: `${region.width * 100}%`, height: `${region.height * 100}%`,
              }}><span className="absolute -top-5 left-0 whitespace-nowrap bg-amber-600 px-1 text-xs text-white">{REGION_LABELS[region.type]}</span></div>
            ))}
            <div aria-label="标注画布" role="application" className="absolute inset-0 cursor-crosshair" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => { origin.current = null; setDraft(null); }} />
          </div>
        </div>
        {regions.length > 0 && <div className="space-y-2">
          <h4 className="text-sm font-semibold">已标注区域（{regions.length}）</h4>
          {regions.map((region, index) => <div className="flex items-center justify-between rounded-md border border-ink-100 px-3 py-2 text-sm" key={region.id}>
            <span>{index + 1}. {REGION_LABELS[region.type]}</span>
            <button type="button" className="text-red-600 hover:underline" onClick={() => setRegions((previous) => previous.filter((item) => item.id !== region.id))} aria-label={`删除第 ${index + 1} 个区域`}>删除</button>
          </div>)}
        </div>}
      </div>
    </Modal>
  );
}
