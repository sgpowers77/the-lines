"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Board,
  type Bubble,
  type Selection,
  type View,
  bubbleTitle,
  radiusOf,
  strokeAttrs,
} from "@/lib/board";
import { IconByName } from "./lucide";

const DRAG_THRESHOLD = 4;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;

type Point = { x: number; y: number };

type Gesture =
  | {
      type: "bubble";
      id: string;
      pointerId: number;
      startClient: Point;
      origin: Point;
      offset: Point;
      moved: boolean;
    }
  | {
      type: "pan";
      pointerId: number;
      startClient: Point;
      startView: View;
      moved: boolean;
    };

interface DragState {
  id: string;
  x: number;
  y: number;
  targetId: string | null;
}

interface CanvasProps {
  board: Board;
  view: View;
  onViewChange: (view: View) => void;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onMoveBubble: (id: string, x: number, y: number) => void;
  onConnect: (from: string, to: string) => void;
  onAddAt: (x: number, y: number) => void;
}

export function clampZoom(k: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
}

export function Canvas({
  board,
  view,
  onViewChange,
  selection,
  onSelect,
  onMoveBubble,
  onConnect,
  onAddAt,
}: CanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const viewRef = useRef(view);
  const [drag, setDragState] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const setDrag = (d: DragState | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const [returning, setReturning] = useState<{ id: string; x: number; y: number } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const toWorld = useCallback((clientX: number, clientY: number): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - rect.left - v.x) / v.k, y: (clientY - rect.top - v.y) / v.k };
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      const rect = svg.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      // Trackpad pinch arrives as ctrl+wheel with small deltas; scale it up to feel natural.
      const intensity = e.ctrlKey ? 0.01 : 0.0015;
      const k = clampZoom(v.k * Math.exp(-e.deltaY * intensity));
      onViewChange({ k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [onViewChange]);

  const byId = new Map(board.bubbles.map((b) => [b.id, b]));

  const positionOf = (b: Bubble): Point => {
    if (drag?.id === b.id) return drag;
    if (returning?.id === b.id) return returning;
    return b;
  };

  const animateReturn = (id: string, from: Point, to: Point) => {
    const duration = 280;
    let start: number | null = null;
    const step = (now: number) => {
      start ??= now;
      const p = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      if (p < 1) {
        setReturning({ id, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
        requestAnimationFrame(step);
      } else {
        setReturning(null);
      }
    };
    setReturning({ id, ...from });
    requestAnimationFrame(step);
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (gesture.current) return;
    const target = e.target as Element;
    const bubbleEl = target.closest("[data-bubble-id]");
    const lineEl = target.closest("[data-line-id]");
    const client = { x: e.clientX, y: e.clientY };

    if (bubbleEl && e.button === 0) {
      const id = bubbleEl.getAttribute("data-bubble-id")!;
      const b = byId.get(id);
      if (!b || returning?.id === id) return;
      const world = toWorld(e.clientX, e.clientY);
      gesture.current = {
        type: "bubble",
        id,
        pointerId: e.pointerId,
        startClient: client,
        origin: { x: b.x, y: b.y },
        offset: { x: world.x - b.x, y: world.y - b.y },
        moved: false,
      };
    } else if (lineEl && e.button === 0) {
      onSelect({ kind: "line", id: lineEl.getAttribute("data-line-id")! });
      return;
    } else {
      gesture.current = {
        type: "pan",
        pointerId: e.pointerId,
        startClient: client,
        startView: viewRef.current,
        moved: false,
      };
    }
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const dx = e.clientX - g.startClient.x;
    const dy = e.clientY - g.startClient.y;
    if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    g.moved = true;

    if (g.type === "pan") {
      setPanning(true);
      onViewChange({ ...g.startView, x: g.startView.x + dx, y: g.startView.y + dy });
      return;
    }

    const world = toWorld(e.clientX, e.clientY);
    const target = board.bubbles.find(
      (b) => b.id !== g.id && Math.hypot(world.x - b.x, world.y - b.y) <= radiusOf(b.size) + 6,
    );
    setDrag({
      id: g.id,
      x: world.x - g.offset.x,
      y: world.y - g.offset.y,
      targetId: target?.id ?? null,
    });
  };

  const endGesture = (e: React.PointerEvent<SVGSVGElement>, cancelled: boolean) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gesture.current = null;
    setPanning(false);
    if (svgRef.current?.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }

    if (g.type === "pan") {
      if (!g.moved && !cancelled) onSelect(null);
      return;
    }

    if (!g.moved) {
      if (!cancelled) onSelect({ kind: "bubble", id: g.id });
      return;
    }

    const current = dragRef.current;
    setDrag(null);
    if (!current) return;
    if (cancelled) {
      animateReturn(g.id, current, g.origin);
    } else if (current.targetId) {
      onConnect(g.id, current.targetId);
      animateReturn(g.id, current, g.origin);
    } else {
      onMoveBubble(g.id, current.x, current.y);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const target = e.target as Element;
    if (target.closest("[data-bubble-id]") || target.closest("[data-line-id]")) return;
    const world = toWorld(e.clientX, e.clientY);
    onAddAt(world.x, world.y);
  };

  const draggedBubble = drag ? byId.get(drag.id) : undefined;
  const targetBubble = drag?.targetId ? byId.get(drag.targetId) : undefined;
  const hovered = !drag && hoveredId ? byId.get(hoveredId) : undefined;
  const lineHit = Math.max(14, 18 / view.k);

  const ordered = [...board.bubbles].sort((a, b) => {
    const rank = (x: Bubble) => (x.id === drag?.id || x.id === returning?.id ? 1 : 0);
    return rank(a) - rank(b);
  });

  return (
    <>
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full touch-none select-none"
        style={{ cursor: panning ? "grabbing" : drag ? "grabbing" : "default" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => endGesture(e, false)}
        onPointerCancel={(e) => endGesture(e, true)}
        onDoubleClick={handleDoubleClick}
        role="application"
        aria-label="The Lines board. Drag bubbles to move them, drop a bubble onto another to connect them."
      >
        <defs>
          <pattern
            id="the-lines-dots"
            width={48}
            height={48}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${view.x} ${view.y}) scale(${view.k})`}
          >
            <circle cx={24} cy={24} r={1.1} fill="white" fillOpacity={0.09} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#the-lines-dots)" />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {board.lines.map((line) => {
            const a = byId.get(line.from);
            const b = byId.get(line.to);
            if (!a || !b) return null;
            const pa = positionOf(a);
            const pb = positionOf(b);
            const selected = selection?.kind === "line" && selection.id === line.id;
            const attrs = strokeAttrs(line.stroke);
            return (
              <g key={line.id} data-line-id={line.id} className="cursor-pointer">
                <line
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke="transparent"
                  strokeWidth={lineHit}
                />
                {selected && (
                  <line
                    x1={pa.x}
                    y1={pa.y}
                    x2={pb.x}
                    y2={pb.y}
                    stroke="white"
                    strokeOpacity={0.16}
                    strokeWidth={attrs.strokeWidth + 10}
                    strokeLinecap="round"
                  />
                )}
                <line
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke="white"
                  strokeOpacity={selected ? 1 : 0.82}
                  strokeWidth={attrs.strokeWidth}
                  strokeDasharray={attrs.strokeDasharray}
                  strokeLinecap="round"
                  className="pointer-events-none"
                />
              </g>
            );
          })}

          {drag && targetBubble && (
            <line
              x1={drag.x}
              y1={drag.y}
              x2={targetBubble.x}
              y2={targetBubble.y}
              stroke="white"
              strokeOpacity={0.7}
              strokeWidth={1.5}
              strokeDasharray="4 6"
              className="pointer-events-none animate-[line-march_0.6s_linear_infinite]"
            />
          )}

          {ordered.map((b) => {
            const p = positionOf(b);
            const r = radiusOf(b.size);
            const selected = selection?.kind === "bubble" && selection.id === b.id;
            const isTarget = drag?.targetId === b.id;
            const isDragged = drag?.id === b.id;
            const attrs = strokeAttrs(b.stroke);
            const iconSize = Math.round(r * 0.9);
            return (
              <g
                key={b.id}
                data-bubble-id={b.id}
                transform={`translate(${p.x} ${p.y})`}
                style={{ cursor: isDragged ? "grabbing" : "grab" }}
                onPointerEnter={() => setHoveredId(b.id)}
                onPointerLeave={() => setHoveredId((h) => (h === b.id ? null : h))}
              >
                {(selected || isTarget) && (
                  <circle
                    r={r + 10}
                    fill="none"
                    stroke="white"
                    strokeOpacity={isTarget ? 0.95 : 0.55}
                    strokeWidth={isTarget ? 2 : 1.25}
                    strokeDasharray={isTarget ? undefined : "2 6"}
                    strokeLinecap="round"
                    className={isTarget ? "pointer-events-none" : "pointer-events-none animate-[spin_24s_linear_infinite]"}
                    style={{ transformBox: "fill-box", transformOrigin: "center" }}
                  />
                )}
                <circle
                  r={r}
                  fill="black"
                  stroke="white"
                  strokeWidth={attrs.strokeWidth}
                  strokeDasharray={attrs.strokeDasharray}
                  className="transition-[stroke-width] duration-150"
                />
                {b.icon && (
                  <IconByName
                    name={b.icon}
                    x={-iconSize / 2}
                    y={-iconSize / 2}
                    size={iconSize}
                    color="white"
                    absoluteStrokeWidth
                    strokeWidth={1.4 + iconSize / 40}
                    className="pointer-events-none"
                  />
                )}
                {b.label.trim() && <BubbleLabel text={b.label} radius={r} size={b.size} />}
              </g>
            );
          })}
        </g>
      </svg>

      {(hovered || (draggedBubble && targetBubble)) && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-10 hidden justify-center px-6 md:flex">
          <div className="max-w-lg text-center">
            {draggedBubble && targetBubble ? (
              <p className="font-serif text-xl text-white italic">
                Release to draw a line from {bubbleTitle(draggedBubble)} to{" "}
                {bubbleTitle(targetBubble)}
              </p>
            ) : hovered && (hovered.label.trim() || hovered.description.trim()) ? (
              <>
                <p className="font-serif text-2xl text-white">{bubbleTitle(hovered)}</p>
                {hovered.description.trim() && (
                  <p className="mt-1 line-clamp-3 text-sm text-white/60">{hovered.description}</p>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}

function wrapLabel(text: string, maxChars: number, maxLines: number) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/\s*\S{0,3}$/, "") + "…";
    return kept;
  }
  return lines.map((l) => (l.length > maxChars + 6 ? l.slice(0, maxChars + 5) + "…" : l));
}

function BubbleLabel({ text, radius, size }: { text: string; radius: number; size: Bubble["size"] }) {
  const fontSize = size === "xl" ? 20 : size === "lg" ? 18 : 16;
  const lines = wrapLabel(text, size === "sm" ? 14 : 20, 3);
  return (
    <text
      y={radius + fontSize + 6}
      textAnchor="middle"
      fill="white"
      fontSize={fontSize}
      stroke="black"
      strokeWidth={5}
      strokeLinejoin="round"
      paintOrder="stroke"
      className="pointer-events-none font-serif"
    >
      {lines.map((line, i) => (
        <tspan key={i} x={0} dy={i === 0 ? 0 : "1.15em"}>
          {line}
        </tspan>
      ))}
    </text>
  );
}
