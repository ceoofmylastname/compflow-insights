import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useAgents } from "@/hooks/useAgents";
import { usePolicies, getPoliciesArray, type Policy } from "@/hooks/usePolicies";
import { supabase } from "@/integrations/supabase/client";
import { calculateAndSavePayouts } from "@/lib/commission-engine";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { addDays, isValid, parseISO } from "date-fns";
import { useCarrierOptions } from "@/hooks/useCarrierOptions";
import { QUERY_KEYS } from "@/lib/query-keys";

interface PostDealModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * If provided, the modal opens in edit mode for that policy. Used by the
   * Drafts page to edit an existing draft. Save updates the row in place
   * rather than creating a new one.
   */
  editingPolicy?: Policy | null;
}

const STATUSES = ["Draft", "Submitted", "Pending", "Active", "Terminated"] as const;
type PolicyStatus = (typeof STATUSES)[number];
const CONTRACT_TYPES = ["Direct Pay", "LOA"];
const LEAD_SOURCES = ["Provided", "Purchased", "Referral", "Self-Generated", "Other"];

interface FormErrors {
  [key: string]: string;
}

export function PostDealModal({ open, onOpenChange, editingPolicy }: PostDealModalProps) {
  const { data: currentAgent } = useCurrentAgent();
  const { data: agents } = useAgents();
  const { data: allPoliciesRaw } = usePolicies({});
  const allPolicies = getPoliciesArray(allPoliciesRaw);
  const queryClient = useQueryClient();

  const [policyNumber, setPolicyNumber] = useState("");
  const [applicationDate, setApplicationDate] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientDob, setClientDob] = useState("");
  const [carrier, setCarrier] = useState("");
  const [product, setProduct] = useState("");
  const [annualPremium, setAnnualPremium] = useState("");
  const [status, setStatus] = useState<PolicyStatus>("Draft");
  const [contractType, setContractType] = useState("");
  const [leadSource, setLeadSource] = useState("");
  const [writingAgentId, setWritingAgentId] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [notes, setNotes] = useState("");
  const [refsCollected, setRefsCollected] = useState("");
  const [refsSold, setRefsSold] = useState("");
  const [modalPremium, setModalPremium] = useState("");
  const [billingInterval, setBillingInterval] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const isOwner = currentAgent?.is_owner ?? false;
  const isEditMode = !!editingPolicy;
  const isDraft = status === "Draft";

  // Populate from editingPolicy when it changes (edit mode entry).
  useEffect(() => {
    if (!editingPolicy) return;
    setPolicyNumber(editingPolicy.policy_number ?? "");
    setApplicationDate(editingPolicy.application_date ?? "");
    setClientName(editingPolicy.client_name ?? "");
    setClientPhone(editingPolicy.client_phone ?? "");
    setClientDob(editingPolicy.client_dob ?? "");
    setCarrier(editingPolicy.carrier ?? "");
    setProduct(editingPolicy.product ?? "");
    setAnnualPremium(
      editingPolicy.annual_premium != null ? String(editingPolicy.annual_premium) : ""
    );
    setStatus(((editingPolicy.status as PolicyStatus) ?? "Draft") as PolicyStatus);
    setContractType(editingPolicy.contract_type ?? "");
    setLeadSource(editingPolicy.lead_source ?? "");
    setEffectiveDate(editingPolicy.effective_date ?? "");
    setNotes(editingPolicy.notes ?? "");
    setRefsCollected(
      editingPolicy.refs_collected != null ? String(editingPolicy.refs_collected) : ""
    );
    setRefsSold(
      editingPolicy.refs_sold != null ? String(editingPolicy.refs_sold) : ""
    );
    setModalPremium(
      editingPolicy.modal_premium != null ? String(editingPolicy.modal_premium) : ""
    );
    setBillingInterval(editingPolicy.billing_interval ?? "");
    setWritingAgentId(editingPolicy.resolved_agent_id ?? "");
    setErrors({});
  }, [editingPolicy]);

  // Find existing custom fields if editing or matching policy_number
  const existingCustomFields = useMemo(() => {
    if (editingPolicy?.custom_fields && typeof editingPolicy.custom_fields === "object" && !Array.isArray(editingPolicy.custom_fields)) {
      const cf = editingPolicy.custom_fields as Record<string, string>;
      if (Object.keys(cf).length > 0) return cf;
    }
    if (!policyNumber.trim()) return null;
    const existing = allPolicies.find(
      (p) => p.policy_number === policyNumber.trim()
    );
    if (!existing?.custom_fields || typeof existing.custom_fields !== "object" || Array.isArray(existing.custom_fields)) return null;
    const cf = existing.custom_fields as Record<string, string>;
    return Object.keys(cf).length > 0 ? cf : null;
  }, [policyNumber, allPolicies, editingPolicy]);

  const { carriers, products: getProducts } = useCarrierOptions();

  /**
   * Validation rules differ by status.
   *  - Draft: only client_name is required (it's a scratchpad).
   *  - Any other status: full required set per Wiki/book-of-business-page.md.
   */
  const validate = (targetStatus: PolicyStatus): FormErrors => {
    const errs: FormErrors = {};
    if (targetStatus === "Draft") {
      if (!clientName.trim()) errs.clientName = "Client name is required, even on drafts";
      return errs;
    }
    if (!policyNumber.trim()) errs.policyNumber = "Policy number is required";
    if (!applicationDate) {
      errs.applicationDate = "Application date is required";
    } else {
      const d = parseISO(applicationDate);
      if (!isValid(d)) {
        errs.applicationDate = "Invalid date";
      } else if (d > addDays(new Date(), 90)) {
        errs.applicationDate = "Cannot be more than 90 days in the future";
      }
    }
    if (!clientName.trim()) errs.clientName = "Client name is required";
    if (!carrier.trim()) errs.carrier = "Carrier is required";
    if (!product.trim()) errs.product = "Product is required";
    const prem = parseFloat(annualPremium);
    if (!annualPremium || isNaN(prem) || prem <= 0) {
      errs.annualPremium = "Annual premium must be greater than 0";
    }
    if (!contractType) errs.contractType = "Contract type is required";
    return errs;
  };

  const resetForm = () => {
    setPolicyNumber("");
    setApplicationDate("");
    setClientName("");
    setClientPhone("");
    setClientDob("");
    setCarrier("");
    setProduct("");
    setAnnualPremium("");
    setStatus("Draft");
    setContractType("");
    setLeadSource("");
    setWritingAgentId("");
    setEffectiveDate("");
    setNotes("");
    setRefsCollected("");
    setRefsSold("");
    setModalPremium("");
    setBillingInterval("");
    setErrors({});
  };

  const handleSave = async () => {
    const validationErrors = validate(status);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});

    if (!currentAgent) return;
    setSubmitting(true);

    try {
      const resolvedAgentId =
        isOwner && writingAgentId ? writingAgentId : currentAgent.id;
      const isStatusDraft = status === "Draft";

      // Common payload. Many fields can be empty on a draft.
      const payload: Record<string, unknown> = {
        tenant_id: currentAgent.tenant_id,
        policy_number: policyNumber.trim() || (isStatusDraft ? `DRAFT-${Date.now()}` : ""),
        application_date: applicationDate || (isStatusDraft ? new Date().toISOString().split("T")[0] : null),
        client_name: clientName.trim(),
        client_phone: clientPhone.trim() || null,
        client_dob: clientDob || null,
        carrier: carrier.trim() || null,
        product: product.trim() || null,
        annual_premium: annualPremium ? parseFloat(annualPremium) : 0,
        status,
        contract_type: contractType || null,
        lead_source: leadSource || null,
        effective_date: effectiveDate || null,
        notes: notes.trim() || null,
        refs_collected: refsCollected ? parseInt(refsCollected, 10) : 0,
        refs_sold: refsSold ? parseInt(refsSold, 10) : 0,
        modal_premium: modalPremium ? parseFloat(modalPremium) : null,
        billing_interval: billingInterval || null,
        resolved_agent_id: resolvedAgentId,
        // Keep is_draft synced with status for backward compat with code paths
        // that haven't migrated to the status-based check.
        is_draft: isStatusDraft,
        draft_saved_at: isStatusDraft ? new Date().toISOString() : null,
      };

      let savedPolicy: { id: string; status: string } | null = null;
      let saveError: { message: string } | null = null;

      if (editingPolicy?.id) {
        const { data, error } = await supabase
          .from("policies")
          .update(payload as any)
          .eq("id", editingPolicy.id)
          .select("id, status")
          .single();
        savedPolicy = data as { id: string; status: string } | null;
        saveError = error;
      } else {
        const { data, error } = await supabase
          .from("policies")
          .upsert(payload as any, { onConflict: "policy_number,tenant_id", ignoreDuplicates: false })
          .select("id, status")
          .single();
        savedPolicy = data as { id: string; status: string } | null;
        saveError = error;
      }

      if (saveError) {
        toast.error(`Failed to save: ${saveError.message}`);
        setSubmitting(false);
        return;
      }

      // Drafts skip downstream effects entirely (no commissions, no webhooks).
      if (savedPolicy && !isStatusDraft) {
        try {
          await calculateAndSavePayouts(savedPolicy.id, supabase);
        } catch {}

        if (status === "Active") {
          const { data: activeWebhooks } = await supabase
            .from("webhook_configs")
            .select("*")
            .eq("tenant_id", currentAgent.tenant_id)
            .eq("is_active", true)
            .eq("event_type", "deal.posted" as any);

          const webhooks = (activeWebhooks ?? []) as Array<{ webhook_url: string }>;
          const agent = agents?.find((a) => a.id === resolvedAgentId);

          for (const config of webhooks) {
            try {
              await supabase.functions.invoke("fire-webhook", {
                body: {
                  webhook_url: config.webhook_url,
                  payload: {
                    event: "deal.posted",
                    policy_number: policyNumber.trim(),
                    client_name: clientName.trim(),
                    carrier: carrier.trim(),
                    product: product.trim(),
                    annual_premium: parseFloat(annualPremium),
                    agent_email: agent?.email || "",
                    application_date: applicationDate,
                    status,
                  },
                },
              });
            } catch {}
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ["policies"] });
      queryClient.invalidateQueries({ queryKey: ["commissionPayouts"] });
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.drafts] });

      toast.success(
        isStatusDraft
          ? "Saved as draft"
          : isEditMode
          ? "Policy updated"
          : "Deal posted"
      );
      resetForm();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Failed to save: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetForm();
      }}
    >
      <DialogContent
        className="
          w-screen h-[100dvh] max-w-none max-h-none rounded-none p-4 gap-3
          md:w-auto md:h-auto md:max-w-lg md:max-h-[85vh] md:rounded-lg md:p-6 md:gap-4
          overflow-y-auto
        "
      >
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit Draft" : "Post a Deal"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status — driving validation. Draft is the default for new policies. */}
          <div>
            <Label>
              Status <span className="text-destructive">*</span>
            </Label>
            <Select value={status} onValueChange={(v) => setStatus(v as PolicyStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isDraft && (
              <p className="text-xs text-muted-foreground mt-1">
                Drafts stay private to you. They do not count toward billing, leaderboards, or commissions.
              </p>
            )}
          </div>

          {/* Policy Number */}
          <div>
            <Label>
              Policy Number {!isDraft && <span className="text-destructive">*</span>}
            </Label>
            <Input
              value={policyNumber}
              onChange={(e) => setPolicyNumber(e.target.value)}
              placeholder="e.g. POL-12345"
            />
            {errors.policyNumber && (
              <p className="text-xs text-destructive mt-1">{errors.policyNumber}</p>
            )}
          </div>

          {/* Application Date */}
          <div>
            <Label>
              Application Date {!isDraft && <span className="text-destructive">*</span>}
            </Label>
            <Input
              type="date"
              value={applicationDate}
              onChange={(e) => setApplicationDate(e.target.value)}
            />
            {errors.applicationDate && (
              <p className="text-xs text-destructive mt-1">{errors.applicationDate}</p>
            )}
          </div>

          {/* Client Name */}
          <div>
            <Label>
              Client Name <span className="text-destructive">*</span>
            </Label>
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="John Doe"
            />
            {errors.clientName && (
              <p className="text-xs text-destructive mt-1">{errors.clientName}</p>
            )}
          </div>

          {/* Client Phone */}
          <div>
            <Label>Client Phone</Label>
            <Input
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              placeholder="(555) 123-4567"
            />
          </div>

          {/* Client DOB */}
          <div>
            <Label>Client Date of Birth</Label>
            <Input
              type="date"
              value={clientDob}
              onChange={(e) => setClientDob(e.target.value)}
            />
          </div>

          {/* Carrier */}
          <div>
            <Label>
              Carrier {!isDraft && <span className="text-destructive">*</span>}
            </Label>
            {carriers.length > 0 ? (
              <Select value={carrier} onValueChange={(v) => { setCarrier(v); setProduct(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select carrier" />
                </SelectTrigger>
                <SelectContent>
                  {carriers.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="Enter carrier name"
              />
            )}
            {errors.carrier && (
              <p className="text-xs text-destructive mt-1">{errors.carrier}</p>
            )}
          </div>

          {/* Product */}
          <div>
            <Label>
              Product {!isDraft && <span className="text-destructive">*</span>}
            </Label>
            {carrier && getProducts(carrier).length > 0 ? (
              <Select value={product} onValueChange={setProduct}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {getProducts(carrier).map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder="Enter product name"
              />
            )}
            {errors.product && (
              <p className="text-xs text-destructive mt-1">{errors.product}</p>
            )}
          </div>

          {/* Annual Premium */}
          <div>
            <Label>
              Annual Premium {!isDraft && <span className="text-destructive">*</span>}
            </Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={annualPremium}
              onChange={(e) => setAnnualPremium(e.target.value)}
              placeholder="0.00"
            />
            {errors.annualPremium && (
              <p className="text-xs text-destructive mt-1">{errors.annualPremium}</p>
            )}
          </div>

          {/* Contract Type */}
          <div>
            <Label>
              Contract Type {!isDraft && <span className="text-destructive">*</span>}
            </Label>
            <Select value={contractType} onValueChange={setContractType}>
              <SelectTrigger>
                <SelectValue placeholder="Select contract type" />
              </SelectTrigger>
              <SelectContent>
                {CONTRACT_TYPES.map((ct) => (
                  <SelectItem key={ct} value={ct}>{ct}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.contractType && (
              <p className="text-xs text-destructive mt-1">{errors.contractType}</p>
            )}
          </div>

          {/* Lead Source */}
          <div>
            <Label>Lead Source</Label>
            <Select value={leadSource} onValueChange={setLeadSource}>
              <SelectTrigger>
                <SelectValue placeholder="Select lead source (optional)" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_SOURCES.map((ls) => (
                  <SelectItem key={ls} value={ls}>{ls}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Effective Date */}
          <div>
            <Label>Effective Date</Label>
            <Input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </div>

          {/* Modal Premium & Billing Interval */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Modal Premium</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={modalPremium}
                onChange={(e) => setModalPremium(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Billing Interval</Label>
              <Select value={billingInterval} onValueChange={setBillingInterval}>
                <SelectTrigger>
                  <SelectValue placeholder="Select interval" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Monthly">Monthly</SelectItem>
                  <SelectItem value="Quarterly">Quarterly</SelectItem>
                  <SelectItem value="Semi-Annual">Semi-Annual</SelectItem>
                  <SelectItem value="Annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Refs Collected & Refs Sold */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Refs Collected</Label>
              <Input
                type="number"
                min="0"
                value={refsCollected}
                onChange={(e) => setRefsCollected(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <Label>Refs Sold</Label>
              <Input
                type="number"
                min="0"
                value={refsSold}
                onChange={(e) => setRefsSold(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label>Notes</Label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this deal"
            />
          </div>

          {/* Writing Agent (owner only) */}
          {isOwner && (
            <div>
              <Label>Writing Agent</Label>
              <Select
                value={writingAgentId || currentAgent?.id || ""}
                onValueChange={setWritingAgentId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select agent" />
                </SelectTrigger>
                <SelectContent>
                  {(agents ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.first_name} {a.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Existing custom fields (read-only) */}
          {existingCustomFields && (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-sm font-medium mb-2">Carrier Data (from import)</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
                {Object.entries(existingCustomFields).map(([key, value]) => (
                  <div key={key} className="flex gap-2 text-sm">
                    <span className="text-muted-foreground shrink-0">{key}:</span>
                    <span className="text-foreground">{value || "(empty)"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleSave}
            disabled={submitting}
          >
            {submitting
              ? "Saving..."
              : isDraft
              ? "Save Draft"
              : isEditMode
              ? "Save Changes"
              : "Post Deal"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
