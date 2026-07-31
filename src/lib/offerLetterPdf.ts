import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/** Fixed layout width for offer letter (A4 @ 96dpi). Same for every college. */
export const OFFER_LETTER_CAPTURE_WIDTH_PX = 794;

/** Horizontal content padding inside the letter (≈8mm). */
export const OFFER_LETTER_PADDING_PX = 30;

/** Balance: enough room for text, still looks like a formal letter on A4. */
const PDF_MARGIN_MM = 5;

/** Higher scale → sharper text after fit-to-page. */
const CAPTURE_SCALE = 2.85;

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
  await Promise.all(
    imgs.map(async (img) => {
      try {
        await img.decode();
      } catch {
        /* ignore */
      }
    })
  );
}

/** Paint images into the live DOM bitmaps so html2canvas never misses / taints assets. */
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
              /* keep original src */
            }
            resolve();
          };
          loader.onerror = () => resolve();
          loader.src = url;
        })
    )
  );
}

/** Fixed A4 width + no clipping so PDF matches on-screen layout for every college. */
export function prepareOfferLetterForCapture(root: HTMLElement): void {
  root.style.width = `${OFFER_LETTER_CAPTURE_WIDTH_PX}px`;
  root.style.maxWidth = `${OFFER_LETTER_CAPTURE_WIDTH_PX}px`;
  root.style.minWidth = `${OFFER_LETTER_CAPTURE_WIDTH_PX}px`;
  root.style.margin = "0";
  root.style.boxShadow = "none";
  root.style.overflow = "visible";
  root.style.background = "#ffffff";
  root.style.boxSizing = "border-box";

  root.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const o = window.getComputedStyle(el).overflow;
    if (o === "hidden" || o === "clip") {
      el.style.overflow = "visible";
    }
  });
}

function mountCloneForCapture(element: HTMLElement): { wrapper: HTMLDivElement; target: HTMLElement } {
  const wrapper = document.createElement("div");
  wrapper.style.cssText =
    "position:fixed;left:-10000px;top:0;z-index:-1;overflow:visible;background:#ffffff;";
  wrapper.style.width = `${OFFER_LETTER_CAPTURE_WIDTH_PX}px`;

  const clone = element.cloneNode(true) as HTMLElement;
  prepareOfferLetterForCapture(clone);
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  return { wrapper, target: clone };
}

function innerLayoutMm(pdf: jsPDF, marginMm: number): { innerW: number; innerH: number } {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  return {
    innerW: pageW - 2 * marginMm,
    innerH: pageH - 2 * marginMm,
  };
}

/**
 * Exactly one A4 page: scale letter uniformly to fit inner box (clients request no page 2).
 * Prefer full printable width when height allows; otherwise shrink proportionally (centered).
 */
function addLetterSinglePageFit(pdf: jsPDF, imgData: string, canvas: HTMLCanvasElement, marginMm: number): void {
  const { innerW, innerH } = innerLayoutMm(pdf, marginMm);
  const aspect = canvas.width / Math.max(canvas.height, 1);

  let dw = innerW;
  let dh = dw / aspect;
  if (dh > innerH) {
    dh = innerH;
    dw = dh * aspect;
  }
  const x = marginMm + (innerW - dw) / 2;
  const y = marginMm;
  pdf.addImage(imgData, "PNG", x, y, dw, dh, undefined, "FAST");
}

function buildHtml2CanvasOptions(captureInPlace: boolean) {
  return {
    scale: CAPTURE_SCALE,
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
    imageTimeout: 30000,
    ...(captureInPlace
      ? {}
      : {
          width: OFFER_LETTER_CAPTURE_WIDTH_PX,
          windowWidth: OFFER_LETTER_CAPTURE_WIDTH_PX,
        }),
  } as const;
}

export type OfferLetterPdfOptions = {
  fileName: string;
  captureInPlace?: boolean;
};

/**
 * Full-letter screenshot → single PDF page (uniform scale to fit; no multi-page exports).
 */
export async function downloadOfferLetterPdf(
  sourceElement: HTMLElement,
  options: OfferLetterPdfOptions
): Promise<void> {
  let wrapper: HTMLDivElement | null = null;
  const captureInPlace = !!options.captureInPlace;

  const target = captureInPlace
    ? sourceElement
    : (() => {
        const mount = mountCloneForCapture(sourceElement);
        wrapper = mount.wrapper;
        return mount.target;
      })();

  const m = PDF_MARGIN_MM;

  try {
    prepareOfferLetterForCapture(target);
    await inlineImagesForCapture(target);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const canvas = await html2canvas(target, buildHtml2CanvasOptions(captureInPlace));

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    addLetterSinglePageFit(pdf, imgData, canvas, m);
    pdf.save(options.fileName);
  } finally {
    if (wrapper?.parentNode) {
      wrapper.parentNode.removeChild(wrapper);
    }
  }
}
