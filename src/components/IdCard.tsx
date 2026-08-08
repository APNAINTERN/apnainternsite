import React, { forwardRef } from "react";
import { Phone, Mail, Globe } from "lucide-react";
import { CERTIFICATE_SIGNATURE_SRC } from "@/lib/certificateFormat";
import { idCardVerifyUrl, type IdCardData } from "@/lib/idCardApi";
import { resolveStorageUrl } from "@/lib/storageUrl";

export type { IdCardData };

interface IdCardProps {
  data: IdCardData;
}

const CATEGORY_LABELS: Record<string, string> = {
  student: "Student",
  staff: "Staff",
  cybercafe: "Cyber Cafe Partner",
  referral: "Referral Partner",
  college_admin: "College Admin",
};

// Dimensions for a standard CR80 ID Card (high-res for printing)
// 600x950 gives good clarity when scaled to PDF.
const ID_CARD_WIDTH_PX = 600;
const ID_CARD_HEIGHT_PX = 950;

const cardStyle: React.CSSProperties = {
  width: ID_CARD_WIDTH_PX,
  height: ID_CARD_HEIGHT_PX,
  boxSizing: "border-box",
  fontFamily: '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif',
  position: "relative",
  overflow: "hidden",
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
};

export const IdCard = forwardRef<HTMLDivElement, IdCardProps>(({ data }, ref) => {
  const roleLabel = data.category ? (CATEGORY_LABELS[data.category] || "User") : "User";
  const position =
    (data.position || "").trim() ||
    (data.course || "").trim() ||
    roleLabel;
  const phone = (data.userPhone || "").trim();
  const qrPayload = idCardVerifyUrl(data.cardNumber || data.registrationId || data.id);
  const avatarUrl = data.profileImageUrl
    ? resolveStorageUrl(data.profileImageUrl)
    : null;

  return (
    <div
      ref={ref}
      data-id-card-root
      style={cardStyle}
      className="flex flex-col bg-white text-slate-800 justify-between select-none"
    >
      {/* Background Watermark (Light EI Logo) */}
      <div 
        className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none"
        style={{ opacity: 0.025 }}
      >
        <img src="/logo.png" alt="Watermark" className="w-[450px] h-[450px] object-contain" crossOrigin="anonymous" />
      </div>

      {/* Header Background Decoration */}
      <div 
        className="h-[200px] bg-gradient-to-br from-[#1E40AF] to-[#3B82F6] w-full absolute top-0 left-0 z-0 shadow-sm" 
        style={{ borderBottomLeftRadius: '50% 15%', borderBottomRightRadius: '50% 15%' }} 
      />

      {/* Main Content Area */}
      <div className="relative z-10 flex flex-col items-center pt-8 px-8 flex-grow">
        {/* Logo Section */}
        <div className="bg-white p-3 rounded-2xl shadow-md mb-6 border border-slate-100 flex items-center justify-center w-40 h-14">
          <img src="/logo.png" alt="Apna Intern" className="h-full w-full object-contain" crossOrigin="anonymous" />
        </div>

        {/* Profile Image */}
        <div className="relative mb-6">
          <div className="w-[160px] h-[160px] rounded-full overflow-hidden border-[5px] border-white shadow-xl bg-slate-50 flex items-center justify-center shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt={data.userName} className="w-full h-full object-cover" crossOrigin="anonymous" />
            ) : (
              <span className="text-[72px] font-black text-slate-300">
                {data.userName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          {/* Badge */}
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-[#1E3A8A] text-white text-[12px] font-bold px-4 py-1.5 rounded-full border-[3px] border-white shadow-md uppercase tracking-widest whitespace-nowrap">
            {roleLabel}
          </div>
        </div>

        {/* User Details */}
        <div className="text-center w-full mb-5 z-10 px-4">
          <div className="mb-1.5">
            <h2 className="text-[30px] font-black text-slate-900 tracking-tight m-0 p-0 leading-snug">{data.userName}</h2>
          </div>
          <div className="mb-4">
            <p className="text-[15px] font-extrabold text-[#3B82F6] uppercase tracking-[0.1em] m-0 p-0 leading-snug">
              {position}
            </p>
          </div>

          <div className="flex gap-3 justify-center w-full">
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 shadow-sm flex-1">
              <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-0.5 leading-normal">ID Card Number</p>
              <p className="text-[15px] font-black text-slate-800 tracking-wide m-0 p-0 leading-normal">{data.cardNumber || "—"}</p>
            </div>
            {data.joiningDate && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 shadow-sm flex-1">
                <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-0.5 leading-normal">Date of Joining</p>
                <p className="text-[15px] font-black text-slate-800 tracking-wide m-0 p-0 leading-normal">{data.joiningDate}</p>
              </div>
            )}
          </div>
        </div>

        {/* Contact Details */}
        <div className="w-full space-y-2.5 px-4 mb-5 z-10">
          <div className="flex items-center gap-3.5 text-[14px] text-slate-700 bg-white/80 p-2.5 rounded-xl border border-slate-200 shadow-sm backdrop-blur-sm">
            <div className="bg-blue-50 p-1.5 rounded-lg shrink-0 border border-blue-100">
              <Mail className="w-4 h-4 text-blue-600" />
            </div>
            <span className="font-bold truncate leading-normal">{data.userEmail}</span>
          </div>
          <div className="flex items-center gap-3.5 text-[14px] text-slate-700 bg-white/80 p-2.5 rounded-xl border border-slate-200 shadow-sm backdrop-blur-sm">
            <div className="bg-blue-50 p-1.5 rounded-lg shrink-0 border border-blue-100">
              <Phone className="w-4 h-4 text-blue-600" />
            </div>
            <span className="font-bold truncate leading-normal">{phone || "Not Provided"}</span>
          </div>
        </div>

        {/* QR and Signature */}
        <div className="w-full border-t border-dashed border-slate-200 pt-5 flex items-end justify-between mt-auto mb-6 px-4 z-10">
          <div className="flex flex-col items-center">
            <div className="p-1.5 bg-white border border-slate-200 rounded-lg shadow-sm">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrPayload)}`}
                alt="QR Code"
                className="w-16 h-16"
                crossOrigin="anonymous"
              />
            </div>
            <span className="text-[9px] font-black text-slate-500 mt-2 uppercase tracking-widest leading-normal">Scan to Verify</span>
          </div>

          <div className="flex flex-col items-center text-center">
            {CERTIFICATE_SIGNATURE_SRC ? (
              <img
                src={CERTIFICATE_SIGNATURE_SRC}
                alt="Signature"
                className="h-[44px] object-contain mb-1.5 drop-shadow-sm"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="h-[44px] flex items-center justify-center text-[12px] text-slate-400 italic">Signature</div>
            )}
            <div className="w-28 h-[1.5px] bg-slate-800 mb-1" />
            <span className="text-[9px] font-black text-slate-800 uppercase tracking-widest leading-normal">Authorized Signatory</span>
          </div>
        </div>
      </div>

      {/* Footer Area - Naturally in Flow at the bottom */}
      <div className="relative z-10 w-full shrink-0">
        <div className="bg-slate-900 text-slate-300 text-[10px] font-semibold py-3 px-6 flex justify-between items-center w-full">
          <div className="flex items-center gap-1">
            <Globe className="w-3 h-3 text-blue-400" /> apnaintern.in
          </div>
          <div className="flex items-center gap-1">
            <Mail className="w-3 h-3 text-blue-400" /> support@apnaintern.in
          </div>
          <div className="flex items-center gap-1">
            <Phone className="w-3 h-3 text-blue-400" /> +91 70509 36593
          </div>
        </div>
        <div className="bg-[#1E40AF] text-white text-[11px] font-black text-center py-2 tracking-[0.25em] uppercase">
          Apna Intern
        </div>
      </div>
    </div>
  );
});
IdCard.displayName = "IdCard";
