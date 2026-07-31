import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, ArrowLeft } from "lucide-react";
import { fetchStudentAssignmentResult } from "@/lib/assignmentApi";

export default function AssignmentResult() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return navigate("/login");

        const impersonateId = localStorage.getItem("impersonate_id");
        const studentId = impersonateId || session.user.id;

        const result = await fetchStudentAssignmentResult(supabase, id!, studentId);

        if (!result) {
          toast.error("Submission not found.");
          navigate("/dashboard");
          return;
        }

        setTitle(String(result.assignment.title || "Assignment"));
      } catch (err: unknown) {
        console.error(err);
        toast.error("Failed to load submission status");
        navigate("/dashboard");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <Card className="max-w-md w-full p-8 text-center border-none shadow-elegant space-y-6">
        <div className="flex justify-center">
          <div className="size-16 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="size-9 text-emerald-600" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">Assignment submitted successfully</h1>
          <p className="text-sm font-semibold text-primary">{title}</p>
          <p className="text-sm text-muted-foreground">
            Thank you. You can return to your dashboard or submit again if you need to update your work.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Button className="gap-2" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="size-4" />
            Back to Dashboard
          </Button>
          <Button variant="outline" onClick={() => navigate(`/assignment/${id}`)}>
            Resubmit
          </Button>
        </div>
      </Card>
    </div>
  );
}
