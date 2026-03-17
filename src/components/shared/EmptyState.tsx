import CFLogo from "@/components/CFLogo";
import { Button } from "@/components/ui/button";
import { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="card-elevated flex flex-col items-center justify-center py-16 text-center animate-fade-in">
      <div className="rounded-2xl bg-primary/10 p-5">
        {icon || <CFLogo size="lg" className="opacity-60" />}
      </div>
      <h3 className="mt-5 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground max-w-md">{description}</p>
      {action && (
        <Button className="mt-5 btn-primary-elevated" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
