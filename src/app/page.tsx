import Image from "next/image";
import { Workbench } from "@/components/Workbench";
import { BLOOM_COLORS } from "@/lib/bloom";

const STEPS = [
  {
    title: "Content",
    body: "Drop a PDF, a text or Markdown file, pasted notes, a web page or a YouTube link. The text is extracted on the server.",
    color: BLOOM_COLORS.Remember,
  },
  {
    title: "Knowledge graph",
    body: "A language model pulls out the document's concepts, rates how central each one is, and records how they relate.",
    color: BLOOM_COLORS.Apply,
  },
  {
    title: "Adaptive questions",
    body: "Questions target the important concepts. After each answer an Item Response Theory (IRT) model picks how hard the next one should be.",
    color: BLOOM_COLORS.Analyze,
  },
  {
    title: "Ability estimate",
    body: "You get a 0 to 100 score with its uncertainty band, the underlying θ estimate, and a map of which concepts you mastered.",
    color: BLOOM_COLORS.Evaluate,
  },
];

const NOTES = [
  {
    lead: "A language model grades written answers.",
    body: "It checks them against key points drawn from your document and explains its call. Multiple-choice and true-or-false answers are checked exactly. Graders can be wrong, so read the feedback.",
  },
  {
    lead: "Difficulties are estimated, not calibrated.",
    body: "The IRT model uses difficulty ratings from the model rather than from thousands of past test-takers. Treat the score as a reading of this document and this session, not a certificate.",
  },
  {
    lead: "Questions only come from what you upload.",
    body: "If the document is thin, so is the test. A chapter or a long article gives the graph enough to work with.",
  },
  {
    lead: "Uploads are processed and stored by the engine.",
    body: "That is how the graph and the questions get built. Don't upload anything confidential.",
  },
];

export default function Home() {
  return (
    <>
      <Workbench />

      <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-16 border-t border-line bg-ink-sunk">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
          <h2 id="how-heading" className="max-w-2xl text-3xl font-semibold leading-tight sm:text-[2.6rem]">
            From a document to an estimate of what you know
          </h2>
          <ol className="relative mt-14 grid gap-10 md:grid-cols-4 md:gap-8">
            <span
              aria-hidden="true"
              className="absolute bottom-3 left-[11px] top-3 w-px bg-gradient-to-b from-bloom-remember via-bloom-analyze to-bloom-evaluate md:bottom-auto md:left-3 md:right-[calc((100%_-_6rem)/4_-_12px)] md:top-[11px] md:h-px md:w-auto md:bg-gradient-to-r"
            />
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative pl-12 md:pl-0 md:pt-12">
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full border-[3px] border-ink-sunk text-[0.7rem] font-bold text-ink"
                  style={{ background: step.color }}
                >
                  {i + 1}
                </span>
                <h3 className="text-xl font-semibold">{step.title}</h3>
                <p className="mt-2 text-mute">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="fine-print" aria-labelledby="notes-heading" className="scroll-mt-16 border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-16 lg:py-28">
          <div>
            <h2 id="notes-heading" className="text-3xl font-semibold leading-tight sm:text-[2.6rem]">
              What the score means, and what it doesn&apos;t
            </h2>
            <p className="mt-4 text-mute">PoCW is a quick, honest read on your understanding. Here is what is behind it.</p>
          </div>
          <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {NOTES.map((n) => (
              <div key={n.lead} className="border-l-2 border-magenta/60 pl-5">
                <dt className="font-semibold text-paper">{n.lead}</dt>
                <dd className="mt-1.5 text-mute">{n.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 text-sm text-mute sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="" width={24} height={24} className="h-6 w-6" />
            <span>
              <span className="font-semibold text-paper">PoCW</span>, Proof of Cognitive Work
            </span>
          </div>
          <p>Built by Cognitive Layer Labs.</p>
        </div>
      </footer>
    </>
  );
}
