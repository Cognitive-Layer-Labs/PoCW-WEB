"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccount, useChainId } from "wagmi";
import { FileUpload } from "./FileUpload";
import { QuestionCard } from "./QuestionCard";
import { GradingResults } from "./GradingResults";
import { SessionConfigPanel } from "./SessionConfig";
import { WalletButton } from "./WalletButton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  VerifyQuestion,
  AnswerFeedback,
  PoCWResult,
  SessionConfig,
  startVerify,
  submitAnswer,
  getResult,
} from "@/lib/api";
import { getChainConfig } from "@/lib/contracts";
import { Wallet, FileUp, Settings2, BrainCircuit, Award, AlertCircle, Loader2, RotateCcw, AlertTriangle } from "lucide-react";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const CHAIN_META: Record<number, {
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls: string[];
}> = {
  31337: {
    chainName: "Anvil Local",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["http://127.0.0.1:8545"],
    blockExplorerUrls: ["http://localhost:5100"],
  },
  84532: {
    chainName: "Base Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://sepolia.base.org"],
    blockExplorerUrls: ["https://base-sepolia.blockscout.com"],
  },
  8453: {
    chainName: "Base Mainnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://mainnet.base.org"],
    blockExplorerUrls: ["https://basescan.org"],
  },
};

const CHAIN_PRIORITY = [84532, 8453, 31337] as const;

type Step = "wallet" | "upload" | "settings" | "quiz" | "results";

const STEPS = [
  { id: "wallet" as Step, icon: Wallet, label: "Connect" },
  { id: "upload" as Step, icon: FileUp, label: "Content" },
  { id: "settings" as Step, icon: Settings2, label: "Settings" },
  { id: "quiz" as Step, icon: BrainCircuit, label: "Test" },
  { id: "results" as Step, icon: Award, label: "Results" },
];

const DEFAULT_SESSION_CONFIG: SessionConfig = {
  max_questions: 10,
  difficulty: 0.5,
  q_types: ["open"],
  threshold: 0.7,
  response: "detailed",
};

