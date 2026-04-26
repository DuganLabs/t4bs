/* OG image render helper.

   Thin wrapper over `@basenative/og-image`. Uses the package's renderPng +
   scene helpers, but keeps t4bs's brand-specific pip layout (orange dots,
   not Wordle-style colored tiles) per ADR-style branding decision.

   Card design tokens mirror the in-app palette:
     bg     #0C0B09   fg #F0EDE4   accent #E8920A
     muted  #988570   tile #FFF3E0 / #5C2A00
*/

import { renderPng, pngHeaders, parseGrid, box, text as txt } from "@basenative/og-image";

export { renderPng, pngHeaders };

const COLORS = {
  bg:     "#0C0B09",
  fg:     "#F0EDE4",
  muted:  "#988570",
  accent: "#E8920A",
  tile:   "#FFF3E0",
  letter: "#5C2A00",
  green:  "#3F9D5B",
  empty:  "#1A1714",
};

/* Per-position pip rendering. Brand-aligned, zero Wordle palette.
   - solid:  filled brand-orange dot   (player knew this letter cold)
   - hint:   brand-orange hollow ring  (letter present, position unknown)
   - miss:   small dim dot             (letter absent at this position)
   - blank:  dim outlined ring         (position never tested)
   The result reads as a progress trail of dots, not a tile grid. */
function pipForState(state, size) {
  switch (state) {
    case "green":
      return { width: size, height: size, borderRadius: 9999, backgroundColor: COLORS.accent };
    case "yellow":
      return { width: size, height: size, borderRadius: 9999, backgroundColor: "transparent",
               border: `3px solid ${COLORS.accent}` };
    case "absent": {
      const small = Math.round(size * 0.36);
      return { width: small, height: small, borderRadius: 9999, backgroundColor: "#3A332B",
               margin: `${(size - small) / 2}px` };
    }
    case "empty":
    default:
      return { width: size, height: size, borderRadius: 9999, backgroundColor: "transparent",
               border: `2px solid #2A2521` };
  }
}

function pipGrid(rows, { dotSize = 36, rowGap = 14, pipGap = 12 } = {}) {
  return box(
    { flexDirection: "column", gap: rowGap, alignItems: "flex-start" },
    rows.map((row) =>
      box(
        { flexDirection: "row", gap: pipGap, alignItems: "center", justifyContent: "flex-start" },
        row.map((state) => box(pipForState(state, dotSize), []))
      )
    )
  );
}

export function scoreCardScene({ category, score, won, grid }) {
  const rows = parseGrid(grid || "").slice(0, 6);
  const verdictColor = won ? COLORS.green : "#E84444";
  return box(
    {
      width: 1200, height: 630,
      flexDirection: "column",
      backgroundColor: COLORS.bg,
      color: COLORS.fg,
      padding: 60,
      fontFamily: "Inter",
      justifyContent: "space-between",
    },
    [
      // Top: header + category
      box({ flexDirection: "column" }, [
        box({ flexDirection: "row", alignItems: "baseline", gap: 18 }, [
          txt({ fontSize: 84, fontWeight: 800, color: COLORS.accent, letterSpacing: -3, lineHeight: 1 }, "T4BS"),
          txt(
            { fontSize: 28, fontWeight: 700, color: verdictColor, letterSpacing: 6, textTransform: "uppercase", lineHeight: 1 },
            won ? "Solved" : "Busted"
          ),
        ]),
        txt(
          { fontSize: 36, fontWeight: 600, color: COLORS.muted, letterSpacing: 2, textTransform: "uppercase", marginTop: 14, lineHeight: 1.1, maxWidth: 1080 },
          category
        ),
      ]),

      // Middle: pip grid (left) + score (right)
      box(
        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" },
        [
          pipGrid(rows, { dotSize: 36, rowGap: 14, pipGap: 12 }),
          box({ flexDirection: "row", alignItems: "baseline", gap: 14 }, [
            txt({ fontSize: 200, fontWeight: 800, color: COLORS.fg, letterSpacing: -8, lineHeight: 1 }, String(score)),
            txt({ fontSize: 60, fontWeight: 700, color: COLORS.accent, lineHeight: 1 }, "pts"),
          ]),
        ]
      ),

      // Bottom: brand pinned right
      box({ flexDirection: "row", justifyContent: "flex-end" }, [
        txt({ fontSize: 30, fontWeight: 700, color: COLORS.muted, letterSpacing: 1, lineHeight: 1 }, "t4bs.com"),
      ]),
    ]
  );
}

export function defaultCardScene() {
  return box(
    {
      width: 1200, height: 630,
      flexDirection: "column",
      backgroundColor: COLORS.bg,
      color: COLORS.fg,
      padding: 80,
      fontFamily: "Inter",
      justifyContent: "center",
    },
    [
      txt({ fontSize: 200, fontWeight: 800, color: COLORS.accent, letterSpacing: -8 }, "T4BS"),
      txt(
        { fontSize: 56, fontWeight: 700, color: COLORS.fg, marginTop: 12, lineHeight: 1.15, maxWidth: 1040 },
        "One subject. One phrase. Stake the letters you're sure about."
      ),
      box({ flexDirection: "row", alignItems: "center", marginTop: 64, gap: 18 }, [
        ...["green","yellow","empty","green","absent","yellow"].map(state =>
          box(pipForState(state, 64), [])
        ),
      ]),
      box(
        { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: "auto" },
        [
          txt({ fontSize: 32, fontWeight: 600, color: COLORS.muted }, "Pick a category. Solve the phrase."),
          txt({ fontSize: 32, fontWeight: 700, color: COLORS.accent }, "t4bs.com"),
        ]
      ),
    ]
  );
}
