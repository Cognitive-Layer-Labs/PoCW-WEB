import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AttemptsTable, BooksTable } from "@/components/admin/tables";
import { Empty, KpiGrid, KpiTile, PageHeader, Panel, updatesLabel } from "@/components/admin/ui";
import { ago, day, int, pct, score, stamp } from "@/lib/admin-format";
import { adminMetadata, requireAdmin } from "@/lib/server/admin-gate";
import { attemptsForReader, booksForReader, readerById } from "@/lib/server/admin";

export const dynamic = "force-dynamic";
export const generateMetadata = adminMetadata("Reader");

type Props = { params: Promise<{ id: string }> };

export default async function ReaderPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;
  const reader = /^\d{1,12}$/.test(id) ? readerById(Number(id)) : null;
  if (!reader) notFound();
  const books = booksForReader(reader.id);
  const attempts = attemptsForReader(reader.id);
  const finished = attempts.filter((a) => a.finishedAt);
  const best = finished.reduce<number | null>((m, a) => (a.score !== null && (m === null || a.score > m) ? a.score : m), null);
  const shared = finished.filter((a) => a.shared).length;

  return (
    <>
      <Link href="/admin/readers" className="-ml-1 mb-3 inline-flex min-h-10 items-center gap-1.5 rounded-full px-1 text-sm text-mute hover:text-paper">
        <ArrowLeft aria-hidden="true" className="size-4" /> Readers
      </Link>
      <PageHeader
        title={reader.name?.trim() || reader.email}
        lede={
          <>
            {reader.name?.trim() ? <span className="text-paper">{reader.email}. </span> : null}
            Joined {day(reader.joinedAt)}, last seen {reader.lastSeenAt ? `${ago(reader.lastSeenAt)} (${stamp(reader.lastSeenAt)} UTC)` : "never"}.
            Update emails: {updatesLabel(reader.updatesOptIn).toLowerCase()}
            {reader.updatesOptInAt ? ` since ${day(reader.updatesOptInAt)}` : ""}.
          </>
        }
      />

      <KpiGrid className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <KpiTile label="Books" value={int(books.length)} />
        <KpiTile label="Tests started" value={int(attempts.length)} />
        <KpiTile label="Tests finished" value={int(finished.length)}>
          <span className="text-mute">{pct(attempts.length ? finished.length / attempts.length : null)} completion</span>
        </KpiTile>
        <KpiTile label="Average score" value={score(reader.avgScore)} />
        <KpiTile label="Best score" value={score(best)} />
        <KpiTile label="Shared results" value={int(shared)} />
      </KpiGrid>

      <Panel id="reader-books-h" title="Books" meta={`${int(books.length)} added`} className="mt-5" flush>
        {books.length === 0 ? (
          <div className="px-4 pb-4 sm:px-5">
            <Empty>This reader hasn&apos;t added a book yet.</Empty>
          </div>
        ) : (
          <BooksTable rows={books} showReader={false} />
        )}
      </Panel>

      <Panel id="reader-tests-h" title="Tests" meta={`${int(attempts.length)} started, newest first`} className="mt-5" flush>
        {attempts.length === 0 ? (
          <div className="px-4 pb-4 sm:px-5">
            <Empty>No tests yet.</Empty>
          </div>
        ) : (
          <AttemptsTable rows={attempts} showReader={false} />
        )}
      </Panel>
    </>
  );
}
