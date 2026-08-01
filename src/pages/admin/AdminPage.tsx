import { Link } from "react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  Settings,
  GitBranch,
  GraduationCap,
  Network,
  ArrowRight,
  SlidersHorizontal,
  User,
  Type,
  UserPlus,
  ShieldCheck,
  UsersRound,
  Building2,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { useSettingsStore, uiScaleConfig, type UiScale } from "@/stores/settings";
import { cn } from "@/lib/utils";

interface AdminItem {
  icon: typeof GitBranch;
  title: string;
  description: string;
  href: string;
  /** 是否仅学校身份可见 */
  schoolOnly?: boolean;
  adminOnly?: boolean;
  platformOnly?: boolean;
}

const allAdminItems: AdminItem[] = [
  {
    icon: GitBranch,
    title: "知识树管理",
    description: "管理学校的知识体系结构，包括课程分类、知识点关联和学习路径规划",
    href: "/knowledge-tree",
    schoolOnly: true,
  },
  {
    icon: GraduationCap,
    title: "班级学生管理",
    description: "管理班级信息、学生档案、成绩记录和学习进度追踪",
    href: "/classes",
  },
  {
    icon: Network,
    title: "组织架构管理",
    description: "管理学校部门结构、教师团队和人员权限配置",
    href: "/organization",
    schoolOnly: true,
  },
  {
    icon: UserPlus,
    title: "教师注册管理",
    description: "管理员预授权教师手机号，或将待注册教师加入“我来担保”名单",
    href: "/admin/registration-access",
    schoolOnly: true,
  },
  {
    icon: UsersRound,
    title: "教师教学资料",
    description: "维护本校教师的任教学科、年级和班级",
    href: "/admin/teacher-profiles",
    schoolOnly: true,
    adminOnly: true,
  },
  {
    icon: ShieldCheck,
    title: "学校管理员审核",
    description: "审核各学校教师提交的学校管理员权限申请",
    href: "/admin/school-admin-applications",
    platformOnly: true,
  },
  {
    icon: Building2,
    title: "新增学校审核",
    description: "审核用户提交的新学校申请，通过后将学校加入平台目录",
    href: "/admin/school-creation-applications",
    platformOnly: true,
  },
  {
    icon: SlidersHorizontal,
    title: "系统设置",
    description: "管理年级、学年、题源、题类、分类等基础数据配置",
    href: "/admin/settings",
    schoolOnly: true,
  },
];

export function AdminPage() {
  const { getCurrentAffiliation } = useAuthStore();
  const currentAffiliation = getCurrentAffiliation();
  const isPersonal = !currentAffiliation?.schoolId;
  const { uiScale, setUiScale } = useSettingsStore();
  const activeRole = currentAffiliation?.role;
  const isAdmin = ["school_admin", "platform_admin"].includes(String(activeRole));
  const isPlatformAdmin = activeRole === "platform_admin";

  const adminItems = allAdminItems.filter((item) => {
    if (item.schoolOnly && isPersonal) return false;
    if (item.adminOnly && !isAdmin) return false;
    if (item.platformOnly && !isPlatformAdmin) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-mist">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <PageHeader
          title="后台管理"
          description={
            isPersonal
              ? "管理个人教学班级和学生档案（个人身份）"
              : "管理学校知识树、班级学生和组织架构"
          }
          icon={isPersonal ? <User className="w-5 h-5" /> : <Settings className="w-5 h-5" />}
        />

        {/* 字体版本切换 */}
        <Card className="mb-6 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Type className="w-4 h-4 text-gold-600" />
            <h3 className="font-serif text-base font-semibold text-ink-900">显示版本</h3>
            <span className="text-xs text-ink-500">切换全局字体大小，适应不同阅读习惯</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(Object.keys(uiScaleConfig) as UiScale[]).map((key) => {
              const config = uiScaleConfig[key];
              const active = uiScale === key;
              return (
                <button
                  key={key}
                  onClick={() => setUiScale(key)}
                  className={cn(
                    "text-left p-4 rounded-lg border-2 transition-all",
                    active
                      ? "border-gold-400 bg-gold-50 shadow-sm"
                      : "border-ink-200 bg-white hover:border-ink-300",
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className="font-serif font-semibold text-ink-900"
                      style={{ fontSize: key === "youth" ? "14px" : key === "senior" ? "18px" : "16px" }}
                    >
                      {config.label}
                    </span>
                    {active && (
                      <span className="text-[11px] px-1.5 py-0.5 bg-gold-400 text-ink-900 rounded font-medium">
                        当前
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-500">{config.description}</p>
                </button>
              );
            })}
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {adminItems.map((item) => (
            <Link key={item.title} to={item.href}>
              <Card
                hoverable
                className="group flex flex-col p-6 bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer"
              >
                <div className="w-12 h-12 rounded-lg bg-ink-900 text-gold-500 flex items-center justify-center mb-4">
                  <item.icon className="w-6 h-6" />
                </div>
                <h3 className="font-serif text-lg font-semibold text-ink-900 mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-ink-600 mb-6 flex-1">
                  {item.description}
                </p>
                <Button variant="gold" className="w-full group-hover:shadow-md transition-shadow">
                  进入管理
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AdminPage;