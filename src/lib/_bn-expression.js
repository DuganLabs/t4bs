export const SCOPE_SLOT = Symbol.for('basenative.scopeSlot');

const EXPRESSION_CACHE = new Map();
const UNSAFE_PROPERTIES = new Set(['__proto__', 'prototype', 'constructor']);

function createExpressionError(code, message, source, index = 0) {
  const error = new SyntaxError(message);
  error.code = code;
  error.source = source;
  error.index = index;
  return error;
}

function reportDiagnostic(options, diagnostic) {
  if (typeof options?.onDiagnostic === 'function') {
    options.onDiagnostic(diagnostic);
  }
}

function tokenize(source) {
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (/\s/.test(char)) {
      index++;
      continue;
    }

    const tri = source.slice(index, index + 3);
    const duo = source.slice(index, index + 2);
    if (tri === '===' || tri === '!==') {
      tokens.push({ type: 'operator', value: tri, index });
      index += 3;
      continue;
    }
    if (
      duo === '&&' || duo === '||' || duo === '==' || duo === '!=' ||
      duo === '<=' || duo === '>='
    ) {
      tokens.push({ type: 'operator', value: duo, index });
      index += 2;
      continue;
    }

    if ('()[]{}.,:;?'.includes(char)) {
      tokens.push({ type: 'punct', value: char, index });
      index++;
      continue;
    }

    if ('+-*/%!<>'.includes(char)) {
      tokens.push({ type: 'operator', value: char, index });
      index++;
      continue;
    }

    if (char === '"' || char === '\'') {
      const quote = char;
      const start = index;
      index++;
      let value = '';

      while (index < source.length) {
        const current = source[index];
        if (current === '\\') {
          const next = source[index + 1];
          if (next == null) break;
          const escapeMap = {
            '"': '"',
            '\'': '\'',
            '\\': '\\',
            n: '\n',
            r: '\r',
            t: '\t',
          };
          value += escapeMap[next] ?? next;
          index += 2;
          continue;
        }

        if (current === quote) {
          index++;
          tokens.push({ type: 'string', value, index: start });
          value = null;
          break;
        }

        value += current;
        index++;
      }

      if (value !== null) {
        throw createExpressionError(
          'BN_EXPR_UNTERMINATED_STRING',
          'Unterminated string literal',
          source,
          start
        );
      }

      continue;
    }

    if (/[0-9]/.test(char)) {
      const start = index;
      let raw = char;
      index++;
      while (index < source.length && /[0-9.]/.test(source[index])) {
        raw += source[index];
        index++;
      }
      if (!/^(\d+|\d+\.\d+)$/.test(raw)) {
        throw createExpressionError(
          'BN_EXPR_INVALID_NUMBER',
          `Invalid numeric literal "${raw}"`,
          source,
          start
        );
      }
      tokens.push({ type: 'number', value: Number(raw), index: start });
      continue;
    }

    if (/[A-Za-z_$]/.test(char)) {
      const start = index;
      let value = char;
      index++;
      while (index < source.length && /[A-Za-z0-9_$]/.test(source[index])) {
        value += source[index];
        index++;
      }
      tokens.push({ type: 'identifier', value, index: start });
      continue;
    }

    throw createExpressionError(
      'BN_EXPR_INVALID_TOKEN',
      `Unsupported token "${char}"`,
      source,
      index
    );
  }

  tokens.push({ type: 'eof', value: '', index: source.length });
  return tokens;
}

class Parser {
  constructor(tokens, source) {
    this.tokens = tokens;
    this.source = source;
    this.index = 0;
  }

  current() {
    return this.tokens[this.index];
  }

  advance() {
    const token = this.current();
    this.index++;
    return token;
  }

  match(type, value) {
    const token = this.current();
    if (!token || token.type !== type) return false;
    if (value != null && token.value !== value) return false;
    this.index++;
    return true;
  }

  expect(type, value, message) {
    const token = this.current();
    if (token?.type === type && (value == null || token.value === value)) {
      this.index++;
      return token;
    }
    throw createExpressionError(
      'BN_EXPR_UNEXPECTED_TOKEN',
      message ?? `Unexpected token "${token?.value ?? 'EOF'}"`,
      this.source,
      token?.index ?? this.source.length
    );
  }

