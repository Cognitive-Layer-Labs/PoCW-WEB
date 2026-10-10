/** Content-Disposition for a download, with an ASCII fallback and the UTF-8 name (RFC 6266). */
export function attachment(name: string): string {
  const clean = name.replace(/[\u0000-\u001f\u007f"\\/]+/g, " ").trim().slice(0, 180) || "download";
  const ascii = clean.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/\s+/g, " ").trim() || "download";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

/** A file-name-safe version of a book title. */
export function titleSlug(title: string): string {
  return title.replace(/[\u0000-\u001f\u007f"\\/:*?<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "book";
}
