"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Constellation } from "@/components/Constellation";
import { DropZone, type Submission } from "@/components/DropZone";
import { TestSetup, DEFAULT_SETTINGS } from "@/components/TestSetup";
import { QuestionView } from "@/components/QuestionView";
import { ResultsView, type AnsweredItem } from "@/components/ResultsView";
import { GraphDialog, type GraphState } from "@/components/graph/GraphDialog";
import {
  EngineError,
  getGraph,
  getIndexStatus,
  getResult,
  indexUrl,
  startTest,
  submitAnswer,
  uploadDocument,
  type AnswerFeedback,
  type ConceptOutcome,
  type IndexPoll,
  type PoCWResult,
  type TestSettings,
  type VerifyQuestion,
} from "@/lib/engine";
import { loadState, saveState } from "@/lib/persist";

interface Doc {
  knowledgeId: string;
  label: string;
  title?: string;
  source?: string;
}

type Phase =
  | { name: "idle" }
  | { name: "sending"; label: string }
  | { name: "indexing"; doc: Doc; since: number; nextCheck: number }
  | { name: "ready"; doc: Doc }
  | {
      name: "testing";
      doc: Doc;
      settings: TestSettings;
      sessionId: string;
      question: VerifyQuestion;
      total: number;
      answers: AnsweredItem[];
      feedback: AnswerFeedback | null;
      submitted: string | null;
    }
  | { name: "results"; doc: Doc; settings: TestSettings; result: PoCWResult; answers: AnsweredItem[] };

const THRESHOLDS: Record<TestSettings["difficulty"], number> = { easy: 35, medium: 50, hard: 65 };

const docTitle = (doc: Doc) => doc.title?.trim() || doc.label;

/** Use result.concepts when present, else derive outcomes from response_detail[].conceptId. */
function outcomesOf(result: PoCWResult): ConceptOutcome[] | null {
  if (Array.isArray(result.concepts) && result.concepts.length > 0) return result.concepts;
  const detail = result.response_detail?.filter((d) => d.conceptId) ?? [];
  if (detail.length === 0) return null;
  const map = new Map<string, ConceptOutcome>();
  for (const d of detail) {
    const c = map.get(d.conceptId!) ?? { id: d.conceptId!, label: d.conceptId!, asked: 0, correct: 0, mastered: false };
    c.asked += 1;
    if (d.correct) c.correct += 1;
    c.mastered = c.correct === c.asked;
    map.set(c.id, c);
  }
  return [...map.values()];
}

function elapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export function Workbench() {
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [graphs, setGraphs] = useState<Record<string, GraphState>>({});
  const [graphOpen, setGraphOpen] = useState(false);
  const [lastSettings, setLastSettings] = useState<TestSettings>(DEFAULT_SETTINGS);
  const [now, setNow] = useState(() => Date.now());
  const topRef = useRef<HTMLDivElement>(null);
  const run = useRef(0); // bumps on every reset so stale async work is dropped

  // ── Persistence (best effort) ────────────────────────────────────────────
  useEffect(() => {
    const saved = loadState<{ phase: Phase; settings?: TestSettings }>();
    if (saved?.phase && saved.phase.name !== "idle" && saved.phase.name !== "sending") {
      const p = saved.phase;
      setPhase(p.name === "indexing" ? { ...p, nextCheck: Date.now() } : p);
    }
    if (saved?.settings) setLastSettings(saved.settings);
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    saveState(phase.name === "idle" || phase.name === "sending" ? null : { phase, settings: lastSettings });
  }, [phase, lastSettings, restored]);

  const doc = "doc" in phase ? phase.doc : null;
  const knowledgeId = doc?.knowledgeId ?? null;

  // ── Graph loading (for the concept count and the graph view) ─────────────
  const loadGraph = useCallback((id: string) => {
    setGraphs((g) => ({ ...g, [id]: { status: "loading" } }));
    getGraph(id)
      .then((graph) => setGraphs((g) => ({ ...g, [id]: { status: "ready", graph } })))
      .catch((err) =>
        setGraphs((g) => ({
          ...g,
          [id]: { status: "error", message: err instanceof Error ? err.message : "The graph couldn't be loaded." },
        }))
      );
  }, []);

  useEffect(() => {
    if (!knowledgeId || phase.name === "indexing" || graphs[knowledgeId]) return;
    loadGraph(knowledgeId);
  }, [knowledgeId, phase.name, graphs, loadGraph]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const reset = useCallback((message: string | null = null) => {
    run.current += 1;
    setBusy(false);
    setGraphOpen(false);
    setProblem(message);
    setPhase({ name: "idle" });
  }, []);

  const scrollTop = () => topRef.current?.scrollIntoView({ block: "start" });

  const applyPoll = useCallback((poll: IndexPoll, base: Doc) => {
    const s = poll.status;
    const next: Doc = { ...base, knowledgeId: s.knowledgeId || base.knowledgeId, title: s.title ?? base.title, source: s.source ?? base.source };
    if (s.status === "failed") {
      reset(s.error ? `Indexing failed: ${s.error}` : "The engine couldn't build a graph from that document. Try a different one.");
      return;
    }
    if (s.status === "ready") {
      setPhase({ name: "ready", doc: next });
      return;
    }
    setPhase((p) => ({
      name: "indexing",
      doc: next,
      since: p.name === "indexing" ? p.since : Date.now(),
      nextCheck: Date.now() + (poll.retryAfterMs ?? 5000),
    }));
  }, [reset]);

  // ── Submitting content ───────────────────────────────────────────────────
  async function handleSubmit(sub: Submission) {
    const token = ++run.current;
    setProblem(null);
    setPhase({ name: "sending", label: sub.label });
    try {
      const poll =
        sub.kind === "url"
          ? await indexUrl(sub.url)
          : sub.kind === "file"
            ? await uploadDocument(sub.file, sub.contentType)
            : await uploadDocument(new Blob([sub.text], { type: "text/plain" }), "text/plain; charset=utf-8");
      if (token !== run.current) return;
      applyPoll(poll, { knowledgeId: poll.status.knowledgeId, label: sub.label, source: sub.kind === "url" ? sub.url : undefined });
    } catch (err) {
      if (token !== run.current) return;
      reset(err instanceof Error ? err.message : "Something went wrong sending that document.");
    }
  }

  // ── Polling while indexing (honours Retry-After) ─────────────────────────
  const indexing = phase.name === "indexing" ? phase : null;
  useEffect(() => {
    if (!indexing) return;
    const token = run.current;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const timer = setTimeout(async () => {
      try {
        const poll = await getIndexStatus(indexing.doc.knowledgeId);
        if (token === run.current) applyPoll(poll, indexing.doc);
      } catch (err) {
        if (token !== run.current) return;
        if (err instanceof EngineError && err.gone) {
          reset("That document is no longer on the engine. Drop it again to start over.");
        } else if (err instanceof EngineError && err.status === 422) {
          reset(err.message);
        } else {
          // Transient: keep waiting and try again a bit later.
          setPhase((p) => (p.name === "indexing" ? { ...p, nextCheck: Date.now() + 8000 } : p));
        }
      }
    }, Math.max(0, indexing.nextCheck - Date.now()));
    return () => {
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [indexing, applyPoll, reset]);

  // After a refresh in "ready", make sure the document still exists.
  const checkedRestore = useRef(false);
  useEffect(() => {
    if (!restored || checkedRestore.current) return;
    checkedRestore.current = true;
    if (phase.name !== "ready") return;
    const id = phase.doc.knowledgeId;
    getIndexStatus(id).catch((err) => {
      if (err instanceof EngineError && err.gone) reset("That document is no longer on the engine. Drop it again to start over.");
    });
  }, [restored, phase, reset]);

  // ── Test flow ────────────────────────────────────────────────────────────
  async function handleStart(settings: TestSettings) {
    if (phase.name !== "ready" && phase.name !== "results") return;
    const current = phase.doc;
    const token = run.current;
    setLastSettings(settings);
    setBusy(true);
    setProblem(null);
    try {
      const res = await startTest(current.knowledgeId, settings);
      if (token !== run.current) return;
      setPhase({
        name: "testing",
        doc: current,
        settings,
        sessionId: res.sessionId,
        question: res.question,
        total: Math.max(res.question.totalQuestions || 0, res.maxQuestions || 0, settings.questions),
        answers: [],
        feedback: null,
        submitted: null,
      });
      scrollTop();
    } catch (err) {
      if (token !== run.current) return;
      if (err instanceof EngineError && err.gone) reset("That document is no longer on the engine. Drop it again to start over.");
      else setProblem(err instanceof Error ? err.message : "The test couldn't start.");
    } finally {
      if (token === run.current) setBusy(false);
    }
  }

  async function handleAnswer(answer: string, display: string) {
    if (phase.name !== "testing") return;
    const p = phase;
    const token = run.current;
    setBusy(true);
    setProblem(null);
    try {
      const feedback = await submitAnswer(p.sessionId, answer);
      if (token !== run.current) return;
      const item: AnsweredItem = {
        number: p.question.number,
        text: p.question.text,
        type: p.question.type,
        bloomLevel: p.question.bloomLevel,
        difficulty: p.question.difficulty,
        answer: display,
        correct: feedback.correct,
        score: feedback.score,
      };
      setPhase({ ...p, feedback, submitted: display, answers: [...p.answers, item] });
    } catch (err) {
      if (token !== run.current) return;
      if (err instanceof EngineError && err.gone) {
        setPhase({ name: "ready", doc: p.doc });
        setProblem("This test session expired. Start a new one when you're ready.");
      } else setProblem(err instanceof Error ? err.message : "Your answer couldn't be sent. Try again.");
    } finally {
      if (token === run.current) setBusy(false);
    }
  }

  async function handleContinue() {
    if (phase.name !== "testing" || !phase.feedback) return;
    const p = phase;
    const fb = phase.feedback;
    if (!fb.isComplete && fb.nextQuestion) {
      const nextQ = fb.nextQuestion;
      setPhase({ ...p, question: nextQ, total: Math.max(p.total, nextQ.totalQuestions || 0), feedback: null, submitted: null });
      scrollTop();
      return;
    }
    if (!fb.isComplete) {
      setProblem("The engine didn't send another question. Try finishing the test again.");
    }
    const token = run.current;
    setBusy(true);
    setProblem(null);
    try {
      const result = await getResult(p.sessionId);
      if (token !== run.current) return;
      setPhase({ name: "results", doc: p.doc, settings: p.settings, result, answers: p.answers });
      scrollTop();
    } catch (err) {
      if (token !== run.current) return;
      if (err instanceof EngineError && err.gone) {
        setPhase({ name: "ready", doc: p.doc });
        setProblem("This test session expired before the results were saved. Start a new one when you're ready.");
      } else setProblem(err instanceof Error ? err.message : "Your results couldn't be loaded. Try again.");
    } finally {
      if (token === run.current) setBusy(false);
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const graphState = knowledgeId ? graphs[knowledgeId] : undefined;
  const outcomes = useMemo(() => (phase.name === "results" ? outcomesOf(phase.result) : null), [phase]);
  const graphSummary =
    graphState?.status === "ready"
      ? `${graphState.graph.nodes.length} concepts, ${graphState.graph.edges.length} connections between them.`
      : graphState?.status === "error"
        ? "The concept count isn't available right now."
        : null;

  const focused = phase.name === "testing" || phase.name === "results";

  const problemBanner = problem && (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-[#FF8FA3]/50 bg-[#FF8FA3]/[0.07] px-4 py-3 text-paper">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#FF8FA3]" aria-hidden="true" />
      <p className="flex-1">{problem}</p>
      <button type="button" onClick={() => setProblem(null)} className="text-mute hover:text-paper" aria-label="Dismiss message">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────────
  let panel: React.ReactNode;
  switch (phase.name) {
    case "idle":
      panel = <DropZone onSubmit={handleSubmit} disabled={!restored} />;
      break;
    case "sending":
    case "indexing": {
      const label = phase.name === "sending" ? phase.label : docTitle(phase.doc);
      const waited = phase.name === "indexing" ? now - phase.since : 0;
      const next = phase.name === "indexing" ? Math.max(0, Math.ceil((phase.nextCheck - now) / 1000)) : null;
      panel = (
        <div className="relative flex min-h-[19rem] flex-col justify-end gap-4 overflow-hidden rounded-[28px] border-2 border-magenta/60 bg-ink-raised/60 px-6 pb-7 pt-5 sm:min-h-[22rem]">
          <Constellation state="working" className="pointer-events-none h-36 w-full sm:h-48" />
          <div className="relative" aria-live="polite">
            <p className="font-display text-2xl font-semibold leading-tight sm:text-[1.7rem]">
              {phase.name === "sending" ? "Sending your document…" : "Mapping the ideas…"}
            </p>
            <p className="mt-1 truncate text-mute" title={label}>
              {label}
            </p>
            <p className="mt-3 text-sm text-mute">
              {phase.name === "sending"
                ? "Uploading and starting the reader."
                : `Extracting concepts and how they connect. This usually takes a minute or two. ${elapsed(waited)} so far${next !== null && next > 0 ? `, next check in ${next}s` : ""}.`}
            </p>
            <Button variant="ghost" size="sm" className="mt-3 px-0" onClick={() => reset()}>
              Cancel and start over
            </Button>
          </div>
        </div>
      );
      break;
    }
    case "ready":
      panel = (
        <div className="rounded-[28px] border border-line-strong bg-ink-raised/60 p-6 sm:p-8">
          <TestSetup
            key={phase.doc.knowledgeId}
            title={docTitle(phase.doc)}
            source={phase.doc.source}
            graphSummary={graphSummary}
            initial={lastSettings}
            busy={busy}
            onViewGraph={() => setGraphOpen(true)}
            onStart={handleStart}
            onReset={() => reset()}
          />
        </div>
      );
      break;
    case "testing":
      panel = (
        <QuestionView
          key={`${phase.sessionId}-${phase.question.number}`}
          question={phase.question}
          total={phase.total}
          feedback={phase.feedback}
          submittedAnswer={phase.submitted}
          busy={busy}
          onSubmit={handleAnswer}
          onContinue={handleContinue}
        />
      );
      break;
    case "results":
      panel = (
        <ResultsView
          result={phase.result}
          answers={phase.answers}
          threshold={THRESHOLDS[phase.settings.difficulty] ?? null}
          outcomes={outcomes}
          onViewGraph={() => setGraphOpen(true)}
          onRetake={() => setPhase({ name: "ready", doc: phase.doc })}
          onReset={() => reset()}
        />
      );
      break;
  }

  return (
    <div ref={topRef} className="scroll-mt-20">
      {focused ? (
        <section className="mx-auto w-full max-w-5xl px-5 pb-20 pt-8 sm:px-8 sm:pt-12" aria-label={phase.name === "testing" ? "Test" : "Results"}>
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
            <p className="min-w-0 truncate text-sm text-mute">
              {phase.name === "testing" ? "Testing your understanding of " : "Tested on "}
              <span className="text-paper">{doc ? docTitle(doc) : ""}</span>
            </p>
            {phase.name === "testing" && (
              <Button variant="ghost" size="sm" className="px-0" onClick={() => setPhase({ name: "ready", doc: phase.doc })}>
                Leave the test
              </Button>
            )}
          </div>
          <div className={phase.name === "testing" ? "mx-auto max-w-2xl" : undefined}>
            {problemBanner && <div className="mb-6">{problemBanner}</div>}
            {panel}
          </div>
        </section>
      ) : (
        <section
          className="mx-auto grid w-full max-w-6xl gap-10 px-5 pb-16 pt-10 sm:px-8 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16 lg:pb-24 lg:pt-20"
          aria-labelledby="hero-heading"
        >
          <div className="flex flex-col justify-center">
            <h1 id="hero-heading" className="text-[2.6rem] font-bold leading-[1.02] tracking-[-0.02em] sm:text-6xl lg:text-[4.25rem]">
              How well did you understand what you just read?
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-mute">
              Drop in a document. PoCW maps its ideas into a knowledge graph, then asks you questions that get harder or easier with each
              answer, and estimates how much of it you&apos;ve really grasped.
            </p>
            <p className="mt-5 text-sm text-mute">Free to try. No account needed.</p>
          </div>
          <div className="flex flex-col gap-4">
            {problemBanner}
            {panel}
          </div>
        </section>
      )}

      <GraphDialog
        key={`${knowledgeId ?? "none"}-${outcomes ? "outcomes" : "plain"}`}
        open={graphOpen}
        onOpenChange={setGraphOpen}
        title={doc ? docTitle(doc) : ""}
        state={graphState}
        outcomes={outcomes}
        onRetry={() => knowledgeId && loadGraph(knowledgeId)}
      />
    </div>
  );
}
