import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { CheckCircle2, Award, Zap, Users, ShieldCheck, GraduationCap, Briefcase, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const Benefits = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <SiteNav />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-24 bg-primary text-white overflow-hidden relative">
          <div className="absolute top-0 right-0 p-24 opacity-10">
            <Award className="size-64" />
          </div>
          <div className="container mx-auto px-6 relative z-10 text-center">
            <h1 className="text-4xl md:text-6xl font-black mb-6">Internship Benefits</h1>
            <p className="text-xl text-blue-100 max-w-2xl mx-auto">
              Unlock a world of opportunities with EzyIntern. Our programs are designed to bridge the gap between academic learning and industry excellence.
            </p>
          </div>
        </section>

        {/* Benefits Grid */}
        <section className="py-24">
          <div className="container mx-auto px-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                {
                  title: "UGC Compliant Certification",
                  desc: "Receive certificates that are fully compliant with UGC guidelines and recognized by major universities.",
                  icon: <ShieldCheck className="size-8 text-primary" />,
                  color: "bg-blue-50"
                },
                {
                  title: "Industry Mentorship",
                  desc: "Get mentored by professionals with years of experience in top tech companies.",
                  icon: <Users className="size-8 text-green-600" />,
                  color: "bg-green-50"
                },
                {
                  title: "Real-world Projects",
                  desc: "Work on live projects that solve real problems, not just dummy assignments.",
                  icon: <Briefcase className="size-8 text-orange-600" />,
                  color: "bg-orange-50"
                },
                {
                  title: "Career Guidance",
                  desc: "Free career counseling and resume building workshops to help you land your dream job.",
                  icon: <GraduationCap className="size-8 text-purple-600" />,
                  color: "bg-purple-50"
                },
                {
                  title: "Global Recognition",
                  desc: "Our ISO 9001:2015 certified process ensures your internship has global credibility.",
                  icon: <Award className="size-8 text-pink-600" />,
                  color: "bg-pink-50"
                },
                {
                  title: "Fast-track Learning",
                  desc: "Intensive training modules that cover in-demand skills in weeks, not months.",
                  icon: <Zap className="size-8 text-yellow-600" />,
                  color: "bg-yellow-50"
                }
              ].map((b, i) => (
                <Card key={i} className="p-8 border-none shadow-elegant hover:scale-105 transition-all">
                  <div className={`size-16 rounded-2xl ${b.color} flex items-center justify-center mb-6`}>
                    {b.icon}
                  </div>
                  <h3 className="text-xl font-bold mb-4">{b.title}</h3>
                  <p className="text-slate-500 leading-relaxed">{b.desc}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Call to Action */}
        <section className="py-24 bg-white">
          <div className="container mx-auto px-6 text-center">
            <div className="max-w-3xl mx-auto bg-slate-900 rounded-[2rem] p-12 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-20">
                <Star className="size-20" />
              </div>
              <h2 className="text-3xl md:text-4xl font-black mb-6">Ready to Boost Your Career?</h2>
              <p className="text-slate-400 mb-10 text-lg">Join 12,000+ students and start your professional journey with us today.</p>
              <Button size="lg" className="bg-primary hover:bg-primary/90 px-10 h-14 rounded-xl text-lg font-bold" onClick={() => navigate("/register")}>
                Get Started for Free
              </Button>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Benefits;
