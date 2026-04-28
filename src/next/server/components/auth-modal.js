/* SSR: passkey sign-in modal. Hidden by default; hydration wires the
   tabs, handle input, and submit buttons to the existing client auth
   helpers (src/lib/auth.js — passkey or dev fallback). */

export function ssrAuthModal() {
  return `<div class="lb-ov is-hidden" data-bn-bind="auth-overlay" data-bn-action="auth-close">
    <div class="lb-card" role="dialog" aria-modal="true" aria-labelledby="lb-auth-title"
         data-bn-action="auth-card">
      <div class="lb-ct auth" id="lb-auth-title">SIGN IN</div>
      <div class="lb-cs">Anonymous play · login only to submit</div>
      <div class="lb-tabs" data-bn-bind="auth-tabs">
        <button type="button" class="on" data-bn-action="auth-tab-login">LOG IN</button>
        <button type="button" data-bn-action="auth-tab-register">NEW HANDLE</button>
      </div>
      <div class="lb-form">
        <div class="lb-field">
          <label class="lb-flabel" for="lb-auth-handle">Handle</label>
          <input id="lb-auth-handle" class="lb-finput" autocapitalize="off" autocorrect="off"
                 spellcheck="false" autocomplete="username"
                 placeholder="2–24 chars · letters, numbers, _ -"
                 data-bn-bind="auth-handle" />
          <span class="lb-fhint">Public attribution on your puzzles.</span>
        </div>
        <div class="lb-ferror is-hidden" data-bn-bind="auth-err"></div>
      </div>
      <button class="lb-btn lb-bp" type="button" disabled data-bn-action="auth-passkey"
              data-bn-bind="auth-passkey">USE PASSKEY</button>
      <button class="lb-btn lb-bs" type="button" data-bn-action="auth-cancel">Cancel</button>
    </div>
  </div>`;
}
