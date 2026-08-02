import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuthStore } from "@/stores/auth";
import { canManageSchoolRoster } from "@/lib/roster-permissions";

export function RequireSchoolRosterManager({ children }: { children: ReactNode }) {
  const { teacher, getCurrentAffiliation } = useAuthStore();
  const affiliation = getCurrentAffiliation();
  if (!teacher || !affiliation?.schoolId || !canManageSchoolRoster(teacher, affiliation)) {
    return <Navigate to="/admin" replace />;
  }
  return children;
}
