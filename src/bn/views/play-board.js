/* play-board.html — the board as first painted, shared by the play view
   (a preview) and the home page (today's puzzle).

   Reads a `play` object shaped by src/bn/server/render.js shapePlay():
   category, words (each a list of cells with the anchor letter or ""),
   attemptsMax per word, totalLetters, submittedBy. The hydrated
   src/views/play.js draws the same regions in the same order, so hydration
   replaces like with like:

     summary   — the category on its sticky note, the shape line, the hint
     grid      — one row per word, one tile per letter, anchors locked
     knowledge — the read-out under the grid (filled on hydration)
     bank      — letters known in the phrase / not in this word
     keyboard  — QWERTY with ENTER and ⌫, disabled until hydration */

import { raw } from "@basenative/runtime/shared/escape";
import { renderPlayKeyboard } from "../../lib/keyboard-layout.js";

export const KEYBOARD_HTML = renderPlayKeyboard();

/** Context fragment the two templates both spread in. */
export const boardContext = { keyboardHtml: raw(KEYBOARD_HTML) };

export default `<header data-bn-region="play-summary">
      <p data-bn-region="play-sticky" aria-hidden="true">{{ play.category }}</p>
      <p data-bn-region="play-meta">{{ play.wordsLabel }} · {{ play.totalLetters }} letters · by {{ play.submittedBy }}</p>
      <p role="status" aria-live="polite" data-bn-region="play-hint">Type letters into the first word, then Enter. A miss spends one of that word's attempts.</p>
    </header>

    <section aria-label="Phrase grid" data-bn-region="grid">
      <template @for="word of play.words; track $index">
        <div role="group" data-bn-region="word" :aria-label="'Word ' + ($index + 1) + ', ' + word.attempts + ' attempts'" :data-word-index="$index">
          <template @for="cell of word.cells; track $index">
            <span role="img"
                  data-bn-region="tile"
                  :data-locked="cell.anchor ? '' : false"
                  :aria-label="cell.anchor ? cell.anchor + ' at position ' + ($index + 1) + ', locked' : 'Empty at position ' + ($index + 1)">{{ cell.anchor }}</span>
          </template>
          <small data-bn-region="attempts">{{ word.attempts }} attempts</small>
        </div>
      </template>
    </section>

    <section aria-label="What you know so far" data-bn-region="knowledge" data-bn-bind="play-knowledge"></section>
    <section aria-label="Letter bank" data-bn-region="bank" data-bn-bind="play-bank"></section>

    <noscript>
      <p data-bn-region="noscript-hint">Type into the tiles and press Enter to guess a word. This round needs JavaScript to play.</p>
    </noscript>

    <section data-bn-region="keyboard" data-bn-bind="play-keyboard">{{ keyboardHtml }}</section>`;
