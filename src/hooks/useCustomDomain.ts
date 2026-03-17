import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "./useCurrentAgent";
import { toast } from "sonner";

type DomainAction = "add" | "verify" | "remove";

export function useCustomDomain() {
  const { data: currentAgent } = useCurrentAgent();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      action,
      hostname,
    }: {
      action: DomainAction;
      hostname?: string;
    }) => {
      if (!currentAgent) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke(
        "manage-custom-domain",
        {
          body: {
            action,
            hostname,
            tenant_id: currentAgent.tenant_id,
          },
        }
      );

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Domain operation failed");
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["tenant"] });
      queryClient.invalidateQueries({ queryKey: ["tenantFromDomain"] });
      if (variables.action === "add")
        toast.success("Domain registered. Add the DNS records below.");
      if (variables.action === "verify")
        toast.success("Verification check complete.");
      if (variables.action === "remove")
        toast.success("Custom domain removed.");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
