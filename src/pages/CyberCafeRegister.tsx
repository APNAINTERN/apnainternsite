import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { supabase } from "@/integrations/supabase/client";
import { ADMIN_LOGIN_PATH, CYBER_CAFE_LOGIN_PATH } from "@/lib/authRoutes";
import { REGISTRATION_PASSWORD_MIN_LENGTH } from "@/lib/registrationPassword";
import { registerCybercafePartner } from "@/lib/registerCybercafePartner";
import { toast } from "sonner";
import { Loader2, Store, CheckCircle2, ShieldCheck, IndianRupee, BarChart3, Users, Laptop, ArrowRight, Star, FileText, LogIn } from "lucide-react";

const CyberCafeRegister = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    owner_name: "",
    email: "",
    password: "",
    shop_name: "",
    location: "",
    phone: "",
  });

  // SEO Implementation
  useEffect(() => {
    document.title = "Partner with EzyIntern | EzyIntern Cyber Cafe Program";
    
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.setAttribute('name', 'description');
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute('content', 'Join the EzyIntern Cyber Cafe Partner Program. Get authorized to register students for UGC-approved internships, increase footfall, and earn commissions. Apply now!');

    return () => {
      document.title = "EzyIntern - Internship Platform";
      metaDescription?.setAttribute('content', 'EzyIntern provides UGC-compliant internship programmes, digital certification, and academic credit tracking.');
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.owner_name || !formData.email || !formData.password || !formData.shop_name || !formData.location || !formData.phone) {
      toast.error("All fields are required");
      return;
    }

    if (formData.password.trim().length < REGISTRATION_PASSWORD_MIN_LENGTH) {
      toast.error(`Password must be at least ${REGISTRATION_PASSWORD_MIN_LENGTH} characters`);
      return;
    }

    setLoading(true);
    try {
      await registerCybercafePartner(supabase, {
        owner_name: formData.owner_name,
        email: formData.email,
        password: formData.password,
        shop_name: formData.shop_name,
        location: formData.location,
        phone: formData.phone,
      });

      toast.success("Registration successful! Please log in. Your application will be reviewed shortly.");
      setIsModalOpen(false);
      navigate(CYBER_CAFE_LOGIN_PATH);
      
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : "Partner registration failed. Please try again.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const advantages = [
    {
      icon: <ShieldCheck className="size-8 text-emerald-500" />,
      title: "Government Compliant",
      desc: "Provide students with officially recognized UGC-compliant internships directly from your shop."
    },
    {
      icon: <IndianRupee className="size-8 text-blue-500" />,
      title: "New Revenue Stream",
      desc: "Earn extra income by charging standard service fees for helping students complete their applications."
    },
    {
      icon: <Laptop className="size-8 text-purple-500" />,
      title: "Increased Footfall",
      desc: "Students will visit your cafe not just for registration, but for daily classes and assignment submissions."
    },
    {
      icon: <BarChart3 className="size-8 text-orange-500" />,
      title: "Partner Dashboard",
      desc: "Track every student you register. See their payment status and internship progress in real-time."
    }
  ];

  const steps = [
    {
      step: "01",
      title: "Sign Up Online",
      desc: "Click the register button and fill in your basic shop and owner details to create your partner account."
    },
    {
      step: "02",
      title: "Quick onboarding",
      desc: "Log into your dashboard while we verify your application (usually within 12–24 hours)."
    },
    {
      step: "03",
      title: "Start Registering",
      desc: "Once approved (usually within 12-24 hrs), start registering students directly from your portal!"
    }
  ];

  const FormContent = (
    <form onSubmit={handleRegister} className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs uppercase font-bold text-slate-500">Shop / Cafe Name</Label>
        <Input name="shop_name" value={formData.shop_name} onChange={handleChange} placeholder="Super Net Cafe" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs uppercase font-bold text-slate-500">Owner Name</Label>
          <Input name="owner_name" value={formData.owner_name} onChange={handleChange} placeholder="John Doe" required />
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase font-bold text-slate-500">Phone</Label>
          <Input type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder="10-digit number" required />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-xs uppercase font-bold text-slate-500">Email Address</Label>
        <Input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="cafe@example.com" required />
      </div>
      <div className="space-y-2">
        <Label className="text-xs uppercase font-bold text-slate-500">Complete Address</Label>
        <Input name="location" value={formData.location} onChange={handleChange} placeholder="City, State, Pincode" required />
      </div>
      <div className="space-y-2">
        <Label className="text-xs uppercase font-bold text-slate-500">Password</Label>
        <Input
          type="password"
          name="password"
          value={formData.password}
          onChange={handleChange}
          placeholder={`Min ${REGISTRATION_PASSWORD_MIN_LENGTH} characters`}
          autoComplete="new-password"
          required
        />
      </div>
      <Button type="submit" className="w-full h-12 text-md font-bold mt-4" disabled={loading}>
        {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Submit Application"}
      </Button>
      <p className="text-center text-xs text-slate-500 mt-4">
        Already a partner? <Link to={CYBER_CAFE_LOGIN_PATH} className="text-primary font-bold hover:underline">Login here</Link>
      </p>
    </form>
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans">
      <SiteNav />
      
      {/* Hero Section */}
      <section className="relative bg-slate-900 text-white overflow-hidden py-24 md:py-32">
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-20" style={{ maskImage: "linear-gradient(180deg, white, rgba(255,255,255,0))", WebkitMaskImage: "linear-gradient(180deg, white, rgba(255,255,255,0))" }}></div>
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/20 blur-[100px] rounded-full"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-500/20 blur-[100px] rounded-full"></div>
        
        <div className="container mx-auto px-4 relative z-10 text-center max-w-4xl">
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 px-4 py-1.5 mb-6 text-xs tracking-widest uppercase">
            Official Partnership Program
          </Badge>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 leading-tight">
            Transform Your Cyber Cafe Into A <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-400">Career Hub</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-400 mb-10 leading-relaxed font-medium max-w-2xl mx-auto">
            Partner with EzyIntern. Help local students secure UGC-approved internships, grow your daily footfall, and open a new stream of revenue.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
              <DialogTrigger asChild>
                <Button className="h-14 px-8 text-lg font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-900/50 transition-all rounded-full gap-2">
                  Apply Now <ArrowRight className="size-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[450px] p-6 border-none shadow-2xl rounded-2xl">
                <DialogHeader className="mb-4">
                  <div className="mx-auto size-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 mb-4">
                    <Store className="size-6" />
                  </div>
                  <DialogTitle className="text-2xl text-center font-black">Partner Registration</DialogTitle>
                  <DialogDescription className="sr-only">Fill out this form to register as a cyber cafe partner.</DialogDescription>
                </DialogHeader>
                {FormContent}
              </DialogContent>
            </Dialog>
            <Button variant="outline" className="h-14 px-8 text-lg font-bold border-slate-700 text-white bg-slate-800 hover:bg-slate-700 rounded-full" onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}>
              Learn More
            </Button>
            <Button
              variant="outline"
              className="h-14 px-8 text-lg font-bold border-emerald-500/60 text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/50 rounded-full gap-2"
              asChild
            >
              <Link to={CYBER_CAFE_LOGIN_PATH}>
                <LogIn className="size-5" />
                Cyber Login
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Advantages Section */}
      <section className="py-20 md:py-32 bg-white relative">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4">Why Partner With EzyIntern?</h2>
            <p className="text-slate-600 text-lg">We provide you with all the tools needed to seamlessly register students and manage their lifecycle.</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {advantages.map((adv, i) => (
              <Card key={i} className="p-8 border-none shadow-soft hover:shadow-xl transition-all duration-300 group bg-slate-50 hover:bg-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110">
                  {adv.icon}
                </div>
                <div className="mb-6 relative z-10">{adv.icon}</div>
                <h3 className="text-xl font-bold text-slate-900 mb-3 relative z-10">{adv.title}</h3>
                <p className="text-slate-600 leading-relaxed text-sm relative z-10">{adv.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features Showcase Section */}
      <section className="py-20 md:py-32 bg-slate-50 border-y border-slate-200">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <h2 className="text-3xl md:text-4xl font-black text-slate-900 leading-tight">
                A Dedicated Dashboard Just For Your Business
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed">
                Say goodbye to tracking student registrations on paper. Our modern partner dashboard gives you complete control over your applications.
              </p>
              <ul className="space-y-5">
                {[
                  "Real-time tracking of successful payments",
                  "View approval status in your dashboard",
                  "One-click direct student registration link",
                  "Monitor abandoned applications for follow-ups"
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-4 text-slate-700 font-medium bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                    <CheckCircle2 className="size-6 text-emerald-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-[2.5rem] blur-xl opacity-30"></div>
              <img src="https://images.unsplash.com/photo-1531482615713-2afd69097998?q=80&w=1200&auto=format&fit=crop" alt="Student registering at Cyber Cafe" className="relative w-full rounded-[2rem] shadow-2xl border-4 border-white bg-slate-900 object-cover aspect-video" />
            </div>
          </div>
        </div>
      </section>

      {/* Steps Section */}
      <section id="how-it-works" className="py-20 md:py-32 bg-white">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4">How It Works</h2>
            <p className="text-slate-600 text-lg">Three simple steps to start earning and helping students.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-1/2 left-[10%] right-[10%] h-0.5 bg-slate-100 -translate-y-1/2 z-0"></div>
            
            {steps.map((step, i) => (
              <div key={i} className="relative z-10 flex flex-col items-center text-center">
                <div className="size-20 rounded-full bg-white border-4 border-slate-100 shadow-xl flex items-center justify-center text-2xl font-black text-emerald-600 mb-6 relative">
                  {step.step}
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-3">{step.title}</h3>
                <p className="text-slate-600">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 bg-slate-900 text-white text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-10"></div>
        <div className="container mx-auto px-4 relative z-10 max-w-3xl">
          <h2 className="text-4xl md:text-5xl font-black mb-6">Ready to Grow Your Business?</h2>
          <p className="text-xl text-slate-400 mb-10">
            Join the network of authorized EzyIntern Cyber Cafes and bring premium educational opportunities to your locality.
          </p>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="h-16 px-10 text-xl font-bold bg-white text-slate-900 hover:bg-slate-100 shadow-2xl transition-all rounded-full gap-3 hover:scale-105">
                Register Your Cafe Now <Store className="size-6 text-emerald-600" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[450px] p-6 border-none shadow-2xl rounded-2xl">
              <DialogHeader className="mb-4">
                <div className="mx-auto size-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 mb-4">
                  <Store className="size-6" />
                </div>
                <DialogTitle className="text-2xl text-center font-black">Partner Registration</DialogTitle>
                <DialogDescription className="sr-only">Fill out this form to register as a cyber cafe partner.</DialogDescription>
              </DialogHeader>
              {FormContent}
            </DialogContent>
          </Dialog>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
};

// Quick polyfill component for the missing Badge component in this file
function Badge({ className, children }: { className?: string, children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${className}`}>{children}</span>;
}

export default CyberCafeRegister;
