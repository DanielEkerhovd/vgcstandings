/* ------------------------------------------------------------------ *
 * The one search box, over everything a player row actually contains:
 * their name, their in-game name, where they're from, and every species
 * and item on their team.
 *
 * Built as an index rather than a per-keystroke scan: the strings are
 * lower-cased and accent-folded once per standings fetch, not once per
 * character typed across a thousand players.
 * ------------------------------------------------------------------ */

import type { Player } from "./pokedata";

/* ---------------- countries ---------------- *
 * pokedata suffixes names with a bracketed code — mostly ISO alpha-2, but
 * it sends [UK] rather than [GB], and the odd alpha-3 turns up too. Each
 * entry is [name, alpha-3, ...other things people type].
 */
const COUNTRIES: Record<string, string[]> = {
  // Europe
  AL: ["Albania", "ALB"],
  AD: ["Andorra", "AND"],
  AT: ["Austria", "AUT", "osterreich"],
  BY: ["Belarus", "BLR"],
  BE: ["Belgium", "BEL", "belgie", "belgique"],
  BA: ["Bosnia and Herzegovina", "BIH", "bosnia"],
  BG: ["Bulgaria", "BGR"],
  HR: ["Croatia", "HRV", "hrvatska"],
  CY: ["Cyprus", "CYP"],
  CZ: ["Czechia", "CZE", "czech republic"],
  DK: ["Denmark", "DNK", "danmark"],
  EE: ["Estonia", "EST"],
  FI: ["Finland", "FIN", "suomi"],
  FR: ["France", "FRA"],
  DE: ["Germany", "DEU", "ger", "deutschland"],
  GR: ["Greece", "GRC", "hellas"],
  HU: ["Hungary", "HUN", "magyarorszag"],
  IS: ["Iceland", "ISL", "island"],
  IE: ["Ireland", "IRL", "eire"],
  IT: ["Italy", "ITA", "italia"],
  LV: ["Latvia", "LVA"],
  LI: ["Liechtenstein", "LIE"],
  LT: ["Lithuania", "LTU"],
  LU: ["Luxembourg", "LUX"],
  MT: ["Malta", "MLT"],
  MD: ["Moldova", "MDA"],
  MC: ["Monaco", "MCO"],
  ME: ["Montenegro", "MNE"],
  NL: ["Netherlands", "NLD", "holland", "nederland"],
  MK: ["North Macedonia", "MKD", "macedonia"],
  NO: ["Norway", "NOR", "norge"],
  PL: ["Poland", "POL", "polska"],
  PT: ["Portugal", "PRT"],
  RO: ["Romania", "ROU"],
  RS: ["Serbia", "SRB"],
  SK: ["Slovakia", "SVK"],
  SI: ["Slovenia", "SVN"],
  ES: ["Spain", "ESP", "espana"],
  SE: ["Sweden", "SWE", "sverige"],
  CH: ["Switzerland", "CHE", "schweiz", "suisse"],
  TR: ["Turkey", "TUR", "turkiye"],
  UA: ["Ukraine", "UKR"],
  RU: ["Russia", "RUS"],
  GB: ["United Kingdom", "GBR", "uk", "britain", "great britain", "england", "scotland", "wales"],
  // pokedata's own spelling of the same place — kept as a real entry so the
  // code shown in the row and the code you can type both resolve.
  UK: ["United Kingdom", "GBR", "gb", "britain", "great britain", "england", "scotland", "wales"],

  // Americas
  US: ["United States", "USA", "america", "united states of america"],
  CA: ["Canada", "CAN"],
  MX: ["Mexico", "MEX"],
  AR: ["Argentina", "ARG"],
  BO: ["Bolivia", "BOL"],
  BR: ["Brazil", "BRA", "brasil"],
  CL: ["Chile", "CHL"],
  CO: ["Colombia", "COL"],
  CR: ["Costa Rica", "CRI"],
  CU: ["Cuba", "CUB"],
  DO: ["Dominican Republic", "DOM"],
  EC: ["Ecuador", "ECU"],
  SV: ["El Salvador", "SLV"],
  GT: ["Guatemala", "GTM"],
  HN: ["Honduras", "HND"],
  JM: ["Jamaica", "JAM"],
  NI: ["Nicaragua", "NIC"],
  PA: ["Panama", "PAN"],
  PY: ["Paraguay", "PRY"],
  PE: ["Peru", "PER"],
  PR: ["Puerto Rico", "PRI"],
  TT: ["Trinidad and Tobago", "TTO"],
  UY: ["Uruguay", "URY"],
  VE: ["Venezuela", "VEN"],

  // Asia-Pacific
  AU: ["Australia", "AUS"],
  NZ: ["New Zealand", "NZL"],
  JP: ["Japan", "JPN", "nippon"],
  KR: ["South Korea", "KOR", "korea"],
  CN: ["China", "CHN"],
  HK: ["Hong Kong", "HKG"],
  TW: ["Taiwan", "TWN"],
  MO: ["Macau", "MAC", "macao"],
  SG: ["Singapore", "SGP"],
  MY: ["Malaysia", "MYS"],
  TH: ["Thailand", "THA"],
  PH: ["Philippines", "PHL"],
  ID: ["Indonesia", "IDN"],
  VN: ["Vietnam", "VNM"],
  IN: ["India", "IND"],
  PK: ["Pakistan", "PAK"],
  BD: ["Bangladesh", "BGD"],
  LK: ["Sri Lanka", "LKA"],
  MN: ["Mongolia", "MNG"],
  KZ: ["Kazakhstan", "KAZ"],

  // Middle East & Africa
  IL: ["Israel", "ISR"],
  AE: ["United Arab Emirates", "ARE", "uae", "dubai"],
  SA: ["Saudi Arabia", "SAU"],
  QA: ["Qatar", "QAT"],
  KW: ["Kuwait", "KWT"],
  BH: ["Bahrain", "BHR"],
  OM: ["Oman", "OMN"],
  JO: ["Jordan", "JOR"],
  LB: ["Lebanon", "LBN"],
  EG: ["Egypt", "EGY"],
  MA: ["Morocco", "MAR"],
  TN: ["Tunisia", "TUN"],
  DZ: ["Algeria", "DZA"],
  ZA: ["South Africa", "ZAF"],
  NG: ["Nigeria", "NGA"],
  KE: ["Kenya", "KEN"],
  GH: ["Ghana", "GHA"],
};

