import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
      <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
      <p className="flex-1 text-sm text-destructive">
        Something went wrong — {message}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  );
}
