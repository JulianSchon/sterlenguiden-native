import { useMemo } from "react";
import { useProfile } from "@/hooks/useProfile";
import { membershipStatus } from "@/lib/membership";
import { usePreviewNonMember } from "@/lib/memberPreview";

/**
 * Är användaren medlem just nu, och till när? Räknas ur profilen (src/lib/membership.ts). I
 * testversionen kan man låtsas att man inte är medlem (lib/memberPreview).
 */
export function useMembership() {
  const { data: profile, isLoading } = useProfile();
  const preview = usePreviewNonMember();
  const status = useMemo(() => membershipStatus(preview ? null : profile), [profile, preview]);
  return { ...status, isMember: status.active, isLoading };
}
