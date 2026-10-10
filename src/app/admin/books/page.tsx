import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { BarList } from "@/components/admin/BarList";
import { ColumnChart } from "@/components/admin/ColumnChart";
import { FilterForm, SearchField, SelectField } from "@/components/admin/FilterForm";
import { BooksTable } from "@/components/admin/tables";
import { Empty, PageHeader, Pagination, Panel, oneOf, param, type Params } from "@/components/admin/ui";
import { ago, int, score, count } from "@/lib/admin-format";
import { adminMetadata, requireAdmin } from "@/lib/server/admin-gate";
import {
  FILE_TYPES,
  bookFacets,
  bookList,
  conceptDistribution,
  indexingFailures,
  mostTestedBooks,
  type BookSort,
  type BookStatusFilter,
  type SourceFilter,
} from "@/lib/server/admin";

export const dynamic = "force-dynamic";
export const generateMetadata = adminMetadata("Books");

const BASE = "/admin/books";
const SORTS: Array<{ value: string; label: string; sort: BookSort; dir: "asc" | "desc" }> = [
  { value: "added-desc", label: "Newest first", sort: "added", dir: "desc" },
  { value: "added-asc", label: "Oldest first", sort: "added", dir: "asc" },
  { value: "tests-desc", label: "Most tested", sort: "tests", dir: "desc" },
  { value: "concepts-desc", label: "Most concepts", sort: "concepts", dir: "desc" },
  { value: "score-desc", label: "Highest average", sort: "score", dir: "desc" },
  { value: "score-asc", label: "Lowest average", sort: "score", dir: "asc" },
  { value: "title-asc", label: "Title, A to Z", sort: "title", dir: "asc" },
];

