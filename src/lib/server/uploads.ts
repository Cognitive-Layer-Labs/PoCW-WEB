import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { dataDir } from "@/lib/server/db";
import { storedFileInUse } from "@/lib/server/repo";

/**
 * Original uploaded files, kept under ${DATA_DIR}/uploads/<knowledgeId>.<ext> so the admin can
 * download them later. One copy per engine resource: readers who upload the same book share it.
 */

const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "application/epub+zip": "epub",
  "text/plain": "txt",
  "text/markdown": "md",
};

export const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  epub: "application/epub+zip",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
};

const uploadsDir = () => path.join(dataDir(), "uploads");

/** Absolute path of a stored file, or null if the relative path escapes the uploads folder. */
export function storedPath(rel: string): string | null {
  const abs = path.resolve(dataDir(), rel);
  return abs.startsWith(uploadsDir() + path.sep) ? abs : null;
}

/** Saves the original upload (once per resource). Returns its relative path, or null on failure. */
export async function saveOriginal(
  knowledgeId: string,
  contentType: string,
  bytes: Uint8Array
): Promise<{ path: string; size: number; type: string } | null> {
  const ext = EXT[contentType.split(";")[0].trim().toLowerCase()];
  if (!ext || !/^[A-Za-z0-9_-]{1,128}$/.test(knowledgeId)) return null;
  const rel = path.posix.join("uploads", `${knowledgeId}.${ext}`);
  const abs = storedPath(rel);
  if (!abs) return null;
  try {
    await fs.mkdir(uploadsDir(), { recursive: true });
    try {
      await fs.access(abs);
    } catch {
      const tmp = `${abs}.${crypto.randomBytes(6).toString("hex")}.tmp`;
      await fs.writeFile(tmp, bytes);
      await fs.rename(tmp, abs);
    }
    return { path: rel, size: bytes.byteLength, type: ext };
  } catch (err) {
    console.error("[bookmap] could not store the original upload:", err);
    return null;
  }
}

/** Deletes a stored original once no book points at it any more. */
export async function removeOriginalIfUnused(rel: string | null): Promise<void> {
  if (!rel || storedFileInUse(rel)) return;
  const abs = storedPath(rel);
  if (abs) await fs.rm(abs, { force: true }).catch(() => {});
}
