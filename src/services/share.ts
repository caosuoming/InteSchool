import { rpcCall } from "./api";

import type {
  ShareRecord, ShareableResourceType, ShareScope,
} from "@/types";

export const shareService = {
  async createShare(params: {
    fromTeacherId: string;
    fromSchoolId: string;
    toTeacherId?: string;
    toSchoolId?: string;
    scope: ShareScope;
    resourceType: ShareableResourceType;
    resourceId: string;
    resourceTitle: string;
    message?: string;
    expiresAt?: string;
  }): Promise<ShareRecord> {
    return rpcCall("share", "createShare", [params]) as any;
  },

  async listIncomingShares(teacherId: string): Promise<ShareRecord[]> {
    return rpcCall("share", "listIncomingShares", [teacherId]) as any;
  },

  async listOutgoingShares(teacherId: string): Promise<ShareRecord[]> {
    return rpcCall("share", "listOutgoingShares", [teacherId]) as any;
  },

  async acceptShare(shareId: string, toTeacherId: string, toSchoolId: string): Promise<{ newResourceId: string; resourceType: ShareableResourceType }> {
    return rpcCall("share", "acceptShare", [shareId, toTeacherId, toSchoolId]) as any;
  },

  async rejectShare(shareId: string): Promise<void> {
    return rpcCall("share", "rejectShare", [shareId]) as any;
  },

  async revokeShare(shareId: string): Promise<void> {
    return rpcCall("share", "revokeShare", [shareId]) as any;
  }
};
