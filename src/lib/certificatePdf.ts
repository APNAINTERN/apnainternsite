import html2canvas from "html2canvas";
import jsPDF from "jspdf";

function pdfOrientationFromContainer(container: HTMLElement): "p" | "l" {
  const landscape = container.querySelector('[data-certificate-orientation="landscape"]');
  return landscape ? "l" : "p";
}

export async function downloadCertificatePdf(
  container: HTMLElement,
  filename: string
): Promise<void> {
  const pages = container.querySelectorAll<HTMLElement>("[data-certificate-page]");
  const targets = pages.length > 0 ? Array.from(pages) : [container];
  const orientation = pdfOrientationFromContainer(container);

  const pdf = new jsPDF(orientation, "mm", "a4");
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < targets.length; i++) {
    const page = targets[i];
    const canvas = await html2canvas(page, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });
    const imgData = canvas.toDataURL("image/jpeg", 0.85);
    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST");
  }

  pdf.save(filename);
}

/** Returns PDF bytes for bulk ZIP export. */
export async function renderCertificatePdfBlob(container: HTMLElement): Promise<Blob> {
  const pages = container.querySelectorAll<HTMLElement>("[data-certificate-page]");
  const targets = pages.length > 0 ? Array.from(pages) : [container];
  const orientation = pdfOrientationFromContainer(container);

  const pdf = new jsPDF(orientation, "mm", "a4");
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < targets.length; i++) {
    const page = targets[i];
    const canvas = await html2canvas(page, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });
    const imgData = canvas.toDataURL("image/jpeg", 0.85);
    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST");
  }

  return pdf.output("blob");
}
