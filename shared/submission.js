/* Submission validation. Used by both the local mock and the production endpoint. */

export function validateSubmission(input) {
  if (!input || typeof input !== "object") return { error: "bad-body" };
  const category = String(input.category || "").trim().toUpperCase();
  const phrase   = String(input.phrase   || "").trim().toUpperCase().replace(/\s+/g, " ");
  const anchors  = Array.isArray(input.anchors) ? input.anchors : [];

  if (!/^[A-Z][A-Z &]{1,29}$/.test(category)) return { error: "bad-category", detail: "letters/spaces/&; up to 30 chars" };
  if (!/^[A-Z]+( [A-Z]+){1,9}$/.test(phrase)) return { error: "bad-phrase", detail: "letters and single spaces only; 2–10 words" };

  const words = phrase.split(" ");
  if (words.some(w => w.length < 2 || w.length > 10)) return { error: "bad-word-length", detail: "each word 2–10 letters" };
  if (phrase.replace(/ /g, "").length > 36) return { error: "phrase-too-long", detail: "max 36 letters total" };

  for (const a of anchors) {
    if (typeof a?.wi !== "number" || typeof a?.li !== "number") return { error: "bad-anchor" };
    if (a.wi < 0 || a.wi >= words.length) return { error: "bad-anchor-wi" };
    if (a.li < 0 || a.li >= words[a.wi].length) return { error: "bad-anchor-li" };
  }
  const seen = new Set();
  const cleanAnchors = [];
  for (const a of anchors) {
    const k = `${a.wi}:${a.li}`;
    if (seen.has(k)) continue;
    seen.add(k); cleanAnchors.push({ wi: a.wi, li: a.li });
  }
  if (cleanAnchors.length > Math.max(2, words.length)) return { error: "too-many-anchors" };

  return { normalized: { category, phrase, anchors: cleanAnchors } };
}
