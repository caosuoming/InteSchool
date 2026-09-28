import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuthStore } from "@/stores/auth";
import { isPlatformAdminAccount } from "@/lib/platform-admin";

export function RequireAccountManager({ children }: { children: ReactNode }) {
  const { teacher, getCurrentAffiliation } = useAuthStore();
  const affiliation = getCurrentAffiliation();
  const role = affiliation?.role || teacher?.role;
  const platformAdmin = isPlatformAdminAccount(teacher);
  if (!teacher || (!platformAdmin && (!affiliation?.schoolId || role !== "school_admin"))) {
    return <Navigate to="/admin" replace />;
  }
  return children;
}