/** Every alternate spelling, pointing back at the code it belongs to, so a
 *  three-letter code in the feed still finds its country. */
const BY_ALIAS = new Map<string, string>();
for (const [code, terms] of Object.entries(COUNTRIES)) {
  BY_ALIAS.set(code.toLowerCase(), code);
  for (const t of terms) if (!BY_ALIAS.has(t.toLowerCase())) BY_ALIAS.set(t.toLowerCase(), code);
}

const resolveCode = (code: string) => BY_ALIAS.get(code.trim().toLowerCase()) ?? null;

/** "NO" → "Norway". Null for codes we don't carry — the code still shows. */
export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  const key = resolveCode(code);
  return key ? COUNTRIES[key][0] : null;
}

/* ---------------- the index ---------------- */

/** Lower-case and strip combining marks, so "Nicolas" finds "Nicolás". */
const fold = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();

/** One searchable string off a player: their name, their IGN, a spelling of
 *  their country, or a species or item from one team slot. */
interface Field {
  text: string;
  /** Country codes match whole-token only — otherwise "no" hits every
   *  Nomura and Antonio in the room. */
  exact?: boolean;
  /** Which team slot this came from, for the two team-side kinds. */
  slot?: number;
}

export interface SearchEntry {
  player: Player;
  fields: Field[];
}

export interface SearchHit {
  player: Player;
  /** Team slots that matched — the only part of a row that can't say for
   *  itself why it's in the list, so it's the only part that gets marked. */
  slots: Set<number>;
}

export function buildSearchIndex(players: Player[]): SearchEntry[] {
  return players.map((p) => {
    const fields: Field[] = [{ text: fold(p.display) }];

    if (p.trainerName) fields.push({ text: fold(p.trainerName) });

    if (p.country) {
      fields.push({ text: fold(p.country), exact: true });
      const key = resolveCode(p.country);
      if (key) {
        // The canonical name matches on substring ("nor" → Norway); the codes
        // and short aliases stay whole-token for the same reason as above.
        for (const [i, term] of COUNTRIES[key].entries()) {
          fields.push({ text: fold(term), exact: i > 0 && term.length <= 3 });
        }
      }
    }

    p.team.forEach((m, slot) => {
      fields.push({ text: fold(m.name), slot });
      if (m.item) fields.push({ text: fold(m.item), slot });
    });

    return { player: p, fields };
  });
}

const matches = (f: Field, term: string) =>
  f.exact ? f.text === term : f.text.includes(term);

/**
 * Tokens are ANDed, so "wolfey miraidon" narrows across fields, while the
 * untokenised query is tried first so "focus sash" reads as the one item
 * rather than two loose words.
 */
export function searchPlayers(index: SearchEntry[], query: string): SearchHit[] {
  const q = fold(query);
  if (!q) return index.map((e) => ({ player: e.player, slots: new Set<number>() }));

  const tokens = q.split(/\s+/).filter(Boolean);
  const hits: SearchHit[] = [];

  for (const entry of index) {
    let hit = entry.fields.filter((f) => matches(f, q));

    if (!hit.length && tokens.length > 1) {
      const perToken = tokens.map((t) => entry.fields.filter((f) => matches(f, t)));
      if (perToken.every((m) => m.length)) hit = perToken.flat();
    }
    if (!hit.length) continue;

    const slots = new Set<number>();
    for (const f of hit) if (f.slot !== undefined) slots.add(f.slot);
    hits.push({ player: entry.player, slots });
  }

  return hits;
}
