import { rpcCall } from "./api";

import type { School } from "@/types";

export const schoolService = {
  async listSchools(): Promise<School[]> {
    return rpcCall("school", "listSchools", []) as any;
  },

  async searchSchools(keyword: string): Promise<School[]> {
    return rpcCall("school", "searchSchools", [keyword]) as any;
  },

  async getSchool(schoolId: string): Promise<School | null> {
    return rpcCall("school", "getSchool", [schoolId]) as any;
  }
};
