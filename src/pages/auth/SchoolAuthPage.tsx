import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  Plus,
  Search,
  School as SchoolIcon,
  Upload,
  Users,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { schoolService } from "@/services/school";
import { authService } from "@/services/auth";
import { uploadFile } from "@/services/api";
import { toast } from "@/stores/ui";
import { Button, Input, Modal, Textarea } from "@/components/ui";
import type { School, SchoolCreationApplication, TeacherRole } from "@/types";
import { cn } from "@/lib/utils";
import { GRADE_OPTIONS, SUBJECT_OPTIONS } from "@/lib/education";
import { TEACHER_ROLES } from "@/lib/teacher-roles";
import { roleLabels } from "@/services/organization";

export default function SchoolAuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const addingSchool = searchParams.get("add") === "1";
  const { teacher, refresh } = useAuthStore();
  const [schools, setSchools] = useState<School[]>([]);
  const [keyword, setKeyword] = useState("");
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [employeeNo, setEmployeeNo] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [teachingGrades, setTeachingGrades] = useState<string[]>([]);
  const [roles, setRoles] = useState<TeacherRole[]>(["teacher"]);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [requestSchoolAdmin, setRequestSchoolAdmin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creationOpen, setCreationOpen] = useState(false);
  const [creationSubmitting, setCreationSubmitting] = useState(false);
  const [creationApplications, setCreationApplications] = useState<SchoolCreationApplication[]>([]);
  const [schoolDraft, setSchoolDraft] = useState({
    name: "",
    code: "",
    city: "",
    description: "",
  });

  useEffect(() => {
    if (!teacher) {
      navigate("/login");
    } else if (teacher.schoolId && !addingSchool) {
      navigate("/dashboard");
    }
  }, [teacher, navigate, addingSchool]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [data, applications] = await Promise.all([
          schoolService.listSchools(),
          schoolService.listMySchoolCreationApplications(),
        ]);
        setSchools(data);
        setCreationApplications(applications);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const handleSearch = async (kw: string) => {
    setKeyword(kw);
    const data = await schoolService.searchSchools(kw);
    setSchools(data);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setProofFile(file);
  };

  const toggleValue = (value: string, values: string[], setter: (next: string[]) => void) => {
    setter(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  };

  const toggleRole = (role: TeacherRole) => {
    if (role === "teacher") return;
    setRoles((current) => current.includes(role)
      ? current.filter((item) => item !== role)
      : [...current, role]);
  };

  const openCreationApplication = () => {
    setSchoolDraft((draft) => ({ ...draft, name: keyword.trim() || draft.name }));
    setCreationOpen(true);
  };

  const handleCreateSchoolApplication = async () => {
    if (!schoolDraft.name.trim() || !schoolDraft.code.trim() || !schoolDraft.city.trim()) {
      toast.error("请填写学校名称、代码和所在城市");
      return;
    }
    setCreationSubmitting(true);
    try {
      const application = await schoolService.submitSchoolCreationApplication(schoolDraft);
      setCreationApplications((items) => [application, ...items]);
      setCreationOpen(false);
      setSchoolDraft({ name: "", code: "", city: "", description: "" });
      toast.success("新增学校申请已提交", "平台超级管理员审核通过后，该学校会出现在搜索结果中");
    } catch (error) {
      toast.error("提交失败", error instanceof Error ? error.message : undefined);
    } finally {
      setCreationSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!teacher || !selectedSchool) return;
    if (subjects.length === 0) {
      toast.error("请至少选择一个任教学科");
      return;
    }
    setSubmitting(true);
    try {
      const uploaded = proofFile ? await uploadFile(proofFile) : null;
      const position = roles.map((role) => roleLabels[role]).join("、");
      const application = await authService.applySchool(
        teacher.id,
        selectedSchool.id,
        employeeNo.trim(),
        subjects,
        uploaded?.id,
        teachingGrades,
        position,
        requestSchoolAdmin,
        roles,
      );
      if (application.status === "approved") {
        toast.success("认证已通过", `欢迎加入 ${selectedSchool.name}`);
        await refresh();
        navigate(addingSchool ? "/profile" : "/dashboard");
      } else {
        toast.success("申请已提交", "本校管理员或平台超级管理员审核通过后即可切换到该学校");
        if (addingSchool) navigate("/profile");
      }
    } catch (e) {
      toast.error("认证失败", e instanceof Error ? e.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  if (!teacher) return null;

  return (
    <div className="min-h-screen bg-mist">
      {/* 顶部栏 */}
      <header className="bg-ink-900 text-paper">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-gold-400 text-ink-900 flex items-center justify-center font-serif font-bold text-lg">
              智
            </div>
            <div className="font-serif font-semibold text-lg">智题云校</div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="w-8 h-8 rounded-full bg-gold-400 text-ink-900 flex items-center justify-center font-medium text-sm">
              {teacher.avatar}
            </div>
            <span className="text-ink-200">{teacher.name}</span>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="font-serif text-3xl font-bold text-ink-900 mb-2">加入学校</h1>
          <p className="text-sm text-ink-500">
            搜索并选择您所在的学校，提交认证材料后即可加入学校题库池，开始构建您的题库与讲义。
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          {/* 学校列表 */}
          <div className="lg:col-span-3">
            <div className="card-base p-5">
              <div className="mb-4 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input
                  type="text"
                  placeholder="搜索学校名称、代码或城市"
                  value={keyword}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="input-base pl-10"
                />
              </div>

              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {loading ? (
                  <div className="text-center py-8 text-ink-400">
                    <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin" />
                    加载中...
                  </div>
                ) : schools.length === 0 ? (
                  <div className="text-center py-10 px-4">
                    <SchoolIcon className="w-10 h-10 mx-auto mb-3 text-ink-200" />
                    <div className="text-sm font-medium text-ink-700">未找到匹配的学校</div>
                    <p className="text-xs text-ink-400 mt-1 mb-4">
                      请确认关键词无误，或提交新增学校申请。
                    </p>
                    {keyword.trim() && (
                      <Button variant="outline" onClick={openCreationApplication}>
                        <Plus className="w-4 h-4" />
                        申请新增“{keyword.trim()}”
                      </Button>
                    )}
                  </div>
                ) : (
                  schools.map((school) => (
                    <button
                      key={school.id}
                      onClick={() => setSelectedSchool(school)}
                      className={cn(
                        "w-full text-left p-4 rounded-lg border transition-all",
                        selectedSchool?.id === school.id
                          ? "border-gold-400 bg-gold-50/40 shadow-gold"
                          : "border-ink-100 bg-paper hover:border-ink-200 hover:bg-mist",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "w-12 h-12 rounded-lg flex items-center justify-center font-serif font-bold text-xl flex-shrink-0",
                            selectedSchool?.id === school.id
                              ? "bg-gold-400 text-ink-900"
                              : "bg-ink-100 text-ink-700",
                          )}
                        >
                          {school.logo}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="font-serif font-semibold text-ink-900">{school.name}</div>
                            {selectedSchool?.id === school.id && (
                              <CheckCircle2 className="w-4 h-4 text-gold-600" />
                            )}
                          </div>
                          <p className="text-xs text-ink-500 mt-1 line-clamp-2">{school.description}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-ink-400">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {school.city}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {school.teacherCount} 位教师
                            </span>
                            <span>代码 {school.code}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {creationApplications.length > 0 && (
              <div className="card-base p-5 mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock3 className="w-4 h-4 text-gold-600" />
                  <h3 className="font-serif font-semibold text-ink-900">我的新增学校申请</h3>
                </div>
                <div className="space-y-2">
                  {creationApplications.slice(0, 5).map((application) => (
                    <div
                      key={application.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-ink-100 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink-800 truncate">{application.name}</div>
                        <div className="text-xs text-ink-400 mt-0.5">{application.city} · {application.code}</div>
                      </div>
                      <span className={cn(
                        "text-xs px-2 py-1 rounded-full flex-shrink-0",
                        application.status === "approved" && "bg-emerald-50 text-emerald-700",
                        application.status === "pending" && "bg-amber-50 text-amber-700",
                        application.status === "rejected" && "bg-red-50 text-red-700",
                      )}>
                        {application.status === "approved"
                          ? "已通过"
                          : application.status === "pending"
                            ? "审核中"
                            : "未通过"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 认证表单 */}
          <div className="lg:col-span-2">
            <div className="card-base p-5 sticky top-6">
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="w-4 h-4 text-gold-600" />
                <h3 className="font-serif font-semibold text-ink-900">教师认证申请</h3>
              </div>

              {!selectedSchool ? (
                <div className="text-center py-12 text-ink-400 text-sm">
                  <SchoolIcon className="w-10 h-10 mx-auto mb-2 text-ink-200" />
                  请先从左侧选择您所在的学校
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 rounded-md bg-ink-50 border border-ink-100">
                    <div className="text-xs text-ink-500">已选学校</div>
                    <div className="font-medium text-ink-900 mt-0.5">{selectedSchool.name}</div>
                  </div>

                  <Input
                    label="工号（可选）"
                    placeholder="如 BJ04-MATH-018"
                    value={employeeNo}
                    onChange={(e) => setEmployeeNo(e.target.value)}
                  />

                  <fieldset>
                    <legend className="block text-sm font-medium text-ink-700 mb-1.5">
                      任教学科 <span className="text-red-500">*</span>
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {SUBJECT_OPTIONS.map((item) => (
                        <label
                          key={item}
                          className={cn(
                            "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors",
                            subjects.includes(item)
                              ? "border-gold-400 bg-gold-50 text-ink-900"
                              : "border-ink-200 bg-white text-ink-600 hover:border-ink-300",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={subjects.includes(item)}
                            onChange={() => toggleValue(item, subjects, setSubjects)}
                          />
                          {item}
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-ink-400 mt-1.5">至少选择一项，可多选</p>
                  </fieldset>

                  <fieldset>
                    <legend className="block text-sm font-medium text-ink-700 mb-1.5">
                      任教年级（可选）
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {GRADE_OPTIONS.map((item) => (
                        <label
                          key={item}
                          className={cn(
                            "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors",
                            teachingGrades.includes(item)
                              ? "border-gold-400 bg-gold-50 text-ink-900"
                              : "border-ink-200 bg-white text-ink-600 hover:border-ink-300",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={teachingGrades.includes(item)}
                            onChange={() => toggleValue(item, teachingGrades, setTeachingGrades)}
                          />
                          {item}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend className="block text-sm font-medium text-ink-700 mb-1.5">
                      申请身份 <span className="text-red-500">*</span>
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {TEACHER_ROLES.map((role) => (
                        <label
                          key={role}
                          className={cn(
                            "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                            role === "teacher" ? "cursor-not-allowed" : "cursor-pointer",
                            roles.includes(role)
                              ? "border-gold-400 bg-gold-50 text-ink-900"
                              : "border-ink-200 bg-white text-ink-600 hover:border-ink-300",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={roles.includes(role)}
                            disabled={role === "teacher"}
                            onChange={() => toggleRole(role)}
                          />
                          {roleLabels[role]}
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-ink-400 mt-1.5">教师身份默认包含，其他身份可同时选择多项</p>
                  </fieldset>

                  <div>
                    <label className="block text-sm font-medium text-ink-700 mb-1.5">
                      教师证明材料（可选）
                    </label>
                    <label className="flex flex-col items-center justify-center px-4 py-6 rounded-md border border-dashed border-ink-200 hover:border-gold-400 hover:bg-gold-50/30 cursor-pointer transition-colors">
                      <Upload className="w-5 h-5 text-ink-400 mb-2" />
                      <span className="text-xs text-ink-500">
                        {proofFile?.name || "点击上传工作证、聘书等证明文件"}
                      </span>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.png,.doc,.docx"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <label className="flex items-start gap-3 rounded-md border border-ink-200 bg-white p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={requestSchoolAdmin}
                      onChange={(event) => setRequestSchoolAdmin(event.target.checked)}
                    />
                    <span>
                      <span className="block text-sm font-medium text-ink-700">申请成为本校管理员（可选）</span>
                      <span className="block text-xs text-ink-400 mt-0.5">审核通过后将同时获得本校管理权限</span>
                    </span>
                  </label>

                  <Button
                    variant="gold"
                    size="lg"
                    loading={submitting}
                    onClick={handleSubmit}
                    className="w-full"
                  >
                    {submitting ? "提交审核中..." : "提交认证申请"}
                    {!submitting && <ArrowRight className="w-4 h-4" />}
                  </Button>

                  <p className="text-xs text-ink-400 text-center">
                    提交后由本校管理员或平台超级管理员审核
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={creationOpen}
        onClose={() => !creationSubmitting && setCreationOpen(false)}
        title="申请新增学校"
        description="提交后由平台超级管理员审核。审核通过前不会出现在学校搜索结果中。"
        footer={(
          <>
            <Button variant="ghost" disabled={creationSubmitting} onClick={() => setCreationOpen(false)}>
              取消
            </Button>
            <Button variant="gold" loading={creationSubmitting} onClick={handleCreateSchoolApplication}>
              提交审核
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Input
            label="学校名称"
            value={schoolDraft.name}
            maxLength={100}
            onChange={(event) => setSchoolDraft((draft) => ({ ...draft, name: event.target.value }))}
            placeholder="例如：南京市第一中学"
          />
          <Input
            label="学校代码"
            value={schoolDraft.code}
            maxLength={24}
            onChange={(event) => setSchoolDraft((draft) => ({ ...draft, code: event.target.value.toUpperCase() }))}
            placeholder="例如：NJYZ"
            hint="2-24 位字母、数字、下划线或短横线"
          />
          <Input
            label="所在城市"
            value={schoolDraft.city}
            maxLength={50}
            onChange={(event) => setSchoolDraft((draft) => ({ ...draft, city: event.target.value }))}
            placeholder="例如：南京"
          />
          <Textarea
            label="学校简介（可选）"
            value={schoolDraft.description}
            maxLength={500}
            onChange={(event) => setSchoolDraft((draft) => ({ ...draft, description: event.target.value }))}
            placeholder="可填写学校全称、校区等便于审核的信息"
          />
        </div>
      </Modal>
    </div>
  );
}
