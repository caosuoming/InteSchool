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
  UserPlus,
  ShieldCheck,
  UsersRound,
  Building2,
  KeyRound,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { canManageSchoolRoster } from "@/lib/roster-permissions";
import { canManageTeachingProfiles } from "@/lib/teaching-profile-permissions";

interface AdminItem {
  icon: typeof GitBranch;
  title: string;
  description: string;
  href: string;
  /** 是否仅学校身份可见 */
  schoolOnly?: boolean;
  adminOnly?: boolean;
  platformOnly?: boolean;
  rosterOnly?: boolean;
  teachingProfileOnly?: boolean;
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
    title: "班级与学生",
    description: "按年级管理班级与学生，支持 Excel 批量导入、升学年和回收站",
    href: "/admin/classes",
    schoolOnly: true,
    rosterOnly: true,
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
    title: "教师权限申请",
    description: "申请新的校内职务权限；学校管理员同时审核本校教师申请",
    href: "/admin/permission-applications",
    schoolOnly: true,
  },
  {
    icon: UsersRound,
    title: "教师权限与教学资料",
    description: "按管理层级维护本校教师角色、任教学科、年级和班级",
    href: "/admin/teacher-profiles",
    schoolOnly: true,
    teachingProfileOnly: true,
  },
  {
    icon: KeyRound,
    title: "用户与密码管理",
    description: "查看学校用户权限、管理学校管理员身份并重置教师登录密码",
    href: "/admin/accounts",
    schoolOnly: true,
    adminOnly: true,
  },
  {
    icon: UserPlus,
    title: "教师入校审核",
    description: "审核教师加入学校的申请及其任教学科、年级和可选管理员权限",
    href: "/admin/teacher-school-applications",
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
    description: "管理年级、学年、来源、题型、题类等基础数据配置",
    href: "/admin/settings",
    schoolOnly: true,
  },
];

export function AdminPage() {
  const { teacher, getCurrentAffiliation } = useAuthStore();
  const currentAffiliation = getCurrentAffiliation();
  const isPersonal = !currentAffiliation?.schoolId;
  const activeRole = currentAffiliation?.role;
  const isAdmin = ["school_admin", "platform_admin"].includes(String(activeRole));
  const isPlatformAdmin = activeRole === "platform_admin";
  const canManageRoster = teacher ? canManageSchoolRoster(teacher, currentAffiliation) : false;
  const canManageProfiles = teacher ? canManageTeachingProfiles(teacher, currentAffiliation) : false;

  const adminItems = allAdminItems.filter((item) => {
    if (item.schoolOnly && isPersonal) return false;
    if (item.adminOnly && !isAdmin) return false;
    if (item.platformOnly && !isPlatformAdmin) return false;
    if (item.rosterOnly && !canManageRoster) return false;
    if (item.teachingProfileOnly && (!canManageProfiles || isPlatformAdmin)) return false;
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {adminItems.map((item) => (
            <Link key={item.title} to={item.href} target="_blank" rel="noreferrer">
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