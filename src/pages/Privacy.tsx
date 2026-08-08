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

const Privacy = () => {
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
                Privacy Policy
              </div>
            </div>

            {/* Document Body */}
            <div className="space-y-10 text-sm text-slate-800 leading-relaxed relative z-10">
              
              {/* Section 1: COLLECTION OF INFORMATION */}
              <div className="border-l-4 border-primary pl-6 py-1">
                <h3 className="text-base font-black text-slate-900 uppercase tracking-wide mb-3">
                  1. COLLECTION OF INFORMATION
                </h3>
                <p className="text-slate-700 mb-2">
                  We collect personal and academic information necessary to provide and manage our internship programmes. This includes:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-slate-700">
                  <li>
                    <strong>Personal Identity:</strong> Name, Father's Name, and Profile Picture.
                  </li>
                  <li>
                    <strong>Academic Information:</strong> College/Institution name, Department/Branch, Registration/Roll Number, Academic Session, and Semester.
                  </li>
                  <li>
                    <strong>Contact Details:</strong> Email Address and Mobile Number.
                  </li>
                  <li>
                    <strong>Payment Information:</strong> Transaction details required for processing program fees.
                  </li>
                </ul>
              </div>

              {/* Section 2: USE OF INFORMATION */}
              <div className="border-l-4 border-primary pl-6 py-1">
                <h3 className="text-base font-black text-slate-900 uppercase tracking-wide mb-3">
                  2. USE OF INFORMATION
                </h3>
                <p className="text-slate-700 mb-2">
                  The data collected is utilized solely to streamline educational training and validation processes, including:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-slate-700">
                  <li>
                    Verifying eligibility and enrolling students in chosen internship courses.
                  </li>
                  <li>
                    Tracking completion of internship hours and assignments.
                  </li>
                  <li>
                    Generating official, verifiable digital internship certificates.
                  </li>
                  <li>
                    Coordinating and matching records with your respective College/University for academic credit tracking and UGC compliance.
                  </li>
                </ul>
              </div>

              {/* Section 3: DATA SHARING & TRANSFERS */}
              <div className="border-l-4 border-primary pl-6 py-1">
                <h3 className="text-base font-black text-slate-900 uppercase tracking-wide mb-3">
                  3. DATA SHARING & TRANSFERS
                </h3>
                <p className="text-slate-700 mb-2">
                  We value your privacy and do not sell, rent, or lease your personal data. Sharing is strictly limited to:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-slate-700">
                  <li>
                    <strong>College Authorities:</strong> Verification dashboards provided to partner colleges to check and approve student internship status.
                  </li>
                  <li>
                    <strong>Legal & Regulatory Compliance:</strong> Government authorities when required under Ministry of Corporate Affairs or other statutory mandates.
                  </li>
                </ul>
              </div>

              {/* Section 4: DATA SECURITY */}
              <div className="border-l-4 border-primary pl-6 py-1">
                <h3 className="text-base font-black text-slate-900 uppercase tracking-wide mb-3">
                  4. DATA SECURITY
                </h3>
                <p className="text-slate-700 mb-2">
                  Apna Intern implements standard technical and administrative security frameworks to safeguard your information:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-slate-700">
                  <li>
                    Secure data transmission protocols (HTTPS/SSL) for all dashboard activities.
                  </li>
                  <li>
                    Restricted backend access limit systems to prevent unauthorized database access.
                  </li>
                  <li>
                    Compliance with ISO 9001:2015 quality and storage parameters.
                  </li>
                </ul>
              </div>

              {/* Section 5: USER RIGHTS & CONTACT */}
              <div className="border-l-4 border-primary pl-6 py-1">
                <h3 className="text-base font-black text-slate-900 uppercase tracking-wide mb-3">
                  5. USER RIGHTS & CONTACT
                </h3>
                <p className="text-slate-700 mb-2">
                  Students are responsible for submitting accurate information. For correcting account details, requesting data deletion, or any other privacy concerns, please contact our support desk:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-slate-700">
                  <li>
                    <strong>Email:</strong> contact@apnaintern.in
                  </li>
                  <li>
                    <strong>Phone:</strong> +91 70509 36593
                  </li>
                  <li>
                    <strong>Registered Address:</strong> Arfabad Colony, East Nahar Road, Bajrangpuri, Patna - 800007, Bihar
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

export default Privacy;
