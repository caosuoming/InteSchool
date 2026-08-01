import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  listQuestions: vi.fn(),
  listPapers: vi.fn(),
  listLectures: vi.fn(),
  listCoursewares: vi.fn(),
  listMaterials: vi.fn(),
  listBaskets: vi.fn(),
}));

vi.mock("../question", () => ({
  questionService: { listQuestions: serviceMocks.listQuestions },
}));
vi.mock("../examPaper", () => ({
  examPaperService: { listPapers: serviceMocks.listPapers },
}));
vi.mock("../lecture", () => ({
  lectureService: { listLectures: serviceMocks.listLectures },
}));
vi.mock("../courseware", () => ({
  coursewareService: { listCoursewares: serviceMocks.listCoursewares },
}));
vi.mock("../material", () => ({
  materialService: { listMaterials: serviceMocks.listMaterials },
}));
vi.mock("../basket", () => ({
  basketService: { listBaskets: serviceMocks.listBaskets },
}));

import {
  getLocalBackupState,
  localBackupKey,
  runLocalResourceBackup,
  type BackupDirectoryHandle,
  type BackupFileHandle,
  type BackupWritableFile,
} from "../localResourceBackup";

class FakeFileHandle implements BackupFileHandle {
  content: Blob | string = "";

  constructor(readonly name: string) {}

  async getFile(): Promise<File> {
    return {
      name: this.name,
      text: () => this.text(),
    } as File;
  }

  async createWritable(): Promise<BackupWritableFile> {
    return {
      write: async (data) => {
        this.content = data;
      },
      close: async () => undefined,
    };
  }

  async text(): Promise<string> {
    return typeof this.content === "string" ? this.content : this.content.text();
  }
}

class FakeDirectoryHandle implements BackupDirectoryHandle {
  readonly directories = new Map<string, FakeDirectoryHandle>();
  readonly files = new Map<string, FakeFileHandle>();

  constructor(readonly name: string) {}

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FakeDirectoryHandle> {
    const existing = this.directories.get(name);
    if (existing) return existing;
    if (!options?.create) throw new DOMException("目录不存在", "NotFoundError");
    const created = new FakeDirectoryHandle(name);
    this.directories.set(name, created);
    return created;
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FakeFileHandle> {
    const existing = this.files.get(name);
    if (existing) return existing;
    if (!options?.create) throw new DOMException("文件不存在", "NotFoundError");
    const created = new FakeFileHandle(name);
    this.files.set(name, created);
    return created;
  }

  directory(...path: string[]): FakeDirectoryHandle {
    return path.reduce((current, part) => {
      const next = current.directories.get(part);
      if (!next) throw new Error(`目录不存在：${path.join("/")}`);
      return next;
    }, this);
  }
}

const context = { teacherId: "teacher-1", schoolId: "school-1" };
const timestamp = "2026-08-01T12:00:00.000Z";

function setResources(): void {
  serviceMocks.listQuestions.mockResolvedValue([{ id: "q-1", stem: "<p>函数题</p>", updatedAt: timestamp }]);
  serviceMocks.listPapers.mockResolvedValue([{ id: "paper-1", title: "期中试卷", updatedAt: timestamp }]);
  serviceMocks.listLectures.mockResolvedValue([{ id: "lecture-1", title: "函数讲义", updatedAt: timestamp }]);
  serviceMocks.listCoursewares.mockResolvedValue([{
    id: "courseware-1",
    title: "函数课件",
    updatedAt: timestamp,
    fileUrl: "/api/files/courseware-1",
    fileName: "函数课件.pptx",
  }]);
  serviceMocks.listMaterials.mockResolvedValue([{ id: "material-1", title: "函数素材", updatedAt: timestamp }]);
  serviceMocks.listBaskets.mockResolvedValue([{ id: "basket-1", name: "默认资源篮", updatedAt: timestamp }]);
}

beforeEach(() => {
  Object.values(serviceMocks).forEach((mock) => mock.mockReset());
  setResources();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("pptx", {
    status: 200,
    headers: { "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
  })));
});

describe("local resource backup", () => {
  it("writes all resource types and skips unchanged entries on the next run", async () => {
    const directory = new FakeDirectoryHandle("教师备份");

    const first = await runLocalResourceBackup(context, directory);

    expect(first).toMatchObject({ total: 6, updated: 6, skipped: 0, failed: 0 });
    const backupRoot = directory.directory("InteSchool-我的资源");
    const questionJson = await backupRoot.directory("题目", "q-1").files.get("资源.json")?.text();
    expect(JSON.parse(questionJson || "{}")).toMatchObject({
      resourceType: "question",
      title: "函数题",
      resource: { id: "q-1" },
    });
    const coursewareDirectory = backupRoot.directory("课件", "courseware-1");
    expect(coursewareDirectory.files.has("函数课件.pptx")).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/files/courseware-1", { credentials: "include" });

    const second = await runLocalResourceBackup(context, directory);

    expect(second).toMatchObject({ total: 6, updated: 0, skipped: 6, failed: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getLocalBackupState(localBackupKey(context))).toMatchObject({
      directoryName: "教师备份",
      lastResult: { total: 6, updated: 0, skipped: 6, failed: 0 },
    });
  });

  it("retries only changed or previously failed resources", async () => {
    const directory = new FakeDirectoryHandle("增量备份");
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    const first = await runLocalResourceBackup(context, directory);
    expect(first).toMatchObject({ total: 6, updated: 5, skipped: 0, failed: 1 });
    expect(first.errors[0]).toContain("函数课件");

    serviceMocks.listMaterials.mockResolvedValue([{
      id: "material-1",
      title: "函数素材（已修改）",
      updatedAt: "2026-08-01T13:00:00.000Z",
    }]);
    fetchMock.mockResolvedValueOnce(new Response("pptx", { status: 200 }));

    const second = await runLocalResourceBackup(context, directory);
    expect(second).toMatchObject({ total: 6, updated: 2, skipped: 4, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
