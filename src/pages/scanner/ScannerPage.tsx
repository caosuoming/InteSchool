import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, Download, FileText, RefreshCw, ScanLine, School as SchoolIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/stores/auth";
import { Select } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { readAnswerSheetQr } from "@/lib/scanner-qr";
import { assertScanBatchSize, validateScanImages } from "@/lib/scanner-import";
import { buildAnswerSheetQrPayload } from "@/lib/answer-sheet";
import { schoolService } from "@/services/school";
import { SCANNER_DEVICE_KEY, SCANNER_SCHOOL_KEY, scannerService, type PublishedScannerSheet, type ScannerDevice } from "@/services/scanner";
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
  const [bridgeUnavailable, setBridgeUnavailable] = useState(false);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [selected, setSelected] = useState<PublishedScannerSheet | null>(null);
  const [scans, setScans] = useState<ScannedImage[]>([]);
  const [scanning, setScanning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [gradeFilter, setGradeFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [thirdPartyImage, setThirdPartyImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [thirdPartyName, setThirdPartyName] = useState("");
  const [savingThirdParty, setSavingThirdParty] = useState(false);
  const [savedName, setSavedName] = useState("");
  const [error, setError] = useState("");
  const [changingSchool, setChangingSchool] = useState(false);
  const imageUrls = useRef<string[]>([]);
  const answerImportRef = useRef<HTMLInputElement>(null);
  const thirdPartyImportRef = useRef<HTMLInputElement>(null);
  const pendingImportSheet = useRef<PublishedScannerSheet | null>(null);

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
      setBridgeUnavailable(false);
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
      setBridgeUnavailable(true);
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

  const filterOptions = useMemo(() => ({
    grades: [...new Set(sheets.map((sheet) => sheet.grade).filter(Boolean))].sort(),
    subjects: [...new Set(sheets.map((sheet) => sheet.subject).filter(Boolean))].sort(),
    classes: [...new Map(sheets.flatMap((sheet) => sheet.classes || []).map((item) => [item.id, item])).values()],
  }), [sheets]);
  const filteredSheets = sheets.filter((sheet) =>
    (!gradeFilter || sheet.grade === gradeFilter)
    && (!subjectFilter || sheet.subject === subjectFilter)
    && (!classFilter || sheet.classes?.some((item) => item.id === classFilter)));

  const scanThirdParty = async () => {
    if (scanning) return;
    if (!teacher || teacher.schoolId !== schoolId) {
      setError("请先以当前学校的教师账号登录，才能将第三方卡保存到作业管理。");
      return;
    }
    setScanning(true);
    setError("");
    setSavedName("");
    try {
      if (!deviceId) throw new Error("请先选择扫描设备");
      const images = await scannerService.scan(deviceId, duplex);
      const blob = images[0];
      if (!blob) throw new Error("扫描仪未返回有效图像");
      const url = URL.createObjectURL(blob);
      imageUrls.current.push(url);
      setThirdPartyImage({ blob, url });
      setThirdPartyName(`第三方答题卡-${new Date().toISOString().slice(0, 10)}-${Date.now()}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "第三方卡扫描失败");
    } finally {
      setScanning(false);
    }
  };

  const importThirdPartyImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    if (!files.length || scanning || uploading) return;
    if (!canUpload) { setError("请先登录本校教师账号，才能导入第三方卡"); return; }
    setScanning(true);
    setError("");
    setSavedName("");
    try {
      const [image] = await validateScanImages(files);
      const url = URL.createObjectURL(image);
      imageUrls.current.push(url);
      setThirdPartyImage({ blob: image, url });
      setThirdPartyName(image.name.replace(/\.(png|jpe?g)$/i, "").slice(0, 150));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导入第三方卡失败");
    } finally { setScanning(false); }
  };

  const saveThirdParty = async () => {
    if (!thirdPartyImage || savingThirdParty) return;
    setSavingThirdParty(true);
    setError("");
    try {
      const saved = await scannerService.saveThirdPartyCard(thirdPartyImage.blob, thirdPartyName);
      setThirdPartyImage(null);
      setSavedName(saved.fileName);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存第三方卡失败");
    } finally {
      setSavingThirdParty(false);
    }
  };

  const bindSchool = () => {
    if (!selection || !schools.some((school) => school.id === selection)) { setError("请选择学校"); return; }
    localStorage.setItem(SCANNER_SCHOOL_KEY, selection);
    setSchoolId(selection);
    setChangingSchool(false);
    setSelected(null);
    clearImages();
    setSheets([]);
    setGradeFilter("");
    setSubjectFilter("");
    setClassFilter("");
    setThirdPartyImage(null);
    setSavedName("");
    setError("");
  };

  const addImages = async (sheet: PublishedScannerSheet, images: Blob[]) => {
    const existing = selected?.id === sheet.id && selected.type === sheet.type ? scans.map((scan) => scan.image) : [];
    assertScanBatchSize(images, existing);
    const results: ScannedImage[] = [];
    try {
      for (const image of images) {
        const url = URL.createObjectURL(image);
        results.push({ url, image, qrPayload: null, uploaded: false, uploading: false,
          name: `${sheet.type}-${sheet.id}-${Date.now()}-${results.length + 1}.${image.type === "image/jpeg" ? "jpg" : "png"}` });
        let qrPayload: string | null = null;
        try { qrPayload = await readAnswerSheetQr(image); } catch { /* Unreadable codes require manual review. */ }
        results[results.length - 1].qrPayload = qrPayload;
      }
    } catch (error) {
      results.forEach((result) => URL.revokeObjectURL(result.url));
      throw error;
    }
    if (selected?.id !== sheet.id || selected.type !== sheet.type) clearImages();
    imageUrls.current.push(...results.map((result) => result.url));
    setSelected(sheet);
    setScans((previous) => [...(selected?.id === sheet.id && selected.type === sheet.type ? previous : []), ...results]);
  };

  const chooseAnswerImages = (sheet: PublishedScannerSheet) => {
    if (scanning || uploading) return;
    pendingImportSheet.current = sheet;
    answerImportRef.current?.click();
  };

  const importAnswerImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    const sheet = pendingImportSheet.current;
    if (!sheet || !files.length || scanning || uploading) return;
    setScanning(true);
    setError("");
    try {
      const existing = selected?.id === sheet.id && selected.type === sheet.type ? scans.map((scan) => scan.image) : [];
      const images = await validateScanImages(files, existing);
      await addImages(sheet, images);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导入扫描图片失败");
    } finally { setScanning(false); }
  };

  const scanSheet = async (sheet: PublishedScannerSheet) => {
    if (scanning || uploading || !deviceId) return;
    setScanning(true);
    setError("");
    try {
      const images = await scannerService.scan(deviceId, duplex);
      await addImages(sheet, images);
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
        <input ref={answerImportRef} type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" multiple hidden aria-label="选择扫描图片" onChange={(event) => void importAnswerImages(event)} />
        <input ref={thirdPartyImportRef} type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" hidden aria-label="选择第三方卡图片" onChange={(event) => void importThirdPartyImage(event)} />
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>
            <ArrowLeft className="h-4 w-4" />返回登录页
          </Button>
          {selectedSchool && !changingSchool && (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => void scanThirdParty()} loading={scanning} disabled={uploading || !deviceId}>扫描第三方卡</Button>
              <Button size="sm" variant="outline" onClick={() => thirdPartyImportRef.current?.click()} disabled={scanning || uploading || !canUpload}>导入第三方卡图片</Button>
              <Button variant="outline" size="sm" disabled={scanning || uploading} onClick={() => { setSelection(schoolId); setChangingSchool(true); }}>
                切换学校
              </Button>
            </div>
          )}
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs text-ink-500">当前绑定学校</div>
                <h2 className="text-lg font-semibold text-ink-900">{selectedSchool.name}</h2>
              </div>
              <div className="text-sm text-ink-500">已发布答题卡 {sheets.length} 份</div>
            </div>
            <section className="rounded-xl border border-ink-100 bg-paper p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">本机扫描设备</h2><Button size="sm" variant="outline" onClick={() => void refreshDevices()} loading={loadingDevices}><RefreshCw className="h-4 w-4" />刷新设备</Button></div>
              {deviceStatus && <p role="status" className="text-sm text-amber-700">{deviceStatus}</p>}
              {bridgeUnavailable && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3 text-sm text-ink-800">
                  <p className="font-semibold">首次使用请安装 Windows 扫描桥接程序</p>
                  <p>安装包已包含运行环境，无需配置 Node.js。安装完成后点击“授权连接本站”，在系统弹窗中确认网址，最后刷新设备列表。</p>
                  <div className="flex flex-wrap gap-3 items-center">
                    <a className="inline-flex items-center gap-1 text-teal-700 underline font-medium" href="https://github.com/caosuoming/InteSchool/releases/download/scanner-bridge-latest/InteSchool-Scanner-Setup.exe"><Download className="h-4 w-4" />下载 Windows 安装包</a>
                    <a className="inline-flex items-center gap-1 text-teal-700 underline font-medium" href={`inteschool-scanner://connect?origin=${encodeURIComponent(window.location.origin)}`}>授权连接本站</a>
                    <a className="text-ink-600 underline" href="https://github.com/caosuoming/InteSchool/blob/main/docs/scanner-bridge.md" target="_blank" rel="noopener noreferrer">安装说明及故障排查</a>
                  </div>
                  <p className="text-xs text-ink-600">连接时浏览器可能询问是否打开 InteSchool 扫描桥接；仅对可信学校网址授权。扫描仪还需安装厂商驱动。若已安装仍无法连接，请在浏览器网站权限中允许“本机设备/本地网络访问”。</p>
                  <p className="text-xs text-ink-600">无法安装桥接时，也可以用系统扫描软件先保存为 PNG/JPEG 图片，然后使用下方答题卡的“导入图片”功能，无须安装 InteSchool 客户端。</p>
                </div>
              )}
              <Select label="扫描仪" value={deviceId} onChange={(event) => { setDeviceId(event.target.value); localStorage.setItem(SCANNER_DEVICE_KEY, event.target.value); }} options={deviceOptions} placeholder="请连接扫描仪并刷新" />
              <label className="flex items-center gap-2 text-sm text-ink-700"><input type="checkbox" checked={duplex} onChange={(event) => setDuplex(event.target.checked)} />双面自动进纸（默认）</label>
              {selectedDevice && duplex && !selectedDevice.duplex && <p className="text-sm text-amber-700">所选 WIA 通道不能保证双面扫描；请选择 TWAIN 设备或取消双面模式。</p>}
            </section>
            {!canUpload && <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">当前未以本校教师身份登录。可在本机扫描并下载，但上传与后续异常卷处理需要先<Link to="/login" className="underline">登录本校教师账号</Link>。</p>}
            {thirdPartyImage && (
              <section className="space-y-3 rounded-xl border border-gold-400 bg-paper p-5">
                <h3 className="font-semibold text-ink-900">第三方答题卡扫描结果</h3>
                <img src={thirdPartyImage.url} alt="第三方答题卡预览" className="max-h-80 w-full object-contain bg-mist" />
                <label className="block text-sm font-medium text-ink-700">文件名
                  <input aria-label="第三方卡文件名" value={thirdPartyName} maxLength={160} onChange={(event) => setThirdPartyName(event.target.value)} className="mt-1 w-full rounded-md border border-ink-200 px-3 py-2" />
                </label>
                <div className="flex gap-2">
                  <Button onClick={() => void saveThirdParty()} loading={savingThirdParty} disabled={!thirdPartyName.trim()}>保存到作业管理</Button>
                  <Button variant="outline" onClick={() => setThirdPartyImage(null)} disabled={savingThirdParty}>取消</Button>
                </div>
              </section>
            )}
            {savedName && <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm">已保存「{savedName}」。<Link className="ml-2 text-teal-700 underline" to="/homework-exams/homework">前往作业管理编辑标注</Link></div>}
            {loadingSheets ? (
              <div className="flex justify-center py-14"><Spinner size={30} /></div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_15rem]">
                <div>
                  {filteredSheets.length === 0 ? (
                    <div className="rounded-xl border border-ink-100 bg-paper px-6 py-16 text-center text-ink-500">{sheets.length ? "没有符合筛选条件的答题卡" : "本校暂无已发布的答题卡"}</div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {filteredSheets.map((sheet) => (
                        <div key={`${sheet.type}:${sheet.id}`} className="rounded-xl border border-ink-100 bg-paper p-5 shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <FileText className="h-5 w-5 text-gold-600" />
                            <span className="text-xs text-ink-500">{sheet.type === "paper" ? "试卷" : "讲义"}</span>
                          </div>
                          <h3 className="mt-3 line-clamp-2 font-semibold text-ink-900">{sheet.title}</h3>
                          <p className="mt-2 text-xs text-ink-500">{sheet.grade} · {sheet.schoolYear} · {sheet.subject}</p>
                          {!!sheet.classes?.length && <p className="mt-1 text-xs text-ink-500">{sheet.classes.map((item) => item.name).join("、")}</p>}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" disabled={scanning || uploading || !deviceId} onClick={() => void scanSheet(sheet)}
                              aria-label={`使用扫描仪采集${sheet.title}`} className="text-sm text-gold-700 hover:underline disabled:opacity-50">{scanning && selected?.id === sheet.id && selected.type === sheet.type ? "正在处理…" : "使用扫描仪"}</button>
                            <button type="button" disabled={scanning || uploading} onClick={() => chooseAnswerImages(sheet)}
                              aria-label={`导入${sheet.title}的扫描图片`} className="text-sm text-teal-700 hover:underline disabled:opacity-50">导入图片</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <aside className="h-fit space-y-4 rounded-xl border border-ink-100 bg-paper p-4" aria-label="答题卡筛选">
                  <h3 className="font-semibold text-ink-900">答题卡筛选</h3>
                  <label className="block text-sm">年级
                    <select aria-label="筛选年级" value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)} className="mt-1 w-full rounded-md border border-ink-200 p-2">
                      <option value="">全部年级</option>{filterOptions.grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm">学科
                    <select aria-label="筛选学科" value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} className="mt-1 w-full rounded-md border border-ink-200 p-2">
                      <option value="">全部学科</option>{filterOptions.subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm">班级
                    <select aria-label="筛选班级" value={classFilter} onChange={(event) => setClassFilter(event.target.value)} className="mt-1 w-full rounded-md border border-ink-200 p-2">
                      <option value="">全部班级</option>{filterOptions.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>
                  <p className="text-xs text-ink-500">显示 {filteredSheets.length} / {sheets.length} 份</p>
                </aside>
              </div>
            )}
            {selected && <section className="space-y-4 rounded-xl border border-ink-100 bg-paper p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-semibold text-ink-900">{selected.title}</h2><p className="mt-1 text-xs text-ink-500">已采集 {scans.length} 页 · 已上传 {scans.filter((scan) => scan.uploaded).length} 页</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void scanSheet(selected)} loading={scanning} disabled={uploading || !deviceId}><RefreshCw className="h-4 w-4" />继续扫描</Button><Button variant="outline" onClick={() => chooseAnswerImages(selected)} disabled={scanning || uploading}>继续导入图片</Button><Button onClick={() => void uploadPending()} disabled={!canUpload || !pendingCount || scanning} loading={uploading}>确认试卷并上传 {pendingCount} 页</Button></div></div>
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
