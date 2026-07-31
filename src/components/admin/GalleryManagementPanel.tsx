import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ImagePlus, Loader2, Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  deleteGalleryImage,
  fetchAdminGalleryImages,
  updateGalleryImage,
  uploadGalleryImage,
  type SiteGalleryImage,
} from "@/lib/siteContentApi";

type Props = {
  client: SupabaseClient;
  currentUserId: string | null;
};

export function GalleryManagementPanel({ client, currentUserId }: Props) {
  const [rows, setRows] = useState<SiteGalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [editRow, setEditRow] = useState<SiteGalleryImage | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCaption, setEditCaption] = useState("");
  const [editSort, setEditSort] = useState(0);
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchAdminGalleryImages(client));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load gallery.");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleUpload = async () => {
    if (!file || !currentUserId) {
      toast.error("Choose an image and ensure you are signed in.");
      return;
    }
    setUploading(true);
    try {
      await uploadGalleryImage(client, file, currentUserId, {
        title: title || file.name,
        caption,
        sortOrder: rows.length,
      });
      toast.success("Gallery image uploaded.");
      setTitle("");
      setCaption("");
      setFile(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const openEdit = (row: SiteGalleryImage) => {
    setEditRow(row);
    setEditTitle(row.title || "");
    setEditCaption(row.caption || "");
    setEditSort(row.sort_order ?? 0);
    setEditActive(row.is_active !== false);
  };

  const saveEdit = async () => {
    if (!editRow) return;
    setSaving(true);
    try {
      await updateGalleryImage(client, editRow.id, {
        title: editTitle.trim() || editRow.title,
        caption: editCaption.trim() || null,
        sort_order: Number(editSort) || 0,
        is_active: editActive,
      });
      toast.success("Gallery image updated.");
      setEditRow(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: SiteGalleryImage) => {
    if (!window.confirm(`Delete “${row.title || "image"}” from the gallery?`)) return;
    try {
      await deleteGalleryImage(client, row);
      toast.success("Image deleted.");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
          <ImagePlus className="size-5 text-primary" /> Gallery Management
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Upload, edit, and remove homepage gallery images. Only active images appear on the site.
          Prefer JPG/PNG/WebP up to <b>8 MB</b>. Images are shown in full (no cropping) on the homepage.
        </p>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-800">Upload image</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Campus visit" />
          </div>
          <div className="space-y-1.5">
            <Label>Caption (optional)</Label>
            <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Short caption" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="max-w-sm"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <Button
            type="button"
            className="gap-2 font-bold"
            disabled={uploading || !file}
            onClick={() => void handleUpload()}
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Upload
          </Button>
        </div>
        {file ? (
          <p className="text-xs text-muted-foreground">
            Selected: {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
            {file.size > 8 * 1024 * 1024 ? " — too large (max 8 MB)" : ""}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Max file size 8 MB. Large screenshots are fine if under the limit.</p>
        )}
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-slate-800">Gallery images</h3>
          {loading ? <Loader2 className="size-4 animate-spin text-slate-400" /> : null}
        </div>
        {rows.length === 0 && !loading ? (
          <p className="text-sm text-slate-500">No images yet.</p>
        ) : (
          <ScrollArea className="h-[28rem] rounded-xl border">
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((row) => (
                <div key={row.id} className="rounded-xl border bg-slate-50 overflow-hidden">
                  <div className="aspect-[4/3] bg-slate-100 flex items-center justify-center p-2">
                    <img
                      src={row.image_url}
                      alt={row.title || "Gallery"}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <div className="p-3 space-y-2">
                    <p className="font-semibold text-sm truncate">{row.title || "Untitled"}</p>
                    <p className="text-xs text-slate-500 line-clamp-2">{row.caption || "—"}</p>
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">
                      Order {row.sort_order} · {row.is_active ? "Active" : "Hidden"}
                    </p>
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
            <DialogTitle>Edit gallery image</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Caption</Label>
              <Input value={editCaption} onChange={(e) => setEditCaption(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Sort order</Label>
              <Input
                type="number"
                value={editSort}
                onChange={(e) => setEditSort(Number(e.target.value))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <Label htmlFor="gallery-active">Show on homepage</Label>
              <Switch id="gallery-active" checked={editActive} onCheckedChange={setEditActive} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditRow(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void saveEdit()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
