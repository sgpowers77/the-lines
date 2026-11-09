import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { type Board, radiusOf, strokeAttrs } from "./board";
import { bubbleLabelLines, labelFontSize } from "./label";
import { getIcon } from "@/components/the-lines/lucide";

export type ImageFormat = "png" | "svg" | "pdf";

const PAD = 80;
const MAX_EDGE = 4096;

export async function downloadBoardImage(board: Board, format: ImageFormat) {
  const { svg, width, height } = await buildBoardSvg(board);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `the-lines-${stamp}`;
  if (format === "svg") {
    downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${base}.svg`);
    return;
  }
  const canvas = await rasterize(svg, width, height);
  if (format === "png") {
    downloadBlob(await canvasToBlob(canvas, "image/png"), `${base}.png`);
    return;
  }
  downloadBlob(new Blob([await canvasToPdf(canvas, width, height)], { type: "application/pdf" }), `${base}.pdf`);
}

async function buildBoardSvg(board: Board) {
  await document.fonts.ready;
  const family = serifFamily();
  const fontCss = await inlineSerifFont(family);
  const measure = makeMeasurer(family);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const placed = board.bubbles.map((bubble) => {
    const radius = radiusOf(bubble.size);
    const lines = bubbleLabelLines(bubble.label, bubble.size);
    const fontSize = labelFontSize(bubble.size);
    const textWidth = lines.reduce((widest, line) => Math.max(widest, measure(line, fontSize)), 0);
    const half = Math.max(radius, textWidth / 2) + 8;
    const top = bubble.y - radius - 4;
    const firstBaseline = bubble.y + radius + fontSize + 6;
    const bottom = lines.length
      ? firstBaseline + (lines.length - 1) * fontSize * 1.15 + fontSize * 0.35
      : bubble.y + radius + 4;
    minX = Math.min(minX, bubble.x - half);
    maxX = Math.max(maxX, bubble.x + half);
    minY = Math.min(minY, top);
    maxY = Math.max(maxY, bottom);
    return { bubble, radius, lines, fontSize };
  });

  if (!Number.isFinite(minX)) {
    minX = -120;
    maxX = 120;
    minY = -80;
    maxY = 80;
  }

  const width = Math.ceil(maxX - minX + PAD * 2);
  const height = Math.ceil(maxY - minY + PAD * 2);
  const ox = PAD - minX;
  const oy = PAD - minY;
  const byId = new Map(board.bubbles.map((bubble) => [bubble.id, bubble]));

  const lines = board.lines
    .map((line) => {
      const from = byId.get(line.from);
      const to = byId.get(line.to);
      if (!from || !to || from.id === to.id) return "";
      const attrs = strokeAttrs(line.stroke);
      const dash = attrs.strokeDasharray ? ` stroke-dasharray="${attrs.strokeDasharray}"` : "";
      return `<line x1="${n(from.x)}" y1="${n(from.y)}" x2="${n(to.x)}" y2="${n(to.y)}" stroke="#fff" stroke-opacity="0.82" stroke-width="${attrs.strokeWidth}" stroke-linecap="round"${dash}/>`;
    })
    .join("");

  const bubbles = placed
    .map(({ bubble, radius, lines: label, fontSize }) => {
      const attrs = strokeAttrs(bubble.stroke);
      const dash = attrs.strokeDasharray ? ` stroke-dasharray="${attrs.strokeDasharray}"` : "";
      const iconSize = Math.round(radius * 0.9);
      const icon = bubble.icon ? iconSvg(bubble.icon, iconSize) : "";
      const text = label
        .map(
          (line, index) =>
            `<tspan x="0" dy="${index === 0 ? 0 : "1.15em"}">${escapeXml(line)}</tspan>`,
        )
        .join("");
      const labelSvg = label.length
        ? `<text y="${n(radius + fontSize + 6)}" text-anchor="middle" fill="#fff" font-size="${fontSize}" stroke="#000" stroke-width="5" stroke-linejoin="round" paint-order="stroke">${text}</text>`
        : "";
      return `<g transform="translate(${n(bubble.x)} ${n(bubble.y)})"><circle r="${radius}" fill="#000" stroke="#fff" stroke-width="${attrs.strokeWidth}"${dash}/>${icon}${labelSvg}</g>`;
    })
    .join("");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style><![CDATA[${fontCss}text{font-family:"TheLinesSerif",Georgia,serif;}]]></style>
  <rect width="100%" height="100%" fill="#000"/>
  <pattern id="the-lines-export-dots" width="48" height="48" patternUnits="userSpaceOnUse">
    <circle cx="24" cy="24" r="1.1" fill="#fff" fill-opacity="0.09"/>
  </pattern>
  <rect width="100%" height="100%" fill="url(#the-lines-export-dots)"/>
  <g transform="translate(${n(ox)} ${n(oy)})">${lines}${bubbles}</g>
</svg>`;

  return { svg, width, height };
}

function iconSvg(name: string, size: number) {
  const Icon = getIcon(name);
  if (!Icon) return "";
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => {
    root.render(
      createElement(Icon, {
        size,
        color: "#ffffff",
        absoluteStrokeWidth: true,
        strokeWidth: 1.4 + size / 40,
      }),
    );
  });
  const markup = host.innerHTML.replace("<svg ", `<svg x="${n(-size / 2)}" y="${n(-size / 2)}" `);
  root.unmount();
  return markup;
}

