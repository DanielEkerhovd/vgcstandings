import type { PokemonType } from "./dex";
import { TYPE_ICONS } from "./type-icons";

/**
 * Official type colours, lifted from the icon artwork itself
 * (see scripts/build-type-icons.mjs) rather than picked by hand.
 */
export const TYPE_COLORS = Object.fromEntries(
  Object.entries(TYPE_ICONS).map(([t, v]) => [t, v.color]),
) as Record<PokemonType, string>;

export const NEUTRAL = "#8b93a3";

export const typeColor = (t?: string) =>
  (t && TYPE_COLORS[t as PokemonType]) || NEUTRAL;

function rgba(hex: string, alpha: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Icons from https://github.com/partywhale/pokemon-type-icons — vector
 * recreations of the BDSP / Legends: Arceus / Scarlet & Violet type icons.
 * MIT License (c) 2022 James Watkins.
 */
export function TypeIcon({
  type,
  size = 14,
  className,
}: {
  type: PokemonType;
  size?: number;
  className?: string;
}) {
  const icon = TYPE_ICONS[type];
  if (!icon) return null;
  return (
    <svg
      viewBox={icon.viewBox}
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {icon.paths.map((d, i) => (
        <path key={i} d={d} fill="currentColor" />
      ))}
    </svg>
  );
}
