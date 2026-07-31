import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, KeyRound } from "lucide-react";

interface ChangePinModalProps {
  userId: string;
  trigger?: React.ReactNode;
}

export const ChangePinModal = ({ userId, trigger }: ChangePinModalProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"verify" | "new">("verify");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [loading, setLoading] = useState(false);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      // Reset state on close
      setTimeout(() => {
        setStep("verify");
        setCurrentPin("");
        setNewPin("");
      }, 200);
    }
  };

  const handleVerify = async () => {
    if (currentPin.length !== 4) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_security")
        .select("security_pin")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      // If no PIN exists yet, allow them to just set a new one
      if (!data) {
        setStep("new");
        return;
      }

      if (data.security_pin === currentPin) {
        setStep("new");
      } else {
        toast.error("Incorrect current PIN");
        setCurrentPin("");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to verify PIN");
    } finally {
      setLoading(false);
    }
  };

  const handleSetNew = async () => {
    if (newPin.length !== 4) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("user_security")
        .upsert({ user_id: userId, security_pin: newPin });

      if (error) throw error;

      toast.success("Security Code updated successfully!");
      setIsOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to update Security Code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <KeyRound className="size-4" /> Change Security Code
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" />
            {step === "verify" ? "Verify Current Code" : "Set New Security Code"}
          </DialogTitle>
          <DialogDescription>
            {step === "verify" 
              ? "Please enter your current 4-digit security code to continue."
              : "Enter a new 4-digit security code for your account."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-6 flex flex-col items-center justify-center space-y-6">
          {step === "verify" ? (
            <>
              <InputOTP maxLength={4} value={currentPin} onChange={setCurrentPin}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} className="size-14 text-2xl font-black" />
                  <InputOTPSlot index={1} className="size-14 text-2xl font-black" />
                  <InputOTPSlot index={2} className="size-14 text-2xl font-black" />
                  <InputOTPSlot index={3} className="size-14 text-2xl font-black" />
                </InputOTPGroup>
              </InputOTP>
              <Button 
                className="w-full h-12" 
                disabled={currentPin.length !== 4 || loading}
                onClick={handleVerify}
              >
                {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                Verify Code
              </Button>
            </>
          ) : (
            <>
              <InputOTP maxLength={4} value={newPin} onChange={setNewPin}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} className="size-14 text-2xl font-black border-primary/50" />
                  <InputOTPSlot index={1} className="size-14 text-2xl font-black border-primary/50" />
                  <InputOTPSlot index={2} className="size-14 text-2xl font-black border-primary/50" />
                  <InputOTPSlot index={3} className="size-14 text-2xl font-black border-primary/50" />
                </InputOTPGroup>
              </InputOTP>
              <Button 
                className="w-full h-12" 
                disabled={newPin.length !== 4 || loading}
                onClick={handleSetNew}
              >
                {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                Save New Code
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
