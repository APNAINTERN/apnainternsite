import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Award,
  Building2,
  FileText,
  Handshake,
  Loader2,
  MapPin,
  MessageSquareQuote,
  Pencil,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createExpertMember,
  createMou,
  createOfflineProgram,
  createTestimonial,
  deleteExpertMember,
  deleteMou,
  deleteOfflineProgram,
  deleteSampleCertificate,
  deleteTestimonial,
  fetchAdminExpertTeam,
  fetchAdminMous,
  fetchAdminOfflinePrograms,
  fetchAdminSampleCertificates,
  fetchAdminTestimonials,
  isPdfMime,
  replaceExpertPhoto,
  replaceMouLogo,
  replaceOfflineImage,
  replaceTestimonialPhoto,
  updateExpertMember,
  updateMou,
  updateOfflineProgram,
  updateSampleCertificate,
  updateTestimonial,
  uploadSampleCertificate,
  type SiteExpertMember,
  type SiteMou,
  type SiteOfflineProgram,
  type SiteSampleCertificate,
  type SiteTestimonial,
  type SocialLinks,
} from "@/lib/siteHomeCmsApi";

type Props = {
  client: SupabaseClient;
  currentUserId: string | null;
};

type TabProps = {
  client: SupabaseClient;
  currentUserId: string | null;
};

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? "default" : "secondary"} className="text-[10px]">
      {active ? "Active" : "Hidden"}
    </Badge>
  );
}

function SortActiveFields({
  sortOrder,
  isActive,
  onSortChange,
  onActiveChange,
  idPrefix,
}: {
  sortOrder: number;
  isActive: boolean;
  onSortChange: (v: number) => void;
  onActiveChange: (v: boolean) => void;
  idPrefix: string;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label>Sort order</Label>
        <Input
          type="number"
          value={sortOrder}
          onChange={(e) => onSortChange(Number(e.target.value))}
        />
      </div>
      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
        <Label htmlFor={`${idPrefix}-active`}>Show on homepage</Label>
        <Switch id={`${idPrefix}-active`} checked={isActive} onCheckedChange={onActiveChange} />
      </div>
    </>
  );
}

