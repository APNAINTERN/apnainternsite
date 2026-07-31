import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  UploadCloud,
  Loader2,
  Trash2,
  ExternalLink,
  FileText,
  RefreshCw,
  Search,
  Pencil,
} from "lucide-react";
import {
  ClassTargetFilters,
  ClassTargetStudent,
  collegesForUniversityNames,
  countStudentsForClassTargets,
  emptyClassTargetFilters,
  pruneCollegesForUniversities,
  rowMatchesAudienceListFilters,
} from "@/lib/classLinkTargeting";
import { InternshipModeFilterSelect } from "@/components/admin/InternshipModeFilterSelect";
import { MultiSelectCheckboxGroup } from "@/components/admin/MultiSelectCheckboxGroup";
import {
  LearningMaterialRow,
  LearningMaterialType,
  deleteLearningMaterial,
  describeMaterialTargets,
  fetchLearningMaterials,
  insertLearningMaterial,
  learningMaterialTypeLabel,
  rowToTargetFilters,
  setLearningMaterialActive,
  updateLearningMaterial,
} from "@/lib/learningMaterialsApi";

type Props = {
  unis: { id: string; name: string }[];
  colleges: { id: string; name: string; university_id: string }[];
  domains: { id: string; name: string }[];
  currentUserId?: string;
  isActive?: boolean;
  studentsForTargeting?: ClassTargetStudent[];
};

const emptyFilters = emptyClassTargetFilters();

