import { rpcCall } from "./api";
import type {
  DonationCheckResult,
  DonationDecision,
  DonationItem,
  DonorStatus,
  PlatformAttributeOption,
  PlatformAttributeOptionType,
  PlatformDonation,
  PlatformSaveCheckResult,
  PlatformSaveDecision,
  PlatformSaveResult,
  TreeNode,
} from "@/types";

export const donationService = {
  async listDonations(): Promise<PlatformDonation[]> {
    return rpcCall("donation", "listDonations", []) as any;
  },

  async listTeacherDonations(teacherId: string): Promise<PlatformDonation[]> {
    return rpcCall("donation", "listTeacherDonations", [teacherId]) as any;
  },

  async getDonorStatus(teacherId: string): Promise<DonorStatus> {
    return rpcCall("donation", "getDonorStatus", [teacherId]) as any;
  },

  async getCatalogTrees(): Promise<{ chapterTree: TreeNode; knowledgeTree: TreeNode }> {
    return rpcCall("donation", "getCatalogTrees", []) as any;
  },

  async checkDonation(
    teacherId: string,
    schoolId: string,
    items: DonationItem[],
  ): Promise<DonationCheckResult> {
    return rpcCall("donation", "checkDonation", [teacherId, schoolId, items]) as any;
  },

  async donateResources(
    teacherId: string,
    schoolId: string,
    items: DonationItem[],
    decisions: DonationDecision[] = [],
  ): Promise<{ created: PlatformDonation[]; skipped: DonationItem[] }> {
    return rpcCall("donation", "donateResources", [teacherId, schoolId, items, decisions]) as any;
  },

  async checkSaveAsOwnResource(
    donationId: string,
    teacherId: string,
    schoolId: string,
  ): Promise<PlatformSaveCheckResult> {
    return rpcCall("donation", "checkSaveAsOwnResource", [donationId, teacherId, schoolId]) as any;
  },

  async saveAsOwnResource(
    donationId: string,
    teacherId: string,
    schoolId: string,
    decision?: PlatformSaveDecision,
  ): Promise<PlatformSaveResult> {
    return rpcCall("donation", "saveAsOwnResource", [donationId, teacherId, schoolId, decision]) as any;
  },

  async updateDonation(
    donationId: string,
    teacherId: string,
    patch: Record<string, unknown>,
  ): Promise<PlatformDonation> {
    return rpcCall("donation", "updateDonation", [donationId, teacherId, patch]) as any;
  },

  async listAttributeOptions(): Promise<Record<PlatformAttributeOptionType, string[]>> {
    return rpcCall("donation", "listAttributeOptions", []) as any;
  },

  async updateAttributeOptions(
    teacherId: string,
    type: PlatformAttributeOptionType,
    values: string[],
  ): Promise<PlatformAttributeOption> {
    return rpcCall("donation", "updateAttributeOptions", [teacherId, type, values]) as any;
  },
};
