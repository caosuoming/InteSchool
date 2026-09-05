import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, Eye, LockKeyhole, Monitor, Power, RefreshCw, ShieldCheck, Trash2, Unlock } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { classroomDeviceService } from "@/services/classroomDevice";
import { schoolService } from "@/services/school";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import type {
  ClassroomDevice,
  ClassroomDeviceAccessPolicy,
  ClassroomDeviceAccessRule,
  ClassroomDeviceTimeRange,
  School,
} from "@/types";

const WEEKDAYS = [
  [1, "一"], [2, "二"], [3, "三"], [4, "四"], [5, "五"], [6, "六"], [0, "日"],
] as const;

function stateLabel(device: ClassroomDevice) {
  if (device.effectiveState === "closed") return "页面已关闭";
  if (device.effectiveState === "locked") return device.controlState === "active" ? "时段外锁定" : "已锁定";
  return "可使用";
}

function online(device: ClassroomDevice) {
  return Boolean(device.lastSeenAt && Date.now() - new Date(device.lastSeenAt).getTime() < 45_000);
}

function newRange(): ClassroomDeviceTimeRange {
  return { id: `range-${Date.now()}`, weekdays: [1, 2, 3, 4, 5], start: "07:00", end: "18:00" };
}

function newAccessRule(kind: ClassroomDeviceAccessRule["kind"] = "website"): ClassroomDeviceAccessRule {
  return { id: `access-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind, target: "" };
}

export default function MyClassroomsPage() {
  const { teacher, getCurrentAffiliation } = useAuthStore();
  const affiliation = teacher ? getCurrentAffiliation() : null;
  const role = affiliation?.role || teacher?.role;
  const platform = role === "platform_admin";
  const schoolAdmin = role === "school_admin";
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState(affiliation?.schoolId || "");
  const [devices, setDevices] = useState<ClassroomDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [scheduleDevice, setScheduleDevice] = useState<ClassroomDevice | null>(null);
  const [ranges, setRanges] = useState<ClassroomDeviceTimeRange[]>([]);
  const [policyDevice, setPolicyDevice] = useState<ClassroomDevice | null>(null);
  const [accessPolicy, setAccessPolicy] = useState<ClassroomDeviceAccessPolicy>({ blacklist: [], whitelist: [] });

  useEffect(() => {
    if (!platform) return;
    schoolService.listSchools().then((items) => {
      setSchools(items);
      if (!schoolId && items[0]) setSchoolId(items[0].id);
    }).catch((error) => toast.error("学校列表加载失败", error instanceof Error ? error.message : undefined));
  }, [platform, schoolId]);

  const load = useCallback(async (silent = false) => {
    if (!teacher) return;
    if (platform && !schoolId) {
      setDevices([]);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      setDevices(await classroomDeviceService.listManagedDevices(platform ? schoolId : undefined));
    } catch (error) {
      if (!silent) toast.error("教室一体机加载失败", error instanceof Error ? error.message : undefined);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [platform, schoolId, teacher]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const mutate = async (device: ClassroomDevice, action: "unlock" | "lock" | "close" | "unbind") => {
    setBusyId(device.id);
    try {
      if (action === "unlock") await classroomDeviceService.unlockDevice(device.id);
      if (action === "lock") await classroomDeviceService.lockDevice(device.id);
      if (action === "close") await classroomDeviceService.closeDevice(device.id);
      if (action === "unbind") await classroomDeviceService.unbindDevice(device.id);
      toast.success(action === "unbind" ? "一体机已解绑" : "远程控制指令已发送");
      await load(true);
    } catch (error) {
      toast.error("操作失败", error instanceof Error ? error.message : undefined);
    } finally {
      setBusyId("");
    }
  };

  const lockAll = async () => {
    const lockable = devices.filter((item) => item.permissions?.canLock);
    if (!lockable.length) return;
    setBusyId("all");
    try {
      await Promise.all(lockable.map((item) => classroomDeviceService.lockDevice(item.id)));
      toast.success("本校已绑定一体机已全部锁定");
      await load(true);
    } catch (error) {
      toast.error("批量锁定失败", error instanceof Error ? error.message : undefined);
    } finally {
      setBusyId("");
    }
  };

  const openSchedule = (device: ClassroomDevice) => {
    setScheduleDevice(device);
    setRanges(device.allowedTimeRanges.map((item) => ({ ...item, weekdays: [...item.weekdays] })));
  };

  const saveSchedule = async () => {
    if (!scheduleDevice) return;
    setBusyId(scheduleDevice.id);
    try {
      await classroomDeviceService.updateDeviceSchedule(scheduleDevice.id, ranges);
      toast.success("可使用时间段已更新");
      setScheduleDevice(null);
      await load(true);
    } catch (error) {
      toast.error("时间段保存失败", error instanceof Error ? error.message : undefined);
    } finally {
      setBusyId("");
    }
  };

  const openAccessPolicy = (device: ClassroomDevice) => {
    setPolicyDevice(device);
    setAccessPolicy({
      blacklist: (device.accessPolicy?.blacklist || []).map((item) => ({ ...item })),
      whitelist: (device.accessPolicy?.whitelist || []).map((item) => ({ ...item })),
    });
  };

  const saveAccessPolicy = async () => {
    if (!policyDevice) return;
    setBusyId(policyDevice.id);
    try {
      await classroomDeviceService.updateDeviceAccessPolicy(policyDevice.id, accessPolicy);
      toast.success("一体机黑白名单已更新");
      setPolicyDevice(null);
      await load(true);
    } catch (error) {
      toast.error("黑白名单保存失败", error instanceof Error ? error.message : undefined);
    } finally {
      setBusyId("");
    }
  };

  const schoolOptions = useMemo(() => schools.map((item) => ({ value: item.id, label: `${item.name} · ${item.city || "未填写城市"}` })), [schools]);

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="我的教室"
        description="查看任教班级一体机当前页面，并按身份权限远程解锁、锁定、关闭或解绑。"
        icon={<Monitor className="h-5 w-5" />}
        action={(
          <div className="flex items-end gap-2">
            {platform && <div className="w-64"><Select label="查看学校" value={schoolId} onChange={(event) => setSchoolId(event.target.value)} options={schoolOptions} /></div>}
            {schoolAdmin && <Button variant="outline" onClick={() => void lockAll()} loading={busyId === "all"}><LockKeyhole className="h-4 w-4" />锁定本校全部</Button>}
            <Button variant="ghost" size="icon" onClick={() => void load()} title="刷新"><RefreshCw className="h-4 w-4" /></Button>
          </div>
        )}
      />

      {!affiliation?.schoolId && !platform ? (
        <Card><div className="py-10 text-center text-sm text-ink-500">请切换到学校身份后查看“我的教室”。</div></Card>
      ) : loading ? (
        <div className="flex min-h-64 items-center justify-center"><Spinner size={32} /></div>
      ) : devices.length === 0 ? (
        <Card><div className="py-12 text-center"><Monitor className="mx-auto mb-3 h-10 w-10 text-ink-300" /><div className="font-medium text-ink-700">暂无可管理的一体机</div><p className="mt-1 text-sm text-ink-400">首次在教室设备点击登录页“我要上课”，选择学校和班级即可绑定。</p></div></Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {devices.map((device) => (
            <Card key={device.id} className="overflow-hidden p-0">
              <div className="grid md:grid-cols-[minmax(0,1fr)_16rem]">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-ink-400">{device.schoolName}</div>
                      <h2 className="mt-1 font-serif text-lg font-semibold text-ink-900">{device.grade} · {device.className}</h2>
                      <div className="mt-1 text-xs text-ink-500">{device.deviceName}</div>
                    </div>
                    <div className="text-right text-xs">
                      <div className={online(device) ? "text-emerald-600" : "text-ink-400"}>{online(device) ? "在线" : "离线"}</div>
                      <div className="mt-1 text-ink-500">{stateLabel(device)}</div>
                    </div>
                  </div>

                  <div className="mt-5 rounded-lg border border-ink-100 bg-mist/50 p-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-ink-600"><Eye className="h-3.5 w-3.5" />当前页面</div>
                    <div className="mt-2 text-sm text-ink-800">{device.currentPage?.title || "尚未上报页面"}</div>
                    {device.currentPage?.path && <div className="mt-1 truncate text-xs text-ink-400">{device.currentPage.path}</div>}
                    {device.currentPage?.updatedAt && <div className="mt-2 text-[11px] text-ink-400">更新于 {new Date(device.currentPage.updatedAt).toLocaleString()}</div>}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {device.permissions?.canUnlock && <Button size="sm" variant="gold" onClick={() => void mutate(device, "unlock")} loading={busyId === device.id}><Unlock className="h-3.5 w-3.5" />解锁</Button>}
                    {device.permissions?.canLock && <Button size="sm" variant="outline" onClick={() => void mutate(device, "lock")} disabled={busyId === device.id}><LockKeyhole className="h-3.5 w-3.5" />锁定</Button>}
                    {device.permissions?.canClose && <Button size="sm" variant="outline" onClick={() => void mutate(device, "close")} disabled={busyId === device.id}><Power className="h-3.5 w-3.5" />关闭页面</Button>}
                    {device.permissions?.canEditSchedule && <Button size="sm" variant="ghost" onClick={() => openSchedule(device)}><Clock3 className="h-3.5 w-3.5" />使用时段</Button>}
                    {device.permissions?.canEditAccessPolicy && <Button size="sm" variant="ghost" onClick={() => openAccessPolicy(device)}><ShieldCheck className="h-3.5 w-3.5" />黑白名单</Button>}
                    {device.permissions?.canUnbind && <Button size="sm" variant="ghost" onClick={() => window.confirm(`确认解绑 ${device.grade}${device.className} 的一体机？`) && void mutate(device, "unbind")}><Trash2 className="h-3.5 w-3.5" />解绑</Button>}
                  </div>
                </div>

                <div className="min-h-44 border-t border-ink-100 bg-ink-950 md:border-l md:border-t-0">
                  {device.currentPage?.screenshot ? (
                    <img src={device.currentPage.screenshot} alt={`${device.className}一体机当前页面`} className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full min-h-44 flex-col items-center justify-center text-ink-500"><Monitor className="mb-2 h-8 w-8" /><span className="text-xs">暂无页面缩略图</span></div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(scheduleDevice)}
        onClose={() => setScheduleDevice(null)}
        title="远程可使用时间段"
        description="留空表示全天允许使用；时段外设备会自动显示锁定页，管理员或任课教师仍可远程解锁。"
        footer={<><Button variant="ghost" onClick={() => setScheduleDevice(null)}>取消</Button><Button variant="gold" onClick={() => void saveSchedule()} loading={busyId === scheduleDevice?.id}>保存</Button></>}
      >
        <div className="space-y-3">
          {ranges.map((range, index) => (
            <div key={range.id} className="rounded-lg border border-ink-100 p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {WEEKDAYS.map(([day, label]) => (
                  <label key={day} className="flex cursor-pointer items-center gap-1 rounded border border-ink-100 px-2 py-1 text-xs">
                    <input
                      type="checkbox"
                      checked={range.weekdays.includes(day)}
                      onChange={(event) => setRanges((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, weekdays: event.target.checked ? [...new Set([...item.weekdays, day])] : item.weekdays.filter((value) => value !== day) } : item))}
                    />周{label}
                  </label>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input aria-label={`时段${index + 1}开始时间`} type="time" className="input-base" value={range.start} onChange={(event) => setRanges((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, start: event.target.value } : item))} />
                <span className="text-sm text-ink-400">至</span>
                <input aria-label={`时段${index + 1}结束时间`} type="time" className="input-base" value={range.end} onChange={(event) => setRanges((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, end: event.target.value } : item))} />
                <Button size="sm" variant="ghost" onClick={() => setRanges((items) => items.filter((_, itemIndex) => itemIndex !== index))}>删除</Button>
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={() => setRanges((items) => [...items, newRange()])}>添加时间段</Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(policyDevice)}
        onClose={() => setPolicyDevice(null)}
        title="一体机黑白名单"
        description="黑名单中的应用或网页禁止打开；白名单中的项目即使一体机处于锁定状态也仍可打开。"
        footer={<><Button variant="ghost" onClick={() => setPolicyDevice(null)}>取消</Button><Button variant="gold" onClick={() => void saveAccessPolicy()} loading={busyId === policyDevice?.id}>保存</Button></>}
      >
        <div className="space-y-5">
          {(["blacklist", "whitelist"] as const).map((listName) => (
            <section key={listName}>
              <div className="mb-2">
                <div className="text-sm font-medium text-ink-800">{listName === "blacklist" ? "黑名单" : "白名单"}</div>
                <div className="mt-0.5 text-xs text-ink-400">
                  {listName === "blacklist" ? "这些应用或网页不可在一体机上打开。" : "锁定状态下仍允许打开这些应用或网页。"}
                </div>
              </div>
              <div className="space-y-2">
                {accessPolicy[listName].map((rule, index) => (
                  <div key={rule.id} className="grid gap-2 rounded-lg border border-ink-100 p-3 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-end">
                    <Select
                      label="类型"
                      value={rule.kind}
                      onChange={(event) => setAccessPolicy((current) => ({
                        ...current,
                        [listName]: current[listName].map((item, itemIndex) => itemIndex === index
                          ? { ...item, kind: event.target.value as ClassroomDeviceAccessRule["kind"] }
                          : item),
                      }))}
                      options={[{ value: "website", label: "网页" }, { value: "app", label: "应用" }]}
                    />
                    <Input
                      label={rule.kind === "website" ? "网页地址" : "应用名称或启动地址"}
                      value={rule.target}
                      placeholder={rule.kind === "website" ? "https://example.com" : "应用名或协议地址"}
                      onChange={(event) => setAccessPolicy((current) => ({
                        ...current,
                        [listName]: current[listName].map((item, itemIndex) => itemIndex === index
                          ? { ...item, target: event.target.value }
                          : item),
                      }))}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setAccessPolicy((current) => ({
                        ...current,
                        [listName]: current[listName].filter((_, itemIndex) => itemIndex !== index),
                      }))}
                    >删除</Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAccessPolicy((current) => ({
                    ...current,
                    [listName]: [...current[listName], newAccessRule()],
                  }))}
                >添加{listName === "blacklist" ? "黑名单" : "白名单"}项目</Button>
              </div>
            </section>
          ))}
        </div>
      </Modal>
    </div>
  );
}