export function VerifyFlow() {
  const [mounted, setMounted] = useState(false);
  const { address, isConnected } = useAccount();
  const [step, setStep] = useState<Step>("wallet");

  useEffect(() => { setMounted(true); }, []);

  const chainId = useChainId();
  const { controllerAddress, sbtAddress } = getChainConfig(chainId);

  const hasContracts = controllerAddress !== ZERO_ADDRESS
    && sbtAddress !== ZERO_ADDRESS;

  const deployedChainIds = CHAIN_PRIORITY.filter((id) => {
    const config = getChainConfig(id);
    return config.controllerAddress !== ZERO_ADDRESS && config.sbtAddress !== ZERO_ADDRESS;
  });

  const requiresConfiguredChain = deployedChainIds.length > 0;
  const isWrongNetwork = requiresConfiguredChain && !hasContracts;
  const preferredChainId = hasContracts ? chainId : deployedChainIds[0];
  const preferredChainMeta = preferredChainId ? CHAIN_META[preferredChainId] : undefined;
  const currentChainName = CHAIN_META[chainId]?.chainName ?? `Chain ${chainId}`;
  const deployedChainLabels = deployedChainIds
    .map((id) => `${CHAIN_META[id]?.chainName ?? `Chain ${id}`} (${id})`)
    .join(", ");

  const switchToPreferredChain = useCallback(async () => {
    if (!preferredChainId || !preferredChainMeta) return;

    try {
      await window.ethereum?.request?.({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${preferredChainId.toString(16)}` }],
      });
    } catch (switchError: any) {
      // Chain not added to wallet — add it
      if (switchError?.code === 4902) {
        await window.ethereum?.request?.({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: `0x${preferredChainId.toString(16)}`,
            chainName: preferredChainMeta.chainName,
            nativeCurrency: preferredChainMeta.nativeCurrency,
            rpcUrls: preferredChainMeta.rpcUrls,
            blockExplorerUrls: preferredChainMeta.blockExplorerUrls,
          }],
        });
      }
    }
  }, [preferredChainId, preferredChainMeta]);

  // Content indexing
  const [knowledgeId, setKnowledgeId] = useState<string | null>(null);
  const [sessionConfig, setSessionConfig] = useState<SessionConfig>(DEFAULT_SESSION_CONFIG);

  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<VerifyQuestion | null>(null);
  const [lastFeedback, setLastFeedback] = useState<AnswerFeedback | null>(null);
  const [finalResult, setFinalResult] = useState<PoCWResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepIndex = STEPS.findIndex(s => s.id === step);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleIndexed = (kid: string) => {
    setKnowledgeId(kid);
  };

  const handleStartQuiz = async () => {
    if (!knowledgeId || !address) return;
    setIsLoading(true);
    setError(null);
    try {
      const configWithAttestation: SessionConfig = {
        ...sessionConfig,
        attest: hasContracts ? "onchain" : "offchain",
        ...(hasContracts && {
          chain: { controllerAddress, sbtAddress },
        }),
      };
      const { sessionId: sid, question } = await startVerify(
        knowledgeId,
        address,
        configWithAttestation
      );
      setSessionId(sid);
      setCurrentQuestion(question);
      setStep("quiz");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start session");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswer = async (answer: string) => {
    if (!sessionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const feedback = await submitAnswer(sessionId, answer);
      setLastFeedback(feedback);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit answer");
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinue = async () => {
    if (!lastFeedback || !sessionId) return;

    if (lastFeedback.isComplete) {
      // Fetch final result
      setIsLoading(true);
      setError(null);
      try {
        const result = await getResult(sessionId);
        setFinalResult(result);
        setStep("results");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch result");
      } finally {
        setIsLoading(false);
      }
    } else if (lastFeedback.nextQuestion) {
      setCurrentQuestion(lastFeedback.nextQuestion);
      setLastFeedback(null);
    }
  };

  const handleReset = () => {
    setStep("wallet");
    setKnowledgeId(null);
    setSessionId(null);
    setCurrentQuestion(null);
    setLastFeedback(null);
    setFinalResult(null);
    setError(null);
    setIsLoading(false);
    setSessionConfig(DEFAULT_SESSION_CONFIG);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Step indicator */}
      <div className="flex items-center justify-between mb-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isCurrent = s.id === step;
          const isDone = i < stepIndex;
          return (
            <div key={s.id} className="flex items-center">
              <div
                className={`flex items-center gap-1.5 ${
                  isCurrent
                    ? "text-primary"
                    : isDone
                    ? "text-muted-foreground"
                    : "text-muted-foreground/40"
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full border flex items-center justify-center ${
                    isCurrent
                      ? "border-primary bg-primary/10"
                      : isDone
                      ? "border-muted-foreground bg-muted"
                      : "border-muted-foreground/30"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <span className="text-xs font-medium hidden sm:block">
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-px mx-2 sm:mx-3 min-w-[20px] ${
                    isDone ? "bg-muted-foreground/50" : "bg-muted-foreground/20"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-red-500/30 bg-red-500/5">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-300">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Step: Wallet ── */}
      {step === "wallet" && (
        <Card className="border-border/60">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-6 text-center">
            <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
              <Wallet className="h-10 w-10 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-2">Connect Your Wallet</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                Your wallet address will be bound to your credential. Only
                connect a wallet you own.
              </p>
            </div>

            {/* Wrong chain warning */}
            {mounted && isConnected && isWrongNetwork && (
              <div className="w-full p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 text-left">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-yellow-300 font-medium">Wrong network</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      You are connected to <strong>{currentChainName} ({chainId})</strong>. This app has contracts configured on <strong>{deployedChainLabels}</strong>.
                    </p>
                    {preferredChainId && preferredChainMeta && (
                      <button
                        onClick={switchToPreferredChain}
                        className="mt-2 text-xs text-primary hover:underline font-medium"
                      >
                        Switch to {preferredChainMeta.chainName} →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {mounted && isConnected && address ? (
              <div className="w-full space-y-3">
                <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-sm text-green-300 font-mono">
                    {address.slice(0, 10)}…{address.slice(-6)}
                  </span>
                  <span className="text-[10px] text-green-400/60 ml-1">{currentChainName}</span>
                </div>
                <button
                  onClick={() => setStep("upload")}
                  disabled={isWrongNetwork}
                  className="w-full h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isWrongNetwork
                    ? `Switch to ${preferredChainMeta?.chainName ?? "configured chain"} first`
                    : "Continue"}
                </button>
              </div>
            ) : (
              <WalletButton />
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Step: Upload ── */}
      {step === "upload" && (
        <Card className="border-border/60">
          <CardContent className="pt-6 pb-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-1">
                Select Your Content
              </h2>
              <p className="text-sm text-muted-foreground">
                Upload a text file or paste a URL. The oracle will index it
                and generate adaptive questions.
              </p>
            </div>

            <FileUpload onIndexed={handleIndexed} />

            <Button
              onClick={() => setStep("settings")}
              disabled={!knowledgeId}
              className="w-full gap-2"
            >
              {knowledgeId ? "Configure Settings →" : "Index content first"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Step: Settings ── */}
      {step === "settings" && (
        <Card className="border-border/60">
          <CardContent className="pt-6 pb-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Session Settings</h2>
                <p className="text-sm text-muted-foreground">
                  Customize your verification session.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSessionConfig(DEFAULT_SESSION_CONFIG)}
                className="gap-1.5 text-xs text-muted-foreground h-auto py-1 px-2"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </Button>
            </div>

            <SessionConfigPanel
              config={sessionConfig}
              onChange={setSessionConfig}
            />

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep("upload")}
                className="flex-1"
              >
                ← Back
              </Button>
              <Button
                onClick={handleStartQuiz}
                disabled={isLoading}
                className="flex-[2] gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Starting session…
                  </>
                ) : (
                  "Start Quiz →"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step: Quiz ── */}
      {step === "quiz" && currentQuestion && (
        <QuestionCard
          key={currentQuestion.number}
          question={currentQuestion}
          feedback={lastFeedback}
          onAnswer={handleAnswer}
          onContinue={handleContinue}
          isSubmitting={isLoading}
        />
      )}

      {/* ── Step: Results ── */}
      {step === "results" && finalResult && (
        <GradingResults
          result={finalResult}
          walletAddress={address}
          onReset={handleReset}
        />
      )}
    </div>
  );
}
