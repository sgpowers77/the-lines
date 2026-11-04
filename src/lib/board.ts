export type BubbleSize = "sm" | "md" | "lg" | "xl";
export type StrokeStyle = "thin" | "thick" | "dashed";

export interface Bubble {
  id: string;
  x: number;
  y: number;
  size: BubbleSize;
  icon: string | null;
  label: string;
  description: string;
  stroke: StrokeStyle;
}

export interface Line {
  id: string;
  from: string;
  to: string;
  stroke: StrokeStyle;
}

export interface View {
  x: number;
  y: number;
  k: number;
}

export interface Board {
  bubbles: Bubble[];
  lines: Line[];
}

export type Selection =
  | { kind: "bubble"; id: string }
  | { kind: "line"; id: string }
  | null;

export const SIZES: { value: BubbleSize; label: string; radius: number }[] = [
  { value: "sm", label: "Sm", radius: 26 },
  { value: "md", label: "Md", radius: 40 },
  { value: "lg", label: "Lg", radius: 58 },
  { value: "xl", label: "XL", radius: 80 },
];

export const STROKES: { value: StrokeStyle; label: string }[] = [
  { value: "thin", label: "Thin" },
  { value: "thick", label: "Thick" },
  { value: "dashed", label: "Dashed" },
];

export function radiusOf(size: BubbleSize) {
  return SIZES.find((s) => s.value === size)?.radius ?? 40;
}

export function strokeAttrs(stroke: StrokeStyle) {
  switch (stroke) {
    case "thick":
      return { strokeWidth: 4, strokeDasharray: undefined };
    case "dashed":
      return { strokeWidth: 1.75, strokeDasharray: "7 6" };
    default:
      return { strokeWidth: 1.5, strokeDasharray: undefined };
  }
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function createBubble(x: number, y: number, size: BubbleSize): Bubble {
  return {
    id: uid(),
    x,
    y,
    size,
    icon: null,
    label: "",
    description: "",
    stroke: "thin",
  };
}

/** Finds a spot near (x, y) that doesn't overlap existing bubbles. */
export function findFreeSpot(bubbles: Bubble[], x: number, y: number, size: BubbleSize) {
  const r = radiusOf(size);
  const fits = (px: number, py: number) =>
    bubbles.every((b) => Math.hypot(b.x - px, b.y - py) > radiusOf(b.size) + r + 24);
  if (fits(x, y)) return { x, y };
  for (let ring = 1; ring < 40; ring++) {
    const dist = ring * (r + 20);
    const steps = 8 + ring * 4;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2 + ring;
      const px = x + Math.cos(a) * dist;
      const py = y + Math.sin(a) * dist;
      if (fits(px, py)) return { x: px, y: py };
    }
  }
  return { x, y };
}

export function bubbleTitle(b: Bubble | undefined) {
  return b?.label.trim() || "Untitled";
}

const SIZE_VALUES = new Set(SIZES.map((s) => s.value));
const STROKE_VALUES = new Set(STROKES.map((s) => s.value));

/** Validates untrusted JSON (imports, localStorage) into a Board. Throws on bad shape. */
export function parseBoard(raw: unknown): Board {
  if (!raw || typeof raw !== "object") throw new Error("Not a board file.");
  const r = raw as { bubbles?: unknown; lines?: unknown };
  if (!Array.isArray(r.bubbles) || !Array.isArray(r.lines)) {
    throw new Error("Board file is missing bubbles or lines.");
  }
  const bubbles: Bubble[] = r.bubbles.map((b, i) => {
    const o = b as Record<string, unknown>;
    if (typeof o?.id !== "string" || typeof o.x !== "number" || typeof o.y !== "number") {
      throw new Error(`Bubble ${i + 1} is malformed.`);
    }
    return {
      id: o.id,
      x: o.x,
      y: o.y,
      size: SIZE_VALUES.has(o.size as BubbleSize) ? (o.size as BubbleSize) : "md",
      icon: typeof o.icon === "string" ? o.icon : null,
      label: typeof o.label === "string" ? o.label : "",
      description: typeof o.description === "string" ? o.description : "",
      stroke: STROKE_VALUES.has(o.stroke as StrokeStyle) ? (o.stroke as StrokeStyle) : "thin",
    };
  });
  const ids = new Set(bubbles.map((b) => b.id));
  const lines: Line[] = r.lines.flatMap((l) => {
    const o = l as Record<string, unknown>;
    if (typeof o?.from !== "string" || typeof o.to !== "string") return [];
    if (!ids.has(o.from) || !ids.has(o.to) || o.from === o.to) return [];
    return [
      {
        id: typeof o.id === "string" ? o.id : uid(),
        from: o.from,
        to: o.to,
        stroke: STROKE_VALUES.has(o.stroke as StrokeStyle) ? (o.stroke as StrokeStyle) : "thin",
      },
    ];
  });
  return { bubbles, lines };
}

const STORAGE_KEY = "the-lines:board:v1";

export function loadBoard(): Board | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseBoard(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveBoard(board: Board) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
  } catch {
    // Storage full or unavailable (private mode); the board still works in memory.
  }
}

export function exampleBoard(): Board {
  const b = (
    id: string,
    x: number,
    y: number,
    size: BubbleSize,
    icon: string | null,
    label: string,
    description: string,
    stroke: StrokeStyle = "thin",
  ): Bubble => ({ id, x, y, size, icon, label, description, stroke });

  const bubbles = [
    b("town", 0, 0, "xl", "Castle", "The Town", "Everything here is connected. The question is how.", "thick"),
    b("plague", 260, -150, "lg", "Biohazard", "The Sand Pest", "It came back. Someone knew it would.", "dashed"),
    b("bull", -280, -130, "md", "Beef", "The Bull", "The herds are sick. The butchers are not talking."),
    b("blood", -330, 120, "sm", "Droplet", "Blood", "Twyre grows where the blood was spilled."),
    b("steppe", -60, 250, "lg", "Sprout", "The Steppe", "Older than the Town. It remembers."),
    b("polyhedron", 300, 150, "md", "Triangle", "The Polyhedron", "A tower that should not stand.", "thick"),
    b("children", 470, 0, "sm", "Users", "The Children", "They know more than they say."),
    b("cure", 120, -310, "sm", "FlaskConical", "Panacea", "If it exists, it costs something.", "dashed"),
  ];
  const l = (from: string, to: string, stroke: StrokeStyle = "thin"): Line => ({
    id: `${from}-${to}`,
    from,
    to,
    stroke,
  });
  const lines = [
    l("town", "plague", "thick"),
    l("town", "bull"),
    l("bull", "blood"),
    l("blood", "steppe", "dashed"),
    l("town", "steppe"),
    l("town", "polyhedron"),
    l("polyhedron", "children", "thick"),
    l("plague", "cure", "dashed"),
    l("plague", "polyhedron", "dashed"),
  ];
  return { bubbles, lines };
}
