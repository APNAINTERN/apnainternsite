import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { DOCUMENT_PAGE } from "@/components/student/StudentDocumentLayout";

function absoluteImageUrl(src: string): string {
  if (!src) return src;
  if (src.startsWith("data:") || src.startsWith("http://") || src.startsWith("https://")) return src;
  try {
    return new URL(src, window.location.origin).href;
  } catch {
    return src;
  }
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        })
    )
  );
}

async function inlineImagesForCapture(root: HTMLElement): Promise<void> {
  await waitForImages(root);
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          const url = absoluteImageUrl(img.getAttribute("src") || img.src || "");
          if (!url || url.startsWith("data:")) {
            resolve();
            return;
          }
          const loader = new Image();
          loader.crossOrigin = "anonymous";
          loader.onload = () => {
            try {
              const c = document.createElement("canvas");
              c.width = loader.naturalWidth;
              c.height = loader.naturalHeight;
              const ctx = c.getContext("2d");
              if (ctx && c.width > 0 && c.height > 0) {
                ctx.drawImage(loader, 0, 0);
                img.src = c.toDataURL("image/png");
              }
            } catch {
              /* keep original */
            }
            resolve();
          };
          loader.onerror = () => resolve();
          loader.src = url;
        })
    )
  );
}

function prepareDocumentForCapture(root: HTMLElement): void {
  root.style.width = `${DOCUMENT_PAGE.captureWidthPx}px`;
  root.style.maxWidth = `${DOCUMENT_PAGE.captureWidthPx}px`;
  root.style.minWidth = `${DOCUMENT_PAGE.captureWidthPx}px`;
  root.style.margin = "0";
  root.style.boxShadow = "none";
  root.style.overflow = "visible";
  root.style.background = "#ffffff";
  root.style.boxSizing = "border-box";
}

function mountCloneForCapture(element: HTMLElement): { wrapper: HTMLDivElement; target: HTMLElement } {
  const wrapper = document.createElement("div");
  wrapper.style.cssText =
    "position:fixed;left:-10000px;top:0;z-index:-1;overflow:visible;background:#ffffff;";
  wrapper.style.width = `${DOCUMENT_PAGE.captureWidthPx}px`;

  const clone = element.cloneNode(true) as HTMLElement;
  prepareDocumentForCapture(clone);
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  return { wrapper, target: clone };
}

export async function downloadHtmlDocumentPdf(
  container: HTMLElement,
  filename: string
): Promise<void> {
  const { wrapper, target } = mountCloneForCapture(container);
  try {
    await inlineImagesForCapture(target);

    const pages = target.querySelectorAll<HTMLElement>("[data-document-page]");
    const targets = pages.length > 0 ? Array.from(pages) : [target];

    const pdf = new jsPDF("p", "mm", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < targets.length; i++) {
      const page = targets[i];
      const canvas = await html2canvas(page, {
        scale: 1.5,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: "#ffffff",
        width: DOCUMENT_PAGE.captureWidthPx,
        windowWidth: DOCUMENT_PAGE.captureWidthPx,
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.85);
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST");
    }

    pdf.save(filename);
  } finally {
    document.body.removeChild(wrapper);
  }
}
