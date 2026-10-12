import { useEffect, useId, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { getCoursewareFileUrl } from "@/lib/courseware-online";
import { exportGeoGebraFile, loadGeoGebra, type GeoGebraApi } from "@/lib/geogebra";
import { teacherResourceScopeId } from "@/lib/personal-resource-scope";
import { useSchoolResourceOptions, includeCurrentOption } from "@/hooks/useSchoolResourceOptions";
import { uploadFile } from "@/services/api";
import { coursewareService } from "@/services/courseware";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import type { Courseware, ResourceSemester } from "@/types";

export default function GeoGebraEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { teacher } = useAuthStore();
  const resourceScopeId = teacher ? teacherResourceScopeId(teacher) : undefined;
  const { gradeOptions, schoolYearOptions, semesterOptions, defaultGrade, defaultSchoolYear } =
    useSchoolResourceOptions(resourceScopeId);
  const [existing, setExisting] = useState<Courseware | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [grade, setGrade] = useState("");
  const [schoolYear, setSchoolYear] = useState("");
  const [semester, setSemester] = useState<ResourceSemester>("上学期");
  const requestedMode = searchParams.get("mode") === "geometry" ? "geometry" : "classic";
  const mode = id && existing
    ? (existing.tags.includes("几何画板") ? "geometry" : "classic")
    : requestedMode;
  const elementId = "geogebra-editor-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<GeoGebraApi | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    coursewareService.getCourseware(id).then((courseware) => {
      if (!active) return;
      if (!courseware || courseware.type !== "ggb" || courseware.teacherId !== teacher?.id) {
        throw new Error("GeoGebra 课件不存在或无权编辑");
      }
      setExisting(courseware);
      setTitle(courseware.title);
      setGrade(courseware.grade);
      setSchoolYear(courseware.schoolYear);
      setSemester(courseware.semester || "上学期");
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "加载课件失败");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [id, teacher?.id]);

  useEffect(() => {
    if (!id && !title) setTitle(mode === "geometry" ? "未命名几何画板" : "未命名 GGB 课件");
  }, [id, mode, title]);

  const selectedGrade = grade || defaultGrade;
  const selectedSchoolYear = schoolYear || defaultSchoolYear;
  const fileUrl = existing ? getCoursewareFileUrl(existing) : undefined;

  useEffect(() => {
    if (loading || error || (id && !existing)) return;
    let active = true;
    let appletApi: GeoGebraApi | null = null;
    const container = containerRef.current;
    if (!container) return;
    setReady(false);
    container.innerHTML = "";
    loadGeoGebra().then((GGBApplet) => {
      if (!active) return;
      const applet = new GGBApplet({
        id: elementId + "-api",
        appName: mode,
        ...(fileUrl ? { filename: fileUrl } : {}),
        width: Math.max(container.clientWidth, 640),
        height: Math.max(container.clientHeight, 520),
        showToolBar: true,
        showMenuBar: true,
        showAlgebraInput: true,
        showToolBarHelp: true,
        showResetIcon: true,
        enableRightClick: true,
        enableShiftDragZoom: true,
        allowUpscale: true,
        scaleContainerClass: elementId + "-scale",
        appletOnLoad: (api: GeoGebraApi) => {
          if (!active) return;
          appletApi = api;
          apiRef.current = api;
          setReady(true);
        },
      }, true);
      applet.inject(elementId);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "GeoGebra 加载失败");
    });
    return () => {
      active = false;
      apiRef.current = null;
      appletApi?.remove();
      container.innerHTML = "";
    };
  }, [elementId, loading, error, id, existing, mode, fileUrl]);

  const save = async () => {
    if (!teacher || !resourceScopeId || !apiRef.current || saving) return;
    if (!title.trim()) {
      toast.warning("请输入课件名称");
      return;
    }
    if (!selectedGrade || !selectedSchoolYear) {
      toast.warning("请选择年级和学年");
      return;
    }
    setSaving(true);
    try {
      const file = await exportGeoGebraFile(apiRef.current, title);
      const uploaded = await uploadFile(file);
      const fields = {
        title: title.trim(),
        grade: selectedGrade,
        schoolYear: selectedSchoolYear,
        semester,
        fileUrl: uploaded.url,
        fileName: file.name,
        fileSize: file.size,
      };
      const saved = existing
        ? await coursewareService.updateCourseware(existing.id, fields)
        : await coursewareService.createCourseware(teacher.id, resourceScopeId, {
            ...fields,
            chapterIds: [],
            knowledgePointIds: [],
            type: "ggb",
            content: mode === "geometry" ? "GeoGebra 几何画板" : "GeoGebra 交互课件",
            tags: [mode === "geometry" ? "几何画板" : "GeoGebra"],
          });
      toast.success("已保存到课件库", "可从上课课件编辑器中插入该 GGB 课件");
      if (!existing) navigate("/geogebra/" + saved.id + "/edit", { replace: true });
      else setExisting(saved);
    } catch (cause) {
      toast.error("保存失败", cause instanceof Error ? cause.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={() => navigate("/my-resources/coursewares")}>
          <ArrowLeft className="w-4 h-4" />返回课件库
        </Button>
        <h1 className="font-serif text-xl font-semibold text-ink-900">
          {mode === "geometry" ? "制作几何画板" : "制作 GGB"}
        </h1>
        <div className="flex-1" />
        <Button variant="gold" onClick={() => void save()} disabled={!ready || loading || Boolean(error)} loading={saving}>
          <Save className="w-4 h-4" />保存到课件库
        </Button>
      </div>
      <div className="grid gap-3 rounded-lg border border-ink-100 bg-paper p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input label="课件名称" maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
        <Select label="年级" value={selectedGrade} options={includeCurrentOption(gradeOptions, selectedGrade)} onChange={(event) => setGrade(event.target.value)} />
        <Select label="学年" value={selectedSchoolYear} options={includeCurrentOption(schoolYearOptions, selectedSchoolYear)} onChange={(event) => setSchoolYear(event.target.value)} />
        <Select label="学期" value={semester} options={semesterOptions} onChange={(event) => setSemester(event.target.value as ResourceSemester)} />
      </div>
      <div className={"relative min-h-[65vh] overflow-hidden rounded-lg border border-ink-100 bg-white " + elementId + "-scale"}>
        <div id={elementId} ref={containerRef} className="h-[70vh] w-full" aria-label="GeoGebra 在线编辑器" />
        {(loading || (!ready && !error)) && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-white/90 text-sm text-ink-600">
            <Spinner size={20} />加载 GeoGebra 在线编辑器...
          </div>
        )}
        {error && <div role="alert" className="absolute inset-0 flex items-center justify-center p-6 text-red-700">{error}</div>}
      </div>
      <p className="text-xs text-ink-500">
        制作完成后点击“保存到课件库”。保存为标准 .ggb 文件，插入上课课件后保留几何对象的交互操作。在线编辑器需要能够访问 GeoGebra 服务。
      </p>
    </div>
  );
}
