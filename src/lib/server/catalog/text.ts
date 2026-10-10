/**
 * Normalising titles and author names so a book from Open Library can be matched with the same
 * book in Project Gutenberg's catalog ("Moby Dick" and "Moby Dick; Or, The Whale", "Jane Austen"
 * and "Austen, Jane, 1775-1817").
 */

const LEADING_ARTICLE = /^(the|a|an) /;

/** Lowercase ASCII words: accents stripped, "&" read as "and", punctuation dropped. */
export function normalise(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The full title, normalised, without a leading article. */
export function titleKey(title: string): string {
  return normalise(title).replace(LEADING_ARTICLE, "");
}

/** The title before any subtitle ("Frankenstein; or, the modern prometheus" -> "Frankenstein"). */
export function mainTitle(title: string): string {
  const cut = title.split(/\r?\n|;|:|\s[-–—]\s|\(|\[/)[0] ?? title;
  return cut.replace(/[,.\s]+$/, "").trim() || title.trim();
}

export function mainKey(title: string): string {
  return titleKey(mainTitle(title));
}

const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "nor", "of", "on", "or", "the", "to", "with"]);

/** Title case for catalog titles typed in lowercase ("The strange case of Dr. Jekyll"). */
export function tidyTitle(title: string): string {
  const words = title.split(" ");
  const lowerWords = words.filter((w) => /^[a-z]/.test(w) && !SMALL_WORDS.has(w));
  if (lowerWords.length < 2) return title;
  return words
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Writing systems other than Latin (a Russian or Greek work title, say). */
export function nonLatin(value: string): boolean {
  return /[Ͱ-ϿЀ-ԯ֐-ۿऀ-෿฀-໿ᄀ-ᇿ぀-ヿ㐀-鿿가-힯]/.test(value);
}

const ENGLISH_WORDS = new Set(["the", "a", "an", "of", "and", "in", "on", "to", "for", "with", "my", "your", "his", "her", "how", "what", "why", "is", "are"]);

/**
 * The title to show for an Open Library work. Works are sometimes titled in their original
 * language ("Преступление и наказание", "O Alquimista"); then the matching English edition's
 * title is shown. A work title in Latin script counts as foreign only when it has no common
 * English word and shares no word with the English edition's title.
 */
export function englishTitle(workTitle: string, editionTitle: string | undefined): string {
  const work = workTitle.trim();
  const edition = editionTitle?.trim().replace(/[;:,/\s]+$/, "");
  if (!edition || edition.length < 2 || /^\d+$/.test(edition)) return work;
  if (nonLatin(work)) return nonLatin(edition) ? work : edition;
  const words = normalise(work).split(" ");
  if (words.some((w) => ENGLISH_WORDS.has(w))) return work;
  const a = new Set(words.filter((w) => w.length > 2));
  const b = titleKey(edition).split(" ").filter((w) => w.length > 2);
  if (a.size === 0 || b.length === 0) return work;
  return b.some((w) => a.has(w)) ? work : edition;
}

/** Normalised surname: the last word of "Jane Austen", or what comes before the comma in "Austen, Jane". */
export function surname(name: string): string {
  const base = name.replace(/\(.*?\)|\[.*?\]/g, " ");
  const part = base.includes(",") ? base.split(",")[0] : base;
  const words = normalise(part).split(" ").filter((w) => w.length > 1 && !/^\d+$/.test(w));
  return words[words.length - 1] ?? "";
}

/** Two surnames that are the same, allowing for transliteration ("Dostoyevsky" / "Dostoievski"). */
export function sameSurname(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5);
}

const HONORIFIC = /^(emperor|empress|king|queen|saint|st|pope|lord|lady|sir|baron|baroness|count|countess|duke|duchess|earl|prince|princess)\b/i;

/**
 * One Gutenberg author ("Austen, Jane, 1775-1817", "Fitzgerald, F. Scott (Francis Scott), 1896-1940",
 * "Marcus Aurelius, Emperor of Rome, 121-180") as it is written on a cover.
 */
export function displayAuthor(raw: string): string {
  const parts = raw
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .split(",")
    .map((p) => p.trim())
    // Life dates ("1775-1817", "751? BCE-651? BCE", "active 6th century B.C.") are dropped.
    .filter((p) => p && !/^(\d|-|active\b|fl\.|approximately\b|born\b|died\b)/i.test(p));
  if (parts.length === 0) return raw.trim();
  if (parts.length === 1) return parts[0];
  const [last, first] = parts;
  if (HONORIFIC.test(first) || /\bof\b/.test(first)) return last;
  return `${first} ${last}`.replace(/\s+/g, " ").trim();
}

/** Gutenberg's "Authors" column: "Austen, Jane, 1775-1817; Thomson, Hugh, 1860-1920 [Illustrator]". */
export function gutenbergAuthors(field: string): { display: string | null; surnames: string[] } {
  const people = field
    .split(/;\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  // Illustrators, editors and translators are listed too; authors carry no role or "[Author]".
  const authors = people.filter((p) => !/\[(?!author\])[^\]]*\]/i.test(p));
  const main = authors.length ? authors : people.slice(0, 1);
  const surnames = [...new Set(main.map(surname).filter(Boolean))];
  const display = main.length ? main.slice(0, 2).map(displayAuthor).join(" and ") : null;
  return { display: display || null, surnames };
}
