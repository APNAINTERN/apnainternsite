import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  CalendarDays,
  Camera,
  Laptop,
  Loader2,
  LogOut,
  Monitor,
  Shield,
  Smartphone,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ATTENDANCE_STATUS_LABELS,
  formatAttendanceTime,
  listEmployeeAttendance,
  type EmployeeAttendanceRow,
} from "@/lib/employeeAttendance";
import {
  getOrCreateStaffSessionKey,
  isCurrentStaffSession,
  listStaffActivity,
  listStaffSessions,
  revokeOtherStaffSessions,
  revokeStaffSession,
  type StaffActivityRow,
  type StaffAuthSession,
} from "@/lib/staffSessions";
import type { AdminStaffProfile } from "@/lib/staffProfile";
import { resolveStorageUrl } from "@/lib/storageUrl";

type ProfileProps = {
  profile: AdminStaffProfile | null;
  roleLabel?: string;
  isActive?: boolean;
  onProfileImageUpdated?: (url: string) => void;
};

function ReadOnlyField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800 break-all">{value?.trim() || "—"}</p>
    </div>
  );
}

export function StaffProfilePanel({
  profile,
  roleLabel = "Staff",
  isActive = true,
  onProfileImageUpdated,
}: ProfileProps) {
  const [activity, setActivity] = useState<StaffActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    setImageUrl(
      resolveStorageUrl(profile?.profile_image_url || "") || profile?.profile_image_url || null
    );
  }, [profile?.profile_image_url]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setActivity(await listStaffActivity(40));
    } catch (e: any) {
      toast.error(e?.message || "Could not load activity");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isActive) void load();
  }, [isActive, load]);

  const uploadImage = async (file: File) => {
    if (!profile?.id) {
      toast.error("Profile not loaded");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `staff-profiles/${profile.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("logos").getPublicUrl(path);
      const publicUrl = resolveStorageUrl(data.publicUrl) || data.publicUrl;
      const { error: rpcErr } = await supabase.rpc("staff_update_profile_image", {
        p_profile_image_url: publicUrl,
      });
      if (rpcErr) {
        // Fallback direct update if RPC missing
        const { error } = await supabase
          .from("admin_staff")
          .update({ profile_image_url: publicUrl, updated_at: new Date().toISOString() })
          .eq("id", profile.id);
        if (error) throw rpcErr;
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
            <h2 className="text-xl font-black text-slate-900">{profile?.full_name || "Staff Member"}</h2>
            <p className="text-sm text-muted-foreground">{profile?.email || "—"}</p>
            <Badge className="mt-2" variant="secondary">
              {roleLabel}
            </Badge>
            <p className="text-xs text-muted-foreground mt-3">
              Profile details are read-only. You can only update your profile image.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-5 mt-8 pt-6 border-t">
          <ReadOnlyField label="Full Name" value={profile?.full_name} />
          <ReadOnlyField label="Email Address" value={profile?.email} />
          <ReadOnlyField label="Mobile Number" value={profile?.mobile_number} />
          <ReadOnlyField label="Bank Name" value={profile?.bank_name} />
          <ReadOnlyField label="Account Number" value={profile?.account_number} />
          <ReadOnlyField label="IFSC Code" value={profile?.ifsc_code} />
          <ReadOnlyField label="Aadhaar Number" value={profile?.aadhaar_number} />
          <ReadOnlyField label="PAN Number" value={profile?.pan_number} />
        </div>
      </Card>

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
                  {(a.user_name || a.user_email) && (
                    <p className="text-[11px] font-medium text-slate-600 mt-0.5">
                      {a.user_name || a.user_email}
                      {a.user_name && a.user_email ? (
                        <span className="text-muted-foreground font-normal"> · {a.user_email}</span>
                      ) : null}
                    </p>
                  )}
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
    </div>
  );
}

type SecurityProps = {
  isActive?: boolean;
  onSignOutCurrent?: () => Promise<void> | void;
};

function deviceIcon(label: string | null) {
  const l = (label || "").toLowerCase();
  if (l.includes("iphone") || l.includes("android") || l.includes("ios")) return Smartphone;
  if (l.includes("mac") || l.includes("windows") || l.includes("linux")) return Laptop;
  return Monitor;
}

export function StaffSecurityPanel({ isActive = true, onSignOutCurrent }: SecurityProps) {
  const [sessions, setSessions] = useState<StaffAuthSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const currentKey = getOrCreateStaffSessionKey();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSessions(await listStaffSessions());
    } catch (e: any) {
      toast.error(e?.message || "Could not load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isActive) void load();
  }, [isActive, load]);

  const revokeOne = async (sessionKey: string) => {
    setBusy(true);
    try {
      await revokeStaffSession(sessionKey);
      if (isCurrentStaffSession(sessionKey)) {
        toast.success("Signed out this device");
        await onSignOutCurrent?.();
        return;
      }
      toast.success("Session ended");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Could not revoke session");
    } finally {
      setBusy(false);
    }
  };

  const revokeOthers = async () => {
    setBusy(true);
    try {
      await revokeOtherStaffSessions();
      toast.success("Signed out of all other devices");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Could not revoke other sessions");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-black flex items-center gap-2">
          <Shield className="size-5 text-primary" /> Security
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Manage devices where you are signed in.</p>
      </div>

      <Card className="p-6 border-none shadow-elegant space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-bold">Your devices</h3>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void revokeOthers()}>
            <LogOut className="size-3.5 mr-1.5" /> Log out of all other devices
          </Button>
        </div>

        {loading ? (
          <div className="py-8 text-center">
            <Loader2 className="size-5 animate-spin inline text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active sessions recorded.</p>
        ) : (
          <ul className="space-y-3">
            {sessions.map((s) => {
              const Icon = deviceIcon(s.device_label);
              const isCurrent = s.session_key === currentKey;
              return (
                <li
                  key={s.id}
                  className="flex items-start justify-between gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/50"
                >
                  <div className="flex gap-3">
                    <div className="size-10 rounded-xl bg-white border flex items-center justify-center">
                      <Icon className="size-5 text-slate-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">
                        {s.device_label || "Unknown device"}
                        {isCurrent && (
                          <Badge
                            className="ml-2 bg-emerald-50 text-emerald-700 border-emerald-200"
                            variant="outline"
                          >
                            This device
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {s.user_agent || "—"}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Last active {new Date(s.last_seen_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50 shrink-0"
                    disabled={busy}
                    onClick={() => void revokeOne(s.session_key)}
                  >
                    Log out
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

type OwnAttendanceProps = {
  isActive?: boolean;
};

export function StaffOwnAttendancePanel({ isActive = true }: OwnAttendanceProps) {
  const [rows, setRows] = useState<EmployeeAttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user?.id;
      if (!uid) {
        setRows([]);
        return;
      }
      setRows(await listEmployeeAttendance({ employeeId: uid, limit: 200 }));
    } catch (e: any) {
      toast.error(e?.message || "Could not load attendance");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isActive) void load();
  }, [isActive, load]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black flex items-center gap-2">
          <CalendarDays className="size-5 text-primary" /> My Attendance
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Your attendance history (read-only).</p>
      </div>
      <Card className="border-none shadow-elegant overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead>Check-out</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  <Loader2 className="size-5 animate-spin inline" />
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No attendance records yet
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.attendance_date}</TableCell>
                  <TableCell>{formatAttendanceTime(r.check_in_at)}</TableCell>
                  <TableCell>{formatAttendanceTime(r.check_out_at)}</TableCell>
                  <TableCell>{ATTENDANCE_STATUS_LABELS[r.status]}</TableCell>
                  <TableCell className="text-muted-foreground">{r.notes || "—"}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
