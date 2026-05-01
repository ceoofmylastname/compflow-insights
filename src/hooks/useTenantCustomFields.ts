import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";

export type CustomFieldDataType =
  | "text"
  | "number"
  | "currency"
  | "date"
  | "boolean"
  | "email"
  | "phone";

export type CustomFieldAppliesTo =
  | "policies"
  | "agents"
  | "commission_levels"
  | "all";

export interface TenantCustomField {
  id: string;
  tenant_id: string;
  field_key: string;
  field_label: string;
  data_type: CustomFieldDataType;
  required: boolean;
  applies_to: CustomFieldAppliesTo;
  visible_in_dashboard: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const QK = ["tenantCustomFields"] as const;

/**
 * Read the tenant's custom-field registry. When `appliesTo` is provided, the
 * result is narrowed to fields targeting that table (plus 'all' which
 * implicitly matches every target).
 */
export function useTenantCustomFields(appliesTo?: CustomFieldAppliesTo) {
  const { data: currentAgent } = useCurrentAgent();

  return useQuery({
    queryKey: [...QK, currentAgent?.tenant_id, appliesTo ?? "all-scopes"],
    queryFn: async (): Promise<TenantCustomField[]> => {
      if (!currentAgent?.tenant_id) return [];
      let query = supabase
        .from("tenant_custom_fields" as any)
        .select("*")
        .eq("tenant_id", currentAgent.tenant_id);

      if (appliesTo && appliesTo !== "all") {
        // 'all' rows match every target; filter accepts the requested target plus 'all'.
        query = query.in("applies_to", [appliesTo, "all"]);
      }

      const { data, error } = await query.order("field_label");
      if (error) throw error;
      return (data ?? []) as unknown as TenantCustomField[];
    },
    enabled: !!currentAgent?.tenant_id,
    staleTime: 30 * 1000,
  });
}

interface CreateInput {
  field_label: string;
  field_key: string;
  data_type: CustomFieldDataType;
  required: boolean;
  applies_to: CustomFieldAppliesTo;
  visible_in_dashboard: boolean;
}

export function useCreateCustomField() {
  const queryClient = useQueryClient();
  const { data: currentAgent } = useCurrentAgent();

  return useMutation({
    mutationFn: async (input: CreateInput) => {
      if (!currentAgent) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("tenant_custom_fields" as any)
        .insert({
          tenant_id: currentAgent.tenant_id,
          field_key: input.field_key,
          field_label: input.field_label,
          data_type: input.data_type,
          required: input.required,
          applies_to: input.applies_to,
          visible_in_dashboard: input.visible_in_dashboard,
          created_by: currentAgent.auth_user_id,
        } as any)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as TenantCustomField;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK });
      toast.success("Custom field created");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

interface UpdateInput {
  id: string;
  field_label?: string;
  data_type?: CustomFieldDataType;
  required?: boolean;
  applies_to?: CustomFieldAppliesTo;
  visible_in_dashboard?: boolean;
}

export function useUpdateCustomField() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateInput) => {
      const { id, ...updates } = input;
      const { error } = await supabase
        .from("tenant_custom_fields" as any)
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK });
      toast.success("Custom field updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteCustomField() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("tenant_custom_fields" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK });
      toast.success("Custom field deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

/**
 * Auto-generate a snake_case field key from a human-readable label. Lowercases,
 * replaces non-alphanumeric runs with single underscores, trims leading/trailing
 * underscores. Used by the Settings UI to suggest a key as the owner types
 * the label; remains user-editable.
 */
export function generateFieldKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
