import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadGeoGebra: vi.fn(),
  graphics: vi.fn(),
  size: vi.fn(),
  parameters: {} as Record<string, unknown>,
}));

vi.mock("@/lib/geogebra", () => ({ loadGeoGebra: mocks.loadGeoGebra }));

import { GeoGebraEmbed } from "./GeoGebraEmbed";

describe("GeoGebraEmbed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadGeoGebra.mockResolvedValue(class {
      constructor(parameters: Record<string, unknown>) {
        mocks.parameters = parameters;
      }
      inject() {
        (mocks.parameters.appletOnLoad as (api: unknown) => void)({
          setGraphicsOptions: mocks.graphics,
          setSize: mocks.size,
        });
      }
    });
  });

  it("matches the graphics background to the slide and updates it without reinjecting", async () => {
    const { rerender } = render(
      <GeoGebraEmbed fileUrl="/api/ggb" title="圆" backgroundColor="#F1F7FF" compact className="h-full" />,
    );

    await waitFor(() => expect(screen.queryByText("加载 GeoGebra 课件...")).not.toBeInTheDocument());
    expect(mocks.graphics).toHaveBeenCalledWith(1, { bgColor: "#F1F7FF" });
    expect(mocks.parameters).toMatchObject({
      filename: "/api/ggb",
      perspective: "G",
      showToolBar: false,
      showMenuBar: false,
      showAlgebraInput: false,
    });

    rerender(<GeoGebraEmbed fileUrl="/api/ggb" title="圆" backgroundColor="#F3FAF5" compact className="h-full" />);
    expect(mocks.graphics).toHaveBeenLastCalledWith(1, { bgColor: "#F3FAF5" });
    expect(mocks.loadGeoGebra).toHaveBeenCalledTimes(1);
  });
});
