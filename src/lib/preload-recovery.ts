const PRELOAD_RECOVERY_KEY = "inteschool:preload-recovery-at";
const PRELOAD_RECOVERY_COOLDOWN_MS = 30_000;

interface RecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function recoverFromPreloadError(
  event: Event,
  storage: RecoveryStorage = window.sessionStorage,
  reload: () => void = () => window.location.reload(),
  now = Date.now(),
): boolean {
  event.preventDefault();
  const lastRecovery = Number(storage.getItem(PRELOAD_RECOVERY_KEY) || 0);
  if (Number.isFinite(lastRecovery) && now - lastRecovery < PRELOAD_RECOVERY_COOLDOWN_MS) {
    return false;
  }

  storage.setItem(PRELOAD_RECOVERY_KEY, String(now));
  reload();
  return true;
}
