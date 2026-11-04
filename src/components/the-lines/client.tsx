"use client";

import dynamic from "next/dynamic";

// The board lives in localStorage, so it only renders in the browser.
export const TheLinesClient = dynamic(() => import("./app").then((m) => m.TheLinesApp), {
  ssr: false,
  loading: () => (
    <main className="flex h-dvh w-full items-center justify-center bg-black">
      <p className="animate-pulse font-serif text-2xl text-white/60 italic">Gathering your thoughts…</p>
    </main>
  ),
});
