import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuthStore } from "@/stores/auth";
import { canManageTeachingProfiles } from "@/lib/teaching-profile-permissions";

export function RequireTeachingProfileManager({ children }: { children: ReactNode }) {
  const { teacher, getCurrentAffiliation } = useAuthStore();
  const affiliation = getCurrentAffiliation();
  if (!teacher || !affiliation?.schoolId || !canManageTeachingProfiles(teacher, affiliation)) {
    return <Navigate to="/admin" replace />;
  }
  return children;
}
