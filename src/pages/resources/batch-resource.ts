import type { ShareableResourceType } from "@/types";

export interface BatchResourceRef {
  resourceType: ShareableResourceType;
  resourceId: string;
}

export function batchResourceKey(resourceType: ShareableResourceType, resourceId: string): string {
  return `${resourceType}:${resourceId}`;
}

export function parseBatchResourceKey(key: string): BatchResourceRef {
  const separator = key.indexOf(":");
  if (separator <= 0 || separator === key.length - 1) {
    throw new Error(`Invalid batch resource key: ${key}`);
  }
  return {
    resourceType: key.slice(0, separator) as ShareableResourceType,
    resourceId: key.slice(separator + 1),
  };
}

export function appendUniqueIds(existing: string[] | undefined, additions: string[]): string[] {
  return Array.from(new Set([...(existing || []), ...additions]));
}
