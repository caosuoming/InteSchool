import { useEffect, useMemo, useState } from "react";
import type { AnyClass, School } from "@/types";
import { schoolService } from "@/services/school";
import { cn } from "@/lib/utils";

type SchoolChoice = Extract<AnyClass, { type: "school" }>;

export function ClassAudiencePicker({
  classes, selectedClassIds, onChange, schoolId, teachingClassIds = [], teachingGrades = [],
}: {
  classes: AnyClass[];
  selectedClassIds: string[];
  onChange: (classIds: string[]) => void;
  schoolId?: string | null;
  teachingClassIds?: string[];
  teachingGrades?: string[];
}) {
  const [schools, setSchools] = useState<School[]>([]);
  const [otherSchoolId, setOtherSchoolId] = useState("");
  const [otherGrade, setOtherGrade] = useState("");
  useEffect(() => {
    let active = true;
    schoolService.listSchools().then((data) => { if (active) setSchools(data); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const taught = useMemo(() => new Set(teachingClassIds), [teachingClassIds]);
  const own = classes.filter((item): item is SchoolChoice => item.type === "school" && item.schoolId === schoolId && taught.has(item.id));
  const personal = classes.filter((item) => item.type === "personal");
  const ownGrades = new Set([...teachingGrades, ...own.map((item) => item.grade)]);
  const sameGrade = classes.filter((item) => item.type === "school" && item.schoolId === schoolId && !taught.has(item.id) && ownGrades.has(item.grade));
  const otherGrades = classes.filter((item) => item.type === "school" && item.schoolId === schoolId && !taught.has(item.id) && !ownGrades.has(item.grade));
  const external = classes.filter((item): item is SchoolChoice => item.type === "school" && item.schoolId !== schoolId);
  const externalSchools = schools.filter((item) => external.some((c) => c.schoolId === item.id));
  const externalGrades = [...new Set(external.filter((c) => c.schoolId === otherSchoolId).map((c) => c.grade))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const externalClasses = external.filter((c) => c.schoolId === otherSchoolId && c.grade === otherGrade);

  const renderClasses = (items: AnyClass[]) => (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => {
        const checked = selectedClassIds.includes(item.id);
        return (
          <label key={item.id} className={cn(
            "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 transition-colors",
            checked ? "border-gold-300 bg-gold-50/60" : "border-ink-100 bg-paper hover:border-ink-200 hover:bg-ink-50/40",
          )}>
            <input type="checkbox" checked={checked} onChange={() => onChange(checked
              ? selectedClassIds.filter((id) => id !== item.id)
              : [...selectedClassIds, item.id])}
              className="rounded border-ink-300 text-gold-500 focus:ring-gold-400" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink-900">{item.name}</span>
              <span className="block truncate text-xs text-ink-400">
                {item.type === "personal" ? "个人教学班" : `${item.grade || "未设置年级"} · ${item.studentCount} 人`}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
  const selectedCount = (items: AnyClass[]) => items.filter((item) => selectedClassIds.includes(item.id)).length;
  const section = (name: string, items: AnyClass[]) => (
    <details key={name} className="rounded-lg border border-ink-100 p-3">
      <summary className="cursor-pointer text-sm font-medium text-ink-900">{name}（{items.length}）{selectedCount(items) ? ` · 已选 ${selectedCount(items)}` : ""}</summary>
      <div className="mt-3">{items.length ? renderClasses(items) : <p className="text-sm text-ink-400">暂无可选班级</p>}</div>
    </details>
  );

  if (classes.length === 0) return <div className="py-10 text-center text-sm text-ink-400">暂无可选班级</div>;

  return (
    <div className="max-h-[420px] space-y-3 overflow-y-auto">
      <section><h3 className="mb-2 text-sm font-medium">自己所教班级</h3>{own.length ? renderClasses(own) : <p className="text-sm text-ink-400">暂无所教班级</p>}</section>
      <section><h3 className="mb-2 text-sm font-medium">个人教学班</h3>{personal.length ? renderClasses(personal) : <p className="text-sm text-ink-400">暂无个人教学班</p>}</section>
      {section("所在年级其他班级", sameGrade)}
      {section("本校其他年级班级", otherGrades)}
      <details className="rounded-lg border border-ink-100 p-3">
        <summary className="cursor-pointer text-sm font-medium">平台其他学校的班级（{external.length}）{selectedCount(external) ? ` · 已选 ${selectedCount(external)}` : ""}</summary>
        <div className="mt-3 space-y-3">
          <select aria-label="选择学校" className="w-full rounded-md border p-2 text-sm" value={otherSchoolId} onChange={(event) => { setOtherSchoolId(event.target.value); setOtherGrade(""); }}>
            <option value="">请选择学校</option>
            {externalSchools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
          </select>
          {otherSchoolId && <select aria-label="选择年级" className="w-full rounded-md border p-2 text-sm" value={otherGrade} onChange={(event) => setOtherGrade(event.target.value)}>
            <option value="">请选择年级</option>
            {externalGrades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
          </select>}
          {otherGrade && renderClasses(externalClasses)}
        </div>
      </details>
    </div>
  );
}
