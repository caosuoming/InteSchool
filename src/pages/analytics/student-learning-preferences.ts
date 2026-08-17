import type { LearningTreePlacement } from "./student-learning-tree";

export interface StudentLearningPlacementPreferences {
  knowledgePoints: Record<string, LearningTreePlacement>;
  chapters: Record<string, LearningTreePlacement>;
}

const emptyPreferences = (): StudentLearningPlacementPreferences => ({
  knowledgePoints: {},
  chapters: {},
});

function sanitizePlacements(value: unknown): Record<string, LearningTreePlacement> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const placements: Record<string, LearningTreePlacement> = {};
  for (const [id, placement] of Object.entries(value)) {
    if (placement === "top" || placement === "bottom") placements[id] = placement;
  }
  return placements;
}

export function studentLearningPlacementStorageKey(teacherId: string, schoolId: string): string {
  return `inteschool:student-learning:placements:${schoolId}:${teacherId}`;
}

export function loadStudentLearningPlacementPreferences(
  storageKey: string,
): StudentLearningPlacementPreferences {
  if (typeof window === "undefined") return emptyPreferences();
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return emptyPreferences();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      knowledgePoints: sanitizePlacements(parsed.knowledgePoints),
      chapters: sanitizePlacements(parsed.chapters),
    };
  } catch {
    return emptyPreferences();
  }
}

export function saveStudentLearningPlacementPreferences(
  storageKey: string,
  preferences: StudentLearningPlacementPreferences,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(preferences));
}
