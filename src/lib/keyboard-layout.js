/* The play keyboard: QWERTY with ENTER and ⌫, because this is a game you
   type words into — a letter goes into the active word's next open tile,
   backspace takes it out, ENTER submits the word. (A letters-only layout
   shipped briefly with the reveal-a-letter experiment and was rejected
   with it.) */

import { renderKeyboard } from "@basenative/keyboard";

export const PLAY_LAYOUT = "qwerty";

/* SSR-safe markup for the same keyboard the client hydrates, so the first
   paint already shows the keys. The id is pinned so server and client emit
   one document. Disabled until hydration wires it. */
export function renderPlayKeyboard() {
  return renderKeyboard({
    id: "play-kb",
    layout: PLAY_LAYOUT,
    primary: "ENTER",
    label: "On-screen keyboard",
    disabled: true,
  });
}