  parseProgram() {
    const body = [];
    while (this.current().type !== 'eof') {
      if (this.match('punct', ';')) continue;
      body.push(this.parseExpression());
      this.match('punct', ';');
    }
    return { type: 'Program', body };
  }

  parseExpression() {
    return this.parseConditional();
  }

  parseConditional() {
    const test = this.parseLogicalOr();
    if (!this.match('punct', '?')) return test;
    const consequent = this.parseExpression();
    this.expect('punct', ':', 'Expected ":" in conditional expression');
    const alternate = this.parseExpression();
    return { type: 'ConditionalExpression', test, consequent, alternate };
  }

  parseLogicalOr() {
    let node = this.parseLogicalAnd();
    while (this.match('operator', '||')) {
      node = {
        type: 'LogicalExpression',
        operator: '||',
        left: node,
        right: this.parseLogicalAnd(),
      };
    }
    return node;
  }

  parseLogicalAnd() {
    let node = this.parseEquality();
    while (this.match('operator', '&&')) {
      node = {
        type: 'LogicalExpression',
        operator: '&&',
        left: node,
        right: this.parseEquality(),
      };
    }
    return node;
  }

  parseEquality() {
    let node = this.parseRelational();
    while (true) {
      if (this.match('operator', '===')) {
        node = {
          type: 'BinaryExpression',
          operator: '===',
          left: node,
          right: this.parseRelational(),
        };
        continue;
      }
      if (this.match('operator', '!==')) {
        node = {
          type: 'BinaryExpression',
          operator: '!==',
          left: node,
          right: this.parseRelational(),
        };
        continue;
      }
      if (this.match('operator', '==')) {
        node = {
          type: 'BinaryExpression',
          operator: '==',
          left: node,
          right: this.parseRelational(),
        };
        continue;
      }
      if (this.match('operator', '!=')) {
        node = {
          type: 'BinaryExpression',
          operator: '!=',
          left: node,
          right: this.parseRelational(),
        };
        continue;
      }
      return node;
    }
  }

  parseRelational() {
    let node = this.parseAdditive();
    while (true) {
      if (this.match('operator', '<=')) {
        node = {
          type: 'BinaryExpression',
          operator: '<=',
          left: node,
          right: this.parseAdditive(),
        };
        continue;
      }
      if (this.match('operator', '>=')) {
        node = {
          type: 'BinaryExpression',
          operator: '>=',
          left: node,
          right: this.parseAdditive(),
        };
        continue;
      }
      if (this.match('operator', '<')) {
        node = {
          type: 'BinaryExpression',
          operator: '<',
          left: node,
          right: this.parseAdditive(),
        };
        continue;
      }
      if (this.match('operator', '>')) {
        node = {
          type: 'BinaryExpression',
          operator: '>',
          left: node,
          right: this.parseAdditive(),
        };
        continue;
      }
      return node;
    }
  }

  parseAdditive() {
    let node = this.parseMultiplicative();
    while (true) {
      if (this.match('operator', '+')) {
        node = {
          type: 'BinaryExpression',
          operator: '+',
          left: node,
          right: this.parseMultiplicative(),
        };
        continue;
      }
      if (this.match('operator', '-')) {
        node = {
          type: 'BinaryExpression',
          operator: '-',
          left: node,
          right: this.parseMultiplicative(),
        };
        continue;
      }
      return node;
    }
  }

  parseMultiplicative() {
    let node = this.parseUnary();
    while (true) {
      if (this.match('operator', '*')) {
        node = {
          type: 'BinaryExpression',
          operator: '*',
          left: node,
          right: this.parseUnary(),
        };
        continue;
      }
      if (this.match('operator', '/')) {
        node = {
          type: 'BinaryExpression',
          operator: '/',
          left: node,
          right: this.parseUnary(),
        };
        continue;
      }
      if (this.match('operator', '%')) {
        node = {
          type: 'BinaryExpression',
          operator: '%',
          left: node,
          right: this.parseUnary(),
        };
        continue;
      }
      return node;
    }
  }

