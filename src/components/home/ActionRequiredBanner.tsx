import { useUserActionItems, useDismissActionItem } from "@/hooks/useHomePage";
import { Button } from "@/components/ui/button";
import { AlertCircle, X, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * Sticky action-required banner row at the top of the home page per
 * Wiki/home-page-and-announcements.md. Auto-dismiss is handled by
 * useUserActionItems (see lazy auto-resolve sweep). Manual dismiss is
 * available for items where is_dismissible=true.
 */
export function ActionRequiredBanner() {
  const { data: items } = useUserActionItems();
  const dismiss = useDismissActionItem();

  if (!items || items.length === 0) return null;

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 p-3 flex items-start gap-3"
        >
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{item.title}</p>
            {item.body && <p className="text-xs text-muted-foreground mt-0.5">{item.body}</p>}
            {item.cta_url && (
              <Link
                to={item.cta_url}
                className="text-xs text-primary underline mt-1 inline-flex items-center gap-1"
              >
                {item.cta_text || "Open"} <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
          {item.is_dismissible && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => dismiss.mutate(item.id)}
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
