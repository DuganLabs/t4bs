/* play-board.html — the board as first painted, shared by the play view
   and the home page (where today's puzzle IS the page).

   Reads a `play` object shaped by src/bn/server/render.js shapePlay():
   category, board (rows of {letter, anchor}), lives, par, scoreIfSolved,
   wordsLabel, totalLetters, submittedBy. Everything the hydrated
   src/views/play.js draws is here in the same order with the same
   data-bn-region names, so hydration replaces like with like:

     summary   — the category on its sticky note, and the shape line
     grid      — one row per word, one tile per letter, anchors turned over
     scoreboard— lives on the left, "solve now for N" in the middle, par
     coach     — one line saying what to do next (aria-live after hydration)
     solve     — the SOLVE button, disabled until the client owns the round
     keyboard  — the letters, rendered by @basenative/keyboard, disabled
                 until hydration wires them */

import { raw } from "@basenative/runtime/shared/escape";
import { renderButton } from "@basenative/components";
import { renderPlayKeyboard } from "../../lib/keyboard-layout.js";

/* Rendered once: neither string depends on the puzzle. */
export const KEYBOARD_HTML = renderPlayKeyboard();
export const SOLVE_BUTTON_HTML = renderButton("Solve", {
  variant: "primary",
  attrs: 'data-bn-action="solve" disabled',
});

/** Context fragment the two templates both spread in. */
export const boardContext = { keyboardHtml: raw(KEYBOARD_HTML), solveButtonHtml: raw(SOLVE_BUTTON_HTML) };

export default `<header data-bn-region="play-summary">
      <p data-bn-region="play-sticky" aria-hidden="true">{{ play.category }}</p>
      <p data-bn-region="play-meta">{{ play.wordsLabel }} · {{ play.totalLetters }} letters · par {{ play.par }} · by {{ play.submittedBy }}</p>
    </header>

    <section aria-label="Phrase" data-bn-region="grid">
      <template @for="row of play.board; track $index">
        <div role="group" data-bn-region="word" :aria-label="'Word ' + ($index + 1)">
          <template @for="cell of row; track $index">
            <span role="img"
                  data-bn-region="tile"
                  :data-on="cell.letter ? '' : false"
                  :data-anchor="cell.anchor ? '' : false"
                  :aria-label="cell.letter ? cell.letter + ', position ' + ($index + 1) : 'hidden, position ' + ($index + 1)">{{ cell.letter }}</span>
          </template>
        </div>
      </template>
    </section>

    <p data-bn-region="scoreboard" role="status">
      <span data-bn-region="lives" aria-label="5 of 5 lives"><i aria-hidden="true">♥</i><i aria-hidden="true">♥</i><i aria-hidden="true">♥</i><i aria-hidden="true">♥</i><i aria-hidden="true">♥</i></span>
      <span data-bn-region="now"><small>Solve now for</small><strong>{{ play.scoreIfSolved }}</strong></span>
      <span data-bn-region="par"><small>Par</small><strong>{{ play.par }}</strong></span>
    </p>

    <p data-bn-region="coach">Tap a letter to turn it over — every one you use is ten points off. Know the phrase? Solve it.</p>

    <div data-bn-region="solve">{{ solveButtonHtml }}</div>

    <noscript>
      <p data-bn-region="noscript-hint">Tap letters to turn them over; solve when you know it. This round needs JavaScript to play.</p>
    </noscript>

    <section data-bn-region="keyboard" data-bn-bind="play-keyboard">{{ keyboardHtml }}</section>`;
