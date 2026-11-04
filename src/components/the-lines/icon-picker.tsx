"use client";

import { useMemo, useState } from "react";
import { Ban, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ICON_NAMES, IconByName, getIcon, humanizeIcon } from "./lucide";

const MAX_RESULTS = 84;

const SUGGESTED = [
  "User", "Users", "Skull", "Eye", "Heart", "Key", "Lock", "House", "Castle", "Church",
  "Flame", "Droplet", "Moon", "Sun", "Star", "Leaf", "Sprout", "Bone", "Syringe", "Pill",
  "FlaskConical", "Biohazard", "BookOpen", "Scroll", "Feather", "Hourglass", "Compass", "Map",
  "Anchor", "Bird", "Cat", "Dog", "Fish", "Beef", "Crown", "Sword", "Shield", "Scale",
  "Coins", "Gem", "Ghost", "Brain", "Hand", "Footprints", "Mountain", "Tent", "Train", "Bell",
  "Clock", "Mail", "MessageCircle", "Music", "Theater", "Drama", "Puzzle", "CircleHelp",
  "TriangleAlert", "Lightbulb", "Link", "Asterisk", "Infinity", "Triangle", "Circle", "Square",
].filter((n) => getIcon(n));

export function IconPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (icon: string | null) => void;
}) {
  const [query, setQuery] = useState("");

  const { results, total } = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/[\s-_]+/g, "");
    if (!q) return { results: SUGGESTED, total: SUGGESTED.length };
    const matches = ICON_NAMES.filter((n) => n.toLowerCase().includes(q));
    matches.sort((a, b) => {
      const as = a.toLowerCase().startsWith(q) ? 0 : 1;
      const bs = b.toLowerCase().startsWith(q) ? 0 : 1;
      return as - bs || a.length - b.length;
    });
    return { results: matches.slice(0, MAX_RESULTS), total: matches.length };
  }, [query]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {value && getIcon(value) ? (
          <>
            <IconByName name={value} className="size-4 text-foreground" />
            <span className="text-foreground">{humanizeIcon(value!)}</span>
          </>
        ) : (
          <span>No icon</span>
        )}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${ICON_NAMES.length.toLocaleString()} icons`}
          className="pl-8"
          aria-label="Search icons"
        />
      </div>
      <div className="grid grid-cols-7 gap-1" role="listbox" aria-label="Icons">
        {!query.trim() && (
          <IconButton label="No icon" selected={value === null} onClick={() => onChange(null)}>
            <Ban className="size-4 opacity-60" />
          </IconButton>
        )}
        {results.map((name) => (
          <IconButton
            key={name}
            label={humanizeIcon(name)}
            selected={value === name}
            onClick={() => onChange(name)}
          >
            <IconByName name={name} className="size-4" />
          </IconButton>
        ))}
      </div>
      {query.trim() && total === 0 && (
        <p className="py-3 text-center text-xs text-muted-foreground">
          No icons match &ldquo;{query.trim()}&rdquo;.
        </p>
      )}
      {total > results.length && (
        <p className="text-xs text-muted-foreground">
          Showing {results.length} of {total}. Keep typing to narrow it down.
        </p>
      )}
      {!query.trim() && (
        <p className="text-xs text-muted-foreground">Suggestions. Search to see every Lucide icon.</p>
      )}
    </div>
  );
}

function IconButton({
  label,
  selected,
  onClick,
  children,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex aspect-square items-center justify-center rounded-md border border-transparent text-foreground/80 transition-colors hover:border-white/20 hover:bg-white/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
        selected && "border-white bg-white text-black hover:bg-white hover:text-black",
      )}
    >
      {children}
    </button>
  );
}
