/* Stub for @basenative/runtime@0.4.0's broken sibling import.

   The published tarball's evaluate.js and scope.js reference
   '../../../src/shared/expression.js' — a monorepo-relative path that
   doesn't exist in node_modules after install. Vite/rolldown can't
   resolve it and the dev server / build refuse to start.

   t4bs's SPA only uses signal/computed/effect/batch from the runtime
   (no template-string hydration), so the unused expression evaluator
   can be stubbed. Scope.js does use the SCOPE_SLOT symbol — provide a
   real one. evaluateExpression is fenced behind code paths we never
   reach; throwing on call surfaces any accidental use immediately.

   PendingBusiness solved this by writing their own signals.js shim
   (apps/site/src/signals.ts). When @basenative/runtime ships a fixed
   tarball this file goes away with the alias in vite.config.js. */

export const SCOPE_SLOT = Symbol("SCOPE_SLOT");

export function evaluateExpression() {
  throw new Error(
    "evaluateExpression() not implemented — t4bs SPA does not use the @basenative/runtime expression evaluator.",
  );
}
