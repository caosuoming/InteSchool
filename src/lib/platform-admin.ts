export interface PlatformAdminCarrier {
  role?: unknown;
  affiliations?: readonly { role?: unknown }[];
}

/** 平台管理员权限属于账号本身，不随当前激活的学校身份丢失。 */
export function isPlatformAdminAccount(teacher: PlatformAdminCarrier | null | undefined): boolean {
  if (!teacher) return false;
  return teacher.role === "platform_admin"
    || Boolean(teacher.affiliations?.some((affiliation) => affiliation.role === "platform_admin"));
}
