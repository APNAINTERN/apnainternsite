import { createRoot } from "react-dom/client";
import JSZip from "jszip";
import { IssuedCertificateDocument } from "@/components/IssuedCertificateDocument";
import type { CertificateDisplayData } from "@/lib/certificateFormat";
import { renderCertificatePdfBlob } from "@/lib/certificatePdf";

/** Maximum certificates in one bulk PDF/ZIP download. */
export const BULK_CERT_DOWNLOAD_MAX = 500;

export type BulkCertDownloadProgress = {
  done: number;
  total: number;
  phase: "rendering" | "zipping";
};

export type BulkCertDownloadOptions = {
  onProgress?: (progress: BulkCertDownloadProgress) => void;
  /** Parallel PDF renders — keep low to avoid browser memory spikes. */
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
  return value.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(0, 80) || "certificate";
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
      if (completed % 3 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }

  const workers = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

/** Admin PDF export — unsigned copy (no CEO signature image). */
export async function renderAdminCertificatePdfBlob(
  data: CertificateDisplayData
): Promise<Blob> {
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;z-index:-1;opacity:0;pointer-events:none;background:#fff;";
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    root.render(<IssuedCertificateDocument data={data} showSignature={false} />);
    await new Promise((r) => setTimeout(r, 100));
    await waitForImages(host);
    return await renderCertificatePdfBlob(host);
  } finally {
    root.unmount();
    document.body.removeChild(host);
  }
}

export async function downloadAdminCertificatePdf(
  data: CertificateDisplayData,
  filename: string
): Promise<void> {
  const blob = await renderAdminCertificatePdfBlob(data);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadAdminCertificatesZip(
  items: Array<{ data: CertificateDisplayData; filename: string }>,
  options?: BulkCertDownloadOptions
): Promise<void> {
  if (items.length === 0) return;

  const concurrency = options?.concurrency ?? 2;
  const usedNames = new Set<string>();
  const zip = new JSZip();

  const rendered = await mapWithConcurrency(
    items,
    concurrency,
    async (item) => {
      const blob = await renderAdminCertificatePdfBlob(item.data);
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
  anchor.download = `certificates_${new Date().toISOString().split("T")[0]}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function certificatePdfFilename(
  certId: string | null | undefined,
  studentName: string | null | undefined
): string {
  const id = sanitizeFilename(certId || "certificate");
  const name = sanitizeFilename(studentName || "student");
  return `EzyIntern_Certificate_${id}_${name}.pdf`;
}
