export interface ResourceTypeNode {
  id: string;
  name: string;
  parentId?: string | null;
  sortOrder: number;
  enabled: boolean;
}

export interface ResourceTypeOption {
  value: string;
  label: string;
  level: 1 | 2;
  parentId?: string;
}

function compareTypes<T extends ResourceTypeNode>(left: T, right: T): number {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "zh-CN");
}

export function orderedResourceTypes<T extends ResourceTypeNode>(types: T[]): T[] {
  const typeMap = new Map(types.map((type) => [type.id, type]));
  const roots = types
    .filter((type) => !type.parentId || !typeMap.has(type.parentId))
    .sort(compareTypes);
  const childrenByParent = new Map<string, T[]>();

  types.forEach((type) => {
    if (!type.parentId || !typeMap.has(type.parentId)) return;
    const children = childrenByParent.get(type.parentId) || [];
    children.push(type);
    childrenByParent.set(type.parentId, children);
  });

  return roots.flatMap((root) => [
    root,
    ...(childrenByParent.get(root.id) || []).sort(compareTypes),
  ]);
}

export function buildResourceTypeOptions<T extends ResourceTypeNode>(
  types: T[],
  options: { enabledOnly?: boolean; currentId?: string } = {},
): ResourceTypeOption[] {
  const typeMap = new Map(types.map((type) => [type.id, type]));
  const ordered = orderedResourceTypes(types);

  return ordered.flatMap<ResourceTypeOption>((type) => {
    const parent = type.parentId ? typeMap.get(type.parentId) : undefined;
    const available = type.enabled && (!parent || parent.enabled);
    if (options.enabledOnly && !available && type.id !== options.currentId) return [];

    return [{
      value: type.id,
      label: parent ? `${parent.name} / ${type.name}` : type.name,
      level: parent ? 2 : 1,
      parentId: parent?.id,
    }];
  });
}

export function resourceTypeLabel<T extends ResourceTypeNode>(
  typeId: string | undefined,
  types: T[],
): string {
  if (!typeId) return "未设置";
  return buildResourceTypeOptions(types).find((option) => option.value === typeId)?.label || "已删除类型";
}

export function matchingResourceTypeIds<T extends ResourceTypeNode>(
  selectedTypeId: string,
  types: T[],
): Set<string> {
  if (!selectedTypeId) return new Set();
  const selected = types.find((type) => type.id === selectedTypeId);
  if (!selected || selected.parentId) return new Set([selectedTypeId]);

  return new Set([
    selectedTypeId,
    ...types.filter((type) => type.parentId === selectedTypeId).map((type) => type.id),
  ]);
}

export function siblingTypes<T extends ResourceTypeNode>(types: T[], type: T): T[] {
  const parentId = type.parentId || null;
  return types
    .filter((candidate) => (candidate.parentId || null) === parentId)
    .sort(compareTypes);
}
