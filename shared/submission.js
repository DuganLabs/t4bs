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
  cleanAnchors.sort((x, y) => x.wi - y.wi || x.li - y.li);
  if (cleanAnchors.length > maxAnchors(words)) return { error: "too-many-anchors" };
  /* Anchors are the documented on-ramp ("a few free anchor letters" —
     README + PRD §4). Shipping a phrase with none is what produced ten
     house puzzles that start from a blank grid against a shared pool of
     four lives, so the minimum is now enforced rather than implied. */
  if (cleanAnchors.length < 1) {
    return { error: "needs-anchor", detail: "reveal at least one starting letter" };
  }
  /* A phrase that starts fully revealed isn't a puzzle. */
  if (cleanAnchors.length >= phrase.replace(/ /g, "").length) {
    return { error: "too-many-anchors", detail: "leave something to solve" };
  }

  return { normalized: { category, phrase, anchors: cleanAnchors } };
}

/** Upper bound on anchors for a phrase's word list. */
export function maxAnchors(words) {
  return Math.max(2, words.length);
}

/**
 * A sensible default anchor set for a phrase — one letter inside the
 * longest word, plus one in the word furthest from it. Used to
 * pre-populate the submission form's anchor picker so every submitted
 * puzzle ships with a bootstrap by default, and by nothing on the
 * authoritative path (the validator above is the only gate).
 *
 * @param {string} phrase Normalized (upper-case, single-spaced) phrase.
 * @returns {{ wi: number, li: number }[]}
 */
export function suggestAnchors(phrase) {
  const words = String(phrase || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const byLength = words
    .map((w, wi) => ({ wi, len: w.length }))
    .sort((a, b) => b.len - a.len || a.wi - b.wi);
  const first = byLength[0];
  const out = [{ wi: first.wi, li: 0 }];
  const second = byLength.find(w => w.wi !== first.wi);
  if (second && out.length < maxAnchors(words)) {
    out.push({ wi: second.wi, li: Math.min(second.len - 1, second.len > 2 ? 1 : 0) });
  }
  return out
    .filter(a => a.li >= 0 && a.li < words[a.wi].length)
    .slice(0, Math.max(1, Math.min(maxAnchors(words), phrase.replace(/ /g, "").length - 1)))
    .sort((x, y) => x.wi - y.wi || x.li - y.li);
}
