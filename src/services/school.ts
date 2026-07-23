import type { School } from "@/types";
import { db } from "./db";
import { delay } from "./_shared";

export const schoolService = {
  async listSchools(): Promise<School[]> {
    await delay(200);
    return db.read("schools");
  },

  async searchSchools(keyword: string): Promise<School[]> {
    await delay(300);
    const kw = keyword.trim().toLowerCase();
    if (!kw) return db.read("schools");
    return db
      .read("schools")
      .filter(
        (s) =>
          s.name.toLowerCase().includes(kw) ||
          s.code.toLowerCase().includes(kw) ||
          s.city.toLowerCase().includes(kw),
      );
  },

  async getSchool(schoolId: string): Promise<School | null> {
    await delay(150);
    return db.read("schools").find((s) => s.id === schoolId) || null;
  },
};
