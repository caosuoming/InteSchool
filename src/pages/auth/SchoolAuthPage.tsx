import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Search, School as SchoolIcon, Upload, ArrowRight, CheckCircle2, Loader2, Building2, MapPin, Users } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { schoolService } from "@/services/school";
import { authService } from "@/services/auth";
import { uploadFile } from "@/services/api";
import { toast } from "@/stores/ui";
import { Button, Input, Select } from "@/components/ui";
import type { School } from "@/types";
import { cn } from "@/lib/utils";

export default function SchoolAuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const addingSchool = searchParams.get("add") === "1";
  const { teacher, refresh } = useAuthStore();
  const [schools, setSchools] = useState<School[]>([]);
  const [keyword, setKeyword] = useState("");
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [employeeNo, setEmployeeNo] = useState("");
  const [subject, setSubject] = useState("数学");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

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
      const data = await schoolService.listSchools();
      setSchools(data);
      setLoading(false);
    };
    load();
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

  const handleSubmit = async () => {
    if (!teacher || !selectedSchool) return;
    if (!employeeNo.trim()) {
      toast.error("请填写工号");
      return;
    }
    if (!proofFile) {
      toast.error("请上传教师证明");
      return;
    }
    setSubmitting(true);
    try {
      const uploaded = await uploadFile(proofFile);
      const application = await authService.applySchool(
        teacher.id,
        selectedSchool.id,
        employeeNo,
        subject,
        uploaded.id,
      );
      if (application.status === "approved") {
        toast.success("认证已通过", `欢迎加入 ${selectedSchool.name}`);
        await refresh();
        navigate(addingSchool ? "/profile" : "/dashboard");
      } else {
        toast.success("申请已提交", "学校管理员审核通过后即可切换到该学校");
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
                  <div className="text-center py-8 text-ink-400 text-sm">未找到匹配的学校</div>
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
                    label="工号"
                    placeholder="如 BJ04-MATH-018"
                    value={employeeNo}
                    onChange={(e) => setEmployeeNo(e.target.value)}
                  />

                  <Select
                    label="任教学科"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    options={[
                      { value: "数学", label: "数学" },
                      { value: "物理", label: "物理" },
                      { value: "化学", label: "化学" },
                      { value: "生物", label: "生物" },
                      { value: "语文", label: "语文" },
                      { value: "英语", label: "英语" },
                      { value: "历史", label: "历史" },
                      { value: "地理", label: "地理" },
                      { value: "政治", label: "政治" },
                    ]}
                  />

                  <div>
                    <label className="block text-sm font-medium text-ink-700 mb-1.5">
                      教师证明材料
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
                    提交后将由学校管理员审核
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
