import { AsyncLocalStorage } from "node:async_hooks";
import type { Question, QuestionFilter } from "../src/types/index.js";
import type { AppState } from "./types.js";

interface DatabaseQueryBackend {
  searchQuestions?(filter?: QuestionFilter): Promise<Question[]>;
}

interface RuntimeDatabaseContext {
  state: AppState;
  backend?: DatabaseQueryBackend;
}

const stateStorage = new AsyncLocalStorage<RuntimeDatabaseContext>();

function currentContext(): RuntimeDatabaseContext {
  const context = stateStorage.getStore();
  if (!context) throw new Error("业务数据库上下文未初始化");
  return context;
}

function currentState(): AppState {
  return currentContext().state;
}

export function runWithState<T>(state: AppState, fn: () => T, backend?: DatabaseQueryBackend): T {
  return stateStorage.run({ state, backend }, fn);
}

export function computeDuplicateHash(stem: string, answer: string, options?: string[]): string {
  const normalize = (value: string) => value
    .replace(/\s+/g, "")
    .replace(/[，。、；：！？“”"'（）()【】]/g, "")
    .replaceAll("[", "")
    .replaceAll("]", "")
    .toLowerCase();
  const content = [normalize(stem), options?.map(normalize).join("|") || "", normalize(answer)].join("::");
  let hash = 5381;
  for (let index = 0; index < content.length; index += 1) {
    hash = ((hash << 5) + hash + content.charCodeAt(index)) & 0xffffffff;
  }
  return `qh${Math.abs(hash).toString(36)}`;
}

export const db = {
  init(): void {},
  read(key: string): any {
    return currentState()[key];
  },
  write(key: string, value: any): void {
    currentState()[key] = value;
  },
  update(key: string, updater: (value: any) => any): void {
    const state = currentState();
    state[key] = updater(state[key]);
  },
  reset(): void {
    throw new Error("生产环境不支持通过业务服务重置数据库");
  },
  snapshot(): AppState {
    return structuredClone(currentState());
  },
  async searchQuestions(filter: QuestionFilter = {}): Promise<Question[] | null> {
    const backend = currentContext().backend;
    return backend?.searchQuestions ? backend.searchQuestions(filter) : null;
  },
};