export function LearningMaterialsPanel({
  unis,
  colleges,
  domains,
  currentUserId,
  isActive = true,
  studentsForTargeting = [],
}: Props) {
  const [rows, setRows] = useState<LearningMaterialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [materialType, setMaterialType] = useState<LearningMaterialType>("learning_material");
  const [file, setFile] = useState<File | null>(null);
  const [filters, setFilters] = useState<ClassTargetFilters>(emptyFilters);
  const [listSearch, setListSearch] = useState("");
  const [listFilters, setListFilters] = useState<ClassTargetFilters>(emptyFilters);
  const [listTypeFilter, setListTypeFilter] = useState<"all" | LearningMaterialType>("all");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingRecipientCount, setPendingRecipientCount] = useState(0);
  const [editingRow, setEditingRow] = useState<LearningMaterialRow | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editMaterialType, setEditMaterialType] = useState<LearningMaterialType>("learning_material");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editFilters, setEditFilters] = useState<ClassTargetFilters>(emptyFilters);
  const [updating, setUpdating] = useState(false);

  const collegeOptions = useMemo(
    () => collegesForUniversityNames(colleges, unis, filters.universities),
    [colleges, unis, filters.universities]
  );

  const listCollegeOptions = useMemo(
    () => collegesForUniversityNames(colleges, unis, listFilters.universities),
    [colleges, unis, listFilters.universities]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchLearningMaterials(supabase);
      setRows(data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load uploads");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isActive) void load();
  }, [isActive, load]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (listTypeFilter !== "all" && row.material_type !== listTypeFilter) return false;

      const pseudoRow = {
        title: row.title,
        target_universities: row.target_universities,
        target_colleges: row.target_colleges,
        target_domains: row.target_domains,
        target_modes: row.target_modes,
      };

      return rowMatchesAudienceListFilters(pseudoRow, listFilters, listSearch);
    });
  }, [rows, listSearch, listFilters, listTypeFilter]);

  const recipientCount = useMemo(
    () =>
      countStudentsForClassTargets(studentsForTargeting, filters, { colleges, unis }),
    [studentsForTargeting, filters, colleges, unis]
  );

  const requestPublish = () => {
    if (!title.trim()) return toast.error("Enter a title");
    if (!file) return toast.error("Choose a file to upload");
    if (!currentUserId) return toast.error("Sign in again to upload");
    setPendingRecipientCount(recipientCount);
    setConfirmOpen(true);
  };

  const handleUpload = async () => {
    if (!title.trim() || !file || !currentUserId) return;
    setConfirmOpen(false);
    setUploading(true);
    try {
      await insertLearningMaterial(supabase, {
        title,
        description,
        materialType,
        file,
        filters,
        createdBy: currentUserId,
      });
      toast.success(`Upload published to ${recipientCount} matching student(s)`);
      setTitle("");
      setDescription("");
      setFile(null);
      setFilters(emptyClassTargetFilters());
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const toggleActive = async (row: LearningMaterialRow) => {
    try {
      await setLearningMaterialActive(supabase, row.id, !row.is_active);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const editCollegeOptions = useMemo(
    () => collegesForUniversityNames(colleges, unis, editFilters.universities),
    [colleges, unis, editFilters.universities]
  );

  const editRecipientCount = useMemo(
    () =>
      countStudentsForClassTargets(studentsForTargeting, editFilters, { colleges, unis }),
    [studentsForTargeting, editFilters, colleges, unis]
  );

  const startEdit = (row: LearningMaterialRow) => {
    setEditingRow(row);
    setEditTitle(row.title);
    setEditDescription(row.description || "");
    setEditMaterialType(row.material_type);
    setEditFile(null);
    setEditFilters(rowToTargetFilters(row));
  };

  const closeEdit = () => {
    setEditingRow(null);
    setEditTitle("");
    setEditDescription("");
    setEditMaterialType("learning_material");
    setEditFile(null);
    setEditFilters(emptyClassTargetFilters());
  };

  const handleUpdate = async () => {
    if (!editingRow || !editTitle.trim()) return toast.error("Enter a title");
    if (!currentUserId) return toast.error("Sign in again to update");
    setUpdating(true);
    try {
      await updateLearningMaterial(supabase, editingRow, {
        title: editTitle,
        description: editDescription,
        materialType: editMaterialType,
        filters: editFilters,
        file: editFile,
        updatedBy: currentUserId,
      });
      toast.success(
        editFile
          ? "Upload updated — file replaced for matching students."
          : "Upload details updated."
      );
      closeEdit();
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setUpdating(false);
    }
  };

  const remove = async (row: LearningMaterialRow) => {
    if (!confirm(`Delete "${row.title}"?`)) return;
    try {
      await deleteLearningMaterial(supabase, row);
      toast.success("Deleted");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <UploadCloud className="size-6 text-primary" />
          Uploads
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Publish learning materials and project report templates by university, college, domain, and mode.
        </p>
      </div>

      <Card className="p-6 border-none shadow-elegant space-y-5">
        <h3 className="font-bold text-sm uppercase tracking-wide text-muted-foreground">
          New upload
        </h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Week 1 notes" />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={materialType}
              onValueChange={(v) => setMaterialType(v as LearningMaterialType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="learning_material">Learning material</SelectItem>
                <SelectItem value="project_report">Project report</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 space-y-2">
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Short note for admins"
            />
          </div>
          <div className="md:col-span-2 space-y-2">
            <Label>File (PDF, DOC, DOCX, PPT, etc.)</Label>
            <Input
              type="file"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.zip,image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {file && (
              <p className="text-xs text-muted-foreground">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 pt-2 border-t">
          <MultiSelectCheckboxGroup
            label="Universities"
            options={unis}
            selectedValues={filters.universities}
            onChange={(universities) =>
              setFilters((f) => ({
                ...f,
                universities,
                colleges: pruneCollegesForUniversities(colleges, unis, universities, f.colleges),
              }))
            }
          />
          <MultiSelectCheckboxGroup
            label="Colleges"
            options={collegeOptions}
            selectedValues={filters.colleges}
            onChange={(collegesSelected) => setFilters((f) => ({ ...f, colleges: collegesSelected }))}
          />
          <div className="space-y-2">
            <Label>Domain</Label>
            <Select
              value={filters.domain}
              onValueChange={(domain) => setFilters((f) => ({ ...f, domain }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All domains</SelectItem>
                {domains.map((d) => (
                  <SelectItem key={d.id} value={d.name}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Mode</Label>
            <InternshipModeFilterSelect
              value={filters.mode}
              onValueChange={(mode) => setFilters((f) => ({ ...f, mode }))}
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {recipientCount} student{recipientCount === 1 ? "" : "s"} match the selected audience filters.
        </p>

        <Button
          className="gap-2 font-bold"
          disabled={uploading}
          onClick={requestPublish}
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
          Publish upload
        </Button>
      </Card>

      <Card className="border-none shadow-elegant overflow-hidden">
        <div className="p-4 border-b flex flex-col gap-4 bg-muted/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <FileText className="size-4" />
              Published files ({filteredRows.length})
            </h3>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
            <Input
              className="pl-8 h-9"
              placeholder="Search by title…"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
            />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={listTypeFilter} onValueChange={(v) => setListTypeFilter(v as "all" | LearningMaterialType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="learning_material">Notes / learning material</SelectItem>
                  <SelectItem value="project_report">Project report</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Domain</Label>
              <Select
                value={listFilters.domain}
                onValueChange={(domain) => setListFilters((f) => ({ ...f, domain }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All domains</SelectItem>
                  {domains.map((d) => (
                    <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <MultiSelectCheckboxGroup
              label="Universities"
              options={unis}
              selectedValues={listFilters.universities}
              onChange={(universities) =>
                setListFilters((f) => ({
                  ...f,
                  universities,
                  colleges: pruneCollegesForUniversities(colleges, unis, universities, f.colleges),
                }))
              }
            />
            <MultiSelectCheckboxGroup
              label="Colleges"
              options={listCollegeOptions}
              selectedValues={listFilters.colleges}
              onChange={(collegesSelected) =>
                setListFilters((f) => ({ ...f, colleges: collegesSelected }))
              }
            />
            <div className="space-y-2">
              <Label>Mode</Label>
              <InternshipModeFilterSelect
                value={listFilters.mode}
                onValueChange={(mode) => setListFilters((f) => ({ ...f, mode }))}
              />
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="self-start text-xs"
            onClick={() => {
              setListFilters(emptyClassTargetFilters());
              setListTypeFilter("all");
              setListSearch("");
            }}
          >
            Clear all filters
          </Button>
        </div>
        {loading && rows.length === 0 ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-bold text-sm">{row.title}</div>
                    {row.file_name && (
                      <div className="text-[10px] text-muted-foreground">{row.file_name}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[9px] uppercase">
                      {learningMaterialTypeLabel(row.material_type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                    {describeMaterialTargets(row)}
                  </TableCell>
                  <TableCell>
                    <Badge className={row.is_active ? "bg-green-600" : "bg-slate-400"}>
                      {row.is_active ? "Active" : "Hidden"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    {row.file_url && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={row.file_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="size-4" />
                        </a>
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => startEdit(row)} title="Update">
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void toggleActive(row)}>
                      {row.is_active ? "Hide" : "Show"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => void remove(row)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    {listSearch.trim() ? "No matching uploads." : "No uploads yet."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish to {pendingRecipientCount} students?</AlertDialogTitle>
            <AlertDialogDescription>
              This upload will be visible only to students matching every selected filter
              (university, college, domain, and mode). Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleUpload()}>
              Publish to {pendingRecipientCount} students
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!editingRow} onOpenChange={(open) => { if (!open) closeEdit(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Update upload</DialogTitle>
            <DialogDescription>
              Fix a wrong file, title, type, or audience. Choose a new file only if you want to replace the current one.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={editMaterialType}
                  onValueChange={(v) => setEditMaterialType(v as LearningMaterialType)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="learning_material">Learning material</SelectItem>
                    <SelectItem value="project_report">Project report</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Replace file (optional)</Label>
              {editingRow?.file_name && (
                <p className="text-xs text-muted-foreground">
                  Current: <span className="font-medium">{editingRow.file_name}</span>
                </p>
              )}
              <Input
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.zip,image/*"
                onChange={(e) => setEditFile(e.target.files?.[0] || null)}
              />
              {editFile && (
                <p className="text-xs text-green-700">
                  New file: {editFile.name} · {(editFile.size / 1024).toFixed(0)} KB
                </p>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t">
              <MultiSelectCheckboxGroup
                label="Universities"
                options={unis}
                selectedValues={editFilters.universities}
                onChange={(universities) =>
                  setEditFilters((f) => ({
                    ...f,
                    universities,
                    colleges: pruneCollegesForUniversities(colleges, unis, universities, f.colleges),
                  }))
                }
              />
              <MultiSelectCheckboxGroup
                label="Colleges"
                options={editCollegeOptions}
                selectedValues={editFilters.colleges}
                onChange={(collegesSelected) =>
                  setEditFilters((f) => ({ ...f, colleges: collegesSelected }))
                }
              />
              <div className="space-y-2">
                <Label>Domain</Label>
                <Select
                  value={editFilters.domain}
                  onValueChange={(domain) => setEditFilters((f) => ({ ...f, domain }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All domains</SelectItem>
                    {domains.map((d) => (
                      <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Mode</Label>
                <InternshipModeFilterSelect
                  value={editFilters.mode}
                  onValueChange={(mode) => setEditFilters((f) => ({ ...f, mode }))}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {editRecipientCount} student{editRecipientCount === 1 ? "" : "s"} match the selected audience.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeEdit} disabled={updating}>
              Cancel
            </Button>
            <Button className="gap-2" onClick={() => void handleUpdate()} disabled={updating}>
              {updating ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
