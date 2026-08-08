import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft,
  Printer,
  ShieldCheck,
  Building
} from "lucide-react";

const Terms = () => {
  const navigate = useNavigate();

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans selection:bg-primary selection:text-white print:bg-white">
      <div className="print:hidden">
        <SiteNav />
      </div>
      
      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8 print:py-0 print:px-0">
        <div className="max-w-4xl mx-auto">
          
          {/* Back & Print Controls (Hidden on print) */}
          <div className="flex justify-between items-center mb-8 print:hidden">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-slate-600 hover:text-slate-900 flex items-center gap-2"
              onClick={() => navigate("/")}
            >
              <ArrowLeft className="size-4" />
              Back to Home
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="text-slate-600 hover:text-slate-900 flex items-center gap-2 border-slate-300"
              onClick={handlePrint}
            >
              <Printer className="size-4" />
              Print Page
            </Button>
          </div>

          {/* Official Document Wrapper */}
          <div className="bg-white border border-slate-200 shadow-xl rounded-none md:rounded-lg overflow-hidden p-8 sm:p-12 md:p-16 relative print:border-none print:shadow-none print:p-0">
            
            {/* Watermark/Icon in Background */}
            <div className="absolute inset-0 opacity-[0.01] pointer-events-none flex items-center justify-center">
              <Building className="size-[350px]" />
            </div>

            {/* Document Header */}
            <div className="border-b-2 border-slate-900 pb-6 mb-10 text-center relative z-10">
              <div className="flex justify-center items-center gap-3 mb-3">
                <img src="/logo.png" alt="Apna Intern Logo" className="h-10 w-auto object-contain" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight uppercase">
                Apna Intern
              </h2>
              <p className="text-[10px] sm:text-xs font-bold tracking-widest text-slate-500 uppercase mt-1">
                Registered Under Ministry of Corporate Affairs, Govt. of India
              </p>
              <p className="text-[9px] text-slate-400 mt-0.5">
                CIN: U85300BR2023PTC063214 | ISO 9001:2015 & MSME Certified
              </p>
              
              <div className="mt-6 bg-slate-900 text-white py-1.5 px-4 inline-block font-bold text-xs tracking-wider uppercase">
                Terms & Conditions of Internship
              </div>
            </div>

            {/* Document Body (Strictly containing only the 4 requested sections) */}
            <div className="space-y-10 text-sm text-slate-800 leading-relaxed relative z-10">
              
              {/* Section 1: PAYMENT & REFUND POLICY */}
              <div className="border-l-4 border-primary pl-6 py-1">
                <h3 className="text-base font-black text-slate-900 uppercase tracking-wide mb-3">
                  PAYMENT & REFUND POLICY
                </h3>
                <ul className="list-disc pl-5 space-y-2 text-slate-700">
                  <li>
                    Refund requests will be accepted only within 24 hours of payment.
                  </li>
                  <li>
                    No refund requests will be entertained after 24 hours.
                  </li>
                </ul>
              </div>

              {/* Section 2: STUDENT RESPONSIBILITY */}
              <div className="border-l-4 border-primary pl-6 py-1">
                <h3 className="text-base font-black text-slate-900 uppercase tracking-wide mb-3">
                  STUDENT RESPONSIBILITY
                </h3>
                <ul className="list-disc pl-5 space-y-2 text-slate-700">
                  <li>
                    Students are responsible for entering correct details such as Name, Father's Name, College, Department, Session, etc.
                  </li>
                  <li>
                    The company will not be responsible for errors caused by incorrect information submitted by students.
                  </li>
                </ul>
              </div>

              {/* Section 3: DOCUMENT SUBMISSION RESPONSIBILITY */}
              <div className="border-l-4 border-primary pl-6 py-1">
                <h3 className="text-base font-black text-slate-900 uppercase tracking-wide mb-3">
                  DOCUMENT SUBMISSION RESPONSIBILITY
                </h3>
                <ul className="list-disc pl-5 space-y-2 text-slate-700">
                  <li>
                    Students are solely responsible for submitting required documents to their colleges within prescribed deadlines.
                  </li>
                  <li>
                    The company will not be liable for delays or non-submission by students.
                  </li>
                </ul>
              </div>

              {/* Section 4: CERTIFICATE POLICY */}
              <div className="border-l-4 border-primary pl-6 py-1">
                <h3 className="text-base font-black text-slate-900 uppercase tracking-wide mb-3">
                  CERTIFICATE POLICY
                </h3>
                <ul className="list-disc pl-5 space-y-2 text-slate-700">
                  <li>
                    Internship certificates will be issued only after successful completion of internship requirements.
                  </li>
                  <li>
                    Certificates may be withheld if attendance, required documents, or mandatory requirements are incomplete.
                  </li>
                </ul>
              </div>

            </div>

            {/* Official Closing Footer */}
            <div className="border-t border-slate-200 mt-12 pt-8 text-xs text-slate-500 relative z-10">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                  <p className="font-bold text-slate-800">Apna Intern</p>
                  <p>Arfabad Colony, East Nahar Road, Bajrangpuri, Patna - 800007, Bihar</p>
                  <p>Contact: contact@apnaintern.in | +91 70509 36593</p>
                </div>
                <div className="shrink-0">
                  <div className="border border-slate-200 p-3 bg-slate-50 flex items-center gap-2 max-w-[280px]">
                    <ShieldCheck className="size-8 text-primary shrink-0" />
                    <div>
                      <div className="font-bold text-slate-800 uppercase text-[9px] tracking-wide">Official Policy</div>
                      <div className="text-[8px] text-slate-500">Authorized & certified under MCA guidelines.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Action Box bottom (Hidden on print) */}
          <div className="mt-8 text-center print:hidden">
            <Button size="lg" className="bg-primary hover:bg-primary/90 rounded-xl px-12" onClick={() => navigate("/register")}>
              Accept & Proceed
            </Button>
          </div>

        </div>
      </main>

      <div className="print:hidden">
        <SiteFooter />
      </div>
    </div>
  );
};

export default Terms;
