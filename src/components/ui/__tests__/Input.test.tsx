import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Input, Select, Textarea } from "@/components/ui/Input";

describe("form controls", () => {
  it("associates generated input ids with labels and descriptions", () => {
    render(<Input label="邮箱" hint="使用学校邮箱" />);

    const input = screen.getByLabelText("邮箱");
    expect(input).toHaveAttribute("id");
    expect(input).toHaveAccessibleDescription("使用学校邮箱");
  });

  it("exposes validation errors to assistive technology", () => {
    render(<Textarea label="说明" error="不能为空" />);

    const textarea = screen.getByLabelText("说明");
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    expect(textarea).toHaveAccessibleDescription("不能为空");
  });

  it("keeps explicit ids and labels connected", () => {
    render(
      <Select
        id="subject"
        label="学科"
        options={[{ value: "math", label: "数学" }]}
      />,
    );

    expect(screen.getByLabelText("学科")).toHaveAttribute("id", "subject");
  });
});
