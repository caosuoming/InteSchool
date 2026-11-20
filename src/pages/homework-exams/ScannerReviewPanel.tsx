import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { scannerService, type ScannerPageRecord } from "@/services/scanner";
import type { Student } from "@/types";

interface ScannerReviewPanelProps {
  schoolId: string;
  students: Student[];
  sheetId?: string;
  onRecordsChange?: (records: ScannerPageRecord[]) => void;
}

export function ScannerReviewPanel({ schoolId, students, sheetId, onRecordsChange }: ScannerReviewPanelProps) {
  const [records, setRecords] = useState<ScannerPageRecord[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await scannerService.listPages(schoolId);
      setRecords(next);
      onRecordsChange?.(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "扫描记录加载失败"); }
    finally { setLoading(false); }
  }, [schoolId, onRecordsChange]);
  useEffect(() => { void refresh(); }, [refresh]);

  const apply = (updated: ScannerPageRecord) => {
    const next = records.map((item) => item.id === updated.id ? updated : item);
    setRecords(next);
    onRecordsChange?.(next);
  };

  const assign = async (record: ScannerPageRecord) => {
    setSavingId(record.id);
    setError("");
    try {
      apply(await scannerService.assignPage(record.id, (selections[record.id] ?? record.studentId) || null));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "匹配失败"); }
    finally { setSavingId(null); }
  };

  const review = async (record: ScannerPageRecord) => {
    setSavingId(record.id);
    setError("");
    try {
      const studentId = (selections[record.id] ?? record.studentId) || null;
      apply(await scannerService.updatePage(record.id, { studentId, reviewed: !record.reviewedAt }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "复查状态保存失败"); }
    finally { setSavingId(null); }
  };

  const matchingRecords = sheetId ? records.filter((record) => record.sheetType === "paper" && record.sheetId === sheetId) : records;
  const isException = (record: ScannerPageRecord) => !(record.qrCurrent ?? record.verified) || !record.studentId;
  const exceptions = matchingRecords.filter(isException).length;
  const visibleRecords = exceptionsOnly ? matchingRecords.filter(isException) : matchingRecords;
  const verify = async (record: ScannerPageRecord) => {
    const confirm = !record.manualVerifiedAt;
    if (confirm && !window.confirm("请先查看原图，确认与当前发布的答题卡版本一致，再进行人工核对。")) return;
    setSavingId(record.id);
    setError("");
    try {
      apply(await scannerService.updatePage(record.id, { manualVerified: confirm }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "人工核对失败"); }
    finally { setSavingId(null); }
  };
  return (
    <section className="rounded-xl border border-ink-100 bg-paper p-5" aria-label={sheetId ? "试卷扫描件详情" : "扫描件处理"}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div><h2 className="font-semibold">扫描件处理（{matchingRecords.length} 张，异常 {exceptions} 张）</h2><p className="text-xs text-ink-500">查看原始图像并核对答题卡版本，匹配学生后确认复查。修改匹配会撤销原复查确认。</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-ink-600"><input type="checkbox" checked={exceptionsOnly} onChange={(event) => setExceptionsOnly(event.target.checked)} />只看异常</label>
          <Button variant="outline" size="sm" loading={loading} onClick={() => void refresh()}>刷新扫描件</Button>
        </div>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
      {!loading && !error && visibleRecords.length === 0 && <p className="py-4 text-sm text-ink-500">{exceptionsOnly ? "没有异常扫描记录" : sheetId ? "这份试卷暂无答题卡扫描记录" : "暂无扫描记录"}</p>}
      {visibleRecords.length > 0 && <div className="max-h-[32rem] space-y-3 overflow-y-auto">{visibleRecords.map((record) => (
        <div key={record.id} className="flex flex-wrap items-center gap-4 rounded-lg border border-ink-100 p-3">
          <a href={`/api/files/${encodeURIComponent(record.fileId)}`} target="_blank" rel="noreferrer" className="shrink-0"><img src={`/api/files/${encodeURIComponent(record.fileId)}`} alt="扫描卷原图" loading="lazy" className="h-28 w-24 object-contain bg-mist" /></a>
          <div className="min-w-0 flex-1 space-y-1 text-xs text-ink-600">
            <p className="font-medium text-ink-900">{record.sheetType === "paper" ? "试卷" : "讲义"} · {record.sheetId}</p>
            <p>{record.qrCurrent ?? record.verified ? (record.manualVerifiedAt ? "已人工确认答题卡版本" : "二维码已核对") : record.qrPayload ? "二维码版本已变化（异常）" : "二维码缺失，待核对"}</p>
            <p>{new Date(record.createdAt).toLocaleString("zh-CN")}</p>
            <p>{record.studentId ? `已关联：${students.find((student) => student.id === record.studentId)?.name || record.studentId}${record.studentClassName ? ` · ${record.studentClassName}` : ""}` : "尚未匹配学生（异常卷）"}</p>
            <p>{record.reviewedAt ? `扫描已复查 · ${new Date(record.reviewedAt).toLocaleString("zh-CN")}` : "已扫描未复查"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label={`匹配学生 ${record.id}`} className="rounded-lg border border-ink-200 px-2 py-2 text-sm" value={selections[record.id] ?? record.studentId ?? ""} onChange={(event) => setSelections((current) => ({ ...current, [record.id]: event.target.value }))}>
              <option value="">保留为异常卷</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}（{student.studentNo || "无学号"}）</option>)}
            </select>
            <Button size="sm" onClick={() => void assign(record)} disabled={savingId !== null} loading={savingId === record.id}>保存匹配</Button>
            {(record.manualVerifiedAt || !(record.qrCurrent ?? record.verified)) && <Button size="sm" variant="outline" disabled={savingId !== null} onClick={() => void verify(record)}>{record.manualVerifiedAt ? "撤销人工核对" : "人工核对答题卡"}</Button>}
            <Button size="sm" variant="outline" disabled={savingId !== null || !(selections[record.id] ?? record.studentId)} onClick={() => void review(record)}>{record.reviewedAt ? "撤销复查" : "确认复查"}</Button>
          </div>
        </div>
      ))}</div>}
    </section>
  );
}
