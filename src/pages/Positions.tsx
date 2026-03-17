import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonTable } from "@/components/shared/SkeletonTable";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { usePositions, useCreatePosition, useUpdatePosition, useDeletePosition } from "@/hooks/usePositions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, GripVertical, Pencil, Check, X } from "lucide-react";

const Positions = () => {
  const { data: currentAgent } = useCurrentAgent();
  const { data: positions, isLoading, error, refetch } = usePositions();
  const createPosition = useCreatePosition();
  const updatePosition = useUpdatePosition();
  const deletePosition = useDeletePosition();
  const isOwner = currentAgent?.is_owner ?? false;

  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState("0");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPriority, setEditPriority] = useState("");

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    createPosition.mutate(
      { title: newTitle.trim(), priority: parseInt(newPriority) || 0 },
      { onSuccess: () => { setNewTitle(""); setNewPriority("0"); } }
    );
  };

  const startEdit = (id: string, title: string, priority: number) => {
    setEditingId(id);
    setEditTitle(title);
    setEditPriority(String(priority));
  };

  const handleEditSave = () => {
    if (!editingId || !editTitle.trim()) return;
    updatePosition.mutate(
      { id: editingId, title: editTitle.trim(), priority: parseInt(editPriority) || 0 },
      { onSuccess: () => setEditingId(null) }
    );
  };

  const handleDelete = (id: string, title: string) => {
    if (!confirm(`Delete position "${title}"?`)) return;
    deletePosition.mutate(id);
  };

  if (error) return <AppLayout><ErrorBanner message={(error as Error).message} onRetry={refetch} /></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Positions</h1>
        <p className="text-sm text-muted-foreground">
          Manage agent position titles. These are used across the platform in agent profiles, commission levels, and imports.
        </p>

        {isOwner && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Add New Position</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label className="text-xs">Title</Label>
                  <Input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Senior Agent"
                    className="h-8 text-sm"
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  />
                </div>
                <div className="w-24">
                  <Label className="text-xs">Priority</Label>
                  <Input
                    type="number"
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <Button size="sm" onClick={handleAdd} disabled={createPosition.isPending || !newTitle.trim()}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {createPosition.isPending ? "Adding..." : "Add"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <SkeletonTable columns={3} />
        ) : !positions || positions.length === 0 ? (
          <EmptyState
            title="No positions defined"
            description="Add position titles to standardize agent hierarchies."
            action={isOwner ? { label: "Add Position", onClick: () => document.querySelector<HTMLInputElement>('[placeholder="e.g. Senior Agent"]')?.focus() } : undefined}
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead className="w-24">Priority</TableHead>
                    {isOwner && <TableHead className="w-24">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.map((pos) => (
                    <TableRow key={pos.id}>
                      <TableCell className="w-8 px-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                      {editingId === pos.id ? (
                        <>
                          <TableCell>
                            <Input
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="h-7 text-sm"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleEditSave();
                                if (e.key === "Escape") setEditingId(null);
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editPriority}
                              onChange={(e) => setEditPriority(e.target.value)}
                              className="h-7 w-16 text-sm"
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleEditSave}>
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="font-medium">{pos.title}</TableCell>
                          <TableCell className="text-muted-foreground">{pos.priority}</TableCell>
                          {isOwner && (
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => startEdit(pos.id, pos.title, pos.priority)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => handleDelete(pos.id, pos.title)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default Positions;
