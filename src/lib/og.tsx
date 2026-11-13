import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import type { BoothPlace, BoothResults } from "./booths";
import { formatInt, formatPct, formatTime } from "./format";
import type { LeavingMp } from "./parliament";
import { blocSeats, displayCandidateName, partyStyle } from "./parties";
import type { ElectorateDetail, Overview } from "./results";
import { majorityOf } from "./seats";
import { OG_SIZE, SITE_URL } from "./site";

/*
 * Share images (1200×630), rendered with next/og. Satori only does flexbox,
 * needs TTF/OTF fonts and can't read CSS variables, so the brand tokens are
 * repeated here as literals (light theme).
 */

const INK = "#1b1a3a";
const PAPER = "#f3f2ff";
const VIOLET = "#5b3df5";
const MUTED = "#5d5b80";
const SOFT = "#e7e5ff";
const HATCH =
  "repeating-linear-gradient(-45deg, #d8d6ef 0px, #d8d6ef 4px, #ffffff 4px, #ffffff 9px)";

const fontDir = join(process.cwd(), "assets/fonts");
const fonts = Promise.all([
  readFile(join(fontDir, "BricolageGrotesque-ExtraBold-Condensed.ttf")),
  readFile(join(fontDir, "SchibstedGrotesk-Medium.ttf")),
  readFile(join(fontDir, "SchibstedGrotesk-Bold.ttf")),
]).then(([display, body, bodyBold]) => [
  {
    name: "Display",
    data: display,
    weight: 800 as const,
    style: "normal" as const,
  },
  { name: "Body", data: body, weight: 500 as const, style: "normal" as const },
  {
    name: "Body",
    data: bodyBold,
    weight: 700 as const,
    style: "normal" as const,
  },
]);

const host = new URL(SITE_URL).host;

async function render(body: ReactNode) {
  const image = new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: PAPER,
        padding: 44,
        fontFamily: "Body",
        color: INK,
      }}
    >
      <Header />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          marginTop: 24,
          padding: "34px 40px",
          background: "#ffffff",
          border: `4px solid ${INK}`,
          borderRadius: 32,
          boxShadow: `8px 8px 0 ${INK}`,
        }}
      >
        {body}
      </div>
    </div>,
    { ...OG_SIZE, fonts: await fonts },
  );
  // The image routes are prerendered and revalidated with the results, like
  // the pages. Drop ImageResponse's own Cache-Control so Next sends the same
  // ISR header as the pages (a header set here would override it).
  image.headers.delete("cache-control");
  return image;
}

function Header() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 66,
            height: 66,
            background: VIOLET,
            color: "#fff",
            border: `4px solid ${INK}`,
            borderRadius: 16,
            boxShadow: `4px 4px 0 ${INK}`,
            transform: "rotate(-6deg)",
            fontFamily: "Display",
            fontSize: 38,
          }}
        >
          61
        </div>
        <div style={{ display: "flex", fontFamily: "Display", fontSize: 40 }}>
          SixtyOne
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 24, color: MUTED }}>
        NZ election 2026, live results
      </div>
    </div>
  );
}

