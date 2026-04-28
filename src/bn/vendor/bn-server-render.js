/* Vendored from @basenative/server@0.4.1 (DuganLabs/basenative#82).

   Why this exists: the published @basenative/server@0.4.0 evaluate
   path imports `'../../../src/shared/expression.js'` — a monorepo-
   relative path that doesn't exist in the published tarball. The fix
   landed in 0.4.1 (re-exports the evaluator via a `./shared/expression`
   subpath) but isn't on GitHub Packages yet. Until t4bs can bump both
   `@basenative/runtime` and `@basenative/server` to ^0.4.1, we vendor
   the fixed render() and import the evaluator from the local copy at
   `src/lib/_bn-expression.js`.

   When 0.4.1 is published: bump the deps in package.json, switch
   src/bn/server/render.js back to `import { render } from '@basenative/server'`,
   and delete this file. */

import { parse } from 'node-html-parser';
import { evaluateExpression } from '../../lib/_bn-expression.js';

function emitDiagnostic(options, diagnostic) {
  if (typeof options?.onDiagnostic === 'function') {
    options.onDiagnostic(diagnostic);
  }
}

function evaluate(expr, ctx, options) {
  return evaluateExpression(expr, ctx, options);
}

function interpolate(text, ctx, options) {
  return text.replace(/\{\{\s*(.+?)\s*\}\}/g, (_, expr) => {
    const value = evaluate(expr, ctx, options);
    return value != null ? value : '';
  });
}

function createChildContext(parent, bindings) {
  return Object.assign(Object.create(parent ?? null), bindings);
}

function parseFragment(html) {
  return parse(html, { comment: true });
}

function wrapFragment(html, label, options, metadata = '') {
  if (!options?.hydratable) return html;
  const suffix = metadata ? `:${metadata}` : '';
  return `<!--bn:${label}${suffix}-->${html}<!--/bn:${label}-->`;
}

function trackLabel(value) {
  return encodeURIComponent(String(value));
}

function processChildren(parent, ctx, options) {
  const children = parent.childNodes.slice();
  let index = 0;

  while (index < children.length) {
    const node = children[index];
    if (node.nodeType === 1 && node.rawTagName === 'template') {
      if (node.getAttribute('@defer') != null) {
        processDefer(node, ctx, options);
        index++;
      } else if (node.getAttribute('@if') != null) {
        index = processIf(children, index, ctx, options);
      } else if (node.getAttribute('@for') != null) {
        index = processFor(children, index, ctx, options);
      } else if (node.getAttribute('@switch') != null) {
        processSwitch(node, ctx, options);
        index++;
      } else {
        index++;
      }
      continue;
    }

    processNode(node, ctx, options);
    index++;
  }
}

function processNode(node, ctx, options) {
  if (node.nodeType === 3) {
    const raw = node.rawText;
    if (raw.includes('{{')) {
      node.rawText = interpolate(raw, ctx, options);
    }
    return;
  }

  if (node.nodeType !== 1) return;

  const tag = node.rawTagName?.toLowerCase();
  if (tag === 'style') return;
  if (tag === 'script' && node.getAttribute('type') !== 'application/json') return;

  if (node.rawAttrs) {
    const attrs = [];
    for (const { name, value } of parseAttrs(node.rawAttrs)) {
      if (name.startsWith('@')) continue;

      if (name.startsWith(':')) {
        const result = evaluate(value, ctx, options);
        if (result !== false && result != null) {
          attrs.push({ name: name.slice(1), value: String(result) });
        }
        continue;
      }

      if (value && value.includes('{{')) {
        attrs.push({ name, value: interpolate(value, ctx, options) });
        continue;
      }

      attrs.push({ name, value });
    }

    node.rawAttrs = attrs
      .map(attr => (attr.value !== '' ? `${attr.name}="${attr.value}"` : attr.name))
      .join(' ');
  }

  processChildren(node, ctx, options);
}

function processIf(children, index, ctx, options) {
  const ifNode = children[index];
  const expr = ifNode.getAttribute('@if');
  let elseNode = null;
  const next = findNextElementSibling(children, index + 1);
  if (next?.rawTagName === 'template' && next.getAttribute('@else') != null) {
    elseNode = next;
  }

  const condition = evaluate(expr, ctx, options);
  const source = condition ? ifNode : elseNode;

  if (source) {
    const content = parseFragment(source.innerHTML);
    processChildren(content, ctx, options);
    ifNode.replaceWith(parseFragment(wrapFragment(content.toString(), 'if', options)));
  } else {
    ifNode.remove();
  }

  if (elseNode && elseNode !== ifNode) {
    elseNode.remove();
  }

  return index + 1;
}

