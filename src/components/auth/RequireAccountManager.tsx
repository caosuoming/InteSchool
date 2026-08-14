import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuthStore } from "@/stores/auth";

export function RequireAccountManager({ children }: { children: ReactNode }) {
  const { teacher, getCurrentAffiliation } = useAuthStore();
  const affiliation = getCurrentAffiliation();
  const role = affiliation?.role || teacher?.role;
  if (!teacher || !affiliation?.schoolId || !["school_admin", "platform_admin"].includes(String(role))) {
    return <Navigate to="/admin" replace />;
  }
  return children;
}
