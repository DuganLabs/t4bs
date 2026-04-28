/* SSR: toast region. Empty container; the hydrator owns its lifecycle. */

export function ssrToast() {
  return `<div role="status" aria-live="polite" data-bn-bind="toast-host"></div>`;
}
