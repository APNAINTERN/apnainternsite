import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, IdCard, Search, XCircle } from "lucide-react";
import { useGlobalLoadingEffect } from "@/hooks/useGlobalLoadingEffect";
import { loadingMessage } from "@/lib/loadingMessages";
import { toast } from "sonner";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { verifyIdCardPublic, type IdCardVerifyResult } from "@/lib/idCardVerify";

const VerifyIdCard = () => {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IdCardVerifyResult | null>(null);
  const [error, setError] = useState(false);
  const autoVerifiedRef = useRef(false);

  useGlobalLoadingEffect(loading, loadingMessage("verifying"));

  const handleVerify = useCallback(async (override?: string) => {
    const q = (override ?? query).trim();
    if (!q) {
      toast.error("Enter an ID card number (e.g. EZI/STF/001)");
      return;
    }
    setLoading(true);
    setError(false);
    setResult(null);
    try {
      const row = await verifyIdCardPublic(supabase, q);
      if (row.found && row.card) {
        setResult(row);
        toast.success("ID card verified successfully!");
      } else {
        setError(true);
        toast.error("No ID card found for this number.");
      }
    } catch (err: unknown) {
      setError(true);
      toast.error(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const cardParam = (searchParams.get("card") || searchParams.get("id") || "").trim();
    if (!cardParam || autoVerifiedRef.current) return;
    autoVerifiedRef.current = true;
    setQuery(cardParam);
    void handleVerify(cardParam);
  }, [searchParams, handleVerify]);

  const card = result?.card;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <SiteNav />
      <main className="flex-1 py-20">
        <div className="container mx-auto px-6 max-w-3xl">
          <div className="text-center mb-12">
            <div className="inline-flex size-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
              <IdCard className="size-8 text-primary" />
            </div>
            <h1 className="text-4xl font-black text-slate-900 mb-4">ID Card Verification</h1>
            <p className="text-slate-500 max-w-xl mx-auto">
              Scan the QR code on an Apna Intern ID card or enter the card number to verify authenticity.
            </p>
          </div>

          <Card className="p-8 md:p-10 shadow-elegant border-none mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleVerify()}
                  placeholder="ID Card Number (EZI/STD/001)"
                  className="h-12 pl-12 rounded-xl"
                />
              </div>
              <Button
                className="h-12 rounded-xl font-bold px-8"
                disabled={loading}
                onClick={() => void handleVerify()}
              >
                Verify
              </Button>
            </div>
          </Card>

          {error ? (
            <Card className="border-none p-8 text-center shadow-elegant">
              <XCircle className="mx-auto mb-3 size-12 text-rose-500" />
              <h2 className="text-xl font-bold text-slate-900">Not found</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                No matching ID card was found. Check the number and try again.
              </p>
            </Card>
          ) : null}

          {card ? (
            <Card className="border-none p-8 shadow-elegant space-y-4">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="size-6" />
                <h2 className="text-xl font-black">Valid ID Card</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Full Name</p>
                  <p className="font-bold text-slate-900">{card.user_name || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">ID Card Number</p>
                  <p className="font-bold text-slate-900">{card.card_number}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Position</p>
                  <p className="font-semibold text-slate-800">{card.position || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Phone Number</p>
                  <p className="font-semibold text-slate-800">{card.phone || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Email</p>
                  <p className="font-semibold text-slate-800">{card.user_email || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Category</p>
                  <Badge variant="secondary" className="mt-0.5 capitalize">
                    {(card.category || "user").replace(/_/g, " ")}
                  </Badge>
                </div>
              </div>
              {card.generated_at ? (
                <p className="text-xs text-muted-foreground">
                  Issued {new Date(card.generated_at).toLocaleString()}
                </p>
              ) : null}
            </Card>
          ) : null}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default VerifyIdCard;
