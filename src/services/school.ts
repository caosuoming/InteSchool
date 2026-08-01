import { rpcCall } from "./api";

import type { School, SchoolCreationApplication } from "@/types";

export const schoolService = {
  async listSchools(): Promise<School[]> {
    return rpcCall("school", "listSchools", []) as any;
  },

  async searchSchools(keyword: string): Promise<School[]> {
    return rpcCall("school", "searchSchools", [keyword]) as any;
  },

  async getSchool(schoolId: string): Promise<School | null> {
    return rpcCall("school", "getSchool", [schoolId]) as any;
  },

  async submitSchoolCreationApplication(input: {
    name: string;
    code: string;
    city: string;
    description?: string;
  }): Promise<SchoolCreationApplication> {
    return rpcCall("school", "submitSchoolCreationApplication", [input, null]) as any;
  },

  async listMySchoolCreationApplications(): Promise<SchoolCreationApplication[]> {
    return rpcCall("school", "listMySchoolCreationApplications", [null]) as any;
  },

  async listPendingSchoolCreationApplications(): Promise<SchoolCreationApplication[]> {
    return rpcCall("school", "listPendingSchoolCreationApplications", [null]) as any;
  },

  async reviewSchoolCreationApplication(
    applicationId: string,
    approved: boolean,
  ): Promise<SchoolCreationApplication> {
    return rpcCall("school", "reviewSchoolCreationApplication", [applicationId, approved, null]) as any;
  },
};
