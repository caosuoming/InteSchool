import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, Download, FileText, RefreshCw, ScanLine, School as SchoolIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { readAnswerSheetQr } from "@/lib/scanner-qr";
import { buildAnswerSheetQrPayload } from "@/lib/answer-sheet";
import { schoolService } from "@/services/school";
import { SCANNER_DEVICE_KEY, SCANNER_SCHOOL_KEY, scannerService, type PublishedScannerSheet, type ScannerDevice } from "@/services/scanner";
import { useAuthStore } from "@/stores/auth";
import type { School } from "@/types";

interface ScannedImage {
  url: string;
  image: Blob;
  name: string;
  qrPayload: string | null;
  uploaded: boolean;
  uploading: boolean;
}

export default function ScannerPage() {
  const navigate = useNavigate();
  const teacher = useAuthStore((state) => state.teacher);
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState(() => localStorage.getItem(SCANNER_SCHOOL_KEY) || "");
  const [selection, setSelection] = useState("");
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [sheets, setSheets] = useState<PublishedScannerSheet[]>([]);
  const [devices, setDevices] = useState<ScannerDevice[]>([]);
  const [deviceId, setDeviceId] = useState(() => localStorage.getItem(SCANNER_DEVICE_KEY) || "");
  const [duplex, setDuplex] = useState(true);
  const [deviceStatus, setDeviceStatus] = useState("");
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [selected, setSelected] = useState<PublishedScannerSheet | null>(null);
  const [scans, setScans] = useState<ScannedImage[]>([]);
  const [scanning, setScanning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [changingSchool, setChangingSchool] = useState(false);
  const imageUrls = useRef<string[]>([]);

  useEffect(() => {
    let active = true;
    schoolService.listSchools()
      .then((items) => {
        if (!active) return;
        setSchools(items);
        const stored = localStorage.getItem(SCANNER_SCHOOL_KEY);
        if (stored && !items.some((item) => item.id === stored)) {
          localStorage.removeItem(SCANNER_SCHOOL_KEY);
          setSchoolId("");
        }
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "学校列表加载失败"); })
      .finally(() => { if (active) setLoadingSchools(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!schoolId || loadingSchools) return;
    let active = true;
    setLoadingSheets(true);
    setError("");
    scannerService.listPublishedAnswerSheets(schoolId)
      .then((items) => { if (active) setSheets(items); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "答题卡加载失败"); })
      .finally(() => { if (active) setLoadingSheets(false); });
    return () => { active = false; };
  }, [schoolId, loadingSchools]);

  const refreshDevices = async () => {
    setLoadingDevices(true);
    setDeviceStatus("");
    try {
      const { devices: items, diagnostics } = await scannerService.listDevices();
      setDevices(items);
      setDeviceId((current) => {
        const next = items.find((item) => item.id === current)?.id
          || items.find((item) => item.id === localStorage.getItem(SCANNER_DEVICE_KEY))?.id
          || items.find((item) => item.duplex)?.id || items[0]?.id || "";
        if (next) localStorage.setItem(SCANNER_DEVICE_KEY, next);
        return next;
      });
      if (!items.length) setDeviceStatus(`未发现可用扫描仪。${diagnostics.join("；") || "请检查驱动、设备连接及本机扫描服务。"}`);
    } catch (cause) {
      setDevices([]);
      setDeviceStatus(cause instanceof Error ? cause.message : "无法查询扫描仪");
    } finally { setLoadingDevices(false); }
  };

  useEffect(() => { if (schoolId) void refreshDevices(); }, [schoolId]);
  useEffect(() => () => { imageUrls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);

  const selectedSchool = schools.find((school) => school.id === schoolId);
  const selectedDevice = devices.find((device) => device.id === deviceId);
  const canUpload = Boolean(teacher?.schoolId && teacher.schoolId === schoolId);
  const schoolOptions = useMemo(() => schools.map((school) => ({
    value: school.id, label: school.city ? `${school.name} · ${school.city}` : school.name,
  })), [schools]);
  const deviceOptions = useMemo(() => devices.map((device) => ({
    value: device.id, label: `${device.name} · ${device.driver}`,
  })), [devices]);
  const expectedQr = selected ? buildAnswerSheetQrPayload(selected.type === "paper" ? "exam-paper" : "lecture", selected.id) : "";
  const pendingCount = scans.filter((image) => !image.uploaded && (!image.qrPayload || image.qrPayload === expectedQr)).length;

  const clearImages = () => {
    imageUrls.current.forEach((url) => URL.revokeObjectURL(url));
    imageUrls.current = [];
    setScans([]);
  };
  const bindSchool = () => {
    if (!selection || !schools.some((school) => school.id === selection)) { setError("请选择学校"); return; }
    localStorage.setItem(SCANNER_SCHOOL_KEY, selection);
    setSchoolId(selection);
    setChangingSchool(false);
    setSelected(null);
    clearImages();
    setSheets([]);
    setError("");
  };

  const scanSheet = async (sheet: PublishedScannerSheet) => {
    if (scanning || uploading || !deviceId) return;
    if (selected?.id !== sheet.id || selected.type !== sheet.type) clearImages();
    setSelected(sheet);
    setScanning(true);
    setError("");
    try {
      const images = await scannerService.scan(deviceId, duplex);
      const results: ScannedImage[] = [];
      for (const image of images) {
        const url = URL.createObjectURL(image);
        imageUrls.current.push(url);
        let qrPayload: string | null = null;
        try { qrPayload = await readAnswerSheetQr(image); } catch { /* Keep unreadable scans for manual review. */ }
        results.push({ url, image, qrPayload, uploaded: false, uploading: false,
          name: `${sheet.type}-${sheet.id}-${Date.now()}-${results.length + 1}.${image.type === "image/jpeg" ? "jpg" : "png"}` });
      }
      setScans((previous) => [...(selected?.id === sheet.id && selected.type === sheet.type ? previous : []), ...results]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "扫描失败");
    } finally { setScanning(false); }
  };

  const uploadPending = async () => {
    if (!selected || uploading || !canUpload) return;
    setUploading(true);
    setError("");
    const queue = scans.filter((scan) => !scan.uploaded && (!scan.qrPayload || scan.qrPayload === expectedQr));
    for (const scan of queue) {
      setScans((current) => current.map((item) => item.url === scan.url ? { ...item, uploading: true } : item));
      try {
        await scannerService.uploadPage(scan.image, schoolId, selected, scan.qrPayload);
        setScans((current) => current.map((item) => item.url === scan.url ? { ...item, uploaded: true, uploading: false } : item));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "上传失败，请重试");
        setScans((current) => current.map((item) => item.url === scan.url ? { ...item, uploading: false } : item));
        break;
      }
    }
    setUploading(false);
  };

  return (
    <div className="min-h-screen bg-mist p-4 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/login")}><ArrowLeft className="h-4 w-4" />返回登录页</Button>
          {selectedSchool && !changingSchool && <Button variant="outline" size="sm" disabled={scanning || uploading} onClick={() => { setSelection(schoolId); setChangingSchool(true); }}>切换学校</Button>}
        </div>
        <header className="rounded-2xl bg-ink-900 text-paper px-6 py-7 sm:px-9">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold-400 text-ink-900"><ScanLine className="h-6 w-6" /></div>
            <div><h1 className="font-serif text-2xl font-semibold">我要扫描</h1><p className="mt-1 text-sm text-ink-300">选择扫描设备及答题卡，采集后核对二维码并上传</p></div>
          </div>
        </header>
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {loadingSchools ? <div className="flex justify-center py-16"><Spinner size={30} /></div> : (!selectedSchool || changingSchool) ? (
          <section className="mx-auto max-w-md rounded-xl border border-ink-100 bg-paper p-6 shadow-sm space-y-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-ink-900"><SchoolIcon className="h-5 w-5" />绑定学校</h2>
            <p className="text-sm text-ink-500">首次使用请选择学校，绑定仅保存在本机浏览器，不代表账号登录。</p>
            <Select label="学校" value={selection} onChange={(event) => setSelection(event.target.value)} options={schoolOptions} placeholder="请选择学校" />
            <div className="flex gap-3"><Button onClick={bindSchool} disabled={!selection}>确认绑定</Button>{changingSchool && <Button variant="outline" onClick={() => setChangingSchool(false)}>取消</Button>}</div>
          </section>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs text-ink-500">当前绑定学校</div><h2 className="text-lg font-semibold text-ink-900">{selectedSchool.name}</h2></div><div className="text-sm text-ink-500">已发布答题卡 {sheets.length} 份</div></div>
            <section className="rounded-xl border border-ink-100 bg-paper p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">本机扫描设备</h2><Button size="sm" variant="outline" onClick={() => void refreshDevices()} loading={loadingDevices}><RefreshCw className="h-4 w-4" />刷新设备</Button></div>
              {deviceStatus && <p role="status" className="text-sm text-amber-700">{deviceStatus}</p>}
              <Select label="扫描仪" value={deviceId} onChange={(event) => { setDeviceId(event.target.value); localStorage.setItem(SCANNER_DEVICE_KEY, event.target.value); }} options={deviceOptions} placeholder="请连接扫描仪并刷新" />
              <label className="flex items-center gap-2 text-sm text-ink-700"><input type="checkbox" checked={duplex} onChange={(event) => setDuplex(event.target.checked)} />双面自动进纸（默认）</label>
              {selectedDevice && duplex && !selectedDevice.duplex && <p className="text-sm text-amber-700">所选 WIA 通道不能保证双面扫描；请选择 TWAIN 设备或取消双面模式。</p>}
            </section>
            {!canUpload && <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">当前未以本校教师身份登录。可在本机扫描并下载，但上传与后续异常卷处理需要先<Link to="/login" className="underline">登录本校教师账号</Link>。</p>}
            {loadingSheets ? <div className="flex justify-center py-14"><Spinner size={30} /></div> : sheets.length === 0 ? <div className="rounded-xl border border-ink-100 bg-paper px-6 py-16 text-center text-ink-500">本校暂无已发布的答题卡</div> : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{sheets.map((sheet) => (
                <button key={`${sheet.type}:${sheet.id}`} type="button" disabled={scanning || uploading || !deviceId} onClick={() => void scanSheet(sheet)} className="rounded-xl border border-ink-100 bg-paper p-5 text-left shadow-sm transition-colors hover:border-gold-400 hover:bg-gold-50 disabled:opacity-60">
                  <div className="flex items-start justify-between gap-2"><FileText className="h-5 w-5 text-gold-600" /><span className="text-xs text-ink-500">{sheet.type === "paper" ? "试卷" : "讲义"}</span></div>
                  <h3 className="mt-3 line-clamp-2 font-semibold text-ink-900">{sheet.title}</h3><p className="mt-2 text-xs text-ink-500">{sheet.grade} · {sheet.schoolYear}</p>
                  <p className="mt-3 text-xs text-gold-700">{scanning && selected?.id === sheet.id && selected.type === sheet.type ? "正在扫描…" : "点击采集"}</p>
                </button>
              ))}</div>
            )}
            {selected && <section className="space-y-4 rounded-xl border border-ink-100 bg-paper p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-semibold text-ink-900">{selected.title}</h2><p className="mt-1 text-xs text-ink-500">已采集 {scans.length} 页 · 已上传 {scans.filter((scan) => scan.uploaded).length} 页</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void scanSheet(selected)} loading={scanning} disabled={uploading || !deviceId}><RefreshCw className="h-4 w-4" />继续扫描</Button><Button onClick={() => void uploadPending()} disabled={!canUpload || !pendingCount || scanning} loading={uploading}>确认试卷并上传 {pendingCount} 页</Button></div></div>
              <p className="text-xs text-ink-500">逐页核对二维码与试卷名称。无法识别二维码的页面会保存为待处理异常卷；二维码指向其他试卷的页面禁止上传到当前试卷。</p>
              {scans.length > 0 && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{scans.map((scan, index) => (
                <div key={scan.url} className="overflow-hidden rounded-lg border border-ink-100"><img src={scan.url} alt={`扫描结果第 ${index + 1} 张`} className="w-full max-h-72 object-contain bg-mist" /><div className="p-3 space-y-2"><p className="text-sm font-medium">第 {index + 1} 页 · {scan.uploaded ? "已上传" : scan.uploading ? "正在上传" : scan.qrPayload === expectedQr ? "二维码已匹配" : scan.qrPayload ? "二维码与选定试卷不符" : "二维码未识别（异常卷）"}</p><a href={scan.url} download={scan.name} className="flex items-center justify-center gap-2 text-sm text-gold-700 hover:underline"><Download className="h-4 w-4" />下载第 {index + 1} 张</a></div></div>
              ))}</div>}
            </section>}
            <p className="text-xs leading-5 text-ink-500">页面关闭后未上传的图像会丢失。已上传的扫描件可在「作业考试 → 考试管理 → 扫描件处理」中人工关联学生。不会未经审核自动生成成绩或签名。</p>
          </>
        )}
      </div>
    </div>
  );
}
