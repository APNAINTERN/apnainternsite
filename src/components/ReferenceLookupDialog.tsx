import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { fetchPublicColleges, fetchPublicUniversities } from "@/lib/registrationCatalog";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import type { PrefilledStudent } from "@/components/PrefilledRegistrationForm";

interface ReferenceLookupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMatched: (data: PrefilledStudent) => void;
}

interface University { id: string; name: string }
interface College { id: string; name: string; university_id: string }

export const ReferenceLookupDialog = ({
  open,
  onOpenChange,
  onMatched,
}: ReferenceLookupDialogProps) => {
  const [refNo, setRefNo] = useState("");
  const [universityId, setUniversityId] = useState("");
  const [collegeId, setCollegeId] = useState("");
  const [unis, setUnis] = useState<University[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [u, c] = await Promise.all([
        fetchPublicUniversities(supabase),
        fetchPublicColleges(supabase),
      ]);
      setUnis(u);
      setColleges(c);
    })();
  }, [open]);

  const filteredColleges = colleges.filter(
    (c) => !universityId || c.university_id === universityId
  );

  const selectedUni = unis.find((u) => u.id === universityId);
  const selectedCollege = colleges.find((c) => c.id === collegeId);

  async function handleSearch() {
    if (!refNo.trim()) {
      toast.error("Enter the reference number");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("match_prefilled_student", {
        p_reference_number: refNo.trim(),
        p_dob: null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const status: string | undefined = row?.status;
      switch (status) {
        case "matched": {
          const payload = row.data || {};
          // If the operator picked a university/college in the dialog, that
          // takes precedence over whatever the matched row carried.
          const finalUniId = universityId || payload.university_id || null;
          const finalCollegeId = collegeId || payload.college_id || null;
          onMatched({
            id: payload.id,
            reference_number: payload.reference_number || refNo.trim(),
            full_name: payload.full_name,
            father_name: payload.father_name,
            gender: payload.gender,
            dob: payload.dob,
            university_id: finalUniId,
            university_name: selectedUni?.name || payload.university_name,
            college_id: finalCollegeId,
            college_name: selectedCollege?.name || payload.college_name,
            degree: payload.degree,
            department: payload.department,
            subject: payload.subject,
            session: payload.session,
            semester: payload.semester,
            internship_domain: payload.internship_domain,
            raw_data: payload.raw_data,
          });
          onOpenChange(false);
          setRefNo("");
          setUniversityId("");
          setCollegeId("");
          break;
        }
        case "claimed":
          toast.error(
            "This reference has already been used to register. Please log in instead."
          );
          break;
        case "none":
        default:
          toast.error(
            "No record found for this reference number. Please use normal registration."
          );
          break;
      }
    } catch (e: any) {
      toast.error(e.message || "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Check Your Reference No.</DialogTitle>
          <DialogDescription>
            Enter the university admission reference number to pull up the
            student's record and pre-fill the registration form. The university
            and college pickers are optional.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Reference Number *</Label>
            <Input
              placeholder="Enter Your Reference No."
              value={refNo}
              onChange={(e) => setRefNo(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>University</Label>
              <Select
                value={universityId}
                onValueChange={(v) => {
                  setUniversityId(v);
                  setCollegeId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select university" />
                </SelectTrigger>
                <SelectContent>
                  {unis.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>College</Label>
              <Select
                value={collegeId}
                onValueChange={setCollegeId}
                disabled={!universityId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={universityId ? "Select college" : "Pick university first"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {filteredColleges.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter className="flex-row gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSearch} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Search
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
