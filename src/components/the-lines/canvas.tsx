"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Board,
  type Bubble,
  type Selection,
  type View,
  bubbleTitle,
  radiusOf,
  selectedBubbleIds,
  selectionFromIds,
  strokeAttrs,
} from "@/lib/board";
import { bubbleLabelLines, labelFontSize } from "@/lib/label";
import { IconByName } from "./lucide";

const DRAG_THRESHOLD = 4;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const MIN_PINCH_PX = 8;

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
      /** Other selected bubbles that should follow this drag. Includes this bubble. */
      group: { id: string; x: number; y: number }[] | null;
    }
  | {
      type: "pan";
      pointerId: number;
      startClient: Point;
      startView: View;
      moved: boolean;
    }
  | {
      type: "line";
      id: string;
      pointerId: number;
      startClient: Point;
      startWorld: Point;
      shiftKey: boolean;
      moved: boolean;
    }
  | {
      type: "marquee";
      pointerId: number;
      startClient: Point;
      startWorld: Point;
      currentWorld: Point;
      /** Ids to keep when Shift is held. Empty when the drag replaces the selection. */
      baseIds: string[];
      moved: boolean;
    };

interface DragState {
  id: string;
  x: number;
  y: number;
  originX: number;
  originY: number;
  targetId: string | null;
  group: { id: string; x: number; y: number }[] | null;
}

interface Marquee {
  start: Point;
  current: Point;
  baseIds: string[];
}

interface CanvasProps {
  board: Board;
  view: View;
  onViewChange: (view: View) => void;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onMoveBubble: (id: string, x: number, y: number) => void;
  onMoveBubbles: (moves: { id: string; x: number; y: number }[]) => void;
  onConnect: (from: string, to: string) => void;
  onAddAt: (x: number, y: number) => void;
}

export function clampZoom(k: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
}

type Pinch = {
  startDist: number;
  startK: number;
  worldX: number;
  worldY: number;
};

function rectContainsCircle(start: Point, current: Point, bubble: Bubble) {
  const x0 = Math.min(start.x, current.x);
  const y0 = Math.min(start.y, current.y);
  const x1 = Math.max(start.x, current.x);
  const y1 = Math.max(start.y, current.y);
  const r = radiusOf(bubble.size);
  const nearestX = Math.max(x0, Math.min(bubble.x, x1));
  const nearestY = Math.max(y0, Math.min(bubble.y, y1));
  return (bubble.x - nearestX) ** 2 + (bubble.y - nearestY) ** 2 <= r * r;
}

function bubblesInRect(board: Board, start: Point, current: Point) {
  return board.bubbles.filter((bubble) => rectContainsCircle(start, current, bubble)).map((bubble) => bubble.id);
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof Element && !!target.closest("input, textarea, [contenteditable=true]");
}

/** Two touches on the board: midpoint and the distance between them. */
function pinchMeasure(touches: TouchList) {
  const a = touches[0];
  const b = touches[1];
  return {
    mid: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 },
    dist: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
  };
}

