import { useState } from "react";
import { Link } from "react-router";
import {
  ArrowDown, ArrowUp, BookCheck, BookOpen, ClipboardList, FileText, FileUp,
  GraduationCap, Library, MessageSquareText, MonitorPlay, RotateCcw,
  ScanLine, Settings2, ShoppingBasket, Users,
} from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { toast } from "@/stores/ui";

const ACTIONS = [
  { id: "import", label: "导入文档", desc: "AI 识别题目入库", icon: FileUp, link: "/upload" },
  { id: "new-lecture", label: "新建讲义", desc: "组题生成讲义", icon: FileText, link: "/lectures/new" },
  { id: "questions", label: "题库管理", desc: "查看与编辑题目", icon: Library, link: "/my-resources/questions" },
  { id: "new-basket", label: "新建试题篮", desc: "整理候选题目", icon: ShoppingBasket, link: "/baskets" },
  { id: "homework", label: "出作业", desc: "创建与布置作业", icon: BookCheck, link: "/homework-exams/homework" },
  { id: "basket-paper", label: "资源篮出卷", desc: "从资源篮组织试卷", icon: ClipboardList, link: "/baskets" },
  { id: "homework-record", label: "作业记录", desc: "查看学生作业情况", icon: BookOpen, link: "/my-students/homework" },
  { id: "interaction", label: "师生互动", desc: "查看互动记录", icon: MessageSquareText, link: "/my-students/interaction" },
  { id: "lessons", label: "我的课件", desc: "编辑和发布课件", icon: MonitorPlay, link: "/my-lessons?tab=courseware", schoolOnly: true },
  { id: "scanner", label: "扫描答题卡", desc: "扫描并上传答题卡", icon: ScanLine, link: "/scanner", schoolOnly: true },
  { id: "student-learning", label: "学生学情", desc: "查看学生学习情况", icon: GraduationCap, link: "/my-students/learning" },
  { id: "classes", label: "班级管理", desc: "管理授课班级", icon: Users, link: "/my-students" },
  { id: "prep", label: "集体备课", desc: "协同备课与任务", icon: Users, link: "/prep", schoolOnly: true },
] as const;

const DEFAULT_QUICK_ACTIONS = ["import", "new-lecture", "questions", "new-basket"];
const MAX_ACTIONS = 8;

function normalizeQuickActions(value: unknown, schoolAccess: boolean): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_QUICK_ACTIONS];
  const allowed = new Set<string>(ACTIONS.filter((action) => !('schoolOnly' in action) || schoolAccess).map((action) => action.id));
  return [...new Set(value.filter((id): id is string => typeof id === "string" && allowed.has(id)))].slice(0, MAX_ACTIONS);
}

function readQuickActions(key: string, schoolAccess: boolean): string[] {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? [...DEFAULT_QUICK_ACTIONS] : normalizeQuickActions(JSON.parse(stored), schoolAccess);
  } catch {
    return [...DEFAULT_QUICK_ACTIONS];
  }
}

export function DashboardQuickActions({ storageKey, schoolAccess }: { storageKey: string; schoolAccess: boolean }) {
  const [selected, setSelected] = useState(() => readQuickActions(storageKey, schoolAccess));
  const [draft, setDraft] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const actions = ACTIONS.filter((action) => !('schoolOnly' in action) || schoolAccess);
  const displayed = selected.map((id) => actions.find((action) => action.id === id)).filter((action) => action !== undefined);

  const startEditing = () => {
    setDraft([...selected]);
    setEditing(true);
  };
  const toggle = (id: string) => {
    setDraft((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : current.length < MAX_ACTIONS ? [...current, id] : current);
  };
  const move = (id: string, direction: -1 | 1) => {
    setDraft((current) => {
      const from = current.indexOf(id);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  };
  const save = () => {
    setSelected(draft);
    setEditing(false);
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      toast.warning("浏览器存储不可用，本次调整无法持久保存");
    }
  };

  return (
    <>
      <Card>
        <CardHeader title="快捷入口" action={
          <Button variant="ghost" size="sm" onClick={startEditing}>
            <Settings2 className="w-4 h-4" /> 自定义
          </Button>
        } />
        {displayed.length ? (
          <div className="grid grid-cols-2 gap-2">
            {displayed.map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.id} to={action.link} className="p-3 rounded-md border border-ink-100 hover:border-gold-300 hover:bg-gold-50/30 transition-all group">
                  <Icon className="w-5 h-5 text-gold-600 mb-2" />
                  <div className="text-sm font-medium text-ink-900">{action.label}</div>
                  <div className="text-xs text-ink-500 mt-0.5">{action.desc}</div>
                </Link>
              );
            })}
          </div>
        ) : <p className="text-sm text-ink-500">暂无快捷入口，点击“自定义”添加。</p>}
      </Card>
      <Modal open={editing} onClose={() => setEditing(false)} title="自定义快捷入口" description={`选择常用功能并调整顺序，最多 ${MAX_ACTIONS} 项。`} footer={
        <>
          <Button variant="ghost" onClick={() => setDraft([...DEFAULT_QUICK_ACTIONS])}>
            <RotateCcw className="w-4 h-4" /> 恢复默认
          </Button>
          <Button variant="outline" onClick={() => setEditing(false)}>取消</Button>
          <Button variant="gold" onClick={save}>保存</Button>
        </>
      }>
        <div className="space-y-2">
          {[...draft.map((id) => actions.find((action) => action.id === id)).filter((action) => action !== undefined),
            ...actions.filter((action) => !draft.includes(action.id))].map((action) => {
            const index = draft.indexOf(action.id);
            const checked = index !== -1;
            const Icon = action.icon;
            return (
              <div key={action.id} className="flex items-center gap-2 border border-ink-100 rounded-lg px-3 py-2">
                <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                  <input type="checkbox" checked={checked} disabled={!checked && draft.length >= MAX_ACTIONS}
                    onChange={() => toggle(action.id)} className="accent-amber-600" />
                  <Icon className="w-4 h-4 text-gold-600 flex-shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink-900">{action.label}</span>
                    <span className="block text-xs text-ink-500">{action.desc}</span>
                  </span>
                </label>
                {checked && <div className="flex items-center gap-1">
                  <button type="button" aria-label={`上移${action.label}`} disabled={index === 0}
                    onClick={() => move(action.id, -1)} className="p-1.5 rounded hover:bg-mist disabled:opacity-30">
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button type="button" aria-label={`下移${action.label}`} disabled={index === draft.length - 1}
                    onClick={() => move(action.id, 1)} className="p-1.5 rounded hover:bg-mist disabled:opacity-30">
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>}
              </div>
            );
          })}
        </div>
      </Modal>
    </>
  );
}
