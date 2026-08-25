import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAutosave } from "./useAutosave";

function Harness(props: {
  dirty: boolean;
  saving?: boolean;
  enabled?: boolean;
  onSave: () => void;
}) {
  useAutosave({ ...props, delayMs: 1_000 });
  return null;
}

describe("useAutosave", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves a dirty editor after the configured delay", () => {
    vi.useFakeTimers();
    const onSave = vi.fn();
    render(<Harness dirty onSave={onSave} />);

    act(() => vi.advanceTimersByTime(999));
    expect(onSave).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("does not save clean, disabled, or currently-saving editors", () => {
    vi.useFakeTimers();
    const onSave = vi.fn();
    const { rerender } = render(<Harness dirty={false} onSave={onSave} />);

    act(() => vi.advanceTimersByTime(2_000));
    rerender(<Harness dirty enabled={false} onSave={onSave} />);
    act(() => vi.advanceTimersByTime(2_000));
    rerender(<Harness dirty saving onSave={onSave} />);
    act(() => vi.advanceTimersByTime(2_000));

    expect(onSave).not.toHaveBeenCalled();
  });

  it("uses the latest callback without restarting the active timer", () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Harness dirty onSave={first} />);

    act(() => vi.advanceTimersByTime(500));
    rerender(<Harness dirty onSave={second} />);
    act(() => vi.advanceTimersByTime(500));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
