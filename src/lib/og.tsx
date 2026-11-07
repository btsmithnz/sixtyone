import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import { formatInt, formatPct, formatTime } from "./format";
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
/** `fill` is the share of voting places counted: each seat fills up with it. */
function Strip({ ticks, fill }: { ticks: (string | null)[]; fill: number }) {
  return (
    <div style={{ display: "flex", position: "relative", height: 74 }}>
      <div style={{ display: "flex", width: "100%", height: "100%", gap: 2 }}>
        {ticks.map((color, i) =>
          color ? (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: seats are positional
              key={i}
              style={{
                display: "flex",
                position: "relative",
                flex: 1,
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: color,
                  opacity: 0.28,
                }}
              />
              <div
                style={{
                  display: "flex",
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: `${fill}%`,
                  background: color,
                }}
              />
            </div>
          ) : (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: seats are positional
              key={i}
              style={{
                display: "flex",
                flex: 1,
                borderRadius: 3,
                backgroundImage: HATCH,
              }}
            />
          ),
        )}
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
        <Strip ticks={ticks} fill={Math.min(100, Math.max(0, counted))} />
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
