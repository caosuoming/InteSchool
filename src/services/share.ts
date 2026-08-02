import { rpcCall } from "./api";

import type {
  DonationContributor,
  DonationPreview,
  DonationPrivileges,
  PlatformResourceCorrection,
  PlatformResourceCorrectionInput,
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

  async listPublicDonations(teacherId: string): Promise<ShareRecord[]> {
    return rpcCall("share", "listPublicDonations", [teacherId]) as any;
  },

  async listDonationStatus(teacherId: string): Promise<ShareRecord[]> {
    return rpcCall("share", "listDonationStatus", [teacherId]) as any;
  },

  async listDonationContributors(teacherId: string): Promise<DonationContributor[]> {
    return rpcCall("share", "listDonationContributors", [teacherId]) as any;
  },

  async getDonationPrivileges(teacherId: string): Promise<DonationPrivileges> {
    return rpcCall("share", "getDonationPrivileges", [teacherId]) as any;
  },

  async getPlatformDirectoryTree(type: "chapter" | "knowledge", teacherId: string): Promise<TreeNode> {
    return rpcCall("share", "getPlatformDirectoryTree", [type, teacherId]) as any;
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

  async createDonationCorrection(
    teacherId: string,
    input: PlatformResourceCorrectionInput,
  ): Promise<PlatformResourceCorrection> {
    return rpcCall("share", "createDonationCorrection", [teacherId, input]) as any;
  },

  async listDonationCorrections(
    teacherId: string,
    donationId?: string,
  ): Promise<PlatformResourceCorrection[]> {
    return rpcCall("share", "listDonationCorrections", [teacherId, donationId]) as any;
  },

  async listCorrectionTodos(teacherId: string): Promise<PlatformResourceCorrection[]> {
    return rpcCall("share", "listCorrectionTodos", [teacherId]) as any;
  },

  async resolveDonationCorrection(
    teacherId: string,
    correctionId: string,
  ): Promise<PlatformResourceCorrection> {
    return rpcCall("share", "resolveDonationCorrection", [teacherId, correctionId]) as any;
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

  async setSubjectModerator(
    adminTeacherId: string,
    subject: string,
    targetTeacherId: string,
    enabled: boolean,
  ): Promise<DonationContributor[]> {
    return rpcCall("share", "setSubjectModerator", [adminTeacherId, subject, targetTeacherId, enabled]) as any;
  },

  async updateDonationOrder(
    teacherId: string,
    subject: string,
    donationIds: string[],
  ): Promise<ShareRecord[]> {
    return rpcCall("share", "updateDonationOrder", [teacherId, subject, donationIds]) as any;
  },

  async deleteDonationResource(adminTeacherId: string, donationId: string): Promise<void> {
    await rpcCall("share", "deleteDonationResource", [adminTeacherId, donationId]);
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
