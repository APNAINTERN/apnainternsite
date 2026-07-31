import { forwardRef } from "react";
import { CertificateDocument } from "@/components/CertificateDocument";
import { EngineeringCertificateDocument } from "@/components/EngineeringCertificateDocument";
import {
  isEngineeringCertificateData,
  type CertificateDisplayData,
} from "@/lib/certificateFormat";

type Props = {
  data: CertificateDisplayData;
  className?: string;
  showSignature?: boolean;
};

/**
 * Renders the Engineering industrial-training certificate for Engineering students,
 * otherwise the standard Certificate of Completion template.
 */
export const IssuedCertificateDocument = forwardRef<HTMLDivElement, Props>(
  function IssuedCertificateDocument({ data, className, showSignature = true }, ref) {
    if (isEngineeringCertificateData(data)) {
      return (
        <EngineeringCertificateDocument
          ref={ref}
          data={data}
          className={className}
          showSignature={showSignature}
        />
      );
    }
    return (
      <CertificateDocument
        ref={ref}
        data={data}
        className={className}
        showSignature={showSignature}
      />
    );
  }
);

IssuedCertificateDocument.displayName = "IssuedCertificateDocument";