function SampleCertsTab({ client, currentUserId }: TabProps) {
  const [rows, setRows] = useState<SiteSampleCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [editRow, setEditRow] = useState<SiteSampleCertificate | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSort, setEditSort] = useState(0);
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchAdminSampleCertificates(client));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load sample certificates.");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = async () => {
    if (!file || !currentUserId) {
      toast.error("Choose a file and ensure you are signed in.");
      return;
    }
    setUploading(true);
    try {
      await uploadSampleCertificate(client, file, currentUserId, {
        title: title || file.name,
        description,
        sortOrder: rows.length,
      });
      toast.success("Sample certificate uploaded.");
      setTitle("");
      setDescription("");
      setFile(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const openEdit = (row: SiteSampleCertificate) => {
    setEditRow(row);
    setEditTitle(row.title || "");
    setEditDescription(row.description || "");
    setEditSort(row.sort_order ?? 0);
    setEditActive(row.is_active !== false);
  };

  const saveEdit = async () => {
    if (!editRow) return;
    setSaving(true);
    try {
      await updateSampleCertificate(client, editRow.id, {
        title: editTitle.trim() || editRow.title,
        description: editDescription.trim() || null,
        sort_order: Number(editSort) || 0,
        is_active: editActive,
      });
      toast.success("Sample certificate updated.");
      setEditRow(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: SiteSampleCertificate) => {
    if (!window.confirm(`Delete “${row.title || "certificate"}”?`)) return;
    try {
      await deleteSampleCertificate(client, row);
      toast.success("Certificate deleted.");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-800">Upload sample certificate</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Completion certificate" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description"
              rows={2}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.pdf"
            className="max-w-sm"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <Button type="button" className="gap-2 font-bold" disabled={uploading || !file} onClick={() => void handleCreate()}>
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Upload
          </Button>
        </div>
        {file ? (
          <p className="text-xs text-muted-foreground">Selected: {file.name}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Image or PDF up to 8 MB (images) / 20 MB (PDF).</p>
        )}
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-slate-800">Sample certificates</h3>
          {loading ? <Loader2 className="size-4 animate-spin text-slate-400" /> : null}
        </div>
        {rows.length === 0 && !loading ? (
          <p className="text-sm text-slate-500">No certificates yet.</p>
        ) : (
          <ScrollArea className="h-[28rem] rounded-xl border">
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((row) => {
                const isPdf = isPdfMime(row.mime_type, row.file_name);
                return (
                  <div key={row.id} className="rounded-xl border bg-slate-50 overflow-hidden">
                    <div className="aspect-[4/3] bg-slate-200 flex items-center justify-center p-3">
                      {isPdf ? (
                        <div className="flex flex-col items-center gap-2 text-center">
                          <FileText className="size-10 text-primary" />
                          <Badge variant="outline">PDF</Badge>
                          <p className="text-xs text-slate-600 truncate max-w-full px-2">{row.file_name || "document.pdf"}</p>
                        </div>
                      ) : (
                        <img src={row.file_url} alt={row.title || "Certificate"} className="max-h-full max-w-full object-contain" />
                      )}
                    </div>
                    <div className="p-3 space-y-2">
                      <p className="font-semibold text-sm truncate">{row.title || "Untitled"}</p>
                      <p className="text-xs text-slate-500 line-clamp-2">{row.description || "—"}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">Order {row.sort_order}</p>
                        <ActiveBadge active={row.is_active !== false} />
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => openEdit(row)}>
                          <Pencil className="size-3" /> Edit
                        </Button>
                        <Button type="button" size="sm" variant="destructive" className="gap-1" onClick={() => void handleDelete(row)}>
                          <Trash2 className="size-3" /> Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>

      <Dialog open={!!editRow} onOpenChange={(open) => !open && setEditRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit sample certificate</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} />
            </div>
            <SortActiveFields
              sortOrder={editSort}
              isActive={editActive}
              onSortChange={setEditSort}
              onActiveChange={setEditActive}
              idPrefix="cert"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditRow(null)}>Cancel</Button>
            <Button type="button" disabled={saving} onClick={() => void saveEdit()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TeamTab({ client, currentUserId }: TabProps) {
  const [rows, setRows] = useState<SiteExpertMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [twitter, setTwitter] = useState("");
  const [website, setWebsite] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [editRow, setEditRow] = useState<SiteExpertMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesignation, setEditDesignation] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editLinkedin, setEditLinkedin] = useState("");
  const [editTwitter, setEditTwitter] = useState("");
  const [editWebsite, setEditWebsite] = useState("");
  const [editSort, setEditSort] = useState(0);
  const [editActive, setEditActive] = useState(true);
  const [editFile, setEditFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const filePreviewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const editPreviewUrl = useMemo(
    () => (editFile ? URL.createObjectURL(editFile) : null),
    [editFile]
  );

  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  useEffect(() => {
    return () => {
      if (editPreviewUrl) URL.revokeObjectURL(editPreviewUrl);
    };
  }, [editPreviewUrl]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchAdminExpertTeam(client));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load team.");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const buildSocialLinks = (li: string, tw: string, web: string): SocialLinks => ({
    ...(li.trim() ? { linkedin: li.trim() } : {}),
    ...(tw.trim() ? { twitter: tw.trim() } : {}),
    ...(web.trim() ? { website: web.trim() } : {}),
  });

  const handleCreate = async () => {
    if (!name.trim() || !designation.trim() || !title.trim() || !currentUserId) {
      toast.error("Name, designation, and title are required.");
      return;
    }
    if (!file) {
      toast.error("Please choose a profile photo.");
      return;
    }
    setCreating(true);
    try {
      await createExpertMember(client, currentUserId, {
        full_name: name,
        designation,
        title,
        bio,
        social_links: buildSocialLinks(linkedin, twitter, website),
        sortOrder: rows.length,
        file,
      });
      toast.success("Team member added.");
      setName("");
      setDesignation("");
      setTitle("");
      setBio("");
      setLinkedin("");
      setTwitter("");
      setWebsite("");
      setFile(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (row: SiteExpertMember) => {
    setEditRow(row);
    setEditName(row.full_name || "");
    setEditDesignation(row.designation || "");
    setEditTitle(row.title || "");
    setEditBio(row.bio || "");
    setEditLinkedin(row.social_links?.linkedin || "");
    setEditTwitter(row.social_links?.twitter || "");
    setEditWebsite(row.social_links?.website || "");
    setEditSort(row.sort_order ?? 0);
    setEditActive(row.is_active !== false);
    setEditFile(null);
  };

  const saveEdit = async () => {
    if (!editRow || !currentUserId) return;
    setSaving(true);
    try {
      await updateExpertMember(client, editRow.id, {
        full_name: editName.trim(),
        designation: editDesignation.trim(),
        title: editTitle.trim(),
        bio: editBio.trim() || null,
        social_links: buildSocialLinks(editLinkedin, editTwitter, editWebsite),
        sort_order: Number(editSort) || 0,
        is_active: editActive,
      });
      if (editFile) {
        await replaceExpertPhoto(client, editRow, editFile, currentUserId);
      }
      toast.success("Team member updated.");
      setEditRow(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: SiteExpertMember) => {
    if (!window.confirm(`Delete “${row.full_name || "member"}”?`)) return;
    try {
      await deleteExpertMember(client, row);
      toast.success("Team member deleted.");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-800">Add team member</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. Jane Doe" />
          </div>
          <div className="space-y-1.5">
            <Label>Designation</Label>
            <Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Lead Mentor" />
          </div>
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="AI & ML Expert" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Bio (optional)</Label>
            <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>LinkedIn (optional)</Label>
            <Input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="https://linkedin.com/in/..." />
          </div>
          <div className="space-y-1.5">
            <Label>Twitter (optional)</Label>
            <Input value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="https://twitter.com/..." />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Website (optional)</Label>
            <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Profile photo</Label>
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-slate-50">
                {filePreviewUrl ? (
                  <img
                    src={filePreviewUrl}
                    alt="Preview"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <Users className="size-8 text-slate-300" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="max-w-sm"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <p className="text-xs text-muted-foreground">
                  JPG/PNG/WebP up to 8 MB. Shown in full (not cropped) on the homepage.
                </p>
                {file ? (
                  <p className="text-xs text-slate-600">
                    Selected: {file.name} ({(file.size / 1024).toFixed(0)} KB)
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            className="gap-2 font-bold"
            disabled={creating || !file}
            onClick={() => void handleCreate()}
          >
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Add member
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-slate-800">Expert team</h3>
          {loading ? <Loader2 className="size-4 animate-spin text-slate-400" /> : null}
        </div>
        {rows.length === 0 && !loading ? (
          <p className="text-sm text-slate-500">No team members yet.</p>
        ) : (
          <ScrollArea className="h-[28rem] rounded-xl border">
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((row) => (
                <div key={row.id} className="rounded-xl border bg-slate-50 overflow-hidden">
                  <div className="aspect-square bg-slate-100 flex items-center justify-center p-2">
                    {row.photo_url ? (
                      <img
                        src={row.photo_url}
                        alt={row.full_name}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <Users className="size-12 text-slate-400" />
                    )}
                  </div>
                  <div className="p-3 space-y-2">
                    <p className="font-semibold text-sm truncate">{row.full_name}</p>
                    <p className="text-xs text-slate-500">{row.designation} · {row.title}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Order {row.sort_order}</p>
                      <ActiveBadge active={row.is_active !== false} />
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => openEdit(row)}>
                        <Pencil className="size-3" /> Edit
                      </Button>
                      <Button type="button" size="sm" variant="destructive" className="gap-1" onClick={() => void handleDelete(row)}>
                        <Trash2 className="size-3" /> Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      <Dialog open={!!editRow} onOpenChange={(open) => !open && setEditRow(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit team member</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Designation</Label>
              <Input value={editDesignation} onChange={(e) => setEditDesignation(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Bio</Label>
              <Textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>LinkedIn</Label>
              <Input value={editLinkedin} onChange={(e) => setEditLinkedin(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Twitter</Label>
              <Input value={editTwitter} onChange={(e) => setEditTwitter(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Website</Label>
              <Input value={editWebsite} onChange={(e) => setEditWebsite(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Replace photo (optional)</Label>
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-slate-50">
                  {editPreviewUrl ? (
                    <img
                      src={editPreviewUrl}
                      alt="New preview"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : editRow?.photo_url ? (
                    <img
                      src={editRow.photo_url}
                      alt={editRow.full_name}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <Users className="size-6 text-slate-300" />
                  )}
                </div>
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => setEditFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>
            <SortActiveFields
              sortOrder={editSort}
              isActive={editActive}
              onSortChange={setEditSort}
              onActiveChange={setEditActive}
              idPrefix="team"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditRow(null)}>Cancel</Button>
            <Button type="button" disabled={saving} onClick={() => void saveEdit()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MouTab({ client, currentUserId }: TabProps) {
  const [rows, setRows] = useState<SiteMou[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [editRow, setEditRow] = useState<SiteMou | null>(null);
  const [editOrgName, setEditOrgName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editWebsiteUrl, setEditWebsiteUrl] = useState("");
  const [editSort, setEditSort] = useState(0);
  const [editActive, setEditActive] = useState(true);
  const [editFile, setEditFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchAdminMous(client));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load MOUs.");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = async () => {
    if (!orgName.trim() || !currentUserId) {
      toast.error("Organization name is required.");
      return;
    }
    setCreating(true);
    try {
      await createMou(client, currentUserId, {
        org_name: orgName,
        description,
        website_url: websiteUrl,
        sortOrder: rows.length,
        file,
      });
      toast.success("MOU added.");
      setOrgName("");
      setDescription("");
      setWebsiteUrl("");
      setFile(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (row: SiteMou) => {
    setEditRow(row);
    setEditOrgName(row.org_name || "");
    setEditDescription(row.description || "");
    setEditWebsiteUrl(row.website_url || "");
    setEditSort(row.sort_order ?? 0);
    setEditActive(row.is_active !== false);
    setEditFile(null);
  };

  const saveEdit = async () => {
    if (!editRow || !currentUserId) return;
    setSaving(true);
    try {
      await updateMou(client, editRow.id, {
        org_name: editOrgName.trim(),
        description: editDescription.trim() || null,
        website_url: editWebsiteUrl.trim() || null,
        sort_order: Number(editSort) || 0,
        is_active: editActive,
      });
      if (editFile) {
        await replaceMouLogo(client, editRow, editFile, currentUserId);
      }
      toast.success("MOU updated.");
      setEditRow(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: SiteMou) => {
    if (!window.confirm(`Delete MOU for “${row.org_name}”?`)) return;
    try {
      await deleteMou(client, row);
      toast.success("MOU deleted.");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-800">Add MOU</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Organization name</Label>
            <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Partner University" />
          </div>
          <div className="space-y-1.5">
            <Label>Website URL (optional)</Label>
            <Input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="max-w-sm"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <Button type="button" className="gap-2 font-bold" disabled={creating} onClick={() => void handleCreate()}>
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Add MOU
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-slate-800">MOUs</h3>
          {loading ? <Loader2 className="size-4 animate-spin text-slate-400" /> : null}
        </div>
        {rows.length === 0 && !loading ? (
          <p className="text-sm text-slate-500">No MOUs yet.</p>
        ) : (
          <ScrollArea className="h-[28rem] rounded-xl border">
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((row) => (
                <div key={row.id} className="rounded-xl border bg-slate-50 overflow-hidden">
                  <div className="aspect-[3/2] bg-white flex items-center justify-center p-4">
                    {row.logo_url ? (
                      <img src={row.logo_url} alt={row.org_name} className="max-h-full max-w-full object-contain" />
                    ) : (
                      <Building2 className="size-10 text-slate-400" />
                    )}
                  </div>
                  <div className="p-3 space-y-2">
                    <p className="font-semibold text-sm truncate">{row.org_name}</p>
                    <p className="text-xs text-slate-500 line-clamp-2">{row.description || "—"}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Order {row.sort_order}</p>
                      <ActiveBadge active={row.is_active !== false} />
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => openEdit(row)}>
                        <Pencil className="size-3" /> Edit
                      </Button>
                      <Button type="button" size="sm" variant="destructive" className="gap-1" onClick={() => void handleDelete(row)}>
                        <Trash2 className="size-3" /> Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      <Dialog open={!!editRow} onOpenChange={(open) => !open && setEditRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit MOU</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Organization name</Label>
              <Input value={editOrgName} onChange={(e) => setEditOrgName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Website URL</Label>
              <Input value={editWebsiteUrl} onChange={(e) => setEditWebsiteUrl(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Replace logo (optional)</Label>
              <Input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => setEditFile(e.target.files?.[0] || null)} />
            </div>
            <SortActiveFields
              sortOrder={editSort}
              isActive={editActive}
              onSortChange={setEditSort}
              onActiveChange={setEditActive}
              idPrefix="mou"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditRow(null)}>Cancel</Button>
            <Button type="button" disabled={saving} onClick={() => void saveEdit()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OfflineTab({ client, currentUserId }: TabProps) {
  const [rows, setRows] = useState<SiteOfflineProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("");
  const [location, setLocation] = useState("");
  const [highlights, setHighlights] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [editRow, setEditRow] = useState<SiteOfflineProgram | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editHighlights, setEditHighlights] = useState("");
  const [editSort, setEditSort] = useState(0);
  const [editActive, setEditActive] = useState(true);
  const [editFile, setEditFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchAdminOfflinePrograms(client));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load offline programs.");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const parseHighlights = (text: string) =>
    text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

  const handleCreate = async () => {
    if (!title.trim() || !currentUserId) {
      toast.error("Title is required.");
      return;
    }
    setCreating(true);
    try {
      await createOfflineProgram(client, currentUserId, {
        title,
        description,
        duration,
        location,
        highlights: parseHighlights(highlights),
        sortOrder: rows.length,
        file,
      });
      toast.success("Offline program added.");
      setTitle("");
      setDescription("");
      setDuration("");
      setLocation("");
      setHighlights("");
      setFile(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (row: SiteOfflineProgram) => {
    setEditRow(row);
    setEditTitle(row.title || "");
    setEditDescription(row.description || "");
    setEditDuration(row.duration || "");
    setEditLocation(row.location || "");
    setEditHighlights((row.highlights || []).join("\n"));
    setEditSort(row.sort_order ?? 0);
    setEditActive(row.is_active !== false);
    setEditFile(null);
  };

  const saveEdit = async () => {
    if (!editRow || !currentUserId) return;
    setSaving(true);
    try {
      await updateOfflineProgram(client, editRow.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        duration: editDuration.trim() || null,
        location: editLocation.trim() || null,
        highlights: parseHighlights(editHighlights),
        sort_order: Number(editSort) || 0,
        is_active: editActive,
      });
      if (editFile) {
        await replaceOfflineImage(client, editRow, editFile, currentUserId);
      }
      toast.success("Offline program updated.");
      setEditRow(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: SiteOfflineProgram) => {
    if (!window.confirm(`Delete “${row.title}”?`)) return;
    try {
      await deleteOfflineProgram(client, row);
      toast.success("Offline program deleted.");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-800">Add offline program</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Summer Bootcamp" />
          </div>
          <div className="space-y-1.5">
            <Label>Duration</Label>
            <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="2 weeks" />
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Hyderabad" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Highlights (one per line)</Label>
            <Textarea value={highlights} onChange={(e) => setHighlights(e.target.value)} rows={4} placeholder="Hands-on labs&#10;Industry mentors" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="max-w-sm"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <Button type="button" className="gap-2 font-bold" disabled={creating} onClick={() => void handleCreate()}>
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Add program
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-slate-800">Offline programs</h3>
          {loading ? <Loader2 className="size-4 animate-spin text-slate-400" /> : null}
        </div>
        {rows.length === 0 && !loading ? (
          <p className="text-sm text-slate-500">No offline programs yet.</p>
        ) : (
          <ScrollArea className="h-[28rem] rounded-xl border">
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((row) => (
                <div key={row.id} className="rounded-xl border bg-slate-50 overflow-hidden">
                  <div className="flex aspect-[4/3] items-center justify-center bg-slate-100 p-2">
                    {row.image_url ? (
                      <img
                        src={row.image_url}
                        alt={row.title}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <MapPin className="size-10 text-slate-400" />
                      </div>
                    )}
                  </div>
                  <div className="p-3 space-y-2">
                    <p className="font-semibold text-sm truncate">{row.title}</p>
                    <p className="text-xs text-slate-500">{row.duration || "—"} · {row.location || "—"}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Order {row.sort_order}</p>
                      <ActiveBadge active={row.is_active !== false} />
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => openEdit(row)}>
                        <Pencil className="size-3" /> Edit
                      </Button>
                      <Button type="button" size="sm" variant="destructive" className="gap-1" onClick={() => void handleDelete(row)}>
                        <Trash2 className="size-3" /> Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      <Dialog open={!!editRow} onOpenChange={(open) => !open && setEditRow(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit offline program</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Duration</Label>
              <Input value={editDuration} onChange={(e) => setEditDuration(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Highlights (one per line)</Label>
              <Textarea value={editHighlights} onChange={(e) => setEditHighlights(e.target.value)} rows={4} />
            </div>
            <div className="space-y-1.5">
              <Label>Replace image (optional)</Label>
              <Input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => setEditFile(e.target.files?.[0] || null)} />
            </div>
            <SortActiveFields
              sortOrder={editSort}
              isActive={editActive}
              onSortChange={setEditSort}
              onActiveChange={setEditActive}
              idPrefix="offline"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditRow(null)}>Cancel</Button>
            <Button type="button" disabled={saving} onClick={() => void saveEdit()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TestimonialsTab({ client, currentUserId }: TabProps) {
  const [rows, setRows] = useState<SiteTestimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [review, setReview] = useState("");
  const [rating, setRating] = useState(5);
  const [file, setFile] = useState<File | null>(null);
  const [editRow, setEditRow] = useState<SiteTestimonial | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesignation, setEditDesignation] = useState("");
  const [editReview, setEditReview] = useState("");
  const [editRating, setEditRating] = useState(5);
  const [editSort, setEditSort] = useState(0);
  const [editActive, setEditActive] = useState(true);
  const [editFile, setEditFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchAdminTestimonials(client));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load testimonials.");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = async () => {
    if (!name.trim() || !review.trim() || !currentUserId) {
      toast.error("Name and review are required.");
      return;
    }
    setCreating(true);
    try {
      await createTestimonial(client, currentUserId, {
        full_name: name,
        designation,
        review,
        rating: Math.min(5, Math.max(1, rating)),
        sortOrder: rows.length,
        file,
      });
      toast.success("Testimonial added.");
      setName("");
      setDesignation("");
      setReview("");
      setRating(5);
      setFile(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (row: SiteTestimonial) => {
    setEditRow(row);
    setEditName(row.full_name || "");
    setEditDesignation(row.designation || "");
    setEditReview(row.review || "");
    setEditRating(row.rating || 5);
    setEditSort(row.sort_order ?? 0);
    setEditActive(row.is_active !== false);
    setEditFile(null);
  };

  const saveEdit = async () => {
    if (!editRow || !currentUserId) return;
    setSaving(true);
    try {
      await updateTestimonial(client, editRow.id, {
        full_name: editName.trim(),
        designation: editDesignation.trim() || null,
        review: editReview.trim(),
        rating: Math.min(5, Math.max(1, editRating)),
        sort_order: Number(editSort) || 0,
        is_active: editActive,
      });
      if (editFile) {
        await replaceTestimonialPhoto(client, editRow, editFile, currentUserId);
      }
      toast.success("Testimonial updated.");
      setEditRow(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: SiteTestimonial) => {
    if (!window.confirm(`Delete testimonial from “${row.full_name}”?`)) return;
    try {
      await deleteTestimonial(client, row);
      toast.success("Testimonial deleted.");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-800">Add testimonial</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Student name" />
          </div>
          <div className="space-y-1.5">
            <Label>Designation (optional)</Label>
            <Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="B.Tech CSE, 2025" />
          </div>
          <div className="space-y-1.5">
            <Label>Rating (1–5)</Label>
            <Input
              type="number"
              min={1}
              max={5}
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Review</Label>
            <Textarea value={review} onChange={(e) => setReview(e.target.value)} rows={3} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="max-w-sm"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <Button type="button" className="gap-2 font-bold" disabled={creating} onClick={() => void handleCreate()}>
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Add testimonial
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-slate-800">Testimonials</h3>
          {loading ? <Loader2 className="size-4 animate-spin text-slate-400" /> : null}
        </div>
        {rows.length === 0 && !loading ? (
          <p className="text-sm text-slate-500">No testimonials yet.</p>
        ) : (
          <ScrollArea className="h-[28rem] rounded-xl border">
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((row) => (
                <div key={row.id} className="rounded-xl border bg-slate-50 overflow-hidden">
                  <div className="flex items-start gap-3 p-4">
                    <div className="size-14 shrink-0 overflow-hidden rounded-full bg-slate-200">
                      {row.photo_url ? (
                        <img src={row.photo_url} alt={row.full_name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <MessageSquareQuote className="size-6 text-slate-400" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{row.full_name}</p>
                      <p className="text-xs text-slate-500">{row.designation || "—"}</p>
                      <p className="text-xs text-amber-600 mt-1">★ {row.rating}/5</p>
                      <p className="text-xs text-slate-600 line-clamp-3 mt-1">&ldquo;{row.review}&rdquo;</p>
                    </div>
                  </div>
                  <div className="border-t px-4 py-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Order {row.sort_order}</p>
                      <ActiveBadge active={row.is_active !== false} />
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => openEdit(row)}>
                        <Pencil className="size-3" /> Edit
                      </Button>
                      <Button type="button" size="sm" variant="destructive" className="gap-1" onClick={() => void handleDelete(row)}>
                        <Trash2 className="size-3" /> Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      <Dialog open={!!editRow} onOpenChange={(open) => !open && setEditRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit testimonial</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Designation</Label>
              <Input value={editDesignation} onChange={(e) => setEditDesignation(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Review</Label>
              <Textarea value={editReview} onChange={(e) => setEditReview(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Rating (1–5)</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={editRating}
                onChange={(e) => setEditRating(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Replace photo (optional)</Label>
              <Input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => setEditFile(e.target.files?.[0] || null)} />
            </div>
            <SortActiveFields
              sortOrder={editSort}
              isActive={editActive}
              onSortChange={setEditSort}
              onActiveChange={setEditActive}
              idPrefix="testimonial"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditRow(null)}>Cancel</Button>
            <Button type="button" disabled={saving} onClick={() => void saveEdit()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function HomeCmsManagementPanel({ client, currentUserId }: Props) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
          <Award className="size-5 text-primary" /> Home CMS Management
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Manage homepage content: sample certificates, expert team, MOUs, offline programs, and testimonials.
          Only active items appear on the site.
        </p>
      </div>

      <Tabs defaultValue="sample-certs" className="w-full">
        <TabsList className="bg-white border rounded-xl p-1 mb-4 flex flex-wrap h-auto gap-1">
          <TabsTrigger value="sample-certs" className="rounded-lg text-xs font-bold gap-1.5">
            <Award className="size-3.5" /> Sample certs
          </TabsTrigger>
          <TabsTrigger value="team" className="rounded-lg text-xs font-bold gap-1.5">
            <Users className="size-3.5" /> Team
          </TabsTrigger>
          <TabsTrigger value="mou" className="rounded-lg text-xs font-bold gap-1.5">
            <Handshake className="size-3.5" /> MOU
          </TabsTrigger>
          <TabsTrigger value="offline" className="rounded-lg text-xs font-bold gap-1.5">
            <MapPin className="size-3.5" /> Offline
          </TabsTrigger>
          <TabsTrigger value="testimonials" className="rounded-lg text-xs font-bold gap-1.5">
            <MessageSquareQuote className="size-3.5" /> Testimonials
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sample-certs" className="mt-0">
          <SampleCertsTab client={client} currentUserId={currentUserId} />
        </TabsContent>
        <TabsContent value="team" className="mt-0">
          <TeamTab client={client} currentUserId={currentUserId} />
        </TabsContent>
        <TabsContent value="mou" className="mt-0">
          <MouTab client={client} currentUserId={currentUserId} />
        </TabsContent>
        <TabsContent value="offline" className="mt-0">
          <OfflineTab client={client} currentUserId={currentUserId} />
        </TabsContent>
        <TabsContent value="testimonials" className="mt-0">
          <TestimonialsTab client={client} currentUserId={currentUserId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
