import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Download, FileText, RefreshCw, ScanLine, School as SchoolIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { schoolService } from "@/services/school";
import { SCANNER_SCHOOL_KEY, scannerService, type PublishedScannerSheet } from "@/services/scanner";
import type { School } from "@/types";

interface ScannedImage {
  url: string;
  name: string;
}

export default function ScannerPage() {
  const navigate = useNavigate();
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState(() => localStorage.getItem(SCANNER_SCHOOL_KEY) || "");
  const [selection, setSelection] = useState("");
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [sheets, setSheets] = useState<PublishedScannerSheet[]>([]);
  const [selected, setSelected] = useState<PublishedScannerSheet | null>(null);
  const [scans, setScans] = useState<ScannedImage[]>([]);
  const [scanning, setScanning] = useState(false);
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
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "学校列表加载失败");
      })
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

  useEffect(() => () => { imageUrls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);

  const selectedSchool = schools.find((school) => school.id === schoolId);
  const schoolOptions = useMemo(() => schools.map((school) => ({
    value: school.id, label: school.city ? `${school.name} · ${school.city}` : school.name,
  })), [schools]);

  const bindSchool = () => {
    if (!selection || !schools.some((school) => school.id === selection)) {
      setError("请选择学校");
      return;
    }
    localStorage.setItem(SCANNER_SCHOOL_KEY, selection);
    setSchoolId(selection);
    setChangingSchool(false);
    setSelected(null);
    setScans([]);
    setSheets([]);
    setError("");
  };

  const scanSheet = async (sheet: PublishedScannerSheet) => {
    if (scanning) return;
    if (selected?.id !== sheet.id || selected.type !== sheet.type) {
      setScans([]);
    }
    setSelected(sheet);
    setScanning(true);
    setError("");
    try {
      const image = await scannerService.scan();
      const url = URL.createObjectURL(image);
      imageUrls.current.push(url);
      const ext = image.type === "image/jpeg" ? "jpg" : image.type === "image/bmp" ? "bmp" : "png";
      setScans((previous) => [...(selected?.id === sheet.id && selected.type === sheet.type ? previous : []), {
        url,
        name: `${sheet.type}-${sheet.id}-${Date.now()}.${ext}`,
      }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "扫描失败");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="min-h-screen bg-mist p-4 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>
            <ArrowLeft className="h-4 w-4" />返回登录页
          </Button>
          {selectedSchool && !changingSchool && (
            <Button variant="outline" size="sm" onClick={() => { setSelection(schoolId); setChangingSchool(true); }}>
              切换学校
            </Button>
          )}
        </div>
        <header className="rounded-2xl bg-ink-900 text-paper px-6 py-7 sm:px-9">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold-400 text-ink-900">
              <ScanLine className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-semibold">我要扫描</h1>
              <p className="mt-1 text-sm text-ink-300">选择答题卡，使用本机扫描仪采集纸质答题卡</p>
            </div>
          </div>
        </header>

        {(error && !scanning) && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        {loadingSchools ? (
          <div className="flex justify-center py-16"><Spinner size={30} /></div>
        ) : (!selectedSchool || changingSchool) ? (
          <section className="mx-auto max-w-md rounded-xl border border-ink-100 bg-paper p-6 shadow-sm space-y-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-ink-900">
              <SchoolIcon className="h-5 w-5" />绑定学校
            </h2>
            <p className="text-sm text-ink-500">首次使用请选择学校。绑定保存在本机浏览器，下次进入无需再次选择。</p>
            <Select label="学校" value={selection} onChange={(event) => setSelection(event.target.value)} options={schoolOptions} placeholder="请选择学校" />
            <div className="flex gap-3">
              <Button onClick={bindSchool} disabled={!selection}>确认绑定</Button>
              {changingSchool && <Button variant="outline" onClick={() => setChangingSchool(false)}>取消</Button>}
            </div>
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
            {loadingSheets ? (
              <div className="flex justify-center py-14"><Spinner size={30} /></div>
            ) : sheets.length === 0 ? (
              <div className="rounded-xl border border-ink-100 bg-paper px-6 py-16 text-center text-ink-500">本校暂无已发布的答题卡</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sheets.map((sheet) => (
                  <button
                    key={`${sheet.type}:${sheet.id}`}
                    type="button"
                    disabled={scanning}
                    onClick={() => void scanSheet(sheet)}
                    className="rounded-xl border border-ink-100 bg-paper p-5 text-left shadow-sm transition-colors hover:border-gold-400 hover:bg-gold-50 disabled:opacity-60"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <FileText className="h-5 w-5 text-gold-600" />
                      <span className="text-xs text-ink-500">{sheet.type === "paper" ? "试卷" : "讲义"}</span>
                    </div>
                    <h3 className="mt-3 line-clamp-2 font-semibold text-ink-900">{sheet.title}</h3>
                    <p className="mt-2 text-xs text-ink-500">{sheet.grade} · {sheet.schoolYear}</p>
                    <p className="mt-3 text-xs text-gold-700">{scanning && selected?.id === sheet.id && selected.type === sheet.type ? "正在扫描…" : "点击开始扫描"}</p>
                  </button>
                ))}
              </div>
            )}
            {selected && (
              <section className="space-y-4 rounded-xl border border-ink-100 bg-paper p-5 sm:p-7">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="font-semibold text-ink-900">{selected.title}</h2>
                    <p className="mt-1 text-xs text-ink-500">已扫描 {scans.length} 张 · 图像仅保存在当前浏览器页面，可逐张下载</p>
                  </div>
                  <Button onClick={() => void scanSheet(selected)} loading={scanning}>
                    <RefreshCw className="h-4 w-4" />再扫一张
                  </Button>
                </div>
                {scans.length > 0 && (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {scans.map((scan, index) => (
                      <div key={scan.url} className="overflow-hidden rounded-lg border border-ink-100">
                        <img src={scan.url} alt={`扫描结果第 ${index + 1} 张`} className="w-full max-h-72 object-contain bg-mist" />
                        <a href={scan.url} download={scan.name} className="flex items-center justify-center gap-2 px-3 py-2 text-sm text-gold-700 hover:bg-mist">
                          <Download className="h-4 w-4" />下载第 {index + 1} 张
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
            <p className="text-xs leading-5 text-ink-500">扫描需要在本机启动 InteSchool 扫描桥接程序，并使用已安装驱动的扫描仪。当前版本采集并下载图像，不会自动识别或提交学生成绩。</p>
          </>
        )}
      </div>
    </div>
  );
}
