import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { AttemptReview } from "@/components/AttemptReview";
import { attemptState, settingsLabel } from "@/components/admin/tables";
import { KpiGrid, KpiTile, PageHeader, Panel } from "@/components/admin/ui";
import { duration, int, score, stamp } from "@/lib/admin-format";
import { adminMetadata, requireAdmin } from "@/lib/server/admin-gate";
import { attemptRow, shareSlugFor } from "@/lib/server/admin";
import { attemptById } from "@/lib/server/repo";

export const dynamic = "force-dynamic";
export const generateMetadata = adminMetadata("Test review");

type Props = { params: Promise<{ id: string }> };

export default async function AdminAttemptPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;
  const valid = /^\d{1,12}$/.test(id);
  const row = valid ? attemptRow(Number(id)) : null;
  const attempt = valid ? attemptById(Number(id)) : null;
  if (!row || !attempt) notFound();
  const slug = row.shared ? shareSlugFor(row.id) : null;
  const state = attemptState(row);
  const mastered = attempt.concepts.filter((c) => c.asked > 0 && c.mastered).length;
  const tested = attempt.concepts.filter((c) => c.asked > 0).length;

  return (
    <>
      <Link href="/admin/tests" className="-ml-1 mb-3 inline-flex min-h-10 items-center gap-1.5 rounded-full px-1 text-sm text-mute hover:text-paper">
        <ArrowLeft aria-hidden="true" className="size-4" /> Tests
      </Link>
      <PageHeader
        title={`Test #${row.id}`}
        lede={
          <>
            <Link href={`/admin/readers/${row.userId}`} className="text-paper hover:text-ribbon-soft hover:underline">
              {row.reader}
            </Link>{" "}
            on <span className="book-title text-paper">{row.bookTitle}</span>. {settingsLabel(row)}. Started {stamp(row.startedAt)} UTC
            {row.finishedAt ? `, finished ${stamp(row.finishedAt)} UTC` : ""}.
          </>
        }
        actions={
          slug ? (
            <a
              href={`/s/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong px-4 text-sm font-semibold text-paper hover:border-ribbon hover:text-ribbon-soft"
            >
              <ExternalLink aria-hidden="true" className="size-4" /> Public result
            </a>
          ) : undefined
        }
      />

      <KpiGrid className="grid-cols-2 sm:grid-cols-4">
        <KpiTile label={state === "finished" ? "Score" : "Status"} value={state === "finished" ? score(row.score) : state === "in progress" ? "In progress" : "Not finished"}>
          {state === "finished" && attempt.ciLow !== null && attempt.ciHigh !== null && (
            <span className="text-mute">
              likely {score(attempt.ciLow)} to {score(attempt.ciHigh)}
            </span>
          )}
        </KpiTile>
        <KpiTile label="Cleared the bar" value={row.passed === null ? "–" : row.passed ? "Yes" : "No"} />
        <KpiTile label="Answered" value={`${int(row.answered)} of ${int(row.questions)}`} />
        <KpiTile label="Took" value={row.finishedAt ? duration((Date.parse(row.finishedAt) - Date.parse(row.startedAt)) / 1000) : "–"}>
          {tested > 0 && (
            <span className="text-mute">
              {int(mastered)} of {int(tested)} ideas mastered
            </span>
          )}
        </KpiTile>
      </KpiGrid>

      <Panel id="review-panel-h" title="Answers" className="mt-5">
        {attempt.transcript.length === 0 && attempt.responseDetail.length === 0 ? (
          <p className="text-sm text-mute">No answers were recorded for this attempt.</p>
        ) : (
          <AttemptReview attempt={attempt} admin heading={null} />
        )}
      </Panel>
    </>
  );
}
