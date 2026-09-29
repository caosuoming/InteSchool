import { describe, expect, it } from "vitest";
import {
  basketAudienceLabel,
  preferredBasketForClassIds,
} from "@/lib/basket-audience";
import type { AnyClass, Basket, Student } from "@/types";

const classes = [
  { id: "class-1", name: "高一（1）班", type: "school" },
  { id: "class-2", name: "高一（2）班", type: "school" },
] as AnyClass[];

const students = [
  { id: "student-1", name: "张同学" },
  { id: "student-2", name: "李同学" },
] as Student[];

function audience(classIds: string[] = [], studentIds: string[] = []) {
  return { classIds, studentIds } satisfies Pick<Basket, "classIds" | "studentIds">;
}

describe("basketAudienceLabel", () => {
  it("shows the selected class names", () => {
    expect(basketAudienceLabel(audience(["class-1", "class-2"]), classes, students)).toBe(
      "班级：高一（1）班、高一（2）班",
    );
  });

  it("shows the selected student names", () => {
    expect(basketAudienceLabel(audience([], ["student-1", "student-2"]), classes, students)).toBe(
      "学生：张同学、李同学",
    );
  });

  it("shows class and explicitly selected student names together", () => {
    expect(basketAudienceLabel(audience(["class-1"], ["student-2"]), classes, students)).toBe(
      "班级：高一（1）班 · 学生：李同学",
    );
  });

  it("falls back to counts until audience metadata is available", () => {
    expect(basketAudienceLabel(audience(["class-1"], ["student-1"]), [], [])).toBe(
      "1 个班级 · 1 名指定学生",
    );
  });

  it("shows an empty-audience hint", () => {
    expect(basketAudienceLabel(audience(), classes, students)).toBe("尚未选择使用对象");
  });
});

describe("preferredBasketForClassIds", () => {
  const baskets = [
    {
      id: "basket-default",
      name: "默认资源篮",
      isDefault: true,
      classIds: [],
    },
    {
      id: "basket-class-1",
      name: "一班资源篮",
      classIds: ["class-1"],
    },
    {
      id: "basket-classes",
      name: "一二班资源篮",
      classIds: ["class-2", "class-1"],
    },
  ] as Basket[];

  it("prefers a basket whose class audience exactly matches the lesson audience", () => {
    expect(preferredBasketForClassIds(baskets, ["class-1"])?.id).toBe("basket-class-1");
    expect(preferredBasketForClassIds(baskets, ["class-1", "class-2"])?.id).toBe("basket-classes");
  });

  it("falls back to the default basket when no audience matches", () => {
    expect(preferredBasketForClassIds(baskets, ["class-3"])?.id).toBe("basket-default");
  });

  it("uses the default basket when the lesson has no audience yet", () => {
    expect(preferredBasketForClassIds(baskets, [])?.id).toBe("basket-default");
  });
});
