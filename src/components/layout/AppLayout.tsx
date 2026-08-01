import { type ReactNode, useState, useRef, useEffect } from "react";
import { Link, useLocation, useNavigate, Navigate } from "react-router";
import {
  LayoutDashboard, LogOut,
  ChevronLeft, School, User, Settings, Users,
  FolderOpen, Download,
  ChevronDown, ChevronRight, Building2, Cloud,
  BookOpen, Check, Crown, ClipboardList, MapPinned, FileSpreadsheet, MonitorPlay,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { useUIStore } from "@/stores/ui";
import { shareService } from "@/services/share";
import { cn } from "@/lib/utils";
import { ToastContainer } from "@/components/ui/Toast";
import { canManageSchoolExams } from "@/lib/exam-permissions";

interface NavItem {
  path: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** 是否仅学校身份可见（个人身份隐藏） */
  schoolOnly?: boolean;
  examManagerOnly?: boolean;
  children?: { path: string; label: string; icon: typeof LayoutDashboard }[];
}

const allNavItems: NavItem[] = [
  { path: "/dashboard", label: "工作台", icon: LayoutDashboard },
  {
    path: "/my-resources",
    label: "我的资源",
    icon: FolderOpen,
  },
  {
    path: "/my-lessons",
    label: "我的上课",
    icon: BookOpen,
  },
  { path: "/classroom", label: "我要上课", icon: MonitorPlay },
  { path: "/my-students", label: "我的学生", icon: Users },
  {
    path: "/my-exams",
    label: "我的考试",
    icon: ClipboardList,
    schoolOnly: true,
    examManagerOnly: true,
    children: [
      { path: "/my-exams/rooms", label: "考场布置", icon: MapPinned },
      { path: "/my-exams/grades", label: "成绩处理", icon: FileSpreadsheet },
    ],
  },
  { path: "/school-resources", label: "校本资源", icon: Building2, schoolOnly: true },
  { path: "/platform-resources", label: "平台资源", icon: Cloud },
  { path: "/prep", label: "集体备课", icon: Users, schoolOnly: true },
  { path: "/admin", label: "后台设置", icon: Settings },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { teacher, loading, logout, switchAffiliation, getAffiliations, getCurrentAffiliation } = useAuthStore();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  const [affiliationDropdownOpen, setAffiliationDropdownOpen] = useState(false);
  const [donationRank, setDonationRank] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const affiliations = teacher ? getAffiliations() : [];
  const currentAffiliation = teacher ? getCurrentAffiliation() : null;
  const isPersonalIdentity = !currentAffiliation?.schoolId;
  const canManageExams = teacher ? canManageSchoolExams(teacher, currentAffiliation) : false;

  // 根据当前身份过滤导航菜单
  const navItems = allNavItems.filter((item) => {
    if (item.schoolOnly && isPersonalIdentity) return false;
    if (item.examManagerOnly && !canManageExams) return false;
    return true;
  });

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setAffiliationDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!teacher) {
      setDonationRank(null);
      return;
    }
    let active = true;
    shareService.getDonationPrivileges(teacher.id)
      .then((privileges) => {
        if (active) setDonationRank(privileges.isTopContributor ? privileges.rank : null);
      })
      .catch(() => {
        if (active) setDonationRank(null);
      });
    return () => {
      active = false;
    };
  }, [teacher]);

  const handleSwitchAffiliation = async (affId: string) => {
    await switchAffiliation(affId);
    setAffiliationDropdownOpen(false);
    navigate("/dashboard");
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mist">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gold-400 animate-spin" />
          <span className="text-sm text-ink-500">加载中...</span>
        </div>
      </div>
    );
  }

  if (!teacher) {
    return <Navigate to="/login" replace />;
  }

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  const toggleMenu = (path: string) => {
    setExpandedMenus((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-mist flex">
      {/* 侧栏 */}
      <aside
        className={cn(
          "no-print fixed left-0 top-0 bottom-0 bg-ink-900 text-ink-100 flex flex-col z-30 transition-all duration-300",
          sidebarCollapsed ? "w-16" : "w-60",
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-ink-800">
          <Link to="/dashboard" className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-md bg-gold-400 text-ink-900 flex items-center justify-center font-serif font-bold text-lg flex-shrink-0">
              智
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <div className="font-serif font-semibold text-base text-paper truncate">智题云校</div>
                <div className="text-[10px] text-ink-400 -mt-0.5">ZhiTi Cloud</div>
              </div>
            )}
          </Link>
        </div>

        {/* 身份切换（所属单位） */}
        {!sidebarCollapsed && affiliations.length > 0 && (
          <div className="px-3 py-3 border-b border-ink-800 relative" ref={dropdownRef}>
            <button
              onClick={() => setAffiliationDropdownOpen(!affiliationDropdownOpen)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md bg-ink-800/50 hover:bg-ink-800 transition-colors text-left"
            >
              {isPersonalIdentity ? (
                <User className="w-4 h-4 text-teal-400 flex-shrink-0" />
              ) : (
                <School className="w-4 h-4 text-gold-400 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs text-ink-200 truncate">
                  {isPersonalIdentity ? "个人身份" : currentAffiliation?.schoolName}
                </div>
                <div className="text-[10px] text-ink-400 truncate">
                  {currentAffiliation?.subject}教师
                </div>
              </div>
              <ChevronDown className={cn(
                "w-3.5 h-3.5 text-ink-400 flex-shrink-0 transition-transform",
                affiliationDropdownOpen && "rotate-180",
              )} />
            </button>

            {/* 下拉菜单 */}
            {affiliationDropdownOpen && (
              <div className="absolute left-3 right-3 top-full mt-1 bg-ink-800 border border-ink-700 rounded-md shadow-lg z-50 overflow-hidden">
                <div className="text-[10px] text-ink-400 px-3 py-1.5 border-b border-ink-700/50">
                  切换所属单位
                </div>
                {affiliations.map((aff) => (
                  <button
                    key={aff.id}
                    onClick={() => handleSwitchAffiliation(aff.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-ink-700/50",
                      aff.isCurrent ? "bg-gold-400/10 text-gold-300" : "text-ink-200",
                    )}
                  >
                    {aff.schoolId ? (
                      <School className="w-3.5 h-3.5 text-gold-400 flex-shrink-0" />
                    ) : (
                      <User className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="truncate">
                        {aff.schoolName || "个人身份"}
                      </div>
                      <div className="text-[10px] text-ink-400 truncate">
                        {aff.subject}教师
                      </div>
                    </div>
                    {aff.isCurrent && (
                      <Check className="w-3.5 h-3.5 text-gold-400 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 获取资源按钮 */}
        {!sidebarCollapsed && (
          <div className="px-3 py-2">
            <Link
              to="/upload"
              className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-md bg-gold-400 text-ink-900 text-sm font-medium hover:bg-gold-500 transition-colors"
            >
              <Download className="w-4 h-4" />
              获取资源
            </Link>
          </div>
        )}
        {sidebarCollapsed && (
          <div className="px-2 py-2">
            <Link
              to="/upload"
              className="flex items-center justify-center w-10 h-10 mx-auto rounded-md bg-gold-400 text-ink-900 hover:bg-gold-500 transition-colors"
              title="获取资源"
            >
              <Download className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* 导航 */}
        <nav className="flex-1 overflow-y-auto py-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            const hasChildren = !!item.children;
            const expanded = expandedMenus.has(item.path);

            if (hasChildren && !sidebarCollapsed) {
              return (
                <div key={item.path}>
                  <div
                    className={cn(
                      "flex items-center gap-3 mx-2 px-3 py-2.5 rounded-md text-sm transition-all relative w-[calc(100%-1rem)]",
                      active
                        ? "bg-gold-400/15 text-gold-300"
                        : "text-ink-300 hover:bg-ink-800 hover:text-paper",
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-gold-400 rounded-r" />
                    )}
                    <button
                      onClick={() => navigate(item.path)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <Icon className={cn("w-4 h-4 flex-shrink-0", active && "text-gold-400")} />
                      <span className="truncate flex-1 text-left">{item.label}</span>
                    </button>
                    <button
                      onClick={() => toggleMenu(item.path)}
                      className="flex-shrink-0 p-0.5 rounded hover:bg-ink-700/50"
                      title={expanded ? "收起" : "展开"}
                    >
                      {expanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-ink-400" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-ink-400" />
                      )}
                    </button>
                  </div>
                  {expanded && (
                    <div className="mt-0.5 mb-1">
                      {item.children!.map((child) => {
                        const ChildIcon = child.icon;
                        const childActive = isActive(child.path);
                        return (
                          <Link
                            key={child.path}
                            to={child.path}
                            className={cn(
                              "flex items-center gap-3 mx-2 px-3 py-2 pl-8 rounded-md text-sm transition-all relative",
                              childActive
                                ? "bg-gold-400/10 text-gold-300"
                                : "text-ink-400 hover:bg-ink-800 hover:text-paper",
                            )}
                          >
                            {childActive && (
                              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-gold-400 rounded-r" />
                            )}
                            <ChildIcon className={cn("w-3.5 h-3.5 flex-shrink-0", childActive && "text-gold-400")} />
                            <span className="truncate">{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 mx-2 px-3 py-2.5 rounded-md text-sm transition-all relative group",
                  active
                    ? "bg-gold-400/15 text-gold-300"
                    : "text-ink-300 hover:bg-ink-800 hover:text-paper",
                  sidebarCollapsed && "justify-center",
                )}
                title={sidebarCollapsed ? item.label : undefined}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-gold-400 rounded-r" />
                )}
                <Icon className={cn("w-4 h-4 flex-shrink-0", active && "text-gold-400")} />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* 用户区 */}
        <div className="border-t border-ink-800 p-3">
          <div className={cn("flex items-center gap-2", sidebarCollapsed && "justify-center")}>
            <div className="w-8 h-8 rounded-full bg-gold-400 text-ink-900 flex items-center justify-center font-medium text-sm flex-shrink-0">
              {teacher.avatar}
            </div>
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-sm text-paper truncate flex items-center gap-1.5">
                  <span className="truncate">{teacher.name}</span>
                  {donationRank !== null && (
                    <Crown
                      className="w-3.5 h-3.5 text-gold-400 flex-shrink-0"
                      aria-label={`平台资源贡献榜第 ${donationRank} 名`}
                    />
                  )}
                </div>
                {donationRank !== null && (
                  <div className="text-[10px] text-gold-400 truncate">
                    平台资源贡献榜第 {donationRank} 名
                  </div>
                )}
                <div className="text-[10px] text-ink-400 truncate">
                  {teacher.roles && teacher.roles.length > 0
                    ? teacher.roles
                        .map((r) => {
                          const labels: Record<string, string> = {
                            teacher: "教师",
                            headTeacher: "班主任",
                            gradeLeader: "年级组长",
                            subjectLeader: "学科组长",
                            prepLeader: "备课组长",
                            dean: "教务主任",
                            vicePrincipal: "副校长",
                            principal: "校长",
                          };
                          return labels[r] || r;
                        })
                        .join("·")
                    : teacher.subject + "教师"}
                </div>
              </div>
            )}
            {!sidebarCollapsed && (
              <div className="flex items-center gap-1">
                <Link
                  to="/profile"
                  className="p-1.5 rounded text-ink-400 hover:bg-ink-800 hover:text-paper transition-colors"
                  title="个人中心"
                >
                  <User className="w-3.5 h-3.5" />
                </Link>
                <button
                  onClick={handleLogout}
                  className="p-1.5 rounded text-ink-400 hover:bg-ink-800 hover:text-red-300 transition-colors"
                  title="退出登录"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* 侧栏切换按钮 */}
      <button
        onClick={toggleSidebar}
        className={cn(
          "no-print fixed top-20 z-30 w-5 h-10 bg-paper border border-ink-200 rounded-r-md shadow-sm flex items-center justify-center text-ink-500 hover:text-ink-900 hover:bg-mist transition-all",
          sidebarCollapsed ? "left-16" : "left-60",
        )}
      >
        <ChevronLeft className={cn("w-3.5 h-3.5 transition-transform", sidebarCollapsed && "rotate-180")} />
      </button>

      {/* 主区域 */}
      <div
        className={cn(
          "print-content-shell flex-1 min-w-0 transition-all duration-300",
          sidebarCollapsed ? "ml-16" : "ml-60",
        )}
      >
        <main className="min-h-screen">
          <div className="print-content p-6 lg:p-8 animate-fade-in">{children}</div>
        </main>
      </div>

      <ToastContainer />
    </div>
  );
}

export default AppLayout;
