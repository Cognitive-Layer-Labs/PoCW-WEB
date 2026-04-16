"use client";

import { useState } from "react";
import { useChainId, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { PoCWResult, OnchainAttestation } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, XCircle, Trophy, TrendingUp, Lock, Sparkles, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
  PolarAngleAxis,
} from "recharts";
import { POCW_CONTROLLER_ABI, POCW_SBT_ABI, getChainConfig } from "@/lib/contracts";

const BLOOM_ORDER = [
  "Remember",
  "Understand",
  "Apply",
  "Analyze",
  "Evaluate",
  "Create",
];
const BLOOM_COLORS: Record<string, string> = {
  Remember: "#00f5d4",
  Understand: "#a78bfa",
  Apply: "#34d399",
  Analyze: "#fbbf24",
  Evaluate: "#fb923c",
  Create: "#f87171",
};

interface GradingResultsProps {
  result: PoCWResult;
  walletAddress?: string;
  onReset: () => void;
}

export function GradingResults({
  result,
  walletAddress,
  onReset,
}: GradingResultsProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const chainId = useChainId();

  const scoreRounded = Math.round(result.score);
  const ciLow = Math.round(result.confidence_interval[0]);
  const ciHigh = Math.round(result.confidence_interval[1]);

  const bloomLevelsReached = result.response_detail
    ? [...new Set(result.response_detail.filter(r => r.correct).map(r => r.bloomLevel))]
    : [];

  const chartData = [
    { value: scoreRounded, fill: result.competenceIndicator ? "#00f5d4" : "#f87171" },
  ];

  const { controllerAddress, sbtAddress } = getChainConfig(chainId);
  const isOnchain = result.attestation?.type === "onchain";
  const onchainAttestation = isOnchain ? result.attestation as OnchainAttestation : null;

  // Prefer live attestation addresses when available; env-based chain config is build-time only.
  const resolvedControllerAddress = (onchainAttestation?.controllerAddress ?? controllerAddress) as `0x${string}`;
  const resolvedSbtAddress = (onchainAttestation?.sbtAddress ?? sbtAddress) as `0x${string}`;
  const hasContracts = resolvedControllerAddress !== "0x0000000000000000000000000000000000000000"
    && resolvedSbtAddress !== "0x0000000000000000000000000000000000000000";

  const canMint = result.competenceIndicator && isOnchain && hasContracts && !!walletAddress;

  const correctCount = result.response_detail?.filter(r => r.correct).length ?? 0;
  const totalCount = result.response_detail?.length ?? 0;

  return (
    <div className="space-y-5">
      {/* Pass / Fail banner */}
      <div
        className={`relative overflow-hidden rounded-2xl border p-5 ${
          result.competenceIndicator
            ? "border-green-500/30 bg-gradient-to-br from-green-500/10 to-emerald-500/5"
            : "border-red-500/30 bg-gradient-to-br from-red-500/10 to-orange-500/5"
        }`}
      >
        <div className="flex items-start gap-4">
          <div className={`p-2.5 rounded-xl ${result.competenceIndicator ? "bg-green-500/15" : "bg-red-500/15"}`}>
            {result.competenceIndicator ? (
              <Trophy className="h-7 w-7 text-green-400" />
            ) : (
              <XCircle className="h-7 w-7 text-red-400" />
            )}
          </div>
          <div className="flex-1">
            <p className={`text-lg font-bold ${result.competenceIndicator ? "text-green-300" : "text-red-300"}`}>
              {result.competenceIndicator ? "Competence Verified" : "Below Threshold"}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {result.competenceIndicator
                ? `You demonstrated mastery across ${bloomLevelsReached.length} cognitive level${bloomLevelsReached.length !== 1 ? "s" : ""}.`
                : `Score ${scoreRounded}% fell below threshold — review the material and try again.`}
            </p>
          </div>
        </div>
      </div>

      {/* Score gauge + Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Score gauge */}
        <Card className="border-border/60 bg-gradient-to-b from-card to-card/80">
          <CardContent className="pt-6 pb-5 flex flex-col items-center">
            <div className="relative w-36 h-36">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  innerRadius="75%"
                  outerRadius="100%"
                  data={chartData}
                  startAngle={90}
                  endAngle={-270}
                >
                  <PolarAngleAxis
                    type="number"
                    domain={[0, 100]}
                    angleAxisId={0}
                    tick={false}
                  />
                  <RadialBar
                    dataKey="value"
                    cornerRadius={10}
                    background={{ fill: "#1e293b" }}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-black">{scoreRounded}</span>
                <span className="text-xs text-muted-foreground">out of 100</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              95% CI: [{ciLow}, {ciHigh}]
            </p>
          </CardContent>
        </Card>

        {/* Quick stats */}
        <Card className="border-border/60 bg-gradient-to-b from-card to-card/80">
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Correct" value={`${correctCount}/${totalCount}`} icon={<CheckCircle className="h-3.5 w-3.5 text-green-400" />} />
              <StatCard label="Theta" value={result.theta.toFixed(2)} icon={<TrendingUp className="h-3.5 w-3.5 text-primary" />} />
              <StatCard label="Std Error" value={result.se.toFixed(2)} icon={<Sparkles className="h-3.5 w-3.5 text-accent" />} />
              <StatCard label="Status" value={result.converged ? "Converged" : "Pending"} icon={result.converged ? <CheckCircle className="h-3.5 w-3.5 text-green-400" /> : <XCircle className="h-3.5 w-3.5 text-yellow-400" />} />
            </div>

            <Separator />

            {/* Bloom's Taxonomy */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Bloom&apos;s Levels</p>
              <div className="flex flex-wrap gap-1.5">
                {BLOOM_ORDER.map(level => {
                  const reached = bloomLevelsReached.includes(level);
                  return (
                    <Badge
                      key={level}
                      className={`border text-[11px] px-2 py-0.5 transition-all ${
                        reached
                          ? "border-current"
                          : "border-border/40 text-muted-foreground/30"
                      }`}
                      style={
                        reached
                          ? {
                              color: BLOOM_COLORS[level],
                              borderColor: BLOOM_COLORS[level] + "50",
                              backgroundColor: BLOOM_COLORS[level] + "10",
                            }
                          : {}
                      }
                    >
                      {level}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-question breakdown (collapsible) */}
      {result.response_detail && result.response_detail.length > 0 && (
        <Card className="border-border/60">
          <button
            onClick={() => setShowBreakdown(v => !v)}
            className="w-full flex items-center justify-between p-4 hover:bg-muted/20 transition-colors"
          >
            <CardTitle className="text-sm font-medium">
              Question Breakdown
            </CardTitle>
            {showBreakdown ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {showBreakdown && (
            <CardContent className="space-y-3 pb-4">
              {result.response_detail.map((r, i) => (
                <div key={i}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <div className={`mt-0.5 p-1 rounded-full shrink-0 ${r.correct ? "bg-green-500/15" : "bg-red-500/15"}`}>
                        {r.correct ? (
                          <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-red-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {r.question}
                        </p>
                        <p className="text-[11px] text-muted-foreground/50 mt-0.5">
                          {r.bloomLevel} · {r.type}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-sm font-mono font-semibold shrink-0 ${
                        r.score >= 60 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {r.score}
                    </span>
                  </div>
                  {i < result.response_detail!.length - 1 && (
                    <Separator className="mt-3" />
                  )}
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* Mint SBT CTA */}
      {result.competenceIndicator && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-primary/20">
                <Lock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">
                  Mint Your Soulbound Token
                </p>
                <p className="text-xs text-muted-foreground">
                  Content #{result.contentId} · On-chain attestation — permanent &amp; non-transferable
                </p>
              </div>
            </div>
            {canMint ? (
              <MintButton
                attestation={onchainAttestation as OnchainAttestation}
                userAddress={walletAddress as `0x${string}`}
                controllerAddress={resolvedControllerAddress}
                sbtAddress={resolvedSbtAddress}
              />
            ) : !walletAddress ? (
              <p className="text-xs text-muted-foreground text-center">
                Connect your wallet to mint
              </p>
            ) : !hasContracts ? (
              <p className="text-xs text-muted-foreground text-center">
                Contract addresses unavailable for this session and chain — verify NEXT_PUBLIC_CONTROLLER_ADDRESS_{chainId}
              </p>
            ) : !isOnchain ? (
              <p className="text-xs text-muted-foreground text-center">
                On-chain attestation not available for this session
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={onReset} className="flex-1 gap-2">
          <RotateCcw className="h-4 w-4" />
          Start Over
        </Button>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/10 p-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-sm font-semibold font-mono">{value}</p>
    </div>
  );
}

// ─── Mint Button ──────────────────────────────────────────────────────────────

function MintButton({
  attestation,
  userAddress,
  controllerAddress,
  sbtAddress,
}: {
  attestation: OnchainAttestation;
  userAddress: `0x${string}`;
  controllerAddress: `0x${string}`;
  sbtAddress: `0x${string}`;
}) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash });

  const { data: tokenUri } = useReadContract({
    address: sbtAddress,
    abi: POCW_SBT_ABI,
    functionName: "uri",
    args: [BigInt(attestation.contentId)],
    query: { enabled: !!isConfirmed },
  });

  if (isConfirmed && tokenUri) {
    const explorerBase = window.location.hostname === "localhost"
      ? "http://localhost:8545"
      : `https://sepolia.basescan.org`;
    const txUrl = hash ? `${explorerBase}/tx/${hash}` : null;

    return (
      <div className="space-y-3">
        <div className="text-center">
          <p className="text-sm font-semibold text-green-400">SBT Minted!</p>
          <p className="text-xs text-muted-foreground mt-1">
            Metadata URI: <code className="text-xs break-all">{tokenUri as string}</code>
          </p>
          {txUrl && (
            <a href={txUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
              View transaction
            </a>
          )}
        </div>
      </div>
    );
  }

  const handleMint = () => {
    writeContract({
      address: controllerAddress,
      abi: POCW_CONTROLLER_ABI as unknown as readonly unknown[],
      functionName: "verifyAndMint",
      args: [
        userAddress,
        BigInt(attestation.contentId),
        BigInt(attestation.score),
        BigInt(attestation.expiry),
        attestation.nonce as `0x${string}`,
        attestation.tokenUri,
        attestation.signature as `0x${string}`,
      ],
    });
  };

  if (error) {
    const msg = error.message.length > 120 ? error.message.slice(0, 120) + "..." : error.message;
    return (
      <div className="space-y-2">
        <p className="text-xs text-red-400 text-center">{msg}</p>
        <Button onClick={handleMint} variant="outline" className="w-full gap-2">
          Retry Mint
        </Button>
      </div>
    );
  }

  return (
    <Button
      onClick={handleMint}
      disabled={isPending || isConfirming}
      className="w-full gap-2"
    >
      <Lock className="h-4 w-4" />
      {isPending ? "Signing..." : isConfirming ? "Minting..." : "Mint SBT"}
    </Button>
  );
}
