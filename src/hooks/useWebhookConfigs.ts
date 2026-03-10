import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { toast } from "sonner";

export interface WebhookConfig {
  id: string;
  tenant_id: string;
  webhook_url: string;
  event_type: string;
  is_active: boolean;
  created_at: string;
}

export function useWebhookConfigs() {
  const { data: currentAgent } = useCurrentAgent();
  return useQuery({
    queryKey: ["webhookConfigs", currentAgent?.tenant_id],
    queryFn: async (): Promise<WebhookConfig[]> => {
      if (!currentAgent) return [];
      const { data, error } = await supabase
        .from("webhook_configs")
        .select("*")
        .eq("tenant_id", currentAgent.tenant_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as WebhookConfig[];
    },
    enabled: !!currentAgent,
  });
}

export function useCreateWebhook() {
  const queryClient = useQueryClient();
  const { data: currentAgent } = useCurrentAgent();

  return useMutation({
    mutationFn: async (params: { webhook_url: string; event_type: string; is_active: boolean }) => {
      if (!currentAgent) throw new Error("Not authenticated");
      const { error } = await supabase.from("webhook_configs").insert({
        tenant_id: currentAgent.tenant_id,
        webhook_url: params.webhook_url,
        event_type: params.event_type,
        is_active: params.is_active,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhookConfigs"] });
      toast.success("Webhook created");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("webhook_configs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhookConfigs"] });
      toast.success("Webhook deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
