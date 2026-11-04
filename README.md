# The Lines

A thought board for mapping relationships between people, places, and ideas, inspired by the "Thoughts" menu in _Pathologic 2_. Bubbles are black circles with white strokes; dropping one bubble onto another draws a line between them.

## Using it

- **Add a bubble** with the Sm / Md / Lg / XL buttons (top left), or double-click empty space.
- **Move** a bubble by dragging it to empty space.
- **Connect** two bubbles by dragging one and releasing it on top of another. The dragged bubble springs back to where it was and a line is drawn.
- **Edit** a bubble by clicking it: label, size, stroke (thin, thick, dashed), a Lucide icon, and a description.
- **Edit a line** by clicking it to change its stroke or delete it.
- **Delete** from the editor panel, or press <kbd>Delete</kbd> / <kbd>Backspace</kbd> with something selected. Every deletion asks for confirmation first.
- **Pan** by dragging the background. **Zoom** with the scroll wheel, a trackpad pinch, or the controls at the bottom left.
- **Export / Import** a board as JSON from the bottom-left controls.

Boards save automatically to your browser's `localStorage`. There's no backend or account.

## Stack

Next.js 16 (App Router, static export), TypeScript, Tailwind CSS v4, shadcn/ui (Base UI), and `lucide-react`.

## Running locally

```bash
npm install
npm run dev      # http://localhost:4317
```

Other scripts:

```bash
npm run lint
npm run build    # static site written to ./out
```

## Deploying to Cloudflare Pages

The app is a fully static export (`output: "export"` in `next.config.ts`), so Pages serves it directly with no Functions or adapters.

1. Push this repo to GitHub.
2. In the Cloudflare dashboard, go to **Workers & Pages → Create → Pages → Connect to Git** and pick the repo.
3. Use these build settings:
   - **Framework preset:** None (or "Next.js (Static HTML Export)")
   - **Build command:** `npm run build`
   - **Build output directory:** `out`
   - **Environment variable:** `NODE_VERSION` = `22`
4. Save and deploy. Every push to the production branch redeploys automatically.

To deploy from your machine instead: `npm run build && npx wrangler pages deploy out --project-name the-lines`.

## Project layout

```
src/app/                        Root layout, fonts, global styles, page
src/components/the-lines/
  app.tsx                       Board state, toolbar, persistence, import/export
  canvas.tsx                    SVG board: pan, zoom, drag to move, drop to connect
  inspector.tsx                 Editor panel for bubbles and lines
  icon-picker.tsx               Searchable Lucide icon grid
  confirm-dialog.tsx            Confirmation modal used for every deletion
src/lib/board.ts                Types, sizes, stroke styles, validation, storage
```
