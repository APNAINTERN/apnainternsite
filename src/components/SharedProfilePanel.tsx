import { useEffect, useState } from "react";
import {
  Activity,
  Camera,
  Loader2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { resolveStorageUrl } from "@/lib/storageUrl";

export type ProfileField = {
  label: string;
  value?: string | null;
};

export type SharedProfilePanelProps = {
  profileId: string | undefined;
  profileName: string | undefined;
  profileEmail: string | undefined;
  profileImageUrl: string | undefined;
  roleLabel: string;
  fields: ProfileField[];
  isActive?: boolean;
  onProfileImageUpdated?: (url: string) => void;
  uploadBucket?: string;
  uploadPathPrefix?: string;
  onDatabaseUpdate?: (publicUrl: string) => Promise<void>;
  activityFetcher?: () => Promise<{ id: string; event_type: string; detail: string | null; created_at: string }[]>;
};

function ReadOnlyField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800 break-all">{value?.trim() || "—"}</p>
    </div>
  );
}

export function SharedProfilePanel({
  profileId,
  profileName,
  profileEmail,
  profileImageUrl,
  roleLabel,
  fields,
  isActive = true,
  onProfileImageUpdated,
  uploadBucket = "logos",
  uploadPathPrefix = "profiles",
  onDatabaseUpdate,
  activityFetcher,
}: SharedProfilePanelProps) {
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    setImageUrl(resolveStorageUrl(profileImageUrl || "") || profileImageUrl || null);
  }, [profileImageUrl]);

  useEffect(() => {
    if (isActive && activityFetcher) {
      setLoading(true);
      activityFetcher()
        .then(setActivity)
        .catch((e: any) => toast.error(e?.message || "Could not load activity"))
        .finally(() => setLoading(false));
    }
  }, [isActive, activityFetcher]);

  const uploadImage = async (file: File) => {
    if (!profileId) {
      toast.error("Profile not loaded");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${uploadPathPrefix}/${profileId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(uploadBucket).upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      
      const { data } = supabase.storage.from(uploadBucket).getPublicUrl(path);
      const publicUrl = resolveStorageUrl(data.publicUrl) || data.publicUrl;
      
      if (onDatabaseUpdate) {
        await onDatabaseUpdate(publicUrl);
      }
      
      setImageUrl(publicUrl);
      onProfileImageUpdated?.(publicUrl);
      toast.success("Profile image updated");
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <Card className="p-6 border-none shadow-elegant">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <div className="relative">
            {imageUrl ? (
              <img src={imageUrl} alt="" className="size-24 rounded-2xl object-cover border shadow-sm" />
            ) : (
              <div className="size-24 rounded-2xl bg-primary/10 flex items-center justify-center">
                <User className="size-10 text-primary" />
              </div>
            )}
            <label className="absolute -bottom-2 -right-2 size-9 rounded-full bg-white border shadow flex items-center justify-center cursor-pointer hover:bg-slate-50">
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Camera className="size-4 text-slate-600" />
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadImage(f);
                }}
              />
            </label>
          </div>
          <div className="flex-1 space-y-1">
            <h2 className="text-xl font-black text-slate-900">{profileName || "Profile"}</h2>
            <p className="text-sm text-muted-foreground">{profileEmail || "—"}</p>
            <Badge className="mt-2" variant="secondary">
              {roleLabel}
            </Badge>
            <p className="text-xs text-muted-foreground mt-3">
              Profile details are read-only. You can only update your profile image.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-5 mt-8 pt-6 border-t">
          {fields.map((f, i) => (
            <ReadOnlyField key={i} label={f.label} value={f.value} />
          ))}
        </div>
      </Card>

      {activityFetcher && (
        <Card className="p-6 border-none shadow-elegant space-y-4">
          <h3 className="font-bold flex items-center gap-2">
            <Activity className="size-4 text-primary" /> Activity
          </h3>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin inline" />
            </div>
          ) : activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {activity.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-0"
                >
                  <div>
                    <p className="font-semibold text-sm capitalize">{a.event_type.replace(/_/g, " ")}</p>
                    {a.detail && <p className="text-xs text-muted-foreground mt-0.5">{a.detail}</p>}
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
