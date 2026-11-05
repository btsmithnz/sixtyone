/**
 * Presentation metadata for parties, keyed by the feed's p_no (stable
 * across elections; abbreviations are not unique, see the feed docs).
 *
 * `color` is the party's own colour. `ink` is a text colour readable on top of
 * it. `dark` overrides the colour in dark mode when the brand colour would
 * vanish (NZ First's black).
 */
export type PartyStyle = {
  short: string;
  color: string;
  ink: string;
  dark?: string;
};

export const PARTY_STYLES: Record<number, PartyStyle> = {
  16: { short: "National", color: "#0A58CA", ink: "#fff" },
  13: { short: "Labour", color: "#E0312B", ink: "#fff" },
  10: { short: "Green", color: "#16A34A", ink: "#fff" },
  5: { short: "ACT", color: "#FFD60A", ink: "#1b1a3a" },
  17: { short: "NZ First", color: "#26263A", ink: "#fff", dark: "#C9C8E0" },
  14: { short: "Te Pāti Māori", color: "#9F1239", ink: "#fff" },
  24: { short: "Opportunity", color: "#14B8A6", ink: "#062b27" },
  34: { short: "Conservative", color: "#38BDF8", ink: "#082f49" },
  70: { short: "NZ Loyal", color: "#F97316", ink: "#fff" },
  20: { short: "Outdoors & Freedom", color: "#65A30D", ink: "#fff" },
  36: { short: "Legalise Cannabis", color: "#84CC16", ink: "#1a2e05" },
  66: { short: "Vision NZ", color: "#64748B", ink: "#fff" },
  52: { short: "Animal Justice", color: "#DB2777", ink: "#fff" },
  56: { short: "Women’s Rights", color: "#A855F7", ink: "#fff" },
  68: { short: "Alliance", color: "#D97706", ink: "#fff" },
  69: { short: "Free Palestine", color: "#047857", ink: "#fff" },
  71: { short: "Te Tai Tokerau Party", color: "#B45309", ink: "#fff" },
};

const FALLBACK: PartyStyle = { short: "", color: "#9A98B8", ink: "#fff" };
export const INDEPENDENT: PartyStyle = {
  short: "Independent",
  color: "#9A98B8",
  ink: "#fff",
};

export function partyStyle(pNo: number | null | undefined, name?: string) {
  if (!pNo) return INDEPENDENT;
  const s = PARTY_STYLES[pNo];
  return s ?? { ...FALLBACK, short: name ?? FALLBACK.short };
}

/** CSS colour that respects dark mode, via a custom property set in globals.css. */
export const partyColorVar = (pNo: number | null | undefined) =>
  pNo ? `var(--party-${pNo}, ${partyStyle(pNo).color})` : "var(--party-0)";

/** Text colour on top of a party colour, dark-mode aware. */
export const partyInkVar = (pNo: number | null | undefined) =>
  pNo ? `var(--party-ink-${pNo}, ${partyStyle(pNo).ink})` : "#fff";

/** The usual coalition blocs, used as the default in the race to 61. */
export const DEFAULT_BLOCS = {
  right: [16, 5, 17], // National, ACT, NZ First
  left: [13, 10, 14], // Labour, Green, Te Pāti Māori
};

/**
 * Seats per bloc using the default blocs, for share images and page
 * descriptions. A bloc is named after its largest party ("National-led").
 */
export function blocSeats<T extends { pNo: number; totalSeats: number }>(
  parties: T[],
) {
  const seated = parties
    .filter((p) => p.totalSeats > 0)
    .sort((a, b) => b.totalSeats - a.totalSeats);
  const bloc = (members: T[], fallback: string) => ({
    name: members[0] ? `${partyStyle(members[0].pNo).short}-led` : fallback,
    seats: members.reduce((n, p) => n + p.totalSeats, 0),
    parties: members,
  });
  const inBloc = (ids: number[]) => seated.filter((p) => ids.includes(p.pNo));
  return {
    left: bloc(inBloc(DEFAULT_BLOCS.left), "Labour-led"),
    right: bloc(inBloc(DEFAULT_BLOCS.right), "National-led"),
    cross: bloc(
      seated.filter(
        (p) =>
          !DEFAULT_BLOCS.left.includes(p.pNo) &&
          !DEFAULT_BLOCS.right.includes(p.pNo),
      ),
      "Crossbench",
    ),
  };
}

/**
 * "SWARBRICK, Chlöe" → "Chlöe Swarbrick", "MacLEOD, David" → "David MacLeod",
 * "van DONGEN, Yvonne" → "Yvonne van Dongen".
 */
export function displayCandidateName(feedName: string) {
  const [surname, given] = feedName.split(",").map((s) => s.trim());
  if (!given) return surnameCase(surname);
  return `${given} ${surnameCase(surname)}`;
}

/**
 * The feed upper-cases surnames but keeps any lowercase prefix as written
 * ("MacLEOD", "McANULTY", "van DONGEN"). So keep that prefix and title-case
 * only the trailing capitals of each part (split on spaces, hyphens and
 * apostrophes, so "O'BRIEN" becomes "O'Brien").
 */
function surnameCase(s: string) {
  return s
    .split(/([\s'’-])/)
    .map((part) => {
      const m = part.match(/^(.*?)(\p{Lu}[\p{Lu}\p{M}]*)$/u);
      if (!m) return part;
      const [, prefix, caps] = m;
      return prefix + caps[0] + caps.slice(1).toLowerCase();
    })
    .join("");
}
