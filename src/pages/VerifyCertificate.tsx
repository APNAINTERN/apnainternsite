import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Search, CheckCircle2, XCircle, Loader2, Award, User, ShieldCheck, Download } from "lucide-react";
import { toast } from "sonner";
import { IssuedCertificateDocument } from "@/components/IssuedCertificateDocument";
import {
  certificateDisplayFromRecord,
} from "@/lib/certificateFormat";
import { verifyCertificatePublic } from "@/lib/certificateVerify";
import { downloadCertificatePdf } from "@/lib/certificatePdf";

const VerifyCertificate = () => {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [verifyName, setVerifyName] = useState("");
  const [verifyRoll, setVerifyRoll] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [cert, setCert] = useState<any>(null);
  const [student, setStudent] = useState<any>(null);
  const [error, setError] = useState(false);
  const certRef = useRef<HTMLDivElement>(null);
  const autoVerifiedRef = useRef(false);

  const certificateDisplayData = useMemo(
    () => certificateDisplayFromRecord(student, cert),
    [student, cert]
  );

  const handleVerify = useCallback(async () => {
    const q = query.trim();
    const nameQ = verifyName.trim();
    const rollQ = verifyRoll.trim();
    if (!q && !(nameQ && rollQ)) {
      return toast.error("Enter Certificate ID / Email / Phone, or both name and university roll number");
    }
    setLoading(true);
    setError(false);
    setCert(null);
    setStudent(null);

    try {
      const result = await verifyCertificatePublic(supabase, {
        query: q || undefined,
        studentName: nameQ || undefined,
        rollNumber: rollQ || undefined,
      });

      if (result.found && result.cert) {
        setCert(result.cert);
        setStudent(result.student);
        toast.success("Certificate verified successfully!");
      } else {
        setError(true);
        toast.error("No certificate found for this query.");
      }
    } catch (err: any) {
      toast.error(err.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  }, [query, verifyName, verifyRoll]);

  useEffect(() => {
    const certParam = (searchParams.get("cert") || searchParams.get("id") || "").trim();
    if (!certParam || autoVerifiedRef.current) return;
    autoVerifiedRef.current = true;
    setQuery(certParam);
  }, [searchParams]);

  useEffect(() => {
    const certParam = (searchParams.get("cert") || searchParams.get("id") || "").trim();
    if (!certParam || query !== certParam || loading || cert) return;
    void handleVerify();
  }, [searchParams, query, loading, cert, handleVerify]);

  const downloadCert = async () => {
    if (!certRef.current) return;
    setGenerating(true);
    try {
      await downloadCertificatePdf(
        certRef.current,
        `EzyIntern_Certificate_${cert?.certificate_id || student?.full_name?.replace(/\s+/g, "_") || "Student"}.pdf`
      );
      toast.success("Certificate downloaded!");
    } catch {
      toast.error("Download failed. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <SiteNav />
      <main className="flex-1 py-20">
        <div className="container mx-auto px-6 max-w-5xl">
          <div className="text-center mb-12">
            <div className="inline-flex size-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
              <Search className="size-8 text-primary" />
            </div>
            <h1 className="text-4xl font-black text-slate-900 mb-4">Certificate Verification</h1>
            <p className="text-slate-500 max-w-xl mx-auto">
              Verify the authenticity of EzyIntern certificates. Use Certificate ID, email, phone, or student name with university roll number.
            </p>
          </div>

          <Card className="p-8 md:p-12 shadow-elegant border-none mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-slate-400" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Certificate ID / Email / Phone Number"
                  className="h-14 pl-12 text-lg font-bold border-2 focus:border-primary/50"
                  onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                />
              </div>
              <Button size="lg" className="h-14 px-10 font-bold text-lg" onClick={handleVerify} disabled={loading}>
                {loading ? <Loader2 className="size-5 animate-spin" /> : "Verify Now"}
              </Button>
            </div>
          </Card>

          <Card className="p-6 md:p-8 shadow-elegant border-none mb-12">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 text-center">
              Or verify by name + roll number
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <Input
                value={verifyName}
                onChange={(e) => setVerifyName(e.target.value)}
                placeholder="Student full name"
                className="h-12 font-bold"
                onKeyDown={(e) => e.key === "Enter" && handleVerify()}
              />
              <Input
                value={verifyRoll}
                onChange={(e) => setVerifyRoll(e.target.value)}
                placeholder="University roll / enrolment number"
                className="h-12 font-bold"
                onKeyDown={(e) => e.key === "Enter" && handleVerify()}
              />
            </div>
            <div className="mt-4 flex justify-center">
              <Button variant="outline" className="font-bold" onClick={handleVerify} disabled={loading}>
                Verify by name & roll
              </Button>
            </div>
          </Card>

          {cert && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="bg-green-600 p-5 rounded-2xl text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <CheckCircle2 className="size-8 shrink-0" />
                  <div>
                    <h3 className="text-xl font-bold">Authentic Certificate</h3>
                    <p className="text-sm opacity-80">Verified and issued by EzyIntern — Certificate ID: {cert.certificate_id}</p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  className="gap-2 shrink-0 font-bold"
                  onClick={downloadCert}
                  disabled={generating}
                >
                  {generating ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                  Download Certificate
                </Button>
              </div>

              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { icon: User, label: "Intern Name", value: student?.full_name || cert.student_name },
                  { icon: Award, label: "Program", value: student?.course || cert.internship_name },
                  { icon: ShieldCheck, label: "Status", value: cert.status || "Active", green: true },
                ].map(({ icon: Icon, label, value, green }) => (
                  <Card key={label} className="p-4 border-none shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-full bg-slate-100 flex items-center justify-center text-primary shrink-0">
                        <Icon className="size-5" />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-slate-400">{label}</p>
                        <p className={`font-bold text-sm ${green ? "text-green-600" : ""}`}>{value}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="bg-slate-200 p-6 rounded-2xl">
                <p className="text-xs font-bold uppercase text-slate-500 mb-4 text-center tracking-widest">
                  Certificate Preview
                </p>
                <div className="flex justify-center overflow-x-auto">
                  <IssuedCertificateDocument ref={certRef} data={certificateDisplayData} />
                </div>
              </div>
            </div>
          )}

          {error && (
            <Card className="p-10 text-center border-none shadow-elegant bg-red-50 animate-fade-in-up">
              <XCircle className="size-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-red-900 mb-2">Verification Failed</h3>
              <p className="text-red-700">No certificate found for the provided ID, email, or phone number. Please double-check and try again, or contact support.</p>
            </Card>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default VerifyCertificate;
