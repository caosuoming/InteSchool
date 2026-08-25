import { useEffect, useRef } from "react";

interface UseAutosaveOptions {
  enabled?: boolean;
  dirty: boolean;
  saving?: boolean;
  delayMs?: number;
  onSave: () => void | Promise<void>;
}

/**
 * Saves an existing dirty editor after it has remained unsaved for a while.
 * The callback is kept in a ref so normal re-renders do not restart the timer.
 */
export function useAutosave({
  enabled = true,
  dirty,
  saving = false,
  delayMs = 30_000,
  onSave,
}: UseAutosaveOptions) {
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    if (!enabled || !dirty || saving) return;

    const timer = window.setTimeout(() => {
      void onSaveRef.current();
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [delayMs, dirty, enabled, saving]);
}
