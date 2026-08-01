import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuthStore } from "@/stores/auth";
import { canManageSchoolExams } from "@/lib/exam-permissions";

export function RequireExamManager({ children }: { children: ReactNode }) {
  const { teacher, getCurrentAffiliation } = useAuthStore();
  if (!teacher) return <Navigate to="/login" replace />;
  const affiliation = getCurrentAffiliation();
  if (!canManageSchoolExams(teacher, affiliation)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
