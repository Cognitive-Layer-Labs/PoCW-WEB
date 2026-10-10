"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from "react-force-graph-2d";
import { forceCollide } from "d3-force-3d";
import { OUTCOME_COLORS, bloomColor, type Outcome } from "@/lib/bloom";
import type { KnowledgeGraph } from "@/lib/engine";

export type ColorMode = "bloom" | "outcome";

export interface CanvasNode {
  id: string;
  label: string;
  bloomLevel?: string;
  /** 0..1, relative to the most important concept in this graph */
  weight: number;
  outcome: Outcome;
}

interface CanvasLink {
  source: string | NodeObject<CanvasNode>;
  target: string | NodeObject<CanvasNode>;
  relationship?: string;
}

type GNode = NodeObject<CanvasNode>;
type GLink = LinkObject<CanvasNode, CanvasLink>;

export interface GraphCanvasProps {
  graph: KnowledgeGraph;
  nodes: CanvasNode[];
  colorMode: ColorMode;
  matches: Set<string> | null;
  selectedId: string | null;
  focus: { id: string; nonce: number } | null;
  onSelect: (id: string | null) => void;
}

const radius = (weight: number) => 3.5 + weight * 8;
const endId = (end: GLink["source"]) => (typeof end === "object" && end ? String(end.id) : String(end));

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export default function GraphCanvas({ graph, nodes, colorMode, matches, selectedId, focus, onSelect }: GraphCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [hoverLink, setHoverLink] = useState<GLink | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const fitted = useRef(false);
  const userMoved = useRef(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build the simulation data once per graph; colors/highlights are read at draw time.
  const data = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    const links: CanvasLink[] = graph.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target)
      .map((e) => ({ source: e.source, target: e.target, relationship: e.relationship }));
    return { nodes: nodes.map((n) => ({ ...n })) as GNode[], links: links as GLink[] };
  }, [graph, nodes]);

  const neighbours = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const l of data.links) {
      const s = endId(l.source);
      const t = endId(l.target);
      if (!map.has(s)) map.set(s, new Set());
      if (!map.has(t)) map.set(t, new Set());
      map.get(s)!.add(t);
      map.get(t)!.add(s);
    }
    return map;
  }, [data]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const charge = fg.d3Force("charge");
    charge?.strength?.(-160);
    const link = fg.d3Force("link");
    link?.distance?.(46);
    // Labels are drawn at a fixed screen size, so keep neighbours apart by roughly half a
    // label's width (≈1.6 graph units per character at the usual fitted zoom).
    fg.d3Force(
      "collide",
      forceCollide<GNode>((n: GNode) => Math.max(radius(n.weight) + 4, Math.min(n.label.length, 38) * 1.6)).iterations(2)
    );
    fitted.current = false;
  }, [data, size.width > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Center on a node when the panel or search asks for it.
  useEffect(() => {
    if (!focus) return;
    const node = data.nodes.find((n) => n.id === focus.id);
    const fg = fgRef.current;
    if (!node || !fg || node.x == null || node.y == null) return;
    fg.centerAt(node.x, node.y, reducedMotion ? 0 : 500);
    fg.zoom(Math.max(fg.zoom(), 2.4), reducedMotion ? 0 : 500);
  }, [focus, data, reducedMotion]);

  // Always label the most central concepts so the graph reads at any zoom.
  const importanceRank = useMemo(
    () => new Map([...nodes].sort((a, b) => b.weight - a.weight).map((n, i) => [n.id, i])),
    [nodes]
  );

  const active = hoverNode ?? selectedId;
  const activeNeighbours = active ? neighbours.get(active) : undefined;

  const colorOf = useCallback(
    (n: GNode) => (colorMode === "outcome" ? OUTCOME_COLORS[n.outcome] : bloomColor(n.bloomLevel)),
    [colorMode]
  );

  const drawNode = useCallback(
    (node: GNode, ctx: CanvasRenderingContext2D, scale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const r = radius(node.weight);
      const id = node.id;
      const dimmedBySearch = matches !== null && !matches.has(id);
      const dimmedByFocus = active !== null && id !== active && !activeNeighbours?.has(id);
      ctx.globalAlpha = dimmedBySearch ? 0.18 : dimmedByFocus ? 0.35 : 1;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = colorOf(node);
      ctx.fill();

      if (id === selectedId || (matches?.has(id) ?? false)) {
        ctx.lineWidth = 2 / scale;
        ctx.strokeStyle = id === selectedId ? "#F0389E" : "#F4EDF8";
        ctx.beginPath();
        ctx.arc(x, y, r + 3 / scale + 1, 0, 2 * Math.PI);
        ctx.stroke();
      }

      const showLabel =
        id === active ||
        activeNeighbours?.has(id) ||
        (matches?.has(id) ?? false) ||
        (importanceRank.get(id) ?? 99) < (scale >= 1.4 ? 8 : scale >= 0.9 ? 5 : 3) ||
        (colorMode === "outcome" && node.outcome !== "untested" && scale >= 1.4) ||
        scale > 2.2;
      if (showLabel && !dimmedBySearch) {
        // Draw text at real screen pixels (not a tiny font scaled up) so it stays crisp.
        const label = node.label.length > 38 ? `${node.label.slice(0, 36)}…` : node.label;
        const ringGap = id === selectedId ? 4 / scale + 1 : 0;
        ctx.save();
        ctx.translate(x, y + r + ringGap);
        ctx.scale(1 / scale, 1 / scale);
        ctx.font = `600 12px "Atkinson Hyperlegible Next Variable", system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.lineJoin = "round";
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = "rgba(16,9,22,0.92)";
        ctx.strokeText(label, 0, 3);
        ctx.fillStyle = "#F4EDF8";
        ctx.fillText(label, 0, 3);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
    [active, activeNeighbours, importanceRank, colorMode, colorOf, matches, selectedId]
  );

  const paintPointer = useCallback((node: GNode, color: string, ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x ?? 0, node.y ?? 0, radius(node.weight) + 3, 0, 2 * Math.PI);
    ctx.fill();
  }, []);

  const linkTouchesActive = useCallback(
    (l: GLink) => active !== null && (endId(l.source) === active || endId(l.target) === active),
    [active]
  );

  const drawRelationship = useCallback(
    (ctx: CanvasRenderingContext2D, scale: number) => {
      const link = hoverLink;
      if (!link?.relationship || typeof link.source !== "object" || typeof link.target !== "object") return;
      const s = link.source as GNode;
      const t = link.target as GNode;
      const x = ((s.x ?? 0) + (t.x ?? 0)) / 2;
      const y = ((s.y ?? 0) + (t.y ?? 0)) / 2;
      const text = link.relationship.replace(/_/g, " ").toLowerCase();
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1 / scale, 1 / scale);
      ctx.font = `600 12px "Atkinson Hyperlegible Next Variable", system-ui, sans-serif`;
      const w = ctx.measureText(text).width;
      const h = 22;
      ctx.fillStyle = "#F0389E";
      ctx.beginPath();
      ctx.roundRect(-w / 2 - 9, -h / 2, w + 18, h, h / 2);
      ctx.fill();
      ctx.fillStyle = "#150D1C";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 0, 1);
      ctx.restore();
    },
    [hoverLink]
  );

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0"
      data-testid="graph-canvas"
      onPointerDown={() => (userMoved.current = true)}
      onWheel={() => (userMoved.current = true)}
    >
      {size.width > 0 && size.height > 0 && (
        <ForceGraph2D<CanvasNode, CanvasLink>
          ref={fgRef}
          width={size.width}
          height={size.height}
          graphData={data}
          backgroundColor="rgba(0,0,0,0)"
          nodeRelSize={1}
          nodeVal={(n) => radius(n.weight) ** 2}
          nodeLabel={() => ""}
          linkLabel={() => ""}
          nodeCanvasObject={drawNode}
          nodePointerAreaPaint={paintPointer}
          linkColor={(l) => (linkTouchesActive(l) || l === hoverLink ? "rgba(240,56,158,0.9)" : "rgba(174,159,187,0.28)")}
          linkWidth={(l) => (linkTouchesActive(l) || l === hoverLink ? 1.8 : 0.9)}
          linkDirectionalArrowLength={3.2}
          linkDirectionalArrowRelPos={1}
          linkHoverPrecision={6}
          onRenderFramePost={drawRelationship}
          onNodeHover={(n) => setHoverNode(n ? String(n.id) : null)}
          onLinkHover={(l) => setHoverLink(l ?? null)}
          onNodeClick={(n) => onSelect(String(n.id))}
          onBackgroundClick={() => onSelect(null)}
          warmupTicks={reducedMotion ? 200 : 60}
          cooldownTicks={reducedMotion ? 0 : 140}
          d3VelocityDecay={0.35}
          minZoom={0.3}
          maxZoom={8}
          onEngineTick={() => {
            // Frame the warmed-up layout immediately, then again once it settles.
            if (!fitted.current) {
              fitted.current = true;
              fgRef.current?.zoomToFit(0, 40);
            }
          }}
          onEngineStop={() => {
            if (!userMoved.current) fgRef.current?.zoomToFit(reducedMotion ? 0 : 400, 40);
          }}
        />
      )}
    </div>
  );
}
