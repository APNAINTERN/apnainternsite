import { useState } from "react";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { MapPin, Phone, Mail, Send, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { assertSendMailOk, getSendMailApiUrl } from "@/lib/sendMailApi";

const Contact = () => {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const message = formData.get("message") as string;

    setLoading(true);
    try {
      const res = await fetch(getSendMailApiUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      await assertSendMailOk(res);
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (data.success === false) throw new Error(data.error || "Failed to send message");

      toast.success("Message sent successfully! Our team will contact you soon.");
      (e.target as HTMLFormElement).reset();
    } catch (err: unknown) {
      console.error("Contact form error:", err);
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <SiteNav />
      
      <main className="flex-1 py-20">
        <div className="container mx-auto px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-4 tracking-tight">Contact Us</h1>
              <p className="text-slate-500 max-w-2xl mx-auto">Have questions about registration, certification, or university alignment? We're here to help.</p>
            </div>

            <div className="grid lg:grid-cols-5 gap-12">
              {/* Contact Info */}
              <div className="lg:col-span-2 space-y-8">
                <div className="space-y-6">
                  <h2 className="text-2xl font-black text-slate-800">Get in Touch</h2>
                  <p className="text-slate-500">Reach out to us via any of these channels or visit our office in Patna.</p>
                </div>

                <Card className="p-8 border-none shadow-elegant space-y-8 bg-white">
                  <div className="flex gap-4">
                    <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                      <MapPin className="size-6" />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Our Office</p>
                      <p className="text-slate-700 font-bold leading-relaxed">
                        Arfabad Colony, East Nahar Road, <br/>
                        Bajrangpuri, Patna - 800007, Bihar
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="size-12 rounded-2xl bg-green-500/10 flex items-center justify-center text-green-600 flex-shrink-0">
                      <Phone className="size-6" />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Call Support</p>
                      <div className="flex flex-col gap-1">
                        <a href="tel:9341143791" className="text-slate-700 font-bold hover:text-primary transition-colors">9341143791</a>
                        <a href="tel:7858967071" className="text-slate-700 font-bold hover:text-primary transition-colors">7858967071</a>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="size-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-600 flex-shrink-0">
                      <Mail className="size-6" />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Email Inquiry</p>
                      <a href="mailto:contact@apnaintern.in" className="text-slate-700 font-bold hover:text-primary transition-colors">contact@apnaintern.in</a>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Form */}
              <div className="lg:col-span-3">
                <Card className="p-8 md:p-10 border-none shadow-elegant bg-white rounded-3xl">
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="name" className="text-xs font-black uppercase text-slate-500">Full Name</Label>
                        <Input id="name" name="name" placeholder="John Doe" required className="h-12 bg-slate-50 border-none focus-visible:ring-primary" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-xs font-black uppercase text-slate-500">Email Address</Label>
                        <Input id="email" name="email" type="email" placeholder="john@example.com" required className="h-12 bg-slate-50 border-none focus-visible:ring-primary" />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="phone" className="text-xs font-black uppercase text-slate-500">Phone Number</Label>
                        <Input id="phone" placeholder="91XXXXXXXX" required className="h-12 bg-slate-50 border-none focus-visible:ring-primary" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="course" className="text-xs font-black uppercase text-slate-500">Course / Degree</Label>
                        <Input id="course" placeholder="B.A. / B.Sc. / BCA" required className="h-12 bg-slate-50 border-none focus-visible:ring-primary" />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="uni" className="text-xs font-black uppercase text-slate-500">University</Label>
                        <Input id="uni" placeholder="Patliputra University" required className="h-12 bg-slate-50 border-none focus-visible:ring-primary" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="college" className="text-xs font-black uppercase text-slate-500">College Name</Label>
                        <Input id="college" placeholder="AN College" required className="h-12 bg-slate-50 border-none focus-visible:ring-primary" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sem" className="text-xs font-black uppercase text-slate-500">Semester</Label>
                      <Input id="sem" placeholder="Semester 3 / Year 2" required className="h-12 bg-slate-50 border-none focus-visible:ring-primary" />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message" className="text-xs font-black uppercase text-slate-500">How can we help?</Label>
                      <Textarea id="message" name="message" placeholder="Type your message here..." required className="min-h-[120px] bg-slate-50 border-none focus-visible:ring-primary resize-none" />
                    </div>

                    <Button type="submit" className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-black text-lg shadow-glow rounded-xl gap-2" disabled={loading}>
                      {loading ? "Sending..." : "Send Message"} <Send className="size-5" />
                    </Button>
                  </form>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
};

export default Contact;
