import { useMemo } from "react";
import { useProfile } from "@/hooks/useProfile";
import { membershipStatus } from "@/lib/membership";

/** Är användaren medlem just nu, och till när? Räknas ur profilen (src/lib/membership.ts). */
export function useMembership() {
  const { data: profile, isLoading } = useProfile();
  const status = useMemo(() => membershipStatus(profile), [profile]);
  return { ...status, isMember: status.active, isLoading };
}
