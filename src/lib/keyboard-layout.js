/* The play keyboard's layout — letters only.

   @basenative/keyboard's stock qwerty carries ENT and ⌫, which are
   Wordle's keys: you type a word, edit it, submit it. Tabs has no word
   to edit. A tap on a letter IS the move (it turns that letter over,
   everywhere, at once — or costs a life), and solving happens in its own
   sheet with the phone's real keyboard. Two dead keys on the most-used
   surface of the game read as "something here isn't wired", which is
   exactly what the owner reported. So: three rows of letters, nothing
   else. The physical Enter key still opens Solve (src/views/play.js). */

import { defineLayout, renderKeyboard } from "@basenative/keyboard";

export const LETTER_LAYOUT = defineLayout([
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
], { name: "letters" });

/* SSR-safe markup for the same keyboard the client hydrates, so the
   first paint already shows the letters instead of an empty box under
   the board. The id is pinned so the server and client emit one
   document, not two ids for one region. */
export function renderPlayKeyboard() {
  return renderKeyboard({
    id: "play-kb",
    layout: LETTER_LAYOUT,
    label: "Letters",
    disabled: true,
  });
}
