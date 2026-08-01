import { rpcCall } from "./api";

import type {
  DonationContributor,
  DonationPreview,
  DonationPrivileges,
  DonationRequest,
  PlatformResourceSetting,
  PlatformResourceSettingType,
  ShareRecord,
  ShareableResourceType,
  ShareScope,
  TreeNode,
  ResourceSemester,
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
    batchId?: string;
  }): Promise<ShareRecord> {
    return rpcCall("share", "createShare", [params]) as any;
  },

  async getBatchShare(batchId: string): Promise<ShareRecord[]> {
    return rpcCall("share", "getBatchShare", [batchId]) as any;
  },

  async checkDonationCandidates(
    teacherId: string,
    requests: DonationRequest[],
  ): Promise<DonationPreview[]> {
    return rpcCall("share", "checkDonationCandidates", [teacherId, requests]) as any;
  },

  async donateResources(
    teacherId: string,
    schoolId: string,
    requests: DonationRequest[],
  ): Promise<ShareRecord[]> {
    return rpcCall("share", "donateResources", [teacherId, schoolId, requests]) as any;
  },

  async listPublicDonations(): Promise<ShareRecord[]> {
    return rpcCall("share", "listPublicDonations", []) as any;
  },

  async listDonationStatus(teacherId: string): Promise<ShareRecord[]> {
    return rpcCall("share", "listDonationStatus", [teacherId]) as any;
  },

  async listDonationContributors(): Promise<DonationContributor[]> {
    return rpcCall("share", "listDonationContributors", []) as any;
  },

  async getDonationPrivileges(teacherId: string): Promise<DonationPrivileges> {
    return rpcCall("share", "getDonationPrivileges", [teacherId]) as any;
  },

  async getPlatformDirectoryTree(type: "chapter" | "knowledge"): Promise<TreeNode> {
    return rpcCall("share", "getPlatformDirectoryTree", [type]) as any;
  },

  async updateDonationResource(
    teacherId: string,
    donationId: string,
    patch: Partial<{
      title: string;
      description: string;
      grade: string;
      schoolYear: string;
      semester: ResourceSemester;
      originalFileName: string;
      difficulty: 1 | 2 | 3 | 4 | 5;
      recommendation: 1 | 2 | 3 | 4 | 5;
    }>,
  ): Promise<ShareRecord> {
    return rpcCall("share", "updateDonationResource", [teacherId, donationId, patch]) as any;
  },

  async listPlatformResourceSettings(): Promise<PlatformResourceSetting[]> {
    return rpcCall("share", "listPlatformResourceSettings", []) as any;
  },

  async updatePlatformResourceSettings(
    teacherId: string,
    settings: Array<{ type: PlatformResourceSettingType; values: string[] }>,
  ): Promise<PlatformResourceSetting[]> {
    return rpcCall("share", "updatePlatformResourceSettings", [teacherId, settings]) as any;
  },

  async listIncomingShares(teacherId: string): Promise<ShareRecord[]> {
    return rpcCall("share", "listIncomingShares", [teacherId]) as any;
  },

  async listOutgoingShares(teacherId: string): Promise<ShareRecord[]> {
    return rpcCall("share", "listOutgoingShares", [teacherId]) as any;
  },

  async acceptShare(
    shareId: string,
    toTeacherId: string,
    toSchoolId: string,
  ): Promise<{ newResourceId: string; resourceType: ShareableResourceType }> {
    return rpcCall("share", "acceptShare", [shareId, toTeacherId, toSchoolId]) as any;
  },

  async rejectShare(shareId: string): Promise<void> {
    return rpcCall("share", "rejectShare", [shareId]) as any;
  },

  async revokeShare(shareId: string): Promise<void> {
    return rpcCall("share", "revokeShare", [shareId]) as any;
  },
};