/** The seat strip, with one finish line in the middle (see RaceTo61). */
function Strip({ ticks }: { ticks: (string | null)[] }) {
  return (
    <div style={{ display: "flex", position: "relative", height: 74 }}>
      <div style={{ display: "flex", width: "100%", height: "100%", gap: 2 }}>
        {ticks.map((color, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: seats are positional
            key={i}
            style={{
              display: "flex",
              flex: 1,
              borderRadius: 3,
              ...(color ? { background: color } : { backgroundImage: HATCH }),
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: -10,
          bottom: -10,
          left: "50%",
          width: 6,
          marginLeft: -3,
          background: INK,
          borderRadius: 3,
        }}
      />
    </div>
  );
}

/** Home page share image: the race to 61 as it stands. */
export async function raceImage(overview: Overview) {
  const { parties, houseSize, stats, updatedAt } = overview;
  const majority = majorityOf(houseSize);
  const blocs = blocSeats(parties);
  const counted = stats?.percentCounted ?? 0;
  const hasSeats = blocs.left.seats + blocs.right.seats + blocs.cross.seats > 0;

  const ticks: (string | null)[] = [];
  const push = (list: { pNo: number; totalSeats: number }[]) => {
    for (const p of list)
      for (let i = 0; i < p.totalSeats; i++)
        ticks.push(partyStyle(p.pNo).color);
  };
  push(blocs.left.parties);
  const used = blocs.left.seats + blocs.right.seats + blocs.cross.seats;
  for (let i = 0; i < houseSize - used; i++) ticks.push(null);
  push([...blocs.cross.parties].reverse());
  push([...blocs.right.parties].reverse());

  // Same rule as the page: "over the line" only once the count is done.
  const ahead =
    blocs.left.seats >= majority
      ? "left"
      : blocs.right.seats >= majority
        ? "right"
        : null;
  const stateOf = (side: "left" | "right") =>
    ahead === side ? (counted >= 100 ? "won" : "ahead") : null;
  const top = parties.filter((p) => p.percent > 0).slice(0, 5);

  return render(
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div
        style={{
          display: "flex",
          fontFamily: "Display",
          fontSize: 62,
          lineHeight: 1,
        }}
      >
        {`Who’s getting to ${majority}?`}
      </div>

      {hasSeats ? (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginTop: 18,
          }}
        >
          <BlocTotal
            name={blocs.left.name}
            seats={blocs.left.seats}
            state={stateOf("left")}
          />
          <BlocTotal
            name={blocs.right.name}
            seats={blocs.right.seats}
            state={stateOf("right")}
            align="right"
          />
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            marginTop: 22,
            marginBottom: 26,
            fontSize: 32,
            color: MUTED,
          }}
        >
          Live results from 7pm, Saturday 7 November
        </div>
      )}

      <div style={{ display: "flex", marginTop: 14, marginBottom: 22 }}>
        <Strip ticks={ticks} />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "auto",
        }}
      >
        {top.length ? (
          <div style={{ display: "flex", gap: 22 }}>
            {top.map((p) => (
              <div
                key={p.pNo}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 24,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    background: partyStyle(p.pNo).color,
                  }}
                />
                <div style={{ display: "flex", fontWeight: 700 }}>
                  {partyStyle(p.pNo, p.name).short}
                </div>
                <div style={{ display: "flex", color: MUTED }}>
                  {formatPct(p.percent)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 26, color: MUTED }}>
            The race to a majority, every electorate, and how the count unfolds
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 10,
          fontSize: 24,
          color: MUTED,
        }}
      >
        <div style={{ display: "flex" }}>
          {counted > 0 && updatedAt
            ? `${formatPct(counted)} of voting places counted, updated ${formatTime(updatedAt)}`
            : ""}
        </div>
        <div style={{ display: "flex" }}>{host}</div>
      </div>
    </div>,
  );
}

function BlocTotal({
  name,
  seats,
  state,
  align = "left",
}: {
  name: string;
  seats: number;
  state: "won" | "ahead" | null;
  align?: "left" | "right";
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: align === "right" ? "flex-end" : "flex-start",
      }}
    >
      <div style={{ display: "flex", fontSize: 26, color: MUTED }}>{name}</div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexDirection: align === "right" ? "row-reverse" : "row",
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "Display",
            fontSize: 96,
            lineHeight: 1,
          }}
        >
          {String(seats)}
        </div>
        {state === "won" ? (
          <div
            style={{
              display: "flex",
              padding: "6px 16px",
              background: "#ffd60a",
              border: `3px solid ${INK}`,
              borderRadius: 999,
              boxShadow: `3px 3px 0 ${INK}`,
              transform: "rotate(-3deg)",
              fontFamily: "Display",
              fontSize: 26,
            }}
          >
            Over the line!
          </div>
        ) : state === "ahead" ? (
          <div
            style={{
              display: "flex",
              padding: "6px 16px",
              border: `3px dashed ${MUTED}`,
              borderRadius: 999,
              color: MUTED,
              fontFamily: "Display",
              fontSize: 26,
            }}
          >
            Enough so far
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Electorate share image: the candidate race. */
export async function electorateImage(
  name: string,
  eNo: number,
  detail: ElectorateDetail | null,
) {
  const summary = detail?.summary;
  const hasVotes = !!summary && summary.votesCast > 0;
  const candidates = hasVotes ? summary.candidates.slice(0, 3) : [];
  const max = Math.max(1, ...candidates.map((c) => c.percent));
  const lead = candidates[0];

  return render(
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "Display",
            fontSize: name.length > 18 ? 66 : 84,
            lineHeight: 0.95,
            maxWidth: 820,
          }}
        >
          {name}
        </div>
        <div
          style={{
            display: "flex",
            padding: "6px 16px",
            background: SOFT,
            border: `3px solid ${INK}`,
            borderRadius: 999,
            fontSize: 22,
            fontWeight: 700,
            transform: "rotate(-2deg)",
          }}
        >
          {eNo > 64 ? "Māori electorate" : "General electorate"}
        </div>
      </div>

      {hasVotes ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            marginTop: 28,
          }}
        >
          {candidates.map((c) => (
            <div
              key={c.cNo}
              style={{ display: "flex", flexDirection: "column", gap: 6 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 28,
                }}
              >
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ display: "flex", fontWeight: 700 }}>
                    {displayCandidateName(c.name)}
                  </div>
                  <div style={{ display: "flex", color: MUTED }}>
                    {partyStyle(c.pNo).short}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ display: "flex", fontWeight: 700 }}>
                    {formatPct(c.percent)}
                  </div>
                  <div style={{ display: "flex", color: MUTED }}>
                    {formatInt(c.votes)}
                  </div>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  height: 16,
                  background: SOFT,
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: `${(c.percent / max) * 100}%`,
                    background: partyStyle(c.pNo).color,
                    borderRadius: 8,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            marginTop: 40,
            padding: "28px 30px",
            backgroundImage: HATCH,
            borderRadius: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              padding: "4px 10px",
              background: "#fff",
              borderRadius: 8,
              fontSize: 30,
              color: MUTED,
            }}
          >
            No results yet. Live from 7pm, Saturday 7 November.
          </div>
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "auto",
          fontSize: 24,
          color: MUTED,
        }}
      >
        <div style={{ display: "flex" }}>
          {hasVotes && lead && summary
            ? `${displayCandidateName(lead.name)} ${summary.complete ? "won" : "ahead"} by ${formatInt(summary.margin ?? 0)} votes, ${formatPct(summary.percentCounted, 0)} counted`
            : "Candidates, votes and how the count unfolds"}
        </div>
        <div style={{ display: "flex" }}>{host}</div>
      </div>
    </div>,
  );
}

