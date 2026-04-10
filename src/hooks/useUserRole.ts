import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface UserRoleData {
  role: string;
  name: string | null;
}

export function useUserRole() {
  return useQuery({
    queryKey: ["user-role"],
    queryFn: async (): Promise<UserRoleData[]> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("user_roles")
        .select("role, name")
        .eq("user_id", user.id);

      if (error) throw error;
      return (data as UserRoleData[]) ?? [];
    },
  });
}

export function useIsBusiness() {
  const { data: roleData = [], ...rest } = useUserRole();
  const businessRole = roleData.find((r) => r.role === "business");
  return {
    isBusiness: !!businessRole,
    businessName: businessRole?.name || null,
    ...rest,
  };
}
