import type { BubbleSize } from "./board";

export function wrapLabel(text: string, maxChars: number, maxLines: number) {
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
  return lines.map((line) => (line.length > maxChars + 6 ? line.slice(0, maxChars + 5) + "…" : line));
}

export function labelFontSize(size: BubbleSize) {
  return size === "xl" ? 20 : size === "lg" ? 18 : 16;
}

export function bubbleLabelLines(text: string, size: BubbleSize) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return wrapLabel(trimmed, size === "sm" ? 14 : 20, 3);
}