/* ------------------------------------------------------------------ */
/* Section share images: one section of a page, for its share page     */
/* (/party-vote, /nail-biters, /parliament/whos-out,                   */
/* /electorates/[slug]/party-vote and each voting place).              */
/* ------------------------------------------------------------------ */

/** A card's title, with an optional line under it. */
function Title({ children, sub }: { children: string; sub?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          fontFamily: "Display",
          fontSize: children.length > 28 ? 50 : 56,
          lineHeight: 1,
        }}
      >
        {children}
      </div>
      {sub ? (
        <div
          style={{ display: "flex", marginTop: 6, fontSize: 24, color: MUTED }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
}

/** The bottom line: what's counted, and the site. */
function Footer({ children }: { children?: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginTop: "auto",
        fontSize: 24,
        color: MUTED,
      }}
    >
      <div style={{ display: "flex" }}>{children ?? ""}</div>
      <div style={{ display: "flex" }}>{host}</div>
    </div>
  );
}

function Dot({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <div
      style={{
        display: "flex",
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: size / 2,
        background: color,
      }}
    />
  );
}

/** No results to show yet, on the hatched "not counted" background. */
function Empty({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        marginTop: 36,
        padding: "28px 30px",
        backgroundImage: HATCH,
        borderRadius: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          padding: "4px 10px",
          background: "#fff",
          borderRadius: 8,
          fontSize: 30,
          color: MUTED,
        }}
      >
        {children}
      </div>
    </div>
  );
}

type PartyRow = { pNo: number; label: string; percent: number; note?: string };

