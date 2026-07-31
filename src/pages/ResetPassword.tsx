import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  REGISTRATION_PASSWORD_MIN_LENGTH,
  setLoginPasswordViaRpc,
  userFacingPasswordError,
} from "@/lib/registrationPassword";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [success, setSuccess] = useState(false);

  const isRecoveryLink = useMemo(() => {
    const hash = window.location.hash || "";
    return hash.includes("type=recovery");
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;

      if (isRecoveryLink || !!session) {
        setReady(true);
      } else {
        toast.error("Invalid or expired reset link. Please request again.");
      }
    };

    init();
    return () => { mounted = false; };
  }, [isRecoveryLink]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < REGISTRATION_PASSWORD_MIN_LENGTH) {
      toast.error(`Password must be at least ${REGISTRATION_PASSWORD_MIN_LENGTH} characters`);
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await setLoginPasswordViaRpc(supabase, password);

      await supabase.auth.signOut();
      setSuccess(true);
      toast.success("Password reset successful");
    } catch (error: unknown) {
      toast.error(userFacingPasswordError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteNav />
      <main className="flex-1 gradient-soft py-12 md:py-20">
        <div className="container mx-auto px-4">
          <Card className="max-w-md mx-auto p-8 md:p-10 shadow-elegant animate-fade-in-up">
            {success ? (
              <div className="text-center space-y-4">
                <div className="inline-flex size-16 items-center justify-center rounded-full bg-primary/10">
                  <CheckCircle2 className="size-9 text-primary" />
                </div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900">Password Reset Successful</h1>
                <p className="text-sm text-slate-500">
                  Your password has been updated. Please login with your new password.
                </p>
                <Button className="w-full h-12 font-black" onClick={() => navigate("/login")}>
                  Go to Login
                </Button>
              </div>
            ) : (
              <>
                <div className="text-center mb-8">
                  <h1 className="text-3xl font-black tracking-tight text-slate-900 mb-2">Reset Password</h1>
                  <p className="text-sm text-slate-500 font-medium">
                    Set a new password for your account.
                  </p>
                </div>

                {!ready ? (
                  <div className="text-center space-y-4">
                    <p className="text-sm text-slate-500">
                      Please open the password reset link sent to your email.
                    </p>
                    <Button variant="outline" className="w-full" onClick={() => navigate("/login")}>
                      Back to Login
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleReset} className="space-y-5">
                    <div className="space-y-2">
                      <Label className="text-xs font-black uppercase tracking-widest text-slate-500 ml-1">
                        New Password
                      </Label>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          className="h-12 bg-slate-50 border-none shadow-inner rounded-xl pl-4 pr-12"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-black uppercase tracking-widest text-slate-500 ml-1">
                        Confirm New Password
                      </Label>
                      <Input
                        type={showPassword ? "text" : "password"}
                        className="h-12 bg-slate-50 border-none shadow-inner rounded-xl pl-4"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />
                    </div>

                    <Button type="submit" className="w-full h-12 font-black" disabled={loading}>
                      {loading ? <Loader2 className="size-5 animate-spin mr-2" /> : null}
                      Update Password
                    </Button>
                  </form>
                )}
              </>
            )}
          </Card>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default ResetPassword;