function serifFamily() {
  const probe = document.createElement("span");
  probe.className = "font-serif";
  probe.textContent = "Ag";
  probe.style.position = "absolute";
  probe.style.left = "-9999px";
  document.body.appendChild(probe);
  const stack = getComputedStyle(probe).fontFamily;
  probe.remove();
  return stack
    .split(",")
    .map((part) => part.trim().replace(/^["']|["']$/g, ""))
    .find((name) => name && name.toLowerCase() !== "serif" && name.toLowerCase() !== "sans-serif");
}

async function inlineSerifFont(family: string | undefined) {
  if (!family) return "";
  const faces = fontFaces(family).filter(({ rule }) => {
    const weight = rule.style.getPropertyValue("font-weight") || "400";
    const style = rule.style.getPropertyValue("font-style") || "normal";
    return (weight === "400" || weight === "normal") && style === "normal";
  });
  const css: string[] = [];
  const seen = new Set<string>();
  for (const { rule, href } of faces) {
    const src = rule.style.getPropertyValue("src");
    const match = src.match(/url\(["']?([^"')]+)["']?\)/);
    if (!match || seen.has(match[1])) continue;
    seen.add(match[1]);
    try {
      const url = new URL(match[1], href || document.baseURI).href;
      const response = await fetch(url);
      if (!response.ok) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      const format = src.includes("woff2") ? "woff2" : src.includes("woff") ? "woff" : "truetype";
      const range = rule.style.getPropertyValue("unicode-range");
      css.push(
        `@font-face{font-family:"TheLinesSerif";font-style:normal;font-weight:400;src:url(data:font/${format};base64,${bytesToBase64(bytes)}) format("${format}");${range ? `unicode-range:${range};` : ""}}`,
      );
    } catch {
      // The export still uses Georgia when the webfont can't be inlined.
    }
  }
  return css.join("");
}

function fontFaces(family: string) {
  const want = family.toLowerCase();
  const rules: { rule: CSSFontFaceRule; href: string | null }[] = [];
  for (const sheet of document.styleSheets) {
    let css: CSSRuleList;
    try {
      css = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of css) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const name = rule.style.getPropertyValue("font-family").replace(/["']/g, "").trim().toLowerCase();
      if (name === want) rules.push({ rule, href: sheet.href });
    }
  }
  return rules;
}

function makeMeasurer(family: string | undefined) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  return (text: string, fontSize: number) => {
    if (!ctx) return text.length * fontSize * 0.5;
    ctx.font = `${fontSize}px ${family ? `"${family}", ` : ""}Georgia, serif`;
    return ctx.measureText(text).width;
  };
}

function rasterize(svg: string, width: number, height: number) {
  const scale = Math.min(2, MAX_EDGE / Math.max(width, height));
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  const image = new Image();
  image.decoding = "sync";
  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Couldn't draw the image."));
        return;
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't draw the image."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode the image."))), type);
  });
}

async function canvasToPdf(canvas: HTMLCanvasElement, pageWidth: number, pageHeight: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't read the image.");
  const { width, height, data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }
  const compressed = await deflate(rgb);
  const content = `q\n${num(pageWidth)} 0 0 ${num(pageHeight)} 0 0 cm\n/Im0 Do\nQ`;
  const imageDict =
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`;
  const objects = [
    enc("<< /Type /Catalog /Pages 2 0 R >>"),
    enc("<< /Type /Pages /Count 1 /Kids [3 0 R] >>"),
    enc(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(pageWidth)} ${num(pageHeight)}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>`,
    ),
    enc(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`),
    concat([enc(imageDict), compressed, enc("\nendstream")]),
  ];
  return buildPdf(objects);
}

async function deflate(bytes: Uint8Array) {
  const stream = new CompressionStream("deflate");
  const output = new Response(stream.readable).arrayBuffer();
  const writer = stream.writable.getWriter();
  const chunk = 64 * 1024;
  for (let i = 0; i < bytes.length; i += chunk) {
    await writer.write(bytes.slice(i, Math.min(i + chunk, bytes.length)));
  }
  await writer.close();
  return new Uint8Array(await output);
}

function buildPdf(objects: Uint8Array[]) {
  const header = enc("%PDF-1.4\n");
  const parts: Uint8Array[] = [header];
  const offsets = [0];
  let position = header.length;
  objects.forEach((body, index) => {
    const head = enc(`${index + 1} 0 obj\n`);
    const tail = enc("\nendobj\n");
    offsets.push(position);
    parts.push(head, body, tail);
    position += head.length + body.length + tail.length;
  });
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${position}\n%%EOF`;
  parts.push(enc(xref));
  return concat(parts);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function n(value: number) {
  return Math.round(value * 100) / 100;
}

function num(value: number) {
  return String(Math.round(value * 100) / 100);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function enc(value: string) {
  return new TextEncoder().encode(value);
}

function concat(parts: Uint8Array[]) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
