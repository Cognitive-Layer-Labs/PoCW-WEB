import Link from "next/link";
import { Download } from "lucide-react";
import { FilterForm, SearchField, SelectField } from "@/components/admin/FilterForm";
import {
  Empty,
  PageHeader,
  Pagination,
  SortHeader,
  Who,
  actionClass,
  numClass,
  oneOf,
  param,
  tableClass,
  tdClass,
  updatesLabel,
  type Params,
} from "@/components/admin/ui";
import { ago, day, int, pct, score, stamp, count } from "@/lib/admin-format";
import { adminMetadata, requireAdmin } from "@/lib/server/admin-gate";
import { readerList, readerTotals, type ReaderSort, type UpdatesFilter } from "@/lib/server/admin";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const generateMetadata = adminMetadata("Readers");

const SORTS: ReaderSort[] = ["name", "joined", "seen", "books", "tests", "score"];
const UPDATES: UpdatesFilter[] = ["all", "yes", "no", "unasked"];
const BASE = "/admin/readers";

export default async function ReadersPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const q = param(params, "q").slice(0, 100);
  const updates = oneOf(param(params, "updates"), UPDATES, "all");
  const sort = oneOf(param(params, "sort"), SORTS, "seen");
  const dir = oneOf(param(params, "dir"), ["asc", "desc"] as const, sort === "name" ? "asc" : "desc");
  const list = readerList({ q, updates, sort, dir, page: Number(param(params, "page")) || 1 });
  const totals = readerTotals();
  const filtered = q !== "" || updates !== "all";

  const head = (label: string, column: ReaderSort, numeric = false) => (
    <SortHeader label={label} column={column} sort={sort} dir={dir} base={BASE} params={params} numeric={numeric} defaultDir={column === "name" ? "asc" : "desc"} />
  );

  return (
    <>
      <PageHeader
        title="Readers"
        lede={
          <>
            {count(totals.readers, "reader")}, {int(totals.joined7d)} new in the last 7 days. {int(totals.withBook)} have added a book;{" "}
            {int(totals.optedIn)} want update emails ({pct(totals.answered ? totals.optedIn / totals.answered : null)} of those asked).
          </>
        }
        actions={
          <a href="/admin/readers.csv" download className={actionClass}>
            <Download aria-hidden="true" /> Export CSV
          </a>
        }
      />

      <FilterForm key={JSON.stringify(params)} action={BASE} className="mb-4">
        <SearchField defaultValue={q} placeholder="Search name or email" label="Search readers" />
        <SelectField
          name="updates"
          label="Update emails"
          value={updates}
          options={[
            { value: "all", label: "Everyone" },
            { value: "yes", label: "Said yes" },
            { value: "no", label: "Said no" },
            { value: "unasked", label: "Not asked" },
          ]}
        />
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        {filtered && (
          <Link href={BASE} className="flex h-10 items-center px-2 text-sm font-semibold text-mute hover:text-paper">
            Clear
          </Link>
        )}
      </FilterForm>

      <section aria-label="Readers" className="overflow-hidden rounded-xl border border-line bg-ink-sunk/40">
        {list.rows.length === 0 ? (
          <div className="p-4">
            <Empty>{filtered ? "No readers match these filters." : "No readers yet."}</Empty>
          </div>
        ) : (
          <>
            {/* Phones */}
            <ul className="divide-y divide-line/60 md:hidden">
              {list.rows.map((r) => (
                <li key={r.id}>
                  <Link href={`${BASE}/${r.id}`} className="block px-4 py-3 hover:bg-ink-raised/40">
                    <span className="block truncate font-semibold text-paper">{r.name?.trim() || "No name"}</span>
                    <span className="block truncate text-[0.8125rem] text-mute">{r.email}</span>
                    <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[0.8125rem] text-mute">
                      <span>
                        <span className="tabular-nums text-paper">{int(r.books)}</span> {r.books === 1 ? "book" : "books"}
                      </span>
                      <span>
                        <span className="tabular-nums text-paper">{int(r.tests)}</span> {r.tests === 1 ? "test" : "tests"}
                      </span>
                      <span>
                        avg <span className="tabular-nums text-paper">{score(r.avgScore)}</span>
                      </span>
                      <span>seen {ago(r.lastSeenAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {/* Wider screens */}
            <div className="hidden overflow-x-auto md:block">
              <table className={tableClass}>
                <caption className="sr-only">Readers, sorted by {sort}</caption>
                <thead>
                  <tr>
                    {head("Reader", "name")}
                    {head("Joined", "joined")}
                    {head("Last seen (UTC)", "seen")}
                    {head("Books", "books", true)}
                    {head("Tests", "tests", true)}
                    {head("Avg score", "score", true)}
                    <th scope="col" className="whitespace-nowrap border-b border-line px-3 py-2.5 pr-5 text-[0.8125rem] font-semibold text-mute">
                      Update emails
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((r) => (
                    <tr key={r.id} className="hover:bg-ink-raised/40">
                      <td className={cn(tdClass, "max-w-[22rem]")}>
                        <Who name={r.name} email={r.email} href={`${BASE}/${r.id}`} />
                      </td>
                      <td className={cn(tdClass, "whitespace-nowrap text-mute")}>{day(r.joinedAt)}</td>
                      <td className={cn(tdClass, "whitespace-nowrap text-mute")} title={r.lastSeenAt ? `${stamp(r.lastSeenAt)} UTC` : undefined}>
                        {r.lastSeenAt ? ago(r.lastSeenAt) : "Never"}
                      </td>
                      <td className={cn(tdClass, numClass)}>{int(r.books)}</td>
                      <td className={cn(tdClass, numClass)}>{int(r.tests)}</td>
                      <td className={cn(tdClass, numClass)}>{score(r.avgScore)}</td>
                      <td className={cn(tdClass, "whitespace-nowrap", r.updatesOptIn ? "text-paper" : "text-mute")}>{updatesLabel(r.updatesOptIn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <Pagination base={BASE} params={params} page={list.page} pageSize={list.pageSize} total={list.total} noun="readers" />
      </section>
    </>
  );
}
