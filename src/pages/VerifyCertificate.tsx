import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  Search,
  CheckCircle2,
  XCircle,
  Award,
  User,
  ShieldCheck,
  Download,
  Sparkles,
  Hash,
  GraduationCap,
} from "lucide-react";
import { toast } from "sonner";
import { IssuedCertificateDocument } from "@/components/IssuedCertificateDocument";
import { certificateDisplayFromRecord } from "@/lib/certificateFormat";
import { verifyCertificatePublic } from "@/lib/certificateVerify";
import { downloadCertificatePdf } from "@/lib/certificatePdf";
import { BrandWordmark } from "@/components/brand/BrandWordmark";
import { useGlobalLoadingEffect } from "@/hooks/useGlobalLoadingEffect";
import { loadingMessage } from "@/lib/loadingMessages";

type SearchMode = "quick" | "name-roll";

const VerifyCertificate = () => {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<SearchMode>("quick");
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

  useGlobalLoadingEffect(loading, loadingMessage("verifying"));
  useGlobalLoadingEffect(generating, loadingMessage("generatingCertificate"));

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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }, [query, verifyName, verifyRoll]);

  useEffect(() => {
    const certParam = (searchParams.get("cert") || searchParams.get("id") || "").trim();
    if (!certParam || autoVerifiedRef.current) return;
    autoVerifiedRef.current = true;
    setQuery(certParam);
    setMode("quick");
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
        `ApnaIntern_Certificate_${cert?.certificate_id || student?.full_name?.replace(/\s+/g, "_") || "Student"}.pdf`
      );
      toast.success("Certificate downloaded!");
    } catch {
      toast.error("Download failed. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f8fc]">
      <SiteNav />

      <main className="flex-1 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 home-mesh-bg opacity-80" aria-hidden />
        <div
          className="pointer-events-none absolute -top-24 right-0 size-[420px] rounded-full bg-[var(--brand-blue)]/10 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute bottom-0 left-0 size-[320px] rounded-full bg-[var(--brand-orange)]/10 blur-3xl"
          aria-hidden
        />

        <div className="relative mx-auto max-w-5xl px-6 py-14 sm:py-20">
          <div className="mb-10 text-center animate-fade-in-up">
            <Badge className="mb-4 rounded-full border-0 bg-white/80 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-primary shadow-sm">
              <Sparkles className="mr-1.5 inline size-3.5" />
              Official verification
            </Badge>
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Is this certificate{" "}
              <span className="home-gradient-text">real?</span>
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
              Quick check for employers, colleges, and students. Search by certificate ID, email,
              phone, or student name with roll number — takes a few seconds.
            </p>
            <div className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-500">
              <ShieldCheck className="size-4 text-primary" />
              <span>Verified against Apna Intern records</span>
              <span className="text-slate-300">·</span>
              <BrandWordmark size="sm" showTagline={false} className="inline-flex" />
            </div>
          </div>

          <Card className="home-glass mb-8 overflow-hidden border-0 p-0 shadow-elegant animate-fade-in-up">
            <div className="border-b border-slate-200/70 bg-white/50 px-4 py-3 sm:px-6">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMode("quick")}
                  className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wide transition-all ${
                    mode === "quick"
                      ? "bg-primary text-white shadow-md"
                      : "bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Hash className="mr-1.5 inline size-3.5" />
                  Quick search
                </button>
                <button
                  type="button"
                  onClick={() => setMode("name-roll")}
                  className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wide transition-all ${
                    mode === "name-roll"
                      ? "bg-primary text-white shadow-md"
                      : "bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <GraduationCap className="mr-1.5 inline size-3.5" />
                  Name + roll no.
                </button>
              </div>
            </div>

            <div className="space-y-5 p-6 sm:p-8">
              {mode === "quick" ? (
                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Certificate ID, email, or phone"
                      className="h-14 rounded-2xl border-2 border-slate-200/80 bg-white pl-12 text-base font-semibold shadow-sm focus:border-primary/40"
                      onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                    />
                  </div>
                  <Button
                    size="lg"
                    className="h-14 rounded-2xl px-8 text-base font-bold shadow-md"
                    onClick={handleVerify}
                    disabled={loading}
                  >
                    Check now
                  </Button>
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      value={verifyName}
                      onChange={(e) => setVerifyName(e.target.value)}
                      placeholder="Student full name"
                      className="h-12 rounded-xl border-2 border-slate-200/80 bg-white font-semibold"
                      onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                    />
                    <Input
                      value={verifyRoll}
                      onChange={(e) => setVerifyRoll(e.target.value)}
                      placeholder="University roll / enrolment no."
                      className="h-12 rounded-xl border-2 border-slate-200/80 bg-white font-semibold"
                      onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                    />
                  </div>
                  <Button
                    className="w-full rounded-2xl font-bold sm:w-auto"
                    size="lg"
                    onClick={handleVerify}
                    disabled={loading}
                  >
                    Verify by name & roll
                  </Button>
                </>
              )}

              <p className="text-center text-xs text-slate-500 sm:text-left">
                Tip: share the certificate ID from the PDF or offer letter for the fastest match.
              </p>
            </div>
          </Card>

          {cert && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-500 to-teal-600 p-6 text-white shadow-lg sm:p-8">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                      <CheckCircle2 className="size-8" />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-100">
                        Verified authentic
                      </p>
                      <h3 className="font-display mt-1 text-2xl font-extrabold">Certificate is valid</h3>
                      <p className="mt-1 text-sm text-emerald-50/90">
                        Issued by Apna Intern · ID: {cert.certificate_id}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    className="shrink-0 gap-2 rounded-xl font-bold"
                    onClick={downloadCert}
                    disabled={generating}
                  >
                    <Download className="size-4" />
                    Download PDF
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { icon: User, label: "Intern", value: student?.full_name || cert.student_name },
                  { icon: Award, label: "Program", value: student?.course || cert.internship_name },
                  { icon: ShieldCheck, label: "Status", value: cert.status || "Active", accent: true },
                ].map(({ icon: Icon, label, value, accent }) => (
                  <Card
                    key={label}
                    className="home-glass border-0 p-5 shadow-sm transition-transform hover:-translate-y-0.5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="size-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          {label}
                        </p>
                        <p
                          className={`truncate font-bold text-sm ${
                            accent ? "text-emerald-600" : "text-slate-800"
                          }`}
                        >
                          {value}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <Card className="overflow-hidden border-0 bg-slate-200/60 p-4 shadow-inner sm:p-6">
                <p className="mb-4 text-center text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
                  Certificate preview
                </p>
                <div className="flex justify-center overflow-x-auto rounded-2xl bg-white/50 p-4">
                  <IssuedCertificateDocument ref={certRef} data={certificateDisplayData} />
                </div>
              </Card>
            </div>
          )}

          {error && (
            <Card className="animate-fade-in-up border-0 bg-white p-10 text-center shadow-elegant">
              <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-red-50">
                <XCircle className="size-9 text-red-500" />
              </div>
              <h3 className="font-display text-xl font-extrabold text-slate-900">
                Couldn&apos;t find a match
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
                Double-check the certificate ID, email, or phone. If you searched by name, make sure
                the roll number matches university records exactly.
              </p>
              <Button variant="outline" className="mt-6 rounded-full font-bold" onClick={() => setError(false)}>
                Try again
              </Button>
            </Card>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
};

export default VerifyCertificate;
