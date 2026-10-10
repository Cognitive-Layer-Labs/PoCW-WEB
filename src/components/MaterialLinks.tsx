import { Download, ExternalLink, FileText } from "lucide-react";
import type { Material } from "@/lib/server/repo";

const linkClass =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong px-3 text-sm font-semibold hover:border-ribbon hover:text-ribbon-soft";

/** Per-book download links for the admin "Materials" section. */
export function MaterialLinks({ m }: { m: Material }) {
  return (
    <div className="flex flex-wrap gap-2">
      {m.storedFile && (
        <a href={`/admin/materials/${m.bookId}/original`} download className={linkClass}>
          <Download aria-hidden="true" className="size-4" /> Original{m.fileType ? ` (.${m.fileType})` : ""}
        </a>
      )}
      {m.status === "ready" && (
        <a href={`/admin/materials/${m.bookId}/text`} download className={linkClass}>
          <FileText aria-hidden="true" className="size-4" /> Text
        </a>
      )}
      {m.sourceKind === "link" && m.sourceUrl && (
        <a href={m.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className={linkClass}>
          <ExternalLink aria-hidden="true" className="size-4" /> Link
        </a>
      )}
    </div>
  );
}

export function fileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function sourceLabel(m: Material): string {
  if (m.sourceKind === "link" && m.sourceUrl) {
    try {
      return new URL(m.sourceUrl).host;
    } catch {
      return "link";
    }
  }
  const size = fileSize(m.fileSize);
  return [m.fileName || "file", size].filter(Boolean).join(", ");
}