export default async function BooksPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const q = param(params, "q").slice(0, 100);
  const status = oneOf(param(params, "status"), ["all", "ready", "working", "failed"] as const, "all") as BookStatusFilter;
  const source = oneOf(param(params, "source"), ["all", "file", "link"] as const, "all") as SourceFilter;
  const type = oneOf(param(params, "type"), ["all", ...FILE_TYPES] as const, "all");
  const order = SORTS.find((s) => s.value === param(params, "order")) ?? SORTS[0];
  const list = bookList({ q, status, source, type, sort: order.sort, dir: order.dir, page: Number(param(params, "page")) || 1 });
  const facets = bookFacets();
  const tested = mostTestedBooks(8);
  const concepts = conceptDistribution();
  const failures = indexingFailures(8);
  const filtered = q !== "" || status !== "all" || source !== "all" || type !== "all";

  const sources = [
    ...FILE_TYPES.map((t) => ({ key: t, label: `.${t} file`, value: facets.fileType[t] ?? 0 })),
    { key: "link", label: "Link", value: facets.source.link },
  ].filter((s) => s.value > 0);

  return (
    <>
      <PageHeader
        title="Books"
        lede={
          <>
            {count(facets.total, "book")} from {count(facets.readers, "reader")}: {int(facets.status.ready)} ready, {int(facets.status.working)} mapping,{" "}
            {int(facets.status.failed)} failed. Originals are kept for uploads made since 10 Oct 2026.
          </>
        }
      />

      {failures.length > 0 && (
        <Panel
          id="failures-h"
          title={
            <span className="inline-flex items-center gap-2">
              <CircleAlert aria-hidden="true" className="size-4 text-danger" /> Mapping failures
            </span>
          }
          meta={
            <Link href={`${BASE}?status=failed`} className="hover:text-paper hover:underline">
              Show all {int(facets.status.failed)}
            </Link>
          }
          className="mb-5"
        >
          <ul className="-my-2 divide-y divide-line/60">
            {failures.map((f) => (
              <li key={f.bookId} className="grid gap-x-4 gap-y-0.5 py-2.5 text-sm md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto]">
                <span className="min-w-0">
                  <span className="book-title block truncate text-paper">{f.title}</span>
                  <span className="block truncate text-[0.8125rem] text-mute">
                    <Link href={`/admin/readers/${f.readerId}`} className="hover:text-paper hover:underline">
                      {f.reader}
                    </Link>
                    , {f.source}
                  </span>
                </span>
                <span className="text-paper/90">{f.error || <span className="text-mute">The engine gave no reason.</span>}</span>
                <span className="whitespace-nowrap text-[0.8125rem] text-mute md:text-right">{ago(f.addedAt)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Panel id="tested-h" title="Most tested" meta="Finished tests, all copies" className="lg:col-span-2 xl:col-span-1">
          {tested.length === 0 ? (
            <Empty>No finished tests yet.</Empty>
          ) : (
            <BarList
              label="Books by finished tests"
              labelWidth="12rem"
              rows={tested.map((b) => ({
                key: b.title,
                label: <span className="book-title">{b.title}</span>,
                value: b.tests,
                display: int(b.tests),
                sub: `avg ${score(b.avgScore)}`,
              }))}
            />
          )}
        </Panel>
        <Panel id="concepts-h" title="Concepts per book" meta={concepts.median !== null ? `Median ${int(concepts.median)}` : undefined}>
          {concepts.mapped === 0 ? (
            <Empty>No books have been mapped yet.</Empty>
          ) : (
            <ColumnChart
              label="Mapped books by number of concepts"
              unit="books"
              height={128}
              columns={concepts.bins.map((b) => ({
                key: String(b.from),
                label: b.to === null ? `${b.from} or more concepts` : `${b.from}–${b.to} concepts`,
                tick: b.to === null ? `${b.from}+` : String(b.from),
                value: b.books,
              }))}
            />
          )}
        </Panel>
        <Panel id="sources-h" title="Where books come from" meta={`${count(facets.total, "book")}`}>
          {sources.length === 0 ? (
            <Empty>No books yet.</Empty>
          ) : (
            <BarList
              label="Books by source"
              labelWidth="6rem"
              max={facets.total}
              track
              rows={sources.map((s) => ({
                key: s.key,
                label: s.label,
                value: s.value,
                display: int(s.value),
                sub: `${Math.round((s.value / Math.max(1, facets.total)) * 100)}%`,
              }))}
            />
          )}
        </Panel>
      </div>

      <section aria-labelledby="library-h" className="mt-8">
        <h2 id="library-h" className="mb-3 font-sans text-[0.95rem] font-semibold text-paper">
          Library
        </h2>
        <FilterForm key={JSON.stringify(params)} action={BASE} className="mb-4">
          <SearchField defaultValue={q} placeholder="Title, author, file or reader" label="Search books" />
          <SelectField
            name="status"
            label="Status"
            value={status}
            options={[
              { value: "all", label: `Any status (${facets.total})` },
              { value: "ready", label: `Ready (${facets.status.ready})` },
              { value: "working", label: `Mapping (${facets.status.working})` },
              { value: "failed", label: `Failed (${facets.status.failed})` },
            ]}
          />
          <SelectField
            name="source"
            label="Source"
            value={source}
            options={[
              { value: "all", label: "Files and links" },
              { value: "file", label: `Files (${facets.source.file})` },
              { value: "link", label: `Links (${facets.source.link})` },
            ]}
          />
          <SelectField
            name="type"
            label="File type"
            value={type}
            options={[{ value: "all", label: "Any type" }, ...FILE_TYPES.map((t) => ({ value: t, label: `.${t} (${facets.fileType[t] ?? 0})` }))]}
          />
          <SelectField name="order" label="Sort" value={order.value} options={SORTS.map((s) => ({ value: s.value, label: s.label }))} />
          {filtered && (
            <Link href={BASE} className="flex h-10 items-center px-2 text-sm font-semibold text-mute hover:text-paper">
              Clear
            </Link>
          )}
        </FilterForm>

        <div className="overflow-hidden rounded-xl border border-line bg-ink-sunk/40">
          {list.rows.length === 0 ? (
            <div className="p-4">
              <Empty>{filtered ? "No books match these filters." : "No books yet."}</Empty>
            </div>
          ) : (
            <BooksTable rows={list.rows} />
          )}
          <Pagination base={BASE} params={params} page={list.page} pageSize={list.pageSize} total={list.total} noun="books" />
        </div>
      </section>
    </>
  );
}