  parseUnary() {
    if (this.match('operator', '!')) {
      return { type: 'UnaryExpression', operator: '!', argument: this.parseUnary() };
    }
    if (this.match('operator', '+')) {
      return { type: 'UnaryExpression', operator: '+', argument: this.parseUnary() };
    }
    if (this.match('operator', '-')) {
      return { type: 'UnaryExpression', operator: '-', argument: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let node = this.parsePrimary();

    while (true) {
      if (this.match('punct', '.')) {
        const property = this.expect(
          'identifier',
          null,
          'Expected a property name after "."'
        );
        node = {
          type: 'MemberExpression',
          object: node,
          property: { type: 'Identifier', name: property.value },
          computed: false,
        };
        continue;
      }

      if (this.match('punct', '[')) {
        const property = this.parseExpression();
        this.expect('punct', ']', 'Expected "]" after computed property');
        node = {
          type: 'MemberExpression',
          object: node,
          property,
          computed: true,
        };
        continue;
      }

      if (this.match('punct', '(')) {
        const args = [];
        if (!this.match('punct', ')')) {
          do {
            args.push(this.parseExpression());
          } while (this.match('punct', ','));
          this.expect('punct', ')', 'Expected ")" after function arguments');
        }
        node = { type: 'CallExpression', callee: node, arguments: args };
        continue;
      }

      return node;
    }
  }

  parsePrimary() {
    const token = this.current();

    if (token.type === 'number') {
      this.advance();
      return { type: 'Literal', value: token.value };
    }

    if (token.type === 'string') {
      this.advance();
      return { type: 'Literal', value: token.value };
    }

    if (token.type === 'identifier') {
      this.advance();
      if (token.value === 'true') return { type: 'Literal', value: true };
      if (token.value === 'false') return { type: 'Literal', value: false };
      if (token.value === 'null') return { type: 'Literal', value: null };
      if (token.value === 'undefined') return { type: 'Literal', value: undefined };
      return { type: 'Identifier', name: token.value };
    }

    if (this.match('punct', '(')) {
      const node = this.parseExpression();
      this.expect('punct', ')', 'Expected ")" after grouped expression');
      return node;
    }

    if (this.match('punct', '[')) {
      const elements = [];
      if (!this.match('punct', ']')) {
        do {
          elements.push(this.parseExpression());
        } while (this.match('punct', ','));
        this.expect('punct', ']', 'Expected "]" after array literal');
      }
      return { type: 'ArrayExpression', elements };
    }

    if (this.match('punct', '{')) {
      const properties = [];
      if (!this.match('punct', '}')) {
        do {
          const keyToken = this.current();
          let key;
          if (keyToken.type === 'identifier') {
            this.advance();
            key = keyToken.value;
          } else if (keyToken.type === 'string' || keyToken.type === 'number') {
            this.advance();
            key = String(keyToken.value);
          } else {
            throw createExpressionError(
              'BN_EXPR_INVALID_OBJECT_KEY',
              'Expected an object property name',
              this.source,
              keyToken.index
            );
          }

          let value;
          if (this.match('punct', ':')) {
            value = this.parseExpression();
          } else {
            value = { type: 'Identifier', name: key };
          }
          properties.push({ key, value });
        } while (this.match('punct', ','));
        this.expect('punct', '}', 'Expected "}" after object literal');
      }
      return { type: 'ObjectExpression', properties };
    }

    throw createExpressionError(
      'BN_EXPR_UNEXPECTED_TOKEN',
      `Unexpected token "${token.value}"`,
      this.source,
      token.index
    );
  }
}

export function isScopeSlot(value) {
  return Boolean(value) && value[SCOPE_SLOT] === true && typeof value.get === 'function';
}

function resolveValue(value) {
  return isScopeSlot(value) ? value.get() : value;
}

function lookupIdentifier(ctx, name) {
  if (ctx == null) return undefined;
  return resolveValue(ctx[name]);
}

function safeMemberRead(object, property, source) {
  if (typeof property === 'string' && UNSAFE_PROPERTIES.has(property)) {
    throw createExpressionError(
      'BN_EXPR_UNSAFE_MEMBER',
      `Access to "${property}" is not allowed in BaseNative expressions`,
      source
    );
  }
  return object[property];
}

function evaluateNode(node, ctx, source) {
  switch (node.type) {
    case 'Program': {
      let result;
      for (const statement of node.body) result = evaluateNode(statement, ctx, source);
      return result;
    }

    case 'Literal':
      return node.value;

    case 'Identifier':
      return lookupIdentifier(ctx, node.name);

    case 'UnaryExpression': {
      const value = evaluateNode(node.argument, ctx, source);
      if (node.operator === '!') return !value;
      if (node.operator === '+') return +value;
      if (node.operator === '-') return -value;
      return undefined;
    }

    case 'BinaryExpression': {
      const left = evaluateNode(node.left, ctx, source);
      const right = evaluateNode(node.right, ctx, source);
      switch (node.operator) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return left / right;
        case '%': return left % right;
        case '<': return left < right;
        case '<=': return left <= right;
        case '>': return left > right;
        case '>=': return left >= right;
        case '==': return left == right;
        case '!=': return left != right;
        case '===': return left === right;
        case '!==': return left !== right;
        default: return undefined;
      }
    }

    case 'LogicalExpression':
      return node.operator === '&&'
        ? (evaluateNode(node.left, ctx, source) && evaluateNode(node.right, ctx, source))
        : (evaluateNode(node.left, ctx, source) || evaluateNode(node.right, ctx, source));

    case 'ConditionalExpression':
      return evaluateNode(node.test, ctx, source)
        ? evaluateNode(node.consequent, ctx, source)
        : evaluateNode(node.alternate, ctx, source);

    case 'ArrayExpression':
      return node.elements.map(element => evaluateNode(element, ctx, source));

    case 'ObjectExpression': {
      const result = {};
      for (const property of node.properties) {
        result[property.key] = evaluateNode(property.value, ctx, source);
      }
      return result;
    }

    case 'MemberExpression': {
      const object = evaluateNode(node.object, ctx, source);
      if (object == null) return undefined;
      const property = node.computed
        ? evaluateNode(node.property, ctx, source)
        : node.property.name;
      return safeMemberRead(object, property, source);
    }

    case 'CallExpression': {
      if (node.callee.type === 'MemberExpression') {
        const target = evaluateNode(node.callee.object, ctx, source);
        if (target == null) return undefined;
        const property = node.callee.computed
          ? evaluateNode(node.callee.property, ctx, source)
          : node.callee.property.name;
        const fn = safeMemberRead(target, property, source);
        if (typeof fn !== 'function') return undefined;
        const args = node.arguments.map(arg => evaluateNode(arg, ctx, source));
        return fn.apply(target, args);
      }

      const fn = evaluateNode(node.callee, ctx, source);
      if (typeof fn !== 'function') return undefined;
      const args = node.arguments.map(arg => evaluateNode(arg, ctx, source));
      return fn(...args);
    }

    default:
      return undefined;
  }
}

export function compileExpression(source) {
  const normalized = String(source ?? '').trim();
  if (EXPRESSION_CACHE.has(normalized)) return EXPRESSION_CACHE.get(normalized);

  try {
    const parser = new Parser(tokenize(normalized), normalized);
    const compiled = { source: normalized, ast: parser.parseProgram() };
    EXPRESSION_CACHE.set(normalized, compiled);
    return compiled;
  } catch (error) {
    const failure = { source: normalized, error };
    EXPRESSION_CACHE.set(normalized, failure);
    return failure;
  }
}

export function evaluateExpression(source, ctx = {}, options = {}) {
  const compiled = typeof source === 'string' ? compileExpression(source) : source;
  if (compiled?.error) {
    reportDiagnostic(options, {
      level: 'error',
      domain: 'expression',
      code: compiled.error.code ?? 'BN_EXPR_COMPILE_FAILED',
      message: compiled.error.message,
      expression: compiled.source,
      error: compiled.error,
    });
    return undefined;
  }

  try {
    return evaluateNode(compiled.ast, ctx, compiled.source);
  } catch (error) {
    reportDiagnostic(options, {
      level: 'error',
      domain: 'expression',
      code: error.code ?? 'BN_EXPR_EVALUATION_FAILED',
      message: error.message,
      expression: compiled.source,
      error,
    });
    return undefined;
  }
}

export function clearExpressionCache() {
  EXPRESSION_CACHE.clear();
}
