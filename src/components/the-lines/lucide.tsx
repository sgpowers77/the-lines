import { createElement } from "react";
import { icons, type LucideIcon, type LucideProps } from "lucide-react";

const ICON_MAP = icons as Record<string, LucideIcon>;

export const ICON_NAMES = Object.keys(ICON_MAP).sort();

export function getIcon(name: string | null | undefined): LucideIcon | undefined {
  return name ? ICON_MAP[name] : undefined;
}

export function humanizeIcon(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .toLowerCase();
}

export function IconByName({ name, ...props }: { name: string } & LucideProps) {
  const icon = getIcon(name);
  return icon ? createElement(icon, props) : null;
}
