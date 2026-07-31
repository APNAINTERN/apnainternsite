import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  CheckCircle2,
  Loader2,
  Pencil,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { createSubUserWithoutServiceRole } from "@/lib/createSubUser";
import {
  emptyStaffPermissions,
  normalizeStaffPermissions,
  staffPermissionsPayload,
  STAFF_PERMISSION_CATALOG,
  type StaffPermissions,
} from "@/lib/staffPermissions";
import {
  emptyStaffProfileForm,
  staffProfileDbPayload,
  staffRowToForm,
  type AdminStaffProfile,
  type StaffProfileFormFields,
} from "@/lib/staffProfile";
import { EmployeeAttendancePanel } from "@/components/admin/EmployeeAttendancePanel";
import {
  AdminStaffLeaveRequestsPanel,
  AdminStaffRequirementsPanel,
} from "@/components/admin/StaffRequestAdminPanels";
import { resolveStorageUrl } from "@/lib/storageUrl";

type Props = {
  staff: AdminStaffProfile[];
  currentUserId: string | null;
  isActive?: boolean;
  onRefresh: () => void | Promise<void>;
  onDeleteStaff: (staffId: string) => void | Promise<void>;
};

async function uploadStaffProfileImage(file: File, staffIdHint: string): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `staff-profiles/${staffIdHint}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("logos").getPublicUrl(path);
  return resolveStorageUrl(data.publicUrl) || data.publicUrl;
}

export function StaffManagementPanel({
  staff,
  currentUserId,
  isActive = true,
  onRefresh,
  onDeleteStaff,
}: Props) {
  const [subTab, setSubTab] = useState("list");
  const [processing, setProcessing] = useState(false);
  const [form, setForm] = useState<StaffProfileFormFields>(emptyStaffProfileForm());
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [permissions, setPermissions] = useState<StaffPermissions>(emptyStaffPermissions());
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminStaffProfile | null>(null);
  const [editForm, setEditForm] = useState<StaffProfileFormFields>(emptyStaffProfileForm());
  const [editPerms, setEditPerms] = useState<StaffPermissions>(emptyStaffPermissions());
  const [editImageFile, setEditImageFile] = useState<File | null>(null);

  const employees = useMemo(
    () =>
      (staff || []).map((s) => ({
        id: s.id,
        email: s.email,
        full_name: s.full_name,
      })),
    [staff]
  );

  useEffect(() => {
    if (!isActive) return;
  }, [isActive]);

  const setField = (key: keyof StaffProfileFormFields, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreate = async () => {
    if (!form.full_name.trim() || !form.email.trim() || !password) {
      toast.error("Full name, email, and password are required");
      return;
    }
    setProcessing(true);
    try {
      let profileImageUrl = form.profile_image_url;
      if (imageFile) {
        profileImageUrl = await uploadStaffProfileImage(imageFile, form.email.split("@")[0] || "staff");
      }
      await createSubUserWithoutServiceRole(supabase, {
        email: form.email,
        password,
        roleTag: form.full_name.trim(),
        role,
        permissions: staffPermissionsPayload(permissions),
        profile: {
          full_name: form.full_name,
          mobile_number: form.mobile_number,
          account_number: form.account_number,
          ifsc_code: form.ifsc_code,
          bank_name: form.bank_name,
          aadhaar_number: form.aadhaar_number,
          pan_number: form.pan_number,
          profile_image_url: profileImageUrl,
        },
      });
      toast.success("Staff account created");
      setForm(emptyStaffProfileForm());
      setPassword("");
      setPermissions(emptyStaffPermissions());
      setImageFile(null);
      setRole("staff");
      await onRefresh();
      setSubTab("list");
    } catch (e: any) {
      toast.error(e?.message || "Failed to create staff");
    } finally {
      setProcessing(false);
    }
  };

  const openEdit = (member: AdminStaffProfile) => {
    setEditTarget(member);
    setEditForm(staffRowToForm(member));
    setEditPerms(normalizeStaffPermissions(member.permissions || {}));
    setEditImageFile(null);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setProcessing(true);
    try {
      let profileImageUrl = editForm.profile_image_url;
      if (editImageFile) {
        profileImageUrl = await uploadStaffProfileImage(editImageFile, editTarget.id);
      }
      const payload = {
        ...staffProfileDbPayload({ ...editForm, profile_image_url: profileImageUrl }),
        role_tag: editForm.full_name.trim() || editTarget.role_tag,
        permissions: staffPermissionsPayload(editPerms),
      };
      const { error } = await supabase.from("admin_staff").update(payload).eq("id", editTarget.id);
      if (error) throw error;
      try {
        await supabase.from("admin_permissions").upsert({
          user_id: editTarget.id,
          ...staffPermissionsPayload(editPerms),
          updated_at: new Date().toISOString(),
        });
      } catch {
        /* optional sync */
      }
      toast.success("Staff updated");
      setEditOpen(false);
      await onRefresh();
    } catch (e: any) {
      toast.error(e?.message || "Update failed");
    } finally {
      setProcessing(false);
    }
  };

  const toggleBlock = async (member: AdminStaffProfile) => {
    const next = !member.is_blocked;
    try {
      const { error } = await supabase
        .from("admin_staff")
        .update({ is_blocked: next, updated_at: new Date().toISOString() })
        .eq("id", member.id);
      if (error) throw error;
      toast.success(next ? "Staff blocked" : "Staff unblocked");
      await onRefresh();
    } catch (e: any) {
      toast.error(e?.message || "Could not update block status");
    }
  };

  const profileFields = (
    values: StaffProfileFormFields,
    onChange: (k: keyof StaffProfileFormFields, v: string) => void,
    opts?: { emailDisabled?: boolean }
  ) => (
    <div className="grid sm:grid-cols-2 gap-3">
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Full Name *</Label>
        <Input value={values.full_name} onChange={(e) => onChange("full_name", e.target.value)} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Email Address *</Label>
        <Input
          type="email"
          value={values.email}
          disabled={opts?.emailDisabled}
          onChange={(e) => onChange("email", e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Mobile Number</Label>
        <Input value={values.mobile_number} onChange={(e) => onChange("mobile_number", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Bank Name</Label>
        <Input value={values.bank_name} onChange={(e) => onChange("bank_name", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Account Number</Label>
        <Input value={values.account_number} onChange={(e) => onChange("account_number", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>IFSC Code</Label>
        <Input value={values.ifsc_code} onChange={(e) => onChange("ifsc_code", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Aadhaar Number</Label>
        <Input value={values.aadhaar_number} onChange={(e) => onChange("aadhaar_number", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>PAN Number</Label>
        <Input value={values.pan_number} onChange={(e) => onChange("pan_number", e.target.value)} />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Users className="size-6 text-primary" /> Staff Management
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Create staff IDs, manage profiles & access, attendance, leave, and requirements.
        </p>
      </div>

      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="bg-slate-100 flex-wrap h-auto gap-1">
          <TabsTrigger value="list">Staff User List</TabsTrigger>
          <TabsTrigger value="create">Create Staff ID</TabsTrigger>
          <TabsTrigger value="attendance">Staff Attendance</TabsTrigger>
          <TabsTrigger value="leave-requests">Leave Requests</TabsTrigger>
          <TabsTrigger value="requirements">Requirements</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="mt-4">
          <Card className="p-6 border-none shadow-elegant space-y-5 max-w-3xl">
            <h3 className="font-bold flex items-center gap-2">
              <UserPlus className="size-4 text-indigo-600" /> Create Staff Account
            </h3>
            {profileFields(form, setField)}
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Initial Password *</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Access Level</Label>
                <Select value={role} onValueChange={(v) => setRole(v as "staff" | "admin")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff Member (Staff Dashboard)</SelectItem>
                    <SelectItem value="admin">Sub-Admin (Full Admin Panel)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Profile Image</Label>
              <div className="flex items-center gap-3">
                {(imageFile || form.profile_image_url) && (
                  <img
                    src={imageFile ? URL.createObjectURL(imageFile) : form.profile_image_url}
                    alt=""
                    className="size-14 rounded-full object-cover border"
                  />
                )}
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>
            <div className="pt-2 border-t">
              <Label className="text-[10px] font-black uppercase text-slate-500 mb-3 block">
                Assign Access Permissions
              </Label>
              {(() => {
                const sections: string[] = [];
                STAFF_PERMISSION_CATALOG.forEach((p) => {
                  if (p.section && !sections.includes(p.section)) sections.push(p.section);
                });
                return sections.map((section) => (
                  <div key={section} className="mb-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 px-1">{section}</p>
                    <div className="grid sm:grid-cols-2 gap-1.5">
                      {STAFF_PERMISSION_CATALOG.filter((p) => p.section === section).map((perm) => (
                        <label
                          key={perm.id}
                          className="flex items-center gap-2 p-2 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer"
                        >
                          <Checkbox
                            checked={permissions[perm.id]}
                            onCheckedChange={(c) =>
                              setPermissions((prev) => ({ ...prev, [perm.id]: !!c }))
                            }
                          />
                          <div>
                            <span className="text-xs font-semibold text-slate-700 block">{perm.label}</span>
                            {perm.description && <span className="text-[10px] text-slate-400">{perm.description}</span>}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
            <Button
              className="w-full bg-indigo-600 hover:bg-indigo-700 font-bold"
              disabled={processing}
              onClick={() => void handleCreate()}
            >
              {processing ? <Loader2 className="size-4 animate-spin mr-2" /> : <UserPlus className="size-4 mr-2" />}
              Create Staff ID
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          <Card className="border-none shadow-elegant overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!staff.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                      No staff members yet
                    </TableCell>
                  </TableRow>
                )}
                {staff.map((member) => {
                  const img = resolveStorageUrl(member.profile_image_url || "") || member.profile_image_url;
                  return (
                    <TableRow key={member.id} className={member.is_blocked ? "opacity-60" : ""}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {img ? (
                            <img src={img} alt="" className="size-10 rounded-full object-cover border" />
                          ) : (
                            <div className="size-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-primary">
                              {(member.full_name || member.email || "?")[0]}
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-sm">{member.full_name || "—"}</p>
                            <p className="text-xs text-muted-foreground">{member.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{member.mobile_number || "—"}</TableCell>
                      <TableCell>
                        {member.is_blocked ? (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                            Blocked
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                            Active
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-blue-600"
                            title="Edit"
                            onClick={() => openEdit(member)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className={member.is_blocked ? "text-emerald-600" : "text-amber-600"}
                            title={member.is_blocked ? "Unblock" : "Block"}
                            onClick={() => void toggleBlock(member)}
                          >
                            {member.is_blocked ? (
                              <CheckCircle2 className="size-4" />
                            ) : (
                              <Ban className="size-4" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-indigo-600"
                            title="Manage services"
                            onClick={() => openEdit(member)}
                          >
                            <Shield className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-red-500"
                            title="Delete"
                            onClick={() => void onDeleteStaff(member.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="mt-4">
          <EmployeeAttendancePanel
            employees={employees}
            currentUserId={currentUserId}
            isActive={isActive && subTab === "attendance"}
          />
        </TabsContent>

        <TabsContent value="leave-requests" className="mt-4">
          <AdminStaffLeaveRequestsPanel
            employees={employees}
            currentUserId={currentUserId}
            isActive={isActive && subTab === "leave-requests"}
          />
        </TabsContent>

        <TabsContent value="requirements" className="mt-4">
          <AdminStaffRequirementsPanel
            employees={employees}
            currentUserId={currentUserId}
            isActive={isActive && subTab === "requirements"}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Staff</DialogTitle>
            <DialogDescription>Update profile details and service access.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {profileFields(editForm, (k, v) => setEditForm((p) => ({ ...p, [k]: v })), {
              emailDisabled: true,
            })}
            <div className="space-y-2">
              <Label>Profile Image</Label>
              <div className="flex items-center gap-3">
                {(editImageFile || editForm.profile_image_url) && (
                  <img
                    src={
                      editImageFile
                        ? URL.createObjectURL(editImageFile)
                        : resolveStorageUrl(editForm.profile_image_url) || editForm.profile_image_url
                    }
                    alt=""
                    className="size-14 rounded-full object-cover border"
                  />
                )}
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setEditImageFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>
            <div className="pt-2 border-t space-y-3">
              <Label className="text-[10px] font-black uppercase text-slate-500">Service Access</Label>
              {(() => {
                const sections: string[] = [];
                STAFF_PERMISSION_CATALOG.forEach((p) => {
                  if (p.section && !sections.includes(p.section)) sections.push(p.section);
                });
                return sections.map((section) => (
                  <div key={section}>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5 px-1">{section}</p>
                    <div className="space-y-1">
                      {STAFF_PERMISSION_CATALOG.filter((p) => p.section === section).map((perm) => (
                        <div
                          key={perm.id}
                          className="flex items-center justify-between p-2 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                        >
                          <div>
                            <span className="text-sm font-semibold block">{perm.label}</span>
                            {perm.description && <span className="text-[10px] text-slate-400">{perm.description}</span>}
                          </div>
                          <Checkbox
                            checked={editPerms[perm.id]}
                            onCheckedChange={(c) =>
                              setEditPerms((prev) => ({ ...prev, [perm.id]: !!c }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button disabled={processing} onClick={() => void saveEdit()}>
              {processing && <Loader2 className="size-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
