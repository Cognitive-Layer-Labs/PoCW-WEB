import { readFile } from "node:fs/promises";
import path from "node:path";
import { MARK_SVG } from "@/components/Logo";

/**
 * Shared pieces for Open Graph images (next/og). Fonts are static Literata WOFF
 * files committed under src/assets/fonts (satori can't read WOFF2); the build
 * copies them into the standalone output (see outputFileTracingIncludes).
 */

const FONT_DIR = path.join(process.cwd(), "src", "assets", "fonts");

type Font = { name: string; data: ArrayBuffer; weight: 400 | 600; style: "normal" | "italic" };

let cached: Promise<Font[]> | null = null;

export function ogFonts(): Promise<Font[]> {
  cached ??= (async () => {
    const load = async (file: string) => {
      const buf = await readFile(path.join(FONT_DIR, file));
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    };
    const files: Array<[string, string, 400 | 600, "normal" | "italic"]> = [
      ["Literata", "literata-latin-400-normal.woff", 400, "normal"],
      ["Literata", "literata-latin-600-normal.woff", 600, "normal"],
      ["Literata", "literata-latin-600-italic.woff", 600, "italic"],
      ["Literata Ext", "literata-latin-ext-400-normal.woff", 400, "normal"],
      ["Literata Ext", "literata-latin-ext-600-normal.woff", 600, "normal"],
      ["Literata Ext", "literata-latin-ext-600-italic.woff", 600, "italic"],
    ];
    return Promise.all(files.map(async ([name, file, weight, style]) => ({ name, data: await load(file), weight, style })));
  })();
  return cached;
}

export const OG_FONT_FAMILY = "Literata, 'Literata Ext'";

export const MARK_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(MARK_SVG).toString("base64")}`;

export const OG_COLORS = {
  ink: "#1B1026",
  raised: "#251933",
  line: "#594670",
  paper: "#F6EFF3",
  mute: "#B5A6C1",
  ribbon: "#F0579B",
  mastered: "#5EE3A1",
  attempted: "#F5B94C",
  untested: "#6B5A7B",
};

type Outcome = "mastered" | "attempted" | "untested";

const SLOTS: Array<[number, number, number]> = [
  // x, y, r on a 520 x 420 page
  [250, 210, 22],
  [130, 120, 16],
  [380, 100, 15],
  [420, 230, 16],
  [350, 340, 14],
  [140, 300, 14],
  [250, 70, 10],
  [70, 210, 10],
  [470, 330, 10],
];
const LINKS: Array<[number, number]> = [
  [0, 1], [0, 2], [0, 3], [0, 5], [1, 5], [2, 3], [3, 4], [4, 5], [0, 4], [1, 6], [6, 2], [7, 1], [7, 5], [8, 3], [8, 4],
];

/** A page of the book turned into a map, nodes colored by outcome (no text: resvg has no fonts). */
export function mapPageDataUri(outcomes: Outcome[]): string {
  const colors = SLOTS.map((_, i) => OG_COLORS[outcomes[i] ?? "untested"]);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 420">
<path d="M10 40C120 6 300 -4 510 4V396C300 392 120 400 10 418Z" fill="${OG_COLORS.raised}" stroke="${OG_COLORS.line}" stroke-width="2"/>
<g stroke="${OG_COLORS.ribbon}" stroke-opacity="0.8" stroke-width="3.5" stroke-linecap="round">${LINKS.map(
    ([a, b]) => `<line x1="${SLOTS[a][0]}" y1="${SLOTS[a][1]}" x2="${SLOTS[b][0]}" y2="${SLOTS[b][1]}"/>`
  ).join("")}</g>
${SLOTS.map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${colors[i]}"/>`).join("")}
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const COVER_HOSTS = new Set(["covers.openlibrary.org", "www.gutenberg.org"]);

/**
 * A book's real cover as a data URI for an Open Graph image, or null. Only the catalog's cover
 * hosts are fetched (Open Library redirects to archive.org), with a timeout and a size cap.
 */
export async function coverDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !COVER_HOSTS.has(parsed.hostname)) return null;
    const res = await fetch(parsed, {
      headers: { "user-agent": "Bookmap/1.0 (+https://bookmap.baghici.com)" },
      signal: AbortSignal.timeout(5000),
    });
    const type = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (!res.ok || (type !== "image/jpeg" && type !== "image/png")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 200 || buf.byteLength > 2 * 1024 * 1024) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
