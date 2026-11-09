"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { Download, ImageDown, Maximize, Minus, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  type Board,
  type Bubble,
  type BubbleSize,
  type Line,
  type Selection,
  type View,
  SIZES,
  bubbleTitle,
  createBubble,
  exampleBoard,
  findFreeSpot,
  loadBoard,
  parseBoard,
  radiusOf,
  saveBoard,
  uid,
} from "@/lib/board";
import { downloadBoardImage, type ImageFormat } from "@/lib/export-board";
import { Canvas, clampZoom } from "./canvas";
import { ConfirmDialog, type ConfirmRequest } from "./confirm-dialog";
import { Inspector } from "./inspector";

const EMPTY: Board = { bubbles: [], lines: [] };

function fitView(board: Board): View {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (board.bubbles.length === 0) return { x: w / 2, y: h / 2, k: 1 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of board.bubbles) {
    const r = radiusOf(b.size);
    minX = Math.min(minX, b.x - r);
    maxX = Math.max(maxX, b.x + r);
    minY = Math.min(minY, b.y - r);
    maxY = Math.max(maxY, b.y + r + 48);
  }
  const pad = w < 768 ? 32 : 96;
  const k = clampZoom(Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2 - 60) / (maxY - minY), 1.2));
  return {
    k,
    x: w / 2 - ((minX + maxX) / 2) * k,
    y: h / 2 + 20 - ((minY + maxY) / 2) * k,
  };
}

