import {
  FileText,
  GraduationCap,
  Phone,
  Shield,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { resolveBnmuUniversityRollNumber } from "@/lib/certificateFormat";
import { isBnmuStudent } from "@/lib/feeRules";
import { getStudentDirectoryPassword } from "@/lib/studentCredentials";
import { studentMetadataOf } from "@/lib/studentProfileDisplay";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUser: Record<string, any> | null;
  onTransferLead?: (user: Record<string, any>) => void;
};

/** Full student profile dialog (Admin / Staff View Details parity). */
export function StudentProfileViewDialog({
  open,
  onOpenChange,
  selectedUser,
  onTransferLead,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden rounded-3xl border-none shadow-elegant">
        <DialogDescription className="sr-only">
          Student profile including personal, academic, emergency contacts, and stored metadata.
        </DialogDescription>
        <div className="bg-primary p-6 text-white">
          <DialogTitle className="text-2xl font-black flex items-center gap-2 flex-wrap">
            {selectedUser?.full_name || selectedUser?.metadata?.fullName || "Profile Details"}
          </DialogTitle>
          <p className="text-primary-foreground/80 text-xs mt-1">
            {selectedUser?.registration_id
              ? `Reg ID: ${selectedUser.registration_id}`
              : "Lead / Pending Registration"}
          </p>
        </div>
        {selectedUser && (
          <ScrollArea className="max-h-[70vh]">
            <div className="p-8 space-y-8">
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                  <User className="size-3" /> Personal Information
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  <div>
                    <Label className="text-[9px] uppercase text-muted-foreground font-bold">Gender</Label>
                    <p className="text-sm font-bold">{selectedUser.gender || selectedUser.metadata?.gender || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-[9px] uppercase text-muted-foreground font-bold">Email</Label>
                    <p className="text-sm font-bold truncate">
                      {selectedUser.email || selectedUser.user_email || "—"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-[9px] uppercase text-muted-foreground font-bold">Contact</Label>
                    <p className="text-sm font-bold">
                      {selectedUser.contact_number ||
                        selectedUser.user_phone ||
                        selectedUser.metadata?.contact_number ||
                        selectedUser.metadata?.contact ||
                        "—"}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-[9px] uppercase text-muted-foreground font-bold">
                      Parent / Guardian
                    </Label>
                    <p className="text-sm font-bold">
                      {selectedUser.parent_name || selectedUser.metadata?.parentName || "—"}
                    </p>
                  </div>
                </div>
              </div>

              <Separator className="bg-slate-100" />

              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                  <GraduationCap className="size-3" /> Academic Details
                </h4>
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <div className="col-span-2">
                    <Label className="text-[9px] uppercase text-muted-foreground font-bold">University</Label>
                    <p className="text-sm font-bold">
                      {selectedUser.university_name ||
                        selectedUser.metadata?.university_name ||
                        selectedUser.metadata?.university ||
                        "—"}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[9px] uppercase text-muted-foreground font-bold">College</Label>
                    <p className="text-sm font-bold">
                      {selectedUser.college_name ||
                        selectedUser.metadata?.college_name ||
                        selectedUser.metadata?.college ||
                        "—"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-[9px] uppercase text-muted-foreground font-bold">Degree</Label>
                    <p className="text-sm font-bold">{selectedUser.degree || selectedUser.metadata?.degree || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-[9px] uppercase text-muted-foreground font-bold">Department</Label>
                    <p className="text-sm font-bold">
                      {selectedUser.department || selectedUser.metadata?.department || "—"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-[9px] uppercase text-muted-foreground font-bold">Subject</Label>
                    <p className="text-sm font-bold">{selectedUser.metadata?.subject || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-[9px] uppercase text-muted-foreground font-bold">Session</Label>
                    <p className="text-sm font-bold">
                      {selectedUser.academic_session || selectedUser.metadata?.session || "—"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-[9px] uppercase text-muted-foreground font-bold">Semester</Label>
                    <p className="text-sm font-bold">
                      {selectedUser.class_semester ||
                        selectedUser.metadata?.semester ||
                        selectedUser.metadata?.classSem ||
                        "—"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-[9px] uppercase text-muted-foreground font-bold">
                      Registration No.
                    </Label>
                    <p className="text-sm font-bold">
                      {selectedUser.roll_number || selectedUser.metadata?.rollNo || "—"}
                    </p>
                  </div>
                  {isBnmuStudent(
                    selectedUser.university_name || selectedUser.metadata?.university_name
                  ) ? (
                    <div>
                      <Label className="text-[9px] uppercase text-muted-foreground font-bold">Roll No.</Label>
                      <p className="text-sm font-bold">
                        {selectedUser.university_roll_number ||
                          selectedUser.metadata?.university_roll_number ||
                          selectedUser.metadata?.universityRollNumber ||
                          resolveBnmuUniversityRollNumber(selectedUser) ||
                          "—"}
                      </p>
                    </div>
                  ) : null}
                  <div className="col-span-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <Label className="text-[9px] uppercase text-primary font-bold">Internship Domain</Label>
                    <p className="text-base font-black text-slate-900">
                      {selectedUser.internship_domain ||
                        selectedUser.metadata?.course ||
                        selectedUser.metadata?.internship_domain ||
                        "—"}
                    </p>
                  </div>
                </div>
              </div>

              <Separator className="bg-slate-100" />

              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                  <Phone className="size-3" /> Emergency Contacts
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  <div>
                    <Label className="text-[9px] uppercase text-muted-foreground font-bold">Contact Name</Label>
                    <p className="text-sm font-bold">
                      {selectedUser.emergency_name || selectedUser.metadata?.emName || "—"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-[9px] uppercase text-muted-foreground font-bold">Relationship</Label>
                    <p className="text-sm font-bold">
                      {selectedUser.emergency_relation || selectedUser.metadata?.emRel || "—"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-[9px] uppercase text-muted-foreground font-bold">Contact Phone</Label>
                    <p className="text-sm font-bold">
                      {selectedUser.emergency_contact || selectedUser.metadata?.emPhone || "—"}
                    </p>
                  </div>
                </div>
              </div>

              {typeof selectedUser.metadata?.consent_form_url === "string" &&
                selectedUser.metadata.consent_form_url.trim() !== "" && (
                  <>
                    <Separator className="bg-slate-100" />
                    <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-4 space-y-2">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                        <FileText className="size-3" /> Consent letter
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        File uploaded at registration — opens in a new tab.
                      </p>
                      <Button variant="outline" size="sm" className="font-bold" asChild>
                        <a
                          href={selectedUser.metadata.consent_form_url.trim()}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open consent letter
                        </a>
                      </Button>
                    </div>
                  </>
                )}

              {(selectedUser.reason || selectedUser.failure_reason) && (
                <>
                  <Separator className="bg-slate-100" />
                  <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
                    <Label className="text-[9px] uppercase text-red-600 font-bold">
                      Lead Status / Payment Issue
                    </Label>
                    <p className="text-sm font-bold text-red-700">
                      {selectedUser.reason || selectedUser.failure_reason}
                    </p>
                  </div>
                </>
              )}

              <div className="space-y-4 pt-6 border-t border-slate-100 bg-slate-50 p-6 rounded-2xl">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-600 flex items-center gap-2">
                  <Shield className="size-3" /> Technical Metadata (A2Z Details)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label className="text-[9px] uppercase text-orange-400 font-bold">
                      Account Password (directory)
                    </Label>
                    <p className="text-sm font-mono font-bold text-orange-700 bg-orange-100 px-2 py-1 rounded inline-block">
                      {getStudentDirectoryPassword(selectedUser) ||
                        "Not stored — use Reset Password or Resend Credentials"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-[9px] uppercase text-muted-foreground font-bold">Address</Label>
                    <p className="text-sm font-bold">{selectedUser.metadata?.address || "—"}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <Label className="text-[9px] uppercase text-slate-400 font-bold">Raw JSON Metadata</Label>
                  <pre className="text-[9px] bg-slate-900 text-slate-300 p-4 rounded-xl mt-2 overflow-x-auto max-h-48">
                    {JSON.stringify(studentMetadataOf(selectedUser), null, 2)}
                  </pre>
                </div>
              </div>

              <div className="flex justify-end gap-4 mt-8">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close View
                </Button>
                {!selectedUser.registration_id && onTransferLead ? (
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                    onClick={() => {
                      onOpenChange(false);
                      onTransferLead(selectedUser);
                    }}
                  >
                    Transfer to Student
                  </Button>
                ) : null}
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