/** Party vote bars, one row each, with the 5% threshold marked. */
function PartyRows({ rows }: { rows: PartyRow[] }) {
  const max = Math.max(35, ...rows.map((r) => r.percent));
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        marginTop: 20,
      }}
    >
      {rows.map((r) => (
        <div
          key={r.pNo}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontSize: 24,
          }}
        >
          <div style={{ display: "flex", width: 190, fontWeight: 700 }}>
            {r.label}
          </div>
          <div
            style={{
              display: "flex",
              flex: 1,
              position: "relative",
              height: 18,
              background: SOFT,
              borderRadius: 9,
            }}
          >
            <div
              style={{
                display: "flex",
                width: `${(r.percent / max) * 100}%`,
                background: partyStyle(r.pNo).color,
                borderRadius: 9,
              }}
            />
            <div
              style={{
                display: "flex",
                position: "absolute",
                top: -5,
                bottom: -5,
                left: `${(5 / max) * 100}%`,
                width: 3,
                background: MUTED,
                borderRadius: 2,
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              width: 100,
              fontWeight: 700,
            }}
          >
            {formatPct(r.percent)}
          </div>
          {r.note !== undefined ? (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                width: 120,
                fontSize: 22,
                color: MUTED,
              }}
            >
              {r.note}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

const countedLine = (percent: number, updatedAt: number | null) =>
  percent > 0 && updatedAt
    ? `${formatPct(percent)} of voting places counted, updated ${formatTime(updatedAt)}`
    : undefined;

/** /party-vote: the national party vote. */
export async function partyVoteImage({
  parties,
  stats,
  updatedAt,
  seatsSource,
}: Overview) {
  const rows = parties
    .filter((p) => p.percent >= 1 || p.totalSeats > 0)
    .slice(0, 6)
    .map((p) => ({
      pNo: p.pNo,
      label: partyStyle(p.pNo, p.name).short,
      percent: p.percent,
      note:
        seatsSource === "none"
          ? undefined
          : p.totalSeats === 1
            ? "1 seat"
            : `${p.totalSeats} seats`,
    }));
  return render(
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <Title sub="Parties need 5% or an electorate to get seats">
        Party vote
      </Title>
      {rows.length ? (
        <PartyRows rows={rows} />
      ) : (
        <Empty>No party votes counted yet.</Empty>
      )}
      <Footer>{countedLine(stats?.percentCounted ?? 0, updatedAt)}</Footer>
    </div>,
  );
}

/** /nail-biters: the three closest electorate races. */
export async function nailBitersImage({
  electorates,
  stats,
  updatedAt,
}: Overview) {
  const close = electorates
    .filter((e) => e.marginPoints !== null && e.votesCast > 0)
    .sort((a, b) => (a.marginPoints ?? 0) - (b.marginPoints ?? 0))
    .slice(0, 3);
  return render(
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <Title sub="The tightest electorate races right now">Nail-biters</Title>
      {close.length ? (
        <div style={{ display: "flex", gap: 20, marginTop: 26 }}>
          {close.map((e) => (
            <div
              key={e.eNo}
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                padding: "18px 20px",
                border: `3px solid ${INK}`,
                borderRadius: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontFamily: "Display",
                  fontSize: e.name.length > 16 ? 28 : 34,
                  lineHeight: 1,
                }}
              >
                {e.name}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  marginTop: 14,
                  marginBottom: 14,
                }}
              >
                {e.candidates.slice(0, 2).map((c) => (
                  <div
                    key={c.cNo}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 22,
                    }}
                  >
                    <Dot color={partyStyle(c.pNo).color} size={14} />
                    {/* The dot gives the party: names alone fill the line. */}
                    <div
                      style={{
                        display: "block",
                        flex: 1,
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {displayCandidateName(c.name)}
                    </div>
                    <div style={{ display: "flex", color: MUTED }}>
                      {formatInt(c.votes)}
                    </div>
                  </div>
                ))}
              </div>
              <div
                style={{
                  display: "flex",
                  marginTop: "auto",
                  padding: "6px 12px",
                  background: SOFT,
                  borderRadius: 10,
                  fontSize: 24,
                }}
              >
                <div style={{ display: "flex", fontWeight: 700 }}>
                  {`Just ${formatInt(e.margin ?? 0)} votes in it`}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty>Close races show up once electorates start reporting.</Empty>
      )}
      <Footer>{countedLine(stats?.percentCounted ?? 0, updatedAt)}</Footer>
    </div>,
  );
}

/** How many names fit on the who's out card. */
const OUT_NAMES = 12;

/** /parliament/whos-out: MPs who stood again and lost. */
export async function whosOutImage(
  leaving: LeavingMp[],
  { stats, updatedAt }: Overview,
) {
  const lost = leaving.filter((m) => m.reason === "lost");
  const retired = leaving.length - lost.length;
  const shown = lost.slice(0, OUT_NAMES);
  const more = lost.length - shown.length;
  const sub = [
    lost.length === 1
      ? "1 MP lost their seat"
      : `${lost.length} MPs lost their seats`,
    retired ? `${retired} didn’t stand again` : "",
  ]
    .filter(Boolean)
    .join(", ");
  return render(
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <Title sub={leaving.length ? sub : undefined}>Who’s out</Title>
      {leaving.length === 0 ? (
        <Empty>Who’s leaving shows up once results come in.</Empty>
      ) : (
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 26 }}
        >
          {shown.map((m) => (
            <div
              key={m.sortName}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 16px",
                border: `3px solid ${INK}`,
                borderRadius: 999,
                fontSize: 24,
              }}
            >
              <Dot color={partyStyle(m.pNo).color} size={16} />
              <div style={{ display: "flex", fontWeight: 700 }}>{m.name}</div>
            </div>
          ))}
          {more > 0 ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "8px 6px",
                fontSize: 24,
                color: MUTED,
              }}
            >
              {`and ${more} more`}
            </div>
          ) : null}
        </div>
      )}
      <Footer>{countedLine(stats?.percentCounted ?? 0, updatedAt)}</Footer>
    </div>,
  );
}

