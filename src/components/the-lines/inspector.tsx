"use client";

import { ArrowLeftRight, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  type Board,
  type Bubble,
  type BubbleSize,
  type Line,
  type Selection,
  type StrokeStyle,
  SIZES,
  STROKES,
  bubbleTitle,
  strokeAttrs,
} from "@/lib/board";
import { cn } from "@/lib/utils";
import { IconPicker } from "./icon-picker";

interface InspectorProps {
  board: Board;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onUpdateBubble: (id: string, patch: Partial<Bubble>) => void;
  onUpdateLine: (id: string, patch: Partial<Line>) => void;
  onRequestDelete: (selection: NonNullable<Selection>) => void;
}

export function Inspector({
  board,
  selection,
  onSelect,
  onUpdateBubble,
  onUpdateLine,
  onRequestDelete,
}: InspectorProps) {
  if (!selection) return null;
  const bubble = selection.kind === "bubble" ? board.bubbles.find((b) => b.id === selection.id) : undefined;
  const line = selection.kind === "line" ? board.lines.find((l) => l.id === selection.id) : undefined;
  if (!bubble && !line) return null;

  return (
    <aside
      className="fixed inset-x-0 bottom-0 z-20 flex max-h-[58vh] flex-col rounded-t-2xl border-t border-white/15 bg-black/95 backdrop-blur md:inset-x-auto md:top-4 md:right-4 md:bottom-4 md:max-h-none md:w-80 md:rounded-2xl md:border"
      aria-label={bubble ? "Edit bubble" : "Edit line"}
    >
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <p className="text-[11px] font-medium tracking-[0.2em] text-muted-foreground uppercase">
          {bubble ? "Bubble" : "Line"}
        </p>
        <Button variant="ghost" size="icon-sm" onClick={() => onSelect(null)} aria-label="Close editor">
          <X />
        </Button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {bubble && (
          <BubbleFields
            key={bubble.id}
            bubble={bubble}
            board={board}
            onSelect={onSelect}
            onChange={(patch) => onUpdateBubble(bubble.id, patch)}
          />
        )}
        {line && (
          <LineFields
            line={line}
            board={board}
            onSelect={onSelect}
            onChange={(patch) => onUpdateLine(line.id, patch)}
          />
        )}
      </div>
      <footer className="border-t border-white/10 px-4 py-3">
        <Button variant="destructive" className="w-full" onClick={() => onRequestDelete(selection)}>
          <Trash2 />
          Delete {bubble ? "bubble" : "line"}
        </Button>
      </footer>
    </aside>
  );
}

function BubbleFields({
  bubble,
  board,
  onSelect,
  onChange,
}: {
  bubble: Bubble;
  board: Board;
  onSelect: (s: Selection) => void;
  onChange: (patch: Partial<Bubble>) => void;
}) {
  const connections = board.lines
    .filter((l) => l.from === bubble.id || l.to === bubble.id)
    .map((l) => ({
      line: l,
      other: board.bubbles.find((b) => b.id === (l.from === bubble.id ? l.to : l.from)),
    }));

  return (
    <div className="space-y-6">
      <Field label="Label" htmlFor="bubble-label">
        <Input
          id="bubble-label"
          value={bubble.label}
          placeholder="Name this thought"
          maxLength={80}
          onChange={(e) => onChange({ label: e.target.value })}
          className="font-serif text-base"
        />
      </Field>

      <Field label="Size">
        <Segmented
          value={bubble.size}
          options={SIZES.map((s) => ({ value: s.value, label: s.label }))}
          onChange={(size) => onChange({ size: size as BubbleSize })}
          ariaLabel="Bubble size"
        />
      </Field>

      <Field label="Stroke">
        <StrokePicker value={bubble.stroke} onChange={(stroke) => onChange({ stroke })} />
      </Field>

      <Field label="Icon">
        <IconPicker value={bubble.icon} onChange={(icon) => onChange({ icon })} />
      </Field>

      <Field label="Description" htmlFor="bubble-description">
        <Textarea
          id="bubble-description"
          value={bubble.description}
          placeholder="What do you know? What do you suspect?"
          rows={4}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </Field>

      <Field label={`Lines (${connections.length})`}>
        {connections.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Drag this bubble onto another to draw a line between them.
          </p>
        ) : (
          <ul className="space-y-1">
            {connections.map(({ line, other }) => (
              <li key={line.id}>
                <button
                  type="button"
                  onClick={() => onSelect({ kind: "line", id: line.id })}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-white/5"
                >
                  <StrokeSwatch stroke={line.stroke} className="w-8" />
                  <span className="truncate font-serif">{bubbleTitle(other)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Field>
    </div>
  );
}

function LineFields({
  line,
  board,
  onSelect,
  onChange,
}: {
  line: Line;
  board: Board;
  onSelect: (s: Selection) => void;
  onChange: (patch: Partial<Line>) => void;
}) {
  const from = board.bubbles.find((b) => b.id === line.from);
  const to = board.bubbles.find((b) => b.id === line.to);
  const endpoint = (b: Bubble | undefined) => (
    <button
      type="button"
      onClick={() => b && onSelect({ kind: "bubble", id: b.id })}
      className="min-w-0 flex-1 truncate rounded-md border border-white/10 px-2 py-2 text-center font-serif text-base hover:border-white/30"
    >
      {bubbleTitle(b)}
    </button>
  );
  return (
    <div className="space-y-6">
      <Field label="Connects">
        <div className="flex items-center gap-2">
          {endpoint(from)}
          <ArrowLeftRight className="size-4 shrink-0 text-muted-foreground" />
          {endpoint(to)}
        </div>
      </Field>
      <Field label="Stroke">
        <StrokePicker value={line.stroke} onChange={(stroke) => onChange({ stroke })} />
      </Field>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: { value: string; label: React.ReactNode; title?: string }[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg border border-white/10 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex min-h-8 items-center px-1 py-1.5 justify-center rounded-md text-sm text-foreground/70 transition-colors hover:bg-white/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
            value === o.value && "bg-white text-black hover:bg-white hover:text-black",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function StrokeSwatch({ stroke, className }: { stroke: StrokeStyle; className?: string }) {
  const attrs = strokeAttrs(stroke);
  return (
    <svg viewBox="0 0 40 8" className={cn("h-2 w-10 shrink-0", className)} aria-hidden>
      <line
        x1={2}
        y1={4}
        x2={38}
        y2={4}
        stroke="currentColor"
        strokeWidth={attrs.strokeWidth}
        strokeDasharray={attrs.strokeDasharray ? "5 4" : undefined}
        strokeLinecap="round"
      />
    </svg>
  );
}

function StrokePicker({ value, onChange }: { value: StrokeStyle; onChange: (s: StrokeStyle) => void }) {
  return (
    <Segmented
      value={value}
      ariaLabel="Stroke style"
      options={STROKES.map((s) => ({
        value: s.value,
        title: s.label,
        label: (
          <span className="flex flex-col items-center gap-1">
            <StrokeSwatch stroke={s.value} className="w-8" />
            <span className="text-[11px] leading-none">{s.label}</span>
          </span>
        ),
      }))}
      onChange={(v) => onChange(v as StrokeStyle)}
    />
  );
}