export function TheLinesApp() {
  const [initial] = useState(() => {
    const board = loadBoard() ?? EMPTY;
    return { board, view: fitView(board) };
  });
  const [board, setBoard] = useState<Board>(initial.board);
  const [view, setView] = useState<View>(initial.view);
  const [selection, setSelection] = useState<Selection>(null);
  const [namingId, setNamingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveBoard(board);
  }, [board]);

  const screenCenterWorld = () => ({
    x: (window.innerWidth / 2 - view.x) / view.k,
    y: (window.innerHeight / 2 - view.y) / view.k,
  });

  const addBubble = (size: BubbleSize, at?: { x: number; y: number }) => {
    const target = at ?? screenCenterWorld();
    const spot = at ? at : findFreeSpot(board.bubbles, target.x, target.y, size);
    const bubble = createBubble(spot.x, spot.y, size);
    setBoard((b) => ({ ...b, bubbles: [...b.bubbles, bubble] }));
    setSelection({ kind: "bubble", id: bubble.id });
    setNamingId(bubble.id);
  };

  const select = useCallback((next: Selection) => {
    setSelection(next);
    setNamingId(null);
  }, []);

  const updateBubble = (id: string, patch: Partial<Bubble>) =>
    setBoard((b) => ({ ...b, bubbles: b.bubbles.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  const updateLine = (id: string, patch: Partial<Line>) =>
    setBoard((b) => ({ ...b, lines: b.lines.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  const moveBubble = useCallback(
    (id: string, x: number, y: number) =>
      setBoard((b) => ({ ...b, bubbles: b.bubbles.map((s) => (s.id === id ? { ...s, x, y } : s)) })),
    [],
  );

  const connect = useCallback(
    (from: string, to: string) => {
      const existing = board.lines.find(
        (l) => (l.from === from && l.to === to) || (l.from === to && l.to === from),
      );
      if (existing) {
        toast("These two are already connected.");
        select({ kind: "line", id: existing.id });
        return;
      }
      const line: Line = { id: uid(), from, to, stroke: "thin" };
      setBoard((b) => ({ ...b, lines: [...b.lines, line] }));
    },
    [board.lines, select],
  );

  const requestDelete = useCallback(
    (sel: NonNullable<Selection>) => {
      if (sel.kind === "bubble") {
        const bubble = board.bubbles.find((b) => b.id === sel.id);
        if (!bubble) return;
        const lineCount = board.lines.filter((l) => l.from === sel.id || l.to === sel.id).length;
        setConfirm({
          title: `Delete “${bubbleTitle(bubble)}”?`,
          description:
            lineCount > 0
              ? `This bubble and its ${lineCount} ${lineCount === 1 ? "line" : "lines"} will be removed. This can't be undone.`
              : "This bubble will be removed. This can't be undone.",
          actionLabel: "Delete bubble",
          onConfirm: () => {
            setBoard((b) => ({
              bubbles: b.bubbles.filter((x) => x.id !== sel.id),
              lines: b.lines.filter((l) => l.from !== sel.id && l.to !== sel.id),
            }));
            select(null);
          },
        });
      } else {
        const line = board.lines.find((l) => l.id === sel.id);
        if (!line) return;
        const from = board.bubbles.find((b) => b.id === line.from);
        const to = board.bubbles.find((b) => b.id === line.to);
        setConfirm({
          title: "Delete this line?",
          description: `The line between “${bubbleTitle(from)}” and “${bubbleTitle(to)}” will be removed. The bubbles stay.`,
          actionLabel: "Delete line",
          onConfirm: () => {
            setBoard((b) => ({ ...b, lines: b.lines.filter((l) => l.id !== sel.id) }));
            select(null);
          },
        });
      }
    },
    [board, select],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirm) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable=true], [role=dialog], [role=alertdialog]")) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selection) {
        e.preventDefault();
        requestDelete(selection);
      } else if (e.key === "Escape") {
        select(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirm, selection, requestDelete, select]);

  const zoomBy = (factor: number) => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    setView((v) => {
      const k = clampZoom(v.k * factor);
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    });
  };

  const replaceBoard = (next: Board) => {
    setBoard(next);
    select(null);
    setView(fitView(next));
  };

  const exportImage = async (format: ImageFormat) => {
    try {
      await downloadBoardImage(board, format);
    } catch (err) {
      toast.error("Couldn't export the image", {
        description: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  };

  const exportBoard = () => {
    const blob = new Blob([JSON.stringify(board, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `the-lines-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    let next: Board;
    try {
      next = parseBoard(JSON.parse(await file.text()));
    } catch (err) {
      toast.error("Couldn't import that file", {
        description: err instanceof Error ? err.message : "It isn't a valid board.",
      });
      return;
    }
    if (board.bubbles.length === 0) {
      replaceBoard(next);
      return;
    }
    setConfirm({
      title: "Replace the current board?",
      description: `Importing “${file.name}” will delete the ${board.bubbles.length} bubbles on your current board. Export first if you want to keep them.`,
      actionLabel: "Replace board",
      onConfirm: () => replaceBoard(next),
    });
  };

  const clearBoard = () =>
    setConfirm({
      title: "Clear the whole board?",
      description: `All ${board.bubbles.length} bubbles and ${board.lines.length} lines will be deleted. This can't be undone.`,
      actionLabel: "Clear board",
      onConfirm: () => replaceBoard(EMPTY),
    });

  const isEmpty = board.bubbles.length === 0;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-black text-white">
      <Canvas
        board={board}
        view={view}
        onViewChange={setView}
        selection={selection}
        onSelect={select}
        onMoveBubble={moveBubble}
        onConnect={connect}
        onAddAt={(x, y) => addBubble("md", { x, y })}
      />

      <div className="the-lines-vignette pointer-events-none fixed inset-0" aria-hidden />
      <div className="the-lines-grain pointer-events-none fixed inset-0" aria-hidden />

      <div className="pointer-events-none fixed top-0 left-0 z-10 p-3 md:p-4">
        <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-white/10 bg-black/85 p-1.5 pl-3 backdrop-blur">
          <h1 className="mr-2 font-serif text-xl leading-none italic">The Lines</h1>
          <div className="mx-1 h-5 w-px bg-white/15" />
          {SIZES.map((s) => (
            <Tooltip key={s.value}>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => addBubble(s.value)}
                    aria-label={`Add ${s.label} bubble`}
                  />
                }
              >
                <SizeGlyph size={s.value} />
                {s.label}
              </TooltipTrigger>
              <TooltipContent side="bottom">Add a {s.label} bubble</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>

      <div className="pointer-events-none fixed bottom-0 left-0 z-10 p-3 md:p-4">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-white/10 bg-black/85 p-1 backdrop-blur">
          <IconAction label="Zoom out" onClick={() => zoomBy(1 / 1.25)}>
            <Minus />
          </IconAction>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-14 tabular-nums"
                  onClick={() => setView((v) => ({ ...v, k: 1, ...centerAt(v, 1) }))}
                />
              }
            >
              {Math.round(view.k * 100)}%
            </TooltipTrigger>
            <TooltipContent>Reset to 100%</TooltipContent>
          </Tooltip>
          <IconAction label="Zoom in" onClick={() => zoomBy(1.25)}>
            <Plus />
          </IconAction>
          <IconAction label="Fit everything in view" onClick={() => setView(fitView(board))}>
            <Maximize />
          </IconAction>
          <div className="mx-1 h-5 w-px bg-white/15" />
          <IconAction label="Export board as JSON" onClick={exportBoard} disabled={isEmpty}>
            <Download />
          </IconAction>
          <ImageExport disabled={isEmpty} onExport={exportImage} />
          <IconAction label="Import a board" onClick={() => fileRef.current?.click()}>
            <Upload />
          </IconAction>
          <IconAction label="Clear board" onClick={clearBoard} disabled={isEmpty}>
            <Trash2 />
          </IconAction>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) importFile(file);
            }}
          />
        </div>
      </div>

      {!selection && !isEmpty && (
        <p className="pointer-events-none fixed right-4 bottom-5 z-10 hidden text-right text-xs leading-relaxed text-white/40 lg:block">
          Drop a bubble onto another to draw a line
          <br />
          Double-click empty space to add · Scroll to zoom · Drag to pan
        </p>
      )}

      {isEmpty && (
        <div className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center p-6">
          <div className="pointer-events-auto max-w-md text-center">
            <svg viewBox="0 0 120 60" className="mx-auto mb-6 h-14 w-28" aria-hidden>
              <line x1="22" y1="34" x2="92" y2="22" stroke="white" strokeOpacity="0.7" strokeWidth="1.5" strokeDasharray="5 5" />
              <circle cx="22" cy="34" r="14" fill="black" stroke="white" strokeWidth="1.5" />
              <circle cx="92" cy="22" r="20" fill="black" stroke="white" strokeWidth="3" />
            </svg>
            <h2 className="font-serif text-4xl leading-tight">Every thought begins alone.</h2>
            <p className="mt-3 text-sm text-white/60">
              Add a bubble for each person, place, or idea. Drag one onto another to draw the line
              between them.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button variant="default" onClick={() => addBubble("md")}>
                <Plus />
                Add your first bubble
              </Button>
              <Button variant="outline" onClick={() => replaceBoard(exampleBoard())}>
                Load an example
              </Button>
            </div>
          </div>
        </div>
      )}

      <Inspector
        board={board}
        selection={selection}
        focusLabel={selection?.kind === "bubble" && selection.id === namingId}
        onSelect={select}
        onUpdateBubble={updateBubble}
        onUpdateLine={updateLine}
        onRequestDelete={requestDelete}
      />

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </main>
  );
}

function centerAt(v: View, k: number) {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  return { x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
}

function SizeGlyph({ size }: { size: BubbleSize }) {
  const r = { sm: 3.5, md: 5, lg: 6.5, xl: 8 }[size];
  return (
    <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
      <circle cx="10" cy="10" r={r} fill="black" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ImageExport({
  disabled,
  onExport,
}: {
  disabled: boolean;
  onExport: (format: ImageFormat) => void;
}) {
  return (
    <Menu.Root>
      <Tooltip>
        <TooltipTrigger
          render={
            <Menu.Trigger
              className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
              disabled={disabled}
              aria-label="Export image"
            />
          }
        >
          <ImageDown />
        </TooltipTrigger>
        <TooltipContent>Export image</TooltipContent>
      </Tooltip>
      <Menu.Portal>
        <Menu.Positioner side="top" sideOffset={8} align="start" className="z-50">
          <Menu.Popup className="min-w-32 rounded-xl border border-white/10 bg-black/95 p-1 text-white shadow-[0_12px_40px_rgba(0,0,0,0.45)] outline-none backdrop-blur">
            {(["png", "svg", "pdf"] as const).map((format) => (
              <Menu.Item
                key={format}
                onClick={() => onExport(format)}
                className="flex cursor-default items-center rounded-lg px-3 py-2 text-xs tracking-[0.18em] text-white/80 uppercase outline-none data-[highlighted]:bg-white/10 data-[highlighted]:text-white"
              >
                {format}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function IconAction({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon-sm" onClick={onClick} disabled={disabled} aria-label={label} />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
