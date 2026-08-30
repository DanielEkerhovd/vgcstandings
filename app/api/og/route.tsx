import { ImageResponse } from "next/og";
import { eventSnapshot, findPlayer, ordinal, progressLine, recordOf } from "@/lib/summary";

/**
 * The link-preview card: 1200x630, which is what Facebook, X, Discord, Slack
 * and iMessage all want. One image serves every share, so it has to say what
 * the link is *about* — the event, the round, who's winning — rather than
 * being a logo. A pasted link is the most common way anyone will meet this
 * site, and a bare URL converts far worse than a card with a scoreline on it.
 *
 * Rendered per request and cached at the edge for a minute, because "Round 8
 * of 11" stops being true.
 */

export const runtime = "nodejs";

const INK = "#241F1C";
const PAPER = "#EFF0E9";
const GOLD = "#F0C43C";
const MUTED = "#9A938A";
const CARD = "#2E2823";

/** The favicon, redrawn in divs — satori has no <svg> path support worth using. */
function Mark() {
  const cells = [0, 1, 2, 3, 4, 5];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", width: 46, height: 30, gap: 3 }}>
      {cells.map((i) => (
        <div
          key={i}
          style={{
            width: 13,
            height: 13,
            borderRadius: 3,
            background: i === 0 ? GOLD : PAPER,
            opacity: i === 0 ? 1 : 0.9,
          }}
        />
      ))}
    </div>
  );
}

function Chip({ text, tone }: { text: string; tone: "gold" | "quiet" }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 18px",
        borderRadius: 999,
        fontSize: 22,
        letterSpacing: 2,
        background: tone === "gold" ? GOLD : "transparent",
        color: tone === "gold" ? INK : MUTED,
        border: tone === "gold" ? "none" : `2px solid ${CARD}`,
      }}
    >
      {text}
    </div>
  );
}

function Row({
  place,
  name,
  country,
  record,
  points,
  lead,
}: {
  place: number;
  name: string;
  country: string | null;
  record: string;
  points: number;
  lead: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 22,
        padding: "16px 26px",
        borderRadius: 999,
        background: lead ? GOLD : CARD,
        color: lead ? INK : PAPER,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 46,
          height: 46,
          borderRadius: 999,
          background: lead ? "rgba(0,0,0,0.16)" : "transparent",
          border: lead ? "none" : `2px solid #4A423A`,
          fontSize: 24,
        }}
      >
        {place}
      </div>
      <div style={{ display: "flex", flex: 1, fontSize: 34, letterSpacing: -0.5 }}>
        {name}
        {country ? (
          <span style={{ fontSize: 22, opacity: 0.6, marginLeft: 12, paddingTop: 8 }}>
            {country}
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", fontSize: 30, opacity: lead ? 0.85 : 0.75 }}>{record}</div>
      <div style={{ display: "flex", fontSize: 30, width: 70, justifyContent: "flex-end" }}>
        {points}
      </div>
    </div>
  );
}

function Shell({ children, foot }: { children: React.ReactNode; foot: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: INK,
        color: PAPER,
        padding: "54px 60px",
        fontFamily: "sans-serif",
      }}
    >
      {children}
      <div style={{ display: "flex", alignItems: "center", gap: 16, color: MUTED, fontSize: 24 }}>
        <Mark />
        <div style={{ display: "flex", color: PAPER, letterSpacing: 1 }}>vgcstandings.com</div>
        <div style={{ display: "flex" }}>· {foot}</div>
      </div>
    </div>
  );
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const snap = await eventSnapshot(q.get("tid") ?? undefined, q.get("division") ?? undefined);

  // Nothing readable upstream: a plain branded card beats a wrong scoreline,
  // because the platforms cache whatever they get for days.
  if (!snap) {
    return new ImageResponse(
      (
        <Shell foot="live Pokémon VGC standings">
          <div style={{ display: "flex" }}>
            <Chip text="STANDINGS · TEAMS · USAGE" tone="gold" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, marginBottom: 40 }}>
            <div style={{ display: "flex", fontSize: 76, letterSpacing: -2 }}>VGC Standings</div>
            <div style={{ display: "flex", fontSize: 34, color: MUTED, maxWidth: 900 }}>
              Live standings, teams and usage from every Pokémon VGC regional,
              international and World Championship.
            </div>
          </div>
        </Shell>
      ),
      { width: 1200, height: 630 },
    );
  }

  const player = findPlayer(snap, q.get("player"));
  const division = snap.division[0].toUpperCase() + snap.division.slice(1);
  const foot = `${division}${snap.dates ? ` · ${snap.dates}` : ""}`;

  // A player link is about the player, so they get the headline and the event
  // drops to the subtitle. An event link is the other way round.
  const headline = player ? player.display : snap.label;
  const size = headline.length > 34 ? 54 : headline.length > 24 ? 64 : 76;
  const sub = player
    ? [
        `${ordinal(player.placing)}${snap.players ? ` of ${snap.players}` : ""}`,
        recordOf(player),
        `${player.points} pts`,
        snap.label,
      ].join("  ·  ")
    : progressLine(snap) || snap.dates || "";

  return new ImageResponse(
    (
      <Shell foot={foot}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Chip text={snap.tier.toUpperCase()} tone="gold" />
          <Chip text={snap.finished ? "FINAL" : "LIVE"} tone="quiet" />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: -6 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 18 }}>
            <div style={{ display: "flex", fontSize: size, letterSpacing: -2 }}>{headline}</div>
            {player?.country ? (
              <div style={{ display: "flex", fontSize: 30, color: MUTED, paddingBottom: 12 }}>
                {player.country}
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", fontSize: 32, color: MUTED }}>{sub}</div>
        </div>

        {player ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", fontSize: 22, color: MUTED, letterSpacing: 2 }}>
              {player.hasTeam ? "TEAM" : ""}
            </div>
            <div style={{ display: "flex", fontSize: 30, color: PAPER, lineHeight: 1.35 }}>
              {player.hasTeam
                ? player.team.map((m) => m.name).join("  ·  ")
                : "Team list not public"}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {snap.standings.slice(0, 3).map((p) => (
              <Row
                key={p.name}
                place={p.placing}
                name={p.display}
                country={p.country}
                record={recordOf(p)}
                points={p.points}
                lead={p.placing === 1}
              />
            ))}
          </div>
        )}
      </Shell>
    ),
    {
      width: 1200,
      height: 630,
      headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" },
    },
  );
}
