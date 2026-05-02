import { useState } from "react";
import {
  useLeadershipBroadcasts,
  useCreateBroadcast,
  useDeactivateBroadcast,
  useIsOwnerOrManager,
} from "@/hooks/useHomePage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Megaphone, Plus, X, ExternalLink } from "lucide-react";

/**
 * Leadership broadcasts panel per Wiki/home-page-and-announcements.md §3.
 * Owner / manager (anyone with at least one downline) can post a flyer
 * with title, body (markdown), optional image URL, optional CTA URL,
 * and a schedule. Visible to everyone in the tenant for now (targeting
 * narrows it to specific positions when set on the row).
 */
export function LeadershipBroadcastsPanel() {
  const { data: broadcasts } = useLeadershipBroadcasts();
  const canPost = useIsOwnerOrManager();
  const [composerOpen, setComposerOpen] = useState(false);
  const deactivate = useDeactivateBroadcast();

  return (
    <div className="card-elevated p-5 animate-slide-up">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-2">
            <Megaphone className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Announcements</h3>
            <p className="text-xs text-muted-foreground">
              Flyers and updates from leadership.
            </p>
          </div>
        </div>
        {canPost && (
          <Button size="sm" variant="outline" onClick={() => setComposerOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Post
          </Button>
        )}
      </div>

      {!broadcasts || broadcasts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No active announcements.</p>
      ) : (
        <div className="space-y-3">
          {broadcasts.map((b) => (
            <div
              key={b.id}
              className="rounded-md border border-border bg-card p-3 flex flex-col sm:flex-row gap-3"
            >
              {b.image_url && (
                <img
                  src={b.image_url}
                  alt=""
                  className="h-20 w-full sm:w-28 object-cover rounded-md shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{b.title}</p>
                  {canPost && (
                    <button
                      type="button"
                      onClick={() => deactivate.mutate(b.id)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      aria-label="Remove broadcast"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {b.body && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{b.body}</p>}
                {b.cta_url && (
                  <a
                    href={b.cta_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary underline mt-2 inline-flex items-center gap-1"
                  >
                    {b.cta_text || "Learn more"} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <BroadcastComposer open={composerOpen} onOpenChange={setComposerOpen} />
    </div>
  );
}

function BroadcastComposer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateBroadcast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [endAt, setEndAt] = useState("");

  const handlePost = () => {
    if (!title.trim()) return;
    create.mutate(
      {
        title: title.trim(),
        body: body.trim() || undefined,
        image_url: imageUrl.trim() || undefined,
        cta_text: ctaText.trim() || undefined,
        cta_url: ctaUrl.trim() || undefined,
        end_at: endAt ? new Date(endAt).toISOString() : null,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setTitle(""); setBody(""); setImageUrl(""); setCtaText(""); setCtaUrl(""); setEndAt("");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Post an announcement</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Vegas conference registration" />
          </div>
          <div>
            <Label>Body (markdown supported)</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="Booking opens Friday. First-come, first-served."
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Image URL</Label>
              <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <Label>End date (optional)</Label>
              <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </div>
            <div>
              <Label>CTA label</Label>
              <Input value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder="Register now" />
            </div>
            <div>
              <Label>CTA URL</Label>
              <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://..." />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handlePost} disabled={!title.trim() || create.isPending}>
              {create.isPending ? "Posting..." : "Post"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
