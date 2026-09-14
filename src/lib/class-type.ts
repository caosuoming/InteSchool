import type { ClassTypeCategory } from "@/types";

export function classTypeMatchesReference(type: ClassTypeCategory, referenceId: string | null | undefined): boolean {
  if (!referenceId) return false;
  return type.id === referenceId || Boolean(type.legacyIds?.includes(referenceId));
}

export function findClassTypeByReference(
  types: ClassTypeCategory[],
  referenceId: string | null | undefined,
): ClassTypeCategory | undefined {
  return referenceId ? types.find((type) => classTypeMatchesReference(type, referenceId)) : undefined;
}

export function classTypeReferenceMap(types: ClassTypeCategory[]): Map<string, ClassTypeCategory> {
  const result = new Map<string, ClassTypeCategory>();
  for (const type of types) {
    result.set(type.id, type);
    for (const legacyId of type.legacyIds || []) result.set(legacyId, type);
  }
  return result;
}
