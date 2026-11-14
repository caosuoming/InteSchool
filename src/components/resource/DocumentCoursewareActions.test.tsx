import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AnyClass } from "@/types";
import { DocumentCoursewareActions } from "./DocumentCoursewareActions";
import { documentLessonAudienceIds } from "@/lib/document-lesson-audience";

const classes = [
  { id: "school-1", type: "school", name: "校内一班" },
  { id: "personal-1", type: "personal", name: "个人一班" },
  { id: "personal-2", type: "personal", name: "个人二班" },
] as AnyClass[];

describe("DocumentCoursewareActions", () => {
  it("does not offer either action without an assigned, known audience", () => {
    const onAdd = vi.fn();
    const { rerender } = render(
      <DocumentCoursewareActions classIds={[]} classes={classes} onAdd={onAdd} />,
    );
    expect(screen.queryByRole("button", { name: /添加到.*上课/ })).not.toBeInTheDocument();
    rerender(<DocumentCoursewareActions classIds={["unknown"]} classes={classes} onAdd={onAdd} />);
    expect(screen.queryByRole("button", { name: /添加到.*上课/ })).not.toBeInTheDocument();
  });

  it("offers the selected school and personal actions independently", () => {
    const onAdd = vi.fn();
    render(
      <DocumentCoursewareActions
        classIds={["personal-2", "school-1", "personal-1"]}
        classes={classes}
        onAdd={onAdd}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "添加到学校上课" }));
    fireEvent.click(screen.getByRole("button", { name: "添加到个人上课" }));
    expect(onAdd).toHaveBeenNthCalledWith(1, "school", ["school-1"]);
    expect(onAdd).toHaveBeenNthCalledWith(2, "personal", ["personal-1", "personal-2"]);
    expect(documentLessonAudienceIds(["school-1"], classes)).toEqual({
      school: ["school-1"], personal: [],
    });
  });

  it("disables both buttons while generating", () => {
    render(
      <DocumentCoursewareActions
        classIds={["school-1", "personal-1"]}
        classes={classes}
        onAdd={vi.fn()}
        loading
      />,
    );
    expect(screen.getByRole("button", { name: "添加到学校上课" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "添加到个人上课" })).toBeDisabled();
  });
});