function processFor(children, index, ctx, options) {
  const forNode = children[index];
  const expr = forNode.getAttribute('@for');
  let emptyNode = null;
  const next = findNextElementSibling(children, index + 1);
  if (next?.rawTagName === 'template' && next.getAttribute('@empty') != null) {
    emptyNode = next;
  }

  const match = expr.match(/(\w+)\s+of\s+(.+?)(?:\s*;\s*track\s+(.+))?$/);
  if (!match) {
    emitDiagnostic(options, {
      level: 'error',
      domain: 'template',
      code: 'BN_FOR_INVALID_SYNTAX',
      message: `Invalid @for expression "${expr}"`,
      expression: expr,
    });
    return index + 1;
  }

  const [, itemName, listExpr, trackExpr] = match;
  const list = evaluate(listExpr, ctx, options) ?? [];

  if (!Array.isArray(list)) {
    emitDiagnostic(options, {
      level: 'warn',
      domain: 'template',
      code: 'BN_FOR_NON_ARRAY',
      message: `@for expected an array but received ${typeof list}; rendering nothing`,
      expression: listExpr,
    });
  }

  if (!Array.isArray(list) || list.length === 0) {
    if (emptyNode) {
      const content = parseFragment(emptyNode.innerHTML);
      processChildren(content, ctx, options);
      forNode.replaceWith(parseFragment(wrapFragment(content.toString(), 'empty', options)));
      emptyNode.remove();
    } else {
      forNode.remove();
    }
    return index + 1;
  }

  const fragments = [];
  const seenKeys = new Set();

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const itemCtx = createChildContext(ctx, {
      [itemName]: item,
      $index: i,
      $first: i === 0,
      $last: i === list.length - 1,
      $even: i % 2 === 0,
      $odd: i % 2 !== 0,
    });

    let metadata = '';
    if (trackExpr) {
      const key = evaluate(trackExpr, itemCtx, options);
      if (seenKeys.has(key)) {
        emitDiagnostic(options, {
          level: 'error',
          domain: 'template',
          code: 'BN_FOR_DUPLICATE_TRACK_KEY',
          message: `Duplicate @for track key "${String(key)}" encountered during server render`,
          expression: trackExpr,
          key,
        });
      }
      seenKeys.add(key);
      metadata = `key=${trackLabel(key)}`;
    }

    const content = parseFragment(forNode.innerHTML);
    processChildren(content, itemCtx, options);
    fragments.push(wrapFragment(content.toString(), 'for:item', options, metadata));
  }

  forNode.replaceWith(parseFragment(wrapFragment(fragments.join(''), 'for', options)));
  if (emptyNode) emptyNode.remove();
  return index + 1;
}

let deferCounter = 0;

function processDefer(templateNode, ctx, options) {
  const id = `d${deferCounter++}`;
  const innerHTML = templateNode.innerHTML;

  if (!options._deferred) options._deferred = [];
  options._deferred.push({ id, html: innerHTML, ctx: Object.assign({}, ctx) });

  const placeholder = parseFragment(
    `<div data-bn-defer="${id}"></div>` +
    (options.hydratable ? `<!--bn:defer:${id}-->` : '')
  );
  templateNode.replaceWith(placeholder);
}

function processSwitch(switchNode, ctx, options) {
  const expr = switchNode.getAttribute('@switch');
  const value = evaluate(expr, ctx, options);

  let match = null;
  let defaultTemplate = null;
  for (const child of switchNode.childNodes) {
    if (child.nodeType !== 1 || child.rawTagName !== 'template') continue;
    if (child.getAttribute('@case') != null) {
      if (!match && evaluate(child.getAttribute('@case'), ctx, options) === value) {
        match = child;
      }
    } else if (child.getAttribute('@default') != null) {
      defaultTemplate = child;
    }
  }

  const source = match ?? defaultTemplate;
  if (!source) {
    switchNode.remove();
    return;
  }

  const content = parseFragment(source.innerHTML);
  processChildren(content, ctx, options);
  switchNode.replaceWith(parseFragment(wrapFragment(content.toString(), 'switch', options)));
}

function findNextElementSibling(children, index) {
  for (let i = index; i < children.length; i++) {
    if (children[i].nodeType === 1) return children[i];
  }
  return null;
}

function parseAttrs(rawAttrs) {
  const attrs = [];
  const re = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  let match;
  while ((match = re.exec(rawAttrs)) !== null) {
    attrs.push({
      name: match[1],
      value: match[2] ?? match[3] ?? match[4] ?? '',
    });
  }
  return attrs;
}

export function render(html, ctx = {}, options = {}) {
  deferCounter = 0;
  const root = parseFragment(html);
  processChildren(root, ctx, options);
  return root.toString();
}

export function resolveDeferred(options) {
  const deferred = options._deferred || [];
  return deferred.map(({ id, html, ctx }) => {
    const content = parseFragment(html);
    processChildren(content, ctx, options);
    const rendered = content.toString();
    return {
      id,
      html: rendered,
      script: `<script data-bn-defer-resolve="${id}">` +
        `(function(){` +
        `var t=document.querySelector('[data-bn-defer="${id}"]');` +
        `if(t){t.innerHTML=${JSON.stringify(rendered)};` +
        `t.removeAttribute('data-bn-defer');` +
        `var e=new CustomEvent('bn:defer',{detail:{id:'${id}'}});` +
        `document.dispatchEvent(e)}` +
        `})();<\/script>`,
    };
  });
}