export function Canvas({
  board,
  view,
  onViewChange,
  selection,
  onSelect,
  onMoveBubble,
  onMoveBubbles,
  onConnect,
  onAddAt,
}: CanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const pinchRef = useRef<Pinch | null>(null);
  const viewRef = useRef(view);
  const onViewChangeRef = useRef(onViewChange);
  const [drag, setDragState] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const setDrag = (d: DragState | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const [returning, setReturning] = useState<{ id: string; x: number; y: number } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const spaceRef = useRef(false);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  }, [onViewChange]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      if (isTypingTarget(e.target)) return;
      if (document.querySelector("[role=dialog], [role=alertdialog]")) return;
      e.preventDefault();
      spaceRef.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceRef.current = false;
    };
    const blur = () => {
      spaceRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const publishView = (next: View) => {
    viewRef.current = next;
    onViewChangeRef.current(next);
  };

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
      const next = { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
      viewRef.current = next;
      onViewChangeRef.current(next);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const byId = new Map(board.bubbles.map((b) => [b.id, b]));

  const positionOf = (b: Bubble): Point => {
    if (drag?.group) {
      const member = drag.group.find((m) => m.id === b.id);
      if (member) return { x: member.x + drag.x - drag.originX, y: member.y + drag.y - drag.originY };
    }
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

  const stopPointerGesture = () => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    setPanning(false);
    const svg = svgRef.current;
    if (svg?.hasPointerCapture(g.pointerId)) svg.releasePointerCapture(g.pointerId);
    if (g.type === "marquee") {
      setMarquee(null);
      return;
    }
    if (g.type !== "bubble" || !g.moved) return;
    const current = dragRef.current;
    setDrag(null);
    if (g.group || !current) return;
    animateReturn(g.id, current, g.origin);
  };
  const stopPointerGestureRef = useRef(stopPointerGesture);
  useEffect(() => {
    stopPointerGestureRef.current = stopPointerGesture;
  });

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const beginPinch = (touches: TouchList) => {
      stopPointerGestureRef.current();
      const { mid, dist } = pinchMeasure(touches);
      const v = viewRef.current;
      const rect = svg.getBoundingClientRect();
      const cx = mid.x - rect.left;
      const cy = mid.y - rect.top;
      pinchRef.current = {
        startDist: Math.max(dist, MIN_PINCH_PX),
        startK: v.k,
        worldX: (cx - v.x) / v.k,
        worldY: (cy - v.y) / v.k,
      };
    };

    const movePinch = (touches: TouchList) => {
      const pinch = pinchRef.current;
      if (!pinch) return;
      const { mid, dist } = pinchMeasure(touches);
      const rect = svg.getBoundingClientRect();
      const cx = mid.x - rect.left;
      const cy = mid.y - rect.top;
      const k = clampZoom(pinch.startK * (dist / pinch.startDist));
      publishView({ k, x: cx - pinch.worldX * k, y: cy - pinch.worldY * k });
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.targetTouches.length !== 2) return;
      e.preventDefault();
      beginPinch(e.targetTouches);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinchRef.current || e.targetTouches.length !== 2) return;
      e.preventDefault();
      movePinch(e.targetTouches);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.targetTouches.length >= 2) return;
      pinchRef.current = null;
    };

    svg.addEventListener("touchstart", onTouchStart, { passive: false });
    svg.addEventListener("touchmove", onTouchMove, { passive: false });
    svg.addEventListener("touchend", onTouchEnd);
    svg.addEventListener("touchcancel", onTouchEnd);
    return () => {
      svg.removeEventListener("touchstart", onTouchStart);
      svg.removeEventListener("touchmove", onTouchMove);
      svg.removeEventListener("touchend", onTouchEnd);
      svg.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pinchRef.current) return;
    if (e.button !== 0 && e.button !== 1) return;
    if (gesture.current) return;
    const target = e.target as Element;
    const bubbleEl = target.closest("[data-bubble-id]");
    const lineEl = target.closest("[data-line-id]");
    const client = { x: e.clientX, y: e.clientY };

    const pan = () => {
      gesture.current = {
        type: "pan",
        pointerId: e.pointerId,
        startClient: client,
        startView: viewRef.current,
        moved: false,
      };
    };

    // Space or the middle button pans. A plain drag on empty space draws a selection rectangle.
    if (e.button === 1 || spaceRef.current) {
      pan();
    } else if (bubbleEl && e.button === 0) {
      const id = bubbleEl.getAttribute("data-bubble-id")!;
      const b = byId.get(id);
      if (!b || returning?.id === id) return;
      const world = toWorld(e.clientX, e.clientY);
      const selected = selectedBubbleIds(selection);
      const group =
        selected.length > 1 && selected.includes(id)
          ? selected.flatMap((memberId) => {
              const member = byId.get(memberId);
              return member ? [{ id: memberId, x: member.x, y: member.y }] : [];
            })
          : null;
      gesture.current = {
        type: "bubble",
        id,
        pointerId: e.pointerId,
        startClient: client,
        origin: { x: b.x, y: b.y },
        offset: { x: world.x - b.x, y: world.y - b.y },
        moved: false,
        group,
      };
    } else if (lineEl && e.button === 0) {
      gesture.current = {
        type: "line",
        id: lineEl.getAttribute("data-line-id")!,
        pointerId: e.pointerId,
        startClient: client,
        startWorld: toWorld(e.clientX, e.clientY),
        shiftKey: e.shiftKey,
        moved: false,
      };
    } else {
      const world = toWorld(e.clientX, e.clientY);
      gesture.current = {
        type: "marquee",
        pointerId: e.pointerId,
        startClient: client,
        startWorld: world,
        currentWorld: world,
        baseIds: e.shiftKey ? selectedBubbleIds(selection) : [],
        moved: false,
      };
    }
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pinchRef.current) return;
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const dx = e.clientX - g.startClient.x;
    const dy = e.clientY - g.startClient.y;
    if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    g.moved = true;

    if (g.type === "pan") {
      setPanning(true);
      publishView({ ...g.startView, x: g.startView.x + dx, y: g.startView.y + dy });
      return;
    }

    const world = toWorld(e.clientX, e.clientY);
    if (g.type === "line") {
      gesture.current = {
        type: "marquee",
        pointerId: g.pointerId,
        startClient: g.startClient,
        startWorld: g.startWorld,
        currentWorld: world,
        baseIds: g.shiftKey ? selectedBubbleIds(selection) : [],
        moved: true,
      };
      setMarquee({
        start: g.startWorld,
        current: world,
        baseIds: g.shiftKey ? selectedBubbleIds(selection) : [],
      });
      return;
    }
    if (g.type === "marquee") {
      g.currentWorld = world;
      setMarquee({ start: g.startWorld, current: world, baseIds: g.baseIds });
      return;
    }

    const groupIds = new Set(g.group?.map((member) => member.id) ?? [g.id]);
    const target = g.group
      ? undefined
      : board.bubbles.find(
          (b) => !groupIds.has(b.id) && Math.hypot(world.x - b.x, world.y - b.y) <= radiusOf(b.size) + 6,
        );
    setDrag({
      id: g.id,
      x: world.x - g.offset.x,
      y: world.y - g.offset.y,
      originX: g.origin.x,
      originY: g.origin.y,
      targetId: target?.id ?? null,
      group: g.group,
    });
  };

  const endGesture = (e: React.PointerEvent<SVGSVGElement>, cancelled: boolean) => {
    if (pinchRef.current) return;
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

    if (g.type === "line") {
      if (!cancelled) onSelect({ kind: "line", id: g.id });
      return;
    }

    if (g.type === "marquee") {
      setMarquee(null);
      if (cancelled || !g.moved) {
        if (!cancelled) onSelect(null);
        return;
      }
      const hits = bubblesInRect(board, g.startWorld, g.currentWorld);
      const ids = [...new Set([...g.baseIds, ...hits])];
      onSelect(selectionFromIds(ids));
      return;
    }

    if (!g.moved) {
      if (cancelled) return;
      if (e.shiftKey) {
        const ids = selectedBubbleIds(selection);
        const next = ids.includes(g.id) ? ids.filter((id) => id !== g.id) : [...ids, g.id];
        onSelect(selectionFromIds(next));
      } else {
        onSelect({ kind: "bubble", id: g.id });
      }
      return;
    }

    const current = dragRef.current;
    setDrag(null);
    if (!current) return;
    if (cancelled) {
      if (!g.group) animateReturn(g.id, current, g.origin);
      return;
    }
    if (g.group) {
      const dx = current.x - current.originX;
      const dy = current.y - current.originY;
      onMoveBubbles(g.group.map((member) => ({ id: member.id, x: member.x + dx, y: member.y + dy })));
      return;
    }
    if (current.targetId) {
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
    const raised = (x: Bubble) =>
      x.id === drag?.id || x.id === returning?.id || !!drag?.group?.some((member) => member.id === x.id);
    return Number(raised(a)) - Number(raised(b));
  });

  const previewIds = marquee
    ? [...new Set([...marquee.baseIds, ...bubblesInRect(board, marquee.start, marquee.current)])]
    : null;
  const chosenIds = new Set(previewIds ?? selectedBubbleIds(selection));
  const marqueeRect = marquee
    ? {
        x: Math.min(marquee.start.x, marquee.current.x),
        y: Math.min(marquee.start.y, marquee.current.y),
        width: Math.abs(marquee.current.x - marquee.start.x),
        height: Math.abs(marquee.current.y - marquee.start.y),
      }
    : null;

  return (
    <>
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full touch-none select-none"
        style={{ cursor: panning ? "grabbing" : drag ? "grabbing" : marquee ? "crosshair" : "default" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => endGesture(e, false)}
        onPointerCancel={(e) => endGesture(e, true)}
        onDoubleClick={handleDoubleClick}
        role="application"
        aria-label="The Lines board. Drag empty space to select bubbles. Drag a bubble to move it, or drop it onto another to connect them."
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
            const linked = chosenIds.size > 0 && (chosenIds.has(line.from) || chosenIds.has(line.to));
            const attrs = strokeAttrs(line.stroke);
            const width = linked ? Math.max(attrs.strokeWidth + 1.75, attrs.strokeWidth * 1.7) : attrs.strokeWidth;
            const dimmed = chosenIds.size > 0 && !linked;
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
                {(selected || linked) && (
                  <line
                    x1={pa.x}
                    y1={pa.y}
                    x2={pb.x}
                    y2={pb.y}
                    stroke="white"
                    strokeOpacity={selected ? 0.16 : 0.2}
                    strokeWidth={width + (selected ? 10 : 7)}
                    strokeLinecap="round"
                  />
                )}
                <line
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke="white"
                  strokeOpacity={linked || selected ? 1 : dimmed ? 0.28 : 0.82}
                  strokeWidth={width}
                  strokeDasharray={attrs.strokeDasharray}
                  strokeLinecap="round"
                  className="pointer-events-none transition-[stroke-width,stroke-opacity] duration-300"
                />
                {linked && (
                  <line
                    x1={pa.x}
                    y1={pa.y}
                    x2={pb.x}
                    y2={pb.y}
                    stroke="white"
                    strokeOpacity={0.7}
                    strokeWidth={Math.max(1.25, width * 0.45)}
                    strokeDasharray="2 8"
                    strokeLinecap="round"
                    className="pointer-events-none animate-[line-march_2.4s_linear_infinite]"
                  />
                )}
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
            const selected = chosenIds.has(b.id);
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

          {marqueeRect && (
            <rect
              x={marqueeRect.x}
              y={marqueeRect.y}
              width={marqueeRect.width}
              height={marqueeRect.height}
              fill="white"
              fillOpacity={0.06}
              stroke="white"
              strokeOpacity={0.85}
              strokeWidth={1 / view.k}
              strokeDasharray={`${5 / view.k} ${4 / view.k}`}
              className="pointer-events-none"
            />
          )}
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

function BubbleLabel({ text, radius, size }: { text: string; radius: number; size: Bubble["size"] }) {
  const fontSize = labelFontSize(size);
  const lines = bubbleLabelLines(text, size);
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
