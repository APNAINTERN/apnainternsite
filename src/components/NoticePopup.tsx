import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Info, X } from "lucide-react";
import { RAZORPAY_CHECKOUT_END, RAZORPAY_CHECKOUT_START } from "@/lib/clientRazorpayPayment";

interface NoticePopupProps {
  page: 'home' | 'registration' | 'login';
}

export const NoticePopup = ({ page }: NoticePopupProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [checkoutActive, setCheckoutActive] = useState(false);
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

      if (data && data.notice_enabled) {
        const shouldShow = 
          page === 'home' ? data.show_on_home : 
          page === 'registration' ? data.show_on_registration : 
          data.show_on_login;

        if (shouldShow) {
          // Default values for new WhatsApp columns if they are not yet in the DB
          setSettings({
            whatsapp_link_enabled: true,
            whatsapp_link_url: 'https://whatsapp.com/channel/0029VbC9lvi3bbV8TS7TbB00',
            ...data
          });
          setIsOpen(true);
        }
      }
    };

    fetchSettings();
  }, [page]);

  useEffect(() => {
    const closeForPayment = () => {
      setIsOpen(false);
      setCheckoutActive(true);
      document.body.style.pointerEvents = "auto";
      document.body.style.overflow = "";
      document.body.removeAttribute("data-scroll-locked");
      document.documentElement.removeAttribute("data-scroll-locked");
    };
    const onCheckoutEnd = () => setCheckoutActive(false);
    window.addEventListener(RAZORPAY_CHECKOUT_START, closeForPayment);
    window.addEventListener(RAZORPAY_CHECKOUT_END, onCheckoutEnd);
    return () => {
      window.removeEventListener(RAZORPAY_CHECKOUT_START, closeForPayment);
      window.removeEventListener(RAZORPAY_CHECKOUT_END, onCheckoutEnd);
    };
  }, []);

  if (!settings || checkoutActive) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-[90vw] sm:max-w-md border-primary/20 shadow-2xl rounded-3xl overflow-hidden p-0 [&>button]:hidden flex flex-col max-h-[90vh]">
        <div className="bg-primary p-6 text-white relative shrink-0">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Info className="size-6 text-white" />
            </div>
            <DialogHeader className="text-left w-full pr-6">
              <DialogTitle className="text-xl font-black text-white leading-tight">
                {settings.notice_title}
              </DialogTitle>
              {settings.whatsapp_link_enabled && settings.whatsapp_link_url && (
                <div className="mt-4">
                  <a 
                    href={settings.whatsapp_link_url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="group relative flex items-center gap-3 bg-[#25D366] hover:bg-[#20ba5a] text-white p-2.5 sm:p-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden border border-white/20"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-700 ease-out"></div>
                    <div className="size-8 sm:size-10 bg-white/25 rounded-full flex items-center justify-center shrink-0 shadow-inner">
                      <svg className="size-5 sm:size-6 fill-white drop-shadow-sm" viewBox="0 0 24 24">
                        <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 001.333 4.993L2 22l5.185-1.358a9.93 9.93 0 004.825 1.243h.005c5.507 0 9.99-4.478 9.99-9.985A9.97 9.97 0 0012.012 2zm6.069 14.141c-.252.712-1.462 1.307-2.014 1.388-.5.074-1.15.107-1.845-.119a12.59 12.59 0 01-5.329-3.483 12.87 12.87 0 01-2.47-3.905c-.328-.564-.652-1.226-.652-1.89 0-.663.348-.99.475-1.127.127-.137.28-.201.42-.201.14 0 .282.001.405.007.133.007.313-.05.49.387.18.445.617 1.493.671 1.602.053.11.089.237.017.382-.072.146-.109.237-.218.364-.11.128-.231.286-.33.383-.11.11-.225.229-.097.45.127.221.564.931 1.213 1.51.838.746 1.543.978 1.763 1.088.22.11.348.092.475-.054.127-.146.546-.637.692-.855.146-.219.292-.183.49-.11.199.073 1.266.598 1.485.707.219.11.365.164.42.255.054.092.054.53-.198 1.242z"/>
                      </svg>
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="text-[9px] sm:text-[10px] font-bold text-white/90 uppercase tracking-[0.2em] mb-0.5">Stay Updated</span>
                      <span className="text-xs sm:text-sm font-black uppercase tracking-wide leading-none">JOIN WHATSAPP CHANNEL NOW</span>
                    </div>
                  </a>
                </div>
              )}
            </DialogHeader>
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 p-2 rounded-full text-white transition-all z-10 backdrop-blur-sm"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="p-6 bg-white overflow-y-auto flex-1">
          <div className="text-slate-600 leading-relaxed whitespace-pre-wrap font-medium">
            {settings.notice_message}
          </div>
        </div>
        <DialogFooter className="p-4 bg-slate-50 border-t flex flex-col sm:flex-row gap-2 shrink-0">
          {settings.whatsapp_link_enabled && settings.whatsapp_link_url && (
            <a 
              href={settings.whatsapp_link_url} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="w-full sm:flex-1"
            >
              <Button 
                className="w-full bg-[#25D366] hover:bg-[#20ba5a] text-white font-black rounded-xl gap-2 shadow-sm uppercase tracking-wider"
              >
                <svg className="size-5 fill-white" viewBox="0 0 24 24">
                  <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 001.333 4.993L2 22l5.185-1.358a9.93 9.93 0 004.825 1.243h.005c5.507 0 9.99-4.478 9.99-9.985A9.97 9.97 0 0012.012 2zm6.069 14.141c-.252.712-1.462 1.307-2.014 1.388-.5.074-1.15.107-1.845-.119a12.59 12.59 0 01-5.329-3.483 12.87 12.87 0 01-2.47-3.905c-.328-.564-.652-1.226-.652-1.89 0-.663.348-.99.475-1.127.127-.137.28-.201.42-.201.14 0 .282.001.405.007.133.007.313-.05.49.387.18.445.617 1.493.671 1.602.053.11.089.237.017.382-.072.146-.109.237-.218.364-.11.128-.231.286-.33.383-.11.11-.225.229-.097.45.127.221.564.931 1.213 1.51.838.746 1.543.978 1.763 1.088.22.11.348.092.475-.054.127-.146.546-.637.692-.855.146-.219.292-.183.49-.11.199.073 1.266.598 1.485.707.219.11.365.164.42.255.054.092.054.53-.198 1.242z"/>
                </svg>
                JOIN WHATSAPP CHANNEL NOW
              </Button>
            </a>
          )}
          <Button 
            variant="outline"
            className="w-full sm:flex-1 font-black rounded-xl"
            onClick={() => setIsOpen(false)}
          >
            Understood
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
