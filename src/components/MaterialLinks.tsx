import { Download, ExternalLink, FileText } from "lucide-react";
import type { Material } from "@/lib/server/admin";
import { cn } from "@/lib/utils";

type Linkable = Pick<Material, "bookId" | "storedFile" | "fileType" | "status" | "sourceKind" | "sourceUrl">;

const linkClass =
  "inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-[0.8125rem] font-semibold text-mute transition-colors hover:bg-ink-raised hover:text-paper [&_svg]:size-3.5";

/** Per-book downloads for the admin: the original upload, the extracted text, or the source link. */
export function MaterialLinks({ m, className, hideEmpty = false }: { m: Linkable; className?: string; hideEmpty?: boolean }) {
  const links = [
    m.storedFile && (
      <a key="original" href={`/admin/materials/${m.bookId}/original`} download className={linkClass} title="Download the file the reader uploaded">
        <Download aria-hidden="true" /> {m.fileType ? m.fileType.toUpperCase() : "File"}
        <span className="sr-only"> original</span>
      </a>
    ),
    m.status === "ready" && (
      <a key="text" href={`/admin/materials/${m.bookId}/text`} download className={linkClass} title="Download the text Bookmap extracted">
        <FileText aria-hidden="true" /> Text
      </a>
    ),
    m.sourceKind === "link" && m.sourceUrl && (
      <a key="link" href={m.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className={linkClass} title={m.sourceUrl}>
        <ExternalLink aria-hidden="true" /> Link
      </a>
    ),
  ].filter(Boolean);
  if (links.length === 0) return hideEmpty ? null : <span className="px-2 text-[0.8125rem] text-mute/60">None</span>;
  return <div className={cn("-mx-2 flex items-center gap-0.5", className)}>{links}</div>;
}

export function fileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function sourceLabel(m: Pick<Material, "sourceKind" | "sourceUrl" | "fileName" | "fileSize">): string {
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

/** "PDF, 14.3 MB" for files, the host for links. */
export function sourceShort(m: Pick<Material, "sourceKind" | "sourceUrl" | "fileType" | "fileSize">): string {
  if (m.sourceKind === "link" && m.sourceUrl) {
    try {
      return new URL(m.sourceUrl).host.replace(/^www\./, "");
    } catch {
      return "link";
    }
  }
  return [m.fileType ? m.fileType.toUpperCase() : "File", fileSize(m.fileSize)].filter(Boolean).join(", ");
}