/** /electorates/[slug]/party-vote: how one electorate voted for parties. */
export async function electoratePartyVoteImage(
  name: string,
  detail: ElectorateDetail | null,
) {
  const rows = (detail?.partyVotes ?? [])
    .filter((p) => p.votes > 0 && p.percent >= 1)
    .slice(0, 6)
    .map((p) => ({
      pNo: p.pNo,
      label: partyStyle(p.pNo).short,
      percent: p.percent,
    }));
  const s = detail?.summary;
  return render(
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <Title
        sub={`How ${name} voted for parties`}
      >{`${name}: party vote`}</Title>
      {rows.length ? (
        <PartyRows rows={rows} />
      ) : (
        <Empty>No party votes counted here yet.</Empty>
      )}
      <Footer>
        {s && s.votesCast > 0
          ? `${formatPct(s.percentCounted, 0)} of voting places counted`
          : undefined}
      </Footer>
    </div>,
  );
}

/** One vote's top choices at a voting place, for the voting place card. */
function BoothColumn({
  title,
  lines,
}: {
  title: string;
  lines: {
    key: number;
    label: string;
    party?: string;
    pNo: number | null;
    percent: number;
  }[];
}) {
  const max = Math.max(1, ...lines.map((l) => l.percent));
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 9 }}>
      <div
        style={{ display: "flex", fontSize: 22, fontWeight: 700, color: MUTED }}
      >
        {title}
      </div>
      {lines.map((l) => (
        <div
          key={l.key}
          style={{ display: "flex", flexDirection: "column", gap: 4 }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              fontSize: 22,
            }}
          >
            <div
              style={{ display: "flex", flex: 1, gap: 8, overflow: "hidden" }}
            >
              <div style={{ display: "flex", fontWeight: 700 }}>{l.label}</div>
              {l.party ? (
                <div style={{ display: "flex", color: MUTED }}>{l.party}</div>
              ) : null}
            </div>
            <div style={{ display: "flex", fontWeight: 700 }}>
              {formatPct(l.percent)}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              height: 10,
              background: SOFT,
              borderRadius: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                width: `${(l.percent / max) * 100}%`,
                background: partyStyle(l.pNo).color,
                borderRadius: 6,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Lines shown per vote on the voting place card. */
const BOOTH_LINES = 4;

/** The top few in one vote at a place, as shares of its votes. */
function boothTop<T>(votes: number[], choices: T[]) {
  const total = votes.reduce((a, n) => a + n, 0);
  return votes
    .map((n, i) => ({ n, i, choice: choices[i] }))
    .filter((v) => v.n > 0 && v.choice)
    .sort((a, b) => b.n - a.n)
    .slice(0, BOOTH_LINES)
    .map((v) => ({ ...v, percent: total ? (v.n / total) * 100 : 0 }));
}

/** /electorates/[slug]/booths/[id]: how one voting place voted. */
export async function boothImage(
  electorate: string,
  data: BoothResults,
  place: BoothPlace,
) {
  const candidates = boothTop(place.candidate, data.candidates).map((v) => ({
    key: v.i,
    label: displayCandidateName(v.choice.name),
    party: partyStyle(v.choice.pNo).short,
    pNo: v.choice.pNo,
    percent: v.percent,
  }));
  const parties = boothTop(place.party, data.parties).map((v) => ({
    key: v.i,
    label: partyStyle(v.choice.pNo, v.choice.name).short,
    pNo: v.choice.pNo,
    percent: v.percent,
  }));
  const votes = place.party.reduce((a, n) => a + n, 0);
  const where = [place.area, `${electorate} electorate`]
    .filter(Boolean)
    .join(" · ");
  return render(
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <Title sub={where}>{place.venue}</Title>
      <div style={{ display: "flex", gap: 44, marginTop: 16 }}>
        <BoothColumn title="Candidate vote" lines={candidates} />
        <BoothColumn title="Party vote" lines={parties} />
      </div>
      <Footer>
        {`${formatInt(votes)} party votes here, ${data.stage === "official" ? "official count" : "preliminary count"}`}
      </Footer>
    </div>,
  );
}
