import { describe, expect, it } from "vitest";
import type { ExamPaperType } from "@/types";
import {
  buildResourceTypeOptions,
  matchingResourceTypeIds,
  orderedResourceTypes,
  resourceTypeLabel,
} from "./resource-type-hierarchy";

function type(
  id: string,
  name: string,
  sortOrder: number,
  parentId?: string,
  enabled = true,
): ExamPaperType {
  return {
    id,
    schoolId: "school-1",
    name,
    parentId,
    format: "simple",
    sortOrder,
    enabled,
    createdAt: "2026-08-02T00:00:00.000Z",
  };
}

describe("resource type hierarchy", () => {
  const types = [
    type("child-b", "周测", 2, "root-exam"),
    type("root-practice", "练习", 1),
    type("child-a", "月考", 1, "root-exam"),
    type("root-exam", "考试", 2),
  ];

  it("orders roots and places each child directly after its parent", () => {
    expect(orderedResourceTypes(types).map((item) => item.id)).toEqual([
      "root-practice",
      "root-exam",
      "child-a",
      "child-b",
    ]);
  });

  it("builds full parent-child labels", () => {
    expect(buildResourceTypeOptions(types)).toEqual([
      { value: "root-practice", label: "练习", level: 1, parentId: undefined },
      { value: "root-exam", label: "考试", level: 1, parentId: undefined },
      { value: "child-a", label: "考试 / 月考", level: 2, parentId: "root-exam" },
      { value: "child-b", label: "考试 / 周测", level: 2, parentId: "root-exam" },
    ]);
    expect(resourceTypeLabel("child-a", types)).toBe("考试 / 月考");
  });

  it("lets a first-level filter include its children while a child remains exact", () => {
    expect([...matchingResourceTypeIds("root-exam", types)]).toEqual([
      "root-exam",
      "child-b",
      "child-a",
    ]);
    expect([...matchingResourceTypeIds("child-a", types)]).toEqual(["child-a"]);
  });

  it("hides a disabled branch from enabled-only selectors", () => {
    const disabledParentTypes = [
      type("root", "考试", 1, undefined, false),
      type("child", "月考", 1, "root", true),
    ];
    expect(buildResourceTypeOptions(disabledParentTypes, { enabledOnly: true })).toEqual([]);
    expect(buildResourceTypeOptions(disabledParentTypes, {
      enabledOnly: true,
      currentId: "child",
    }).map((item) => item.value)).toEqual(["child"]);
  });
});
