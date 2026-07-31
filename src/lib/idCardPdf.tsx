import { createRoot } from "react-dom/client";
import JSZip from "jszip";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { PrintableIDCard, type IdCardData } from "@/components/PrintableIDCard";

/** Soft cap to avoid browser memory spikes during bulk render. */
export const BULK_ID_CARD_MAX = 100;

export type BulkIdCardProgress = {
  done: number;
  total: number;
  phase: "rendering" | "zipping";
};

export type BulkIdCardOptions = {
  onProgress?: (progress: BulkIdCardProgress) => void;
  concurrency?: number;
};

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

function sanitizeFilename(value: string): string {
  return value.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(0, 80) || "id_card";
}

function uniquePdfFilename(base: string, used: Set<string>): string {
  const normalized = base.endsWith(".pdf") ? base : `${base}.pdf`;
  if (!used.has(normalized)) {
    used.add(normalized);
    return normalized;
  }
  const stem = normalized.replace(/\.pdf$/i, "");
  let n = 2;
  while (used.has(`${stem}_${n}.pdf`)) n += 1;
  const unique = `${stem}_${n}.pdf`;
  used.add(unique);
  return unique;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onItemDone?: (done: number, total: number) => void
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index], index);
      completed += 1;
      onItemDone?.(completed, items.length);
      if (completed % 2 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }

  const workers = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

export async function captureIdCardPng(data: IdCardData): Promise<string> {
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;z-index:-1;opacity:1;pointer-events:none;background:#fff;transform:none;zoom:1;";
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    root.render(<PrintableIDCard data={data} />);
    await new Promise((r) => setTimeout(r, 120));
    await new Promise((r) => setTimeout(r, 120));
    await document.fonts.ready;
    await waitForImages(host);

    const el = host.querySelector("[data-printable-id-card]") as HTMLElement | null;
    if (!el) throw new Error("ID card DOM missing");

    const canvas = await html2canvas(el, {
      scale: 4,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: "#ffffff",
    });
    return canvas.toDataURL("image/png");
  } finally {
    root.unmount();
    document.body.removeChild(host);
  }
}

/** Render one ID card DOM → CR80 PDF blob. */
export async function renderIdCardPdfBlob(data: IdCardData): Promise<Blob> {
  const imgData = await captureIdCardPng(data);
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "px",
    format: [350, 560],
    compress: true,
  });
  pdf.addImage(imgData, "PNG", 0, 0, 350, 560);
  return pdf.output("blob");
}

export function idCardPdfFilename(cardNumber: string, userName: string): string {
  return `${sanitizeFilename(cardNumber)}_${sanitizeFilename(userName)}.pdf`;
}

export async function downloadIdCardsZip(
  items: Array<{ data: IdCardData; filename: string }>,
  options?: BulkIdCardOptions
): Promise<void> {
  if (items.length === 0) return;

  const concurrency = options?.concurrency ?? 1;
  const usedNames = new Set<string>();
  const zip = new JSZip();

  const rendered = await mapWithConcurrency(
    items,
    concurrency,
    async (item) => {
      const blob = await renderIdCardPdfBlob(item.data);
      const name = uniquePdfFilename(item.filename, usedNames);
      return { name, blob };
    },
    (done, total) => options?.onProgress?.({ done, total, phase: "rendering" })
  );

  for (const { name, blob } of rendered) {
    zip.file(name, blob);
  }

  options?.onProgress?.({ done: items.length, total: items.length, phase: "zipping" });

  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 3 },
  });

  const url = URL.createObjectURL(zipBlob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `id_cards_${new Date().toISOString().split("T")[0]}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Multi-page PDF (one card per page) for print / combined download. */
export async function downloadIdCardsCombinedPdf(
  items: IdCardData[],
  options?: BulkIdCardOptions
): Promise<void> {
  if (items.length === 0) return;

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "px",
    format: [350, 560],
    compress: true,
  });

  for (let i = 0; i < items.length; i++) {
    const imgData = await captureIdCardPng(items[i]);
    if (i > 0) pdf.addPage([350, 560], "portrait");
    pdf.addImage(imgData, "PNG", 0, 0, 350, 560);
    options?.onProgress?.({ done: i + 1, total: items.length, phase: "rendering" });
  }

  pdf.save(`id_cards_print_${new Date().toISOString().split("T")[0]}.pdf`);
}
