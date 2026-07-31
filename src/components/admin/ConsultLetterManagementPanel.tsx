import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchConsultLetter,
  removeConsultLetter,
  uploadConsultLetter,
  type SiteConsultLetter,
} from "@/lib/siteContentApi";

type Props = {
  client: SupabaseClient;
  currentUserId: string | null;
};

/**
 * Global consent-form template (fixed format).
 * Public homepage section download. Separate from per-student signed consent in Directory.
 */
export function ConsultLetterManagementPanel({ client, currentUserId }: Props) {
  const [letter, setLetter] = useState<SiteConsultLetter | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setLetter(await fetchConsultLetter(client));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load consent form template.");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleUpload = async () => {
    if (!file || !currentUserId) {
      toast.error("Choose a PDF and ensure you are signed in.");
      return;
    }
    setUploading(true);
    try {
      const next = await uploadConsultLetter(client, file, currentUserId);
      setLetter(next);
      setFile(null);
      toast.success("Consent form template updated — homepage download now uses this PDF.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm("Remove the public consent form template from the homepage?")) return;
    try {
      await removeConsultLetter(client);
      setLetter(null);
      toast.success("Consent form template removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed.");
    }
  };

  const hasFile = Boolean(letter?.file_url);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
          <FileText className="size-5 text-primary" /> Consent Form Template
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Upload the fixed consent letter format for the public homepage Consent Form section. A new
          upload replaces the previous file. Per-student signed consent letters stay under Directory
          → actions.
        </p>
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm space-y-4 max-w-2xl">
        <div className="rounded-xl border bg-slate-50 p-4 text-sm">
          {loading ? (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : hasFile ? (
            <div className="space-y-2">
              <p className="font-semibold text-slate-800">Current homepage template</p>
              <p className="font-mono text-xs break-all">{letter?.file_name || "consent-form.pdf"}</p>
              {letter?.updated_at ? (
                <p className="text-xs text-slate-500">
                  Updated {new Date(letter.updated_at).toLocaleString()}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" className="gap-1" asChild>
                  <a href={letter!.file_url!} target="_blank" rel="noreferrer">
                    <Download className="size-3.5" /> Preview / Download
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="gap-1"
                  onClick={() => void handleRemove()}
                >
                  <Trash2 className="size-3.5" /> Remove
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-slate-500">No consent form template uploaded yet.</p>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-sm font-bold text-slate-700">
            {hasFile ? "Replace with a new PDF" : "Upload PDF"}
          </p>
          <Input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <Button
            type="button"
            className="gap-2 font-bold"
            disabled={uploading || !file}
            onClick={() => void handleUpload()}
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {hasFile ? "Replace Consent Form" : "Upload Consent Form"}
          </Button>
        </div>
      </div>
    </div>
  );
}
