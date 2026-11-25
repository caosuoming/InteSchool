import { Worker } from "node:worker_threads";
import { existsSync } from "node:fs";
import { runWithState } from "./runtime-db.js";
import { applyDuplicateScan, nextExecution, prepareDuplicateScan, type DuplicateCandidate, type DuplicateSchedule } from "./domain/scheduledDuplicate.js";
import type { DuplicateScanInput } from "./domain/duplicateScan.js";
import type { DatabaseStore } from "./database.js";
import type { AppState } from "./types.js";

type AccessState = <T>(store: DatabaseStore, task: (state: AppState) => T | Promise<T>) => Promise<T>;
interface StateAccess { read: AccessState; write: AccessState }

type DuplicateRunStatus = "queued" | "running" | "failed";
interface DuplicateRun {
  status: DuplicateRunStatus;
  promise: Promise<number>;
}

export class DuplicateScanQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private runs = new Map<string, DuplicateRun>();

  constructor(private store: DatabaseStore, private access: StateAccess) {}

  status(scheduleId: string): DuplicateRunStatus | undefined {
    return this.runs.get(scheduleId)?.status;
  }

  enqueue(schedule: DuplicateSchedule, dueAt?: string): Promise<number> {
    const previous = this.runs.get(schedule.id);
    if (previous && previous.status !== "failed") return previous.promise;
    const run: DuplicateRun = { status: "queued", promise: Promise.resolve(0) };
    this.runs.set(schedule.id, run);
    run.promise = this.tail.then(async () => {
      run.status = "running";
      const input = await this.access.read(this.store, (state) => runWithState(state, () => {
        const current = ((state.duplicateSchedules || []) as DuplicateSchedule[]).find((item) => item.id === schedule.id && item.teacherId === schedule.teacherId);
        if (!current || (dueAt && (!current.enabled || current.nextRunAt !== schedule.nextRunAt))) return null;
        return prepareDuplicateScan(current);
      }));
      if (!input) return 0;
      const additions = await computeInWorker(input);
      return this.access.write(this.store, (state) => runWithState(state, () => {
        const current = ((state.duplicateSchedules || []) as DuplicateSchedule[]).find((item) => item.id === schedule.id && item.teacherId === schedule.teacherId);
        if (!current || (dueAt && (!current.enabled || current.nextRunAt !== input.schedule.nextRunAt))) return 0;
        const count = applyDuplicateScan(input, additions);
        const now = new Date().toISOString();
        let next = current.nextRunAt;
        if (dueAt && next) {
          do { next = nextExecution(new Date(next), current.repeat, current.timezoneOffsetMinutes); }
          while (next && next <= now);
        }
        state.duplicateSchedules = ((state.duplicateSchedules || []) as DuplicateSchedule[]).map((item) =>
          item.id === current.id ? { ...item, lastRunAt: now, ...(dueAt ? { nextRunAt: next, enabled: next !== null } : {}) } : item);
        return count;
      }, this.store));
    }).then((count) => {
      this.runs.delete(schedule.id);
      return count;
    }, (error: unknown) => {
      run.status = "failed";
      throw error;
    });
    // A failed job must not prevent the next queued scan from running.
    this.tail = run.promise.catch(() => undefined);
    return run.promise;
  }
}

function computeInWorker(input: DuplicateScanInput): Promise<DuplicateCandidate[]> {
  return new Promise((resolve, reject) => {
    const compiled = new URL("./domain/duplicateScanWorker.js", import.meta.url);
    const source = new URL("./domain/duplicateScanWorker.ts", import.meta.url);
    const worker = new Worker(existsSync(compiled) ? compiled : source, {
      workerData: input,
      ...(existsSync(compiled) ? {} : { execArgv: ["--import", "tsx"] }),
      resourceLimits: { maxOldGenerationSizeMb: 1024 },
    });
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", (code) => reject(new Error(`duplicate scan worker exited before returning a result (code ${code})`)));
  });
}
