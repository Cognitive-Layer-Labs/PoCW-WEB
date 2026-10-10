"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, X } from "lucide-react";
import { QuestionView } from "@/components/QuestionView";
import { DEFAULT_SETTINGS, TestSetup } from "@/components/TestSetup";
import {
  EngineError,
  getResult,
  startTest,
  submitAnswer,
  type AnswerFeedback,
  type TestSettings,
  type VerifyQuestion,
} from "@/lib/engine";
import { loadState, saveState } from "@/lib/persist";

type Phase =
  | { name: "setup" }
  | {
      name: "testing";
      sessionId: string;
      settings: TestSettings;
      question: VerifyQuestion;
      total: number;
      feedback: AnswerFeedback | null;
      submitted: string | null;
      draft: string;
    };

interface Saved {
  phase: Phase;
  settings: TestSettings;
}

const SETTINGS_KEY = "bookmap:settings";

export function TestRunner({ bookId, knowledgeId, title }: { bookId: number; knowledgeId: string; title: string }) {
  const router = useRouter();
  const key = `bookmap:test:${bookId}`;
  const [phase, setPhase] = useState<Phase>({ name: "setup" });
  const [settings, setSettings] = useState<TestSettings>(DEFAULT_SETTINGS);
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const inFlight = useRef(false); // one start/answer/result request at a time
  const run = useRef(0); // bumps when leaving so late answers are dropped

  // ── Resume a test in progress after a refresh (best effort) ──────────────
  useEffect(() => {
    const saved = loadState<Saved>(key);
    const lastSettings = loadState<TestSettings>(SETTINGS_KEY);
    if (lastSettings?.questions && lastSettings.level && lastSettings.types?.length) setSettings(lastSettings);
    if (saved?.phase?.name === "testing") setPhase(saved.phase);
    setRestored(true);
  }, [key]);

  useEffect(() => {
    if (!restored) return;
    saveState(key, phase.name === "testing" ? { phase, settings } : null);
  }, [key, phase, settings, restored]);

  const fail = useCallback((err: unknown, fallback: string) => {
    if (err instanceof EngineError && err.gone) {
      setPhase({ name: "setup" });
      setProblem("This test session expired. Start a new one when you're ready.");
    } else {
      setProblem(err instanceof Error ? err.message : fallback);
    }
  }, []);

  async function handleStart(next: TestSettings) {
    if (inFlight.current) return;
    inFlight.current = true;
    const token = run.current;
    setSettings(next);
    saveState(SETTINGS_KEY, next);
    setBusy(true);
    setProblem(null);
    try {
      const res = await startTest(knowledgeId, next);
      if (token !== run.current) return;
      setPhase({
        name: "testing",
        sessionId: res.sessionId,
        settings: next,
        question: res.question,
        total: res.maxQuestions || res.question.totalQuestions || next.questions,
        feedback: null,
        submitted: null,
        draft: "",
      });
    } catch (err) {
      if (token === run.current) setProblem(err instanceof Error ? err.message : "The test couldn't start. Try again.");
    } finally {
      if (token === run.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  async function handleAnswer(answer: string, display: string) {
    if (phase.name !== "testing" || phase.feedback || inFlight.current) return;
    const p = phase;
    const token = run.current;
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    try {
      const feedback = await submitAnswer(p.sessionId, answer);
      if (token !== run.current) return;
      setPhase({ ...p, feedback, submitted: display });
    } catch (err) {
      if (token === run.current) fail(err, "Your answer couldn't be sent. Try again.");
    } finally {
      if (token === run.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  async function handleContinue() {
    if (phase.name !== "testing" || !phase.feedback || inFlight.current) return;
    const p = phase;
    const fb = phase.feedback;
    if (!fb.isComplete && fb.nextQuestion) {
      const q = fb.nextQuestion;
      setPhase({ ...p, question: q, total: q.totalQuestions || p.total, feedback: null, submitted: null, draft: "" });
      return;
    }
    const token = run.current;
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    try {
      const { attemptId } = await getResult(p.sessionId);
      if (token !== run.current) return;
      saveState(key, null);
      router.replace(`/attempt/${attemptId}`);
    } catch (err) {
      if (token === run.current) {
        fail(err, "Your results couldn't be loaded. Try again.");
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  function leave() {
    run.current += 1;
    inFlight.current = false;
    saveState(key, null);
  }

  const banner = problem && (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-danger/50 bg-danger/[0.07] px-4 py-3 text-paper">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
      <p className="flex-1">{problem}</p>
      <button type="button" onClick={() => setProblem(null)} className="-m-2 flex h-11 w-11 items-center justify-center text-mute hover:text-paper" aria-label="Dismiss message">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );

  if (!restored) return <div className="min-h-[60dvh]" aria-busy="true" />;

  if (phase.name === "setup") {
    return <TestSetup key={JSON.stringify(settings)} title={title} initial={settings} busy={busy} problem={banner} onStart={handleStart} />;
  }

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col gap-6">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
        <p className="min-w-0 truncate text-sm text-mute">
          Testing yourself on <span className="book-title text-paper">{title}</span>
        </p>
        <Link href={`/book/${bookId}`} onClick={leave} className="-mr-2 flex min-h-11 shrink-0 items-center rounded-full px-2 text-sm font-semibold text-mute hover:text-paper">
          Leave test
        </Link>
      </div>
      {banner}
      <QuestionView
        key={`${phase.sessionId}-${phase.question.number}`}
        question={phase.question}
        total={phase.total}
        feedback={phase.feedback}
        submittedAnswer={phase.submitted}
        busy={busy}
        draft={phase.draft}
        onDraft={(draft) => setPhase((p) => (p.name === "testing" ? { ...p, draft } : p))}
        onSubmit={handleAnswer}
        onContinue={handleContinue}
      />
    </div>
  );
}
