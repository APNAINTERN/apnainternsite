import React, { forwardRef } from "react";
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

// Fixed Exact Dimensions for reliable HTML2Canvas export (No Scaling)
const CARD_W = 350;
const CARD_H = 560;

export const PrintableIDCard = forwardRef<HTMLDivElement, IdCardProps>(({ data }, ref) => {
  const roleLabel = data.category ? (CATEGORY_LABELS[data.category] || "User") : "User";
  const position = (data.position || "").trim() || (data.course || "").trim() || roleLabel;
  const phone = (data.userPhone || "").trim();
  const qrPayload = idCardVerifyUrl(data.cardNumber || data.registrationId || data.id);
  const avatarUrl = data.profileImageUrl ? resolveStorageUrl(data.profileImageUrl) : null;

  return (
    <div
      ref={ref}
      data-printable-id-card
      style={{
        width: `${CARD_W}px`,
        height: `${CARD_H}px`,
        backgroundColor: "#ffffff",
        position: "relative",
        boxSizing: "border-box",
        fontFamily: '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif',
        overflow: "hidden",
        border: "1px solid #e2e8f0",
        color: "#1e293b",
        margin: 0,
        padding: 0,
      }}
    >
      {/* Background Watermark */}
      <img
        src="/logo.png"
        alt=""
        crossOrigin="anonymous"
        style={{
          position: "absolute",
          top: "130px",
          left: "25px",
          width: "300px",
          height: "300px",
          opacity: 0.025,
          objectFit: "contain",
          zIndex: 0,
        }}
      />

      {/* Header Background Decoration (Blue shape) */}
      <div
        style={{
          position: "absolute",
          top: "0px",
          left: "0px",
          width: `${CARD_W}px`,
          height: "120px",
          background: "linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)",
          borderBottomLeftRadius: "50% 15%",
          borderBottomRightRadius: "50% 15%",
          zIndex: 1,
        }}
      />

      {/* Foreground Content Container */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 2,
          boxSizing: "border-box",
        }}
      >
        {/* Logo box */}
        <div
          style={{
            position: "absolute",
            top: "20px",
            left: "130px", // (350 - 90)/2
            width: "90px",
            height: "34px",
            backgroundColor: "#ffffff",
            borderRadius: "10px",
            boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
            border: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
            padding: "6px",
          }}
        >
          <img
            src="/logo.png"
            alt="Logo"
            crossOrigin="anonymous"
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </div>

        {/* Profile Image Group */}
        <div
          style={{
            position: "absolute",
            top: "70px",
            left: "125px", // (350 - 100)/2
            width: "100px",
            height: "115px",
          }}
        >
          {/* Avatar circle */}
          <div
            style={{
              width: "100px",
              height: "100px",
              borderRadius: "50px",
              border: "4px solid #ffffff",
              backgroundColor: "#f8fafc",
              overflow: "hidden",
              boxSizing: "border-box",
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
            }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Profile"
                crossOrigin="anonymous"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "42px",
                  fontWeight: 900,
                  color: "#cbd5e1",
                }}
              >
                {data.userName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          {/* Role Badge */}
          <div
            style={{
              position: "absolute",
              top: "92px", // overlap the bottom edge
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: "#1E3A8A",
              color: "#ffffff",
              fontSize: "9px",
              fontWeight: "bold",
              padding: "4px 10px",
              borderRadius: "9999px",
              border: "2px solid #ffffff",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              whiteSpace: "nowrap",
              boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
              boxSizing: "border-box",
            }}
          >
            {roleLabel}
          </div>
        </div>

        {/* Names & Titles */}
        <div
          style={{
            position: "absolute",
            top: "195px",
            left: "20px",
            width: "310px",
            textAlign: "center",
          }}
        >
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 900,
              color: "#0f172a",
              letterSpacing: "-0.01em",
              margin: "0 0 4px 0",
              lineHeight: 1.2,
            }}
          >
            {data.userName}
          </h2>
          <p
            style={{
              fontSize: "10px",
              fontWeight: 800,
              color: "#3B82F6",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              margin: "0",
              lineHeight: 1.2,
            }}
          >
            {position}
          </p>
        </div>

        {/* Details Blocks - Stacked vertically */}
        {/* ID Card Number */}
        <div
          style={{
            position: "absolute",
            top: "245px",
            left: "20px",
            width: "310px",
            height: "40px",
            backgroundColor: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            padding: "8px",
            boxSizing: "border-box",
            textAlign: "center",
          }}
        >
          <p style={{ margin: "0 0 2px 0", fontSize: "7px", fontWeight: "bold", textTransform: "uppercase", color: "#94a3b8", letterSpacing: "0.1em" }}>ID Card Number</p>
          <p style={{ margin: 0, fontSize: "11px", fontWeight: 900, color: "#1e293b", letterSpacing: "0.025em" }}>{data.cardNumber || "—"}</p>
        </div>

        {/* Date of Joining (Optional) */}
        {data.joiningDate && (
           <div
           style={{
             position: "absolute",
             top: "295px",
             left: "20px",
             width: "310px",
             height: "40px",
             backgroundColor: "#f8fafc",
             border: "1px solid #e2e8f0",
             borderRadius: "8px",
             padding: "8px",
             boxSizing: "border-box",
             textAlign: "center",
           }}
         >
           <p style={{ margin: "0 0 2px 0", fontSize: "7px", fontWeight: "bold", textTransform: "uppercase", color: "#94a3b8", letterSpacing: "0.1em" }}>Date of Joining</p>
           <p style={{ margin: 0, fontSize: "11px", fontWeight: 900, color: "#1e293b", letterSpacing: "0.025em" }}>{data.joiningDate}</p>
         </div>
        )}

        {/* Email Box */}
        <div
          style={{
            position: "absolute",
            top: data.joiningDate ? "345px" : "295px",
            left: "20px",
            width: "310px",
            height: "40px",
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            padding: "8px",
            display: "flex",
            alignItems: "center",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              backgroundColor: "#eff6ff",
              border: "1px solid #dbeafe",
              borderRadius: "6px",
              width: "20px",
              height: "20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginRight: "10px",
              flexShrink: 0,
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
          </div>
          <span style={{ fontSize: "10px", fontWeight: "bold", color: "#334155", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: "1" }}>
            {data.userEmail}
          </span>
        </div>

        {/* Phone Box */}
        <div
          style={{
            position: "absolute",
            top: data.joiningDate ? "395px" : "345px",
            left: "20px",
            width: "310px",
            height: "40px",
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            padding: "8px",
            display: "flex",
            alignItems: "center",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              backgroundColor: "#eff6ff",
              border: "1px solid #dbeafe",
              borderRadius: "6px",
              width: "20px",
              height: "20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginRight: "10px",
              flexShrink: 0,
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          </div>
          <span style={{ fontSize: "10px", fontWeight: "bold", color: "#334155", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: "1" }}>
            {phone || "Not Provided"}
          </span>
        </div>

        {/* QR Code - Bottom Left (Above footer) */}
        <div
          style={{
            position: "absolute",
            top: "445px",
            left: "20px",
            textAlign: "center",
            width: "60px",
            height: "60px",
          }}
        >
          <div style={{ padding: "4px", backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "6px", display: "inline-block" }}>
            <img
              src={`https://quickchart.io/qr?text=${encodeURIComponent(qrPayload)}&size=200`}
              alt="QR Code"
              style={{ width: "45px", height: "45px", display: "block" }}
              crossOrigin="anonymous"
            />
          </div>
          <div style={{ fontSize: "6px", fontWeight: 900, color: "#64748b", marginTop: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Scan to Verify
          </div>
        </div>

        {/* Signature - Bottom Right (Above footer) */}
        <div
          style={{
            position: "absolute",
            top: "450px",
            left: "230px", // 350 - 100(width) - 20(padding right)
            textAlign: "center",
            width: "100px",
            height: "50px",
          }}
        >
          {CERTIFICATE_SIGNATURE_SRC ? (
            <img
              src={CERTIFICATE_SIGNATURE_SRC}
              alt="Signature"
              style={{ height: "30px", objectFit: "contain", marginBottom: "4px", display: "block", margin: "0 auto" }}
              crossOrigin="anonymous"
            />
          ) : (
            <div style={{ height: "30px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", color: "#94a3b8", fontStyle: "italic", marginBottom: "4px" }}>
              Signature
            </div>
          )}
          <div style={{ width: "100%", height: "1px", backgroundColor: "#1e293b", margin: "2px 0" }} />
          <div style={{ fontSize: "6px", fontWeight: 900, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Authorized Signatory
          </div>
        </div>

        {/* Footer Area (Fixed exactly at the bottom) */}
        <div
          style={{
            position: "absolute",
            top: "515px", // 560 - 45
            left: "0px",
            width: "350px",
            height: "45px",
            boxSizing: "border-box",
          }}
        >
          {/* Top dark row */}
          <div
            style={{
              position: "absolute",
              top: "0px",
              left: "0px",
              width: "350px",
              backgroundColor: "#0f172a",
              color: "#cbd5e1",
              height: "25px",
              padding: "0 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
              <span style={{ fontSize: "7px", fontWeight: 600 }}>apnaintern.in</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              <span style={{ fontSize: "7px", fontWeight: 600 }}>support@apnaintern.in</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              <span style={{ fontSize: "7px", fontWeight: 600 }}>+91 70509 36593</span>
            </div>
          </div>
          {/* Bottom blue row */}
          <div
            style={{
              position: "absolute",
              top: "25px",
              left: "0px",
              width: "350px",
              backgroundColor: "#1E40AF",
              color: "#ffffff",
              height: "20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "7px",
              fontWeight: 900,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              boxSizing: "border-box",
            }}
          >
            Apna Intern
          </div>
        </div>
      </div>
    </div>
  );
});
PrintableIDCard.displayName = "PrintableIDCard";
