#!/usr/bin/env node

/**
 * Read-only route/link integrity checker for the CRM + HRM Next.js apps.
 *
 * Run:
 *   node scripts/check-route-integrity.mjs
 *   node scripts/check-route-integrity.mjs --verbose
 *   node scripts/check-route-integrity.mjs --json
 *
 * Exit status:
 *   0 — no high-confidence dead route literal
 *   1 — one or more high-confidence dead route literals
 *   2 — checker could not complete
 *
 * Dynamic templates that cannot be proven are review findings, never failures.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const APP_NAMES = ['crm', 'hrm'];
const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/;
const ROUTE_FILE = /^(page|route)\.(?:[jt]sx?)$/;
const CATEGORY_ORDER = [
  'same-app',
  'cross-app',
  'api',
  'dynamic-template',
  'probable-dead',
  'allowlisted',
];
const modulePath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(modulePath), '..');

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function relativePosix(root, target) {
  return toPosix(path.relative(root, target));
}

export function routePatternFromFile(relativeFile) {
  const segments = relativeFile.split(/[\\/]/);
  segments.pop();

  const routeSegments = [];
  for (let segment of segments) {
    if (/^\([^/]+\)$/.test(segment) || segment.startsWith('@')) continue;
    if (segment.startsWith('_')) return null;
    segment = segment.replace(/^(\(\.\)|\(\.\.\)|\(\.\.\.\))+/, '');
    if (segment) routeSegments.push(segment);
  }

  return routeSegments.length === 0 ? '/' : `/${routeSegments.join('/')}`;
}

function scriptKindFor(file) {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.cjs')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (
    ts.isElementAccessExpression(node) &&
    node.argumentExpression &&
    ts.isStringLiteral(node.argumentExpression)
  ) {
    return node.argumentExpression.text;
  }
  return null;
}

function calledName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function inferTargetHint(text) {
  if (/(?:NEXT_PUBLIC_)?HRM(?:_BASE|_URL)|hrmBaseUrl|hrmUrl/i.test(text)) {
    return 'hrm';
  }
  if (/(?:NEXT_PUBLIC_)?CRM(?:_BASE|_URL)|crmBaseUrl|crmUrl/i.test(text)) {
    return 'crm';
  }
  return null;
}

function inferTargetHintWithBindings(text, bindings) {
  const direct = inferTargetHint(text);
  if (direct) return direct;
  for (const identifier of text.matchAll(/\b[A-Za-z_$][\w$]*\b/g)) {
    const bound = bindings.get(identifier[0]);
    if (bound) return bound;
  }
  return null;
}

function literalFromExpression(
  node,
  sourceFile,
  bindings,
  literalBindings = new Map(),
) {
  if (!node) return null;

  if (ts.isIdentifier(node)) {
    const bound = literalBindings.get(node.text);
    return bound?.length === 1 ? bound[0] : null;
  }

  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return literalFromExpression(
      node.expression,
      sourceFile,
      bindings,
      literalBindings,
    );
  }

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { raw: node.text, dynamic: false, targetHint: null };
  }

  if (ts.isTemplateExpression(node)) {
    let raw = node.head.text;
    for (const span of node.templateSpans) {
      raw += `\${${span.expression.getText(sourceFile)}}${span.literal.text}`;
    }
    return {
      raw,
      dynamic: true,
      targetHint: inferTargetHintWithBindings(node.getText(sourceFile), bindings),
    };
  }

  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = literalFromExpression(
      node.left,
      sourceFile,
      bindings,
      literalBindings,
    );
    const right = literalFromExpression(
      node.right,
      sourceFile,
      bindings,
      literalBindings,
    );
    if (left && right) {
      return {
        raw: `${left.raw}${right.raw}`,
        dynamic: left.dynamic || right.dynamic,
        targetHint: left.targetHint ?? right.targetHint,
      };
    }
    if (left) {
      return {
        raw: `${left.raw}\${${node.right.getText(sourceFile)}}`,
        dynamic: true,
        targetHint:
          left.targetHint ??
          inferTargetHintWithBindings(node.right.getText(sourceFile), bindings),
      };
    }
    if (right) {
      return {
        raw: `\${${node.left.getText(sourceFile)}}${right.raw}`,
        dynamic: true,
        targetHint:
          inferTargetHintWithBindings(node.left.getText(sourceFile), bindings) ??
          right.targetHint,
      };
    }
  }

  if (ts.isCallExpression(node)) {
    const name = calledName(node.expression);
    if (['hrmUrl', 'hrmBaseUrl', 'crmUrl', 'crmBaseUrl'].includes(name ?? '')) {
      const nested = literalFromExpression(
        node.arguments[0],
        sourceFile,
        bindings,
        literalBindings,
      );
      if (!nested) return null;
      return {
        ...nested,
        dynamic: true,
        targetHint: name.toLowerCase().startsWith('hrm') ? 'hrm' : 'crm',
      };
    }
  }

  if (
    ts.isNewExpression(node) &&
    calledName(node.expression) === 'URL' &&
    node.arguments?.length
  ) {
    return literalFromExpression(
      node.arguments[0],
      sourceFile,
      bindings,
      literalBindings,
    );
  }

  return null;
}

function literalCandidatesFromExpression(
  node,
  sourceFile,
  bindings,
  literalBindings = new Map(),
) {
  if (!node) return [];
  if (ts.isIdentifier(node)) {
    return literalBindings.get(node.text) ?? [];
  }
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return literalCandidatesFromExpression(
      node.expression,
      sourceFile,
      bindings,
      literalBindings,
    );
  }
  if (ts.isConditionalExpression(node)) {
    return [
      ...literalCandidatesFromExpression(
        node.whenTrue,
        sourceFile,
        bindings,
        literalBindings,
      ),
      ...literalCandidatesFromExpression(
        node.whenFalse,
        sourceFile,
        bindings,
        literalBindings,
      ),
    ];
  }
  if (
    ts.isBinaryExpression(node) &&
    [
      ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.QuestionQuestionToken,
      ts.SyntaxKind.AmpersandAmpersandToken,
    ].includes(node.operatorToken.kind)
  ) {
    return [
      ...literalCandidatesFromExpression(
        node.left,
        sourceFile,
        bindings,
        literalBindings,
      ),
      ...literalCandidatesFromExpression(
        node.right,
        sourceFile,
        bindings,
        literalBindings,
      ),
    ];
  }
  if (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === 'href' &&
    ts.isCallExpression(node.expression) &&
    calledName(node.expression.expression) === 'resolveNotificationLink' &&
    node.expression.arguments.length
  ) {
    return literalCandidatesFromExpression(
      node.expression.arguments[0],
      sourceFile,
      bindings,
      literalBindings,
    );
  }
  const literal = literalFromExpression(
    node,
    sourceFile,
    bindings,
    literalBindings,
  );
  return literal ? [literal] : [];
}

export function extractReferences(source, file, app) {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(file),
  );
  const references = [];
  const seen = new Set();
  const bindings = new Map();
  const declarations = [];

  function collectBindings(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      declarations.push(node);
      const hint = inferTargetHint(node.initializer.getText(sourceFile));
      if (hint) bindings.set(node.name.text, hint);
    }
    ts.forEachChild(node, collectBindings);
  }

  collectBindings(sourceFile);
  const literalBindings = new Map();
  for (let pass = 0; pass < Math.min(declarations.length + 1, 8); pass += 1) {
    let changed = false;
    for (const declaration of declarations) {
      const candidates = literalCandidatesFromExpression(
        declaration.initializer,
        sourceFile,
        bindings,
        literalBindings,
      );
      if (candidates.length === 0) continue;
      const unique = [
        ...new Map(
          candidates.map((candidate) => [
            `${candidate.raw}|${candidate.dynamic}|${candidate.targetHint ?? ''}`,
            candidate,
          ]),
        ).values(),
      ];
      const before = JSON.stringify(literalBindings.get(declaration.name.text) ?? []);
      const after = JSON.stringify(unique);
      if (before !== after) {
        literalBindings.set(declaration.name.text, unique);
        changed = true;
      }
    }
    if (!changed) break;
  }

  function add(expression, sourceKind, locationNode = expression) {
    const start = sourceFile.getLineAndCharacterOfPosition(locationNode.getStart(sourceFile));
    for (const literal of literalCandidatesFromExpression(
      expression,
      sourceFile,
      bindings,
      literalBindings,
    )) {
      const key = `${sourceKind}:${start.line}:${start.character}:${literal.raw}`;
      if (seen.has(key)) continue;
      seen.add(key);
      references.push({
        app,
        file,
        line: start.line + 1,
        column: start.character + 1,
        sourceKind,
        ...literal,
      });
    }
  }

  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.text === 'href') {
      if (node.initializer && ts.isStringLiteral(node.initializer)) {
        add(node.initializer, 'href', node);
      } else if (
        node.initializer &&
        ts.isJsxExpression(node.initializer) &&
        node.initializer.expression
      ) {
        add(node.initializer.expression, 'href', node);
      }
    } else if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name);
      if (name === 'href' || name === 'linkUrl') {
        add(node.initializer, name, node);
      }
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      propertyName(node.left) === 'href'
    ) {
      add(node.right, 'href', node);
    } else if (ts.isCallExpression(node)) {
      const name = calledName(node.expression);
      if (
        (name === 'redirect' || name === 'permanentRedirect') &&
        node.arguments.length
      ) {
        add(node.arguments[0], 'redirect', node);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return references;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function compileRoute(route) {
  const segments = route.pattern === '/' ? [] : route.pattern.slice(1).split('/');
  let source = '^';
  let specificity = 0;

  if (segments.length === 0) {
    source += '/';
    specificity = 1;
  }

  for (const segment of segments) {
    if (/^\[\[\.\.\.[^\]]+\]\]$/.test(segment)) {
      source += '(?:/.*)?';
    } else if (/^\[\.\.\.[^\]]+\]$/.test(segment)) {
      source += '/.+';
      specificity += 1;
    } else if (/^\[[^\]]+\]$/.test(segment)) {
      source += '/[^/]+';
      specificity += 10;
    } else {
      source += `/${escapeRegex(segment)}`;
      specificity += 100;
    }
  }

  source += '/?$';
  return {
    ...route,
    regex: new RegExp(source),
    specificity,
  };
}

/**
 * False-positive allowlist. These values can be literal hrefs but are not
 * Next.js routes. Keep every exception narrow and explain why it is safe.
 */
const ALLOWLIST = [
  {
    id: 'same-page-anchor',
    reason: 'Hash-only hrefs target an element on the current document.',
    matches: ({ raw }) => raw.startsWith('#'),
  },
  {
    id: 'current-page-query',
    reason: 'Query-only hrefs preserve the current pathname.',
    matches: ({ raw }) => raw.startsWith('?'),
  },
  {
    id: 'contact-link',
    reason: 'mailto: and tel: hrefs are handled by the browser/OS.',
    matches: ({ raw }) => /^(?:mailto|tel):/i.test(raw),
  },
  {
    id: 'browser-resource',
    reason: 'blob: and data: values are browser-managed resources.',
    matches: ({ raw }) => /^(?:blob|data):/i.test(raw),
  },
  {
    id: 'external-origin',
    reason: 'External HTTP(S) origins are outside this two-app route inventory.',
    matches: ({ raw, knownAppOrigin }) =>
      /^(?:https?:)?\/\//i.test(raw) && !knownAppOrigin,
  },
  {
    id: 'relative-reference',
    reason:
      'Non-root relative hrefs depend on the runtime page location and cannot be proven dead statically.',
    matches: ({ raw }) =>
      raw !== '' &&
      !raw.includes('${') &&
      !raw.startsWith('/') &&
      !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw),
  },
  {
    id: 'public-asset',
    reason: 'The path resolves to a file under the target app public/ directory.',
    matches: ({ pathname, app, targetHint, publicAssets }) => {
      if (!pathname) return false;
      const target = targetHint ?? app;
      return publicAssets[target]?.has(pathname) ?? false;
    },
  },
];

function parseReferenceTarget(reference) {
  const raw = reference.raw.trim();
  let targetHint = reference.targetHint ?? inferTargetHint(raw);
  let knownAppOrigin = false;
  let value = raw;

  const staticAbsolute = raw.match(/^https?:\/\/([^/]+)(\/.*)?$/i);
  if (staticAbsolute) {
    const host = staticAbsolute[1].toLowerCase();
    if (/^(?:localhost|127\.0\.0\.1):3000$/.test(host)) {
      targetHint = 'crm';
      knownAppOrigin = true;
      value = staticAbsolute[2] || '/';
    } else if (/^(?:localhost|127\.0\.0\.1):3001$/.test(host)) {
      targetHint = 'hrm';
      knownAppOrigin = true;
      value = staticAbsolute[2] || '/';
    }
  }

  let templated = value.replace(/\$\{[^}]*\}/g, '__DYNAMIC__');
  while (templated.startsWith('__DYNAMIC__/')) {
    templated = templated.slice('__DYNAMIC__'.length);
  }

  const pathname = templated.startsWith('/')
    ? (templated.split(/[?#]/, 1)[0] || '/').replace(/\/{2,}/g, '/')
    : null;

  const variants = new Set();
  if (pathname) {
    const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    variants.add(trimmed);
    if (trimmed.includes('__DYNAMIC__')) {
      variants.add(trimmed.replaceAll('__DYNAMIC__', 'x'));
      variants.add(trimmed.replaceAll('__DYNAMIC__', ''));
      variants.add(
        trimmed
          .replaceAll('__DYNAMIC__', '/x')
          .replace(/\/{2,}/g, '/')
          .replace(/\/+$/, '') || '/',
      );
    }
  }

  return {
    raw,
    targetHint,
    knownAppOrigin,
    pathname,
    variants: [...variants],
  };
}

function bestMatch(routes, variants) {
  let best = null;
  for (const route of routes) {
    if (!variants.some((variant) => route.regex.test(variant))) continue;
    if (!best || route.specificity > best.specificity) best = route;
  }
  return best;
}

function ownershipFor(reference, parsed, inventories) {
  const otherApp = reference.app === 'crm' ? 'hrm' : 'crm';
  const matches = {
    crm: bestMatch(inventories.crm, parsed.variants),
    hrm: bestMatch(inventories.hrm, parsed.variants),
  };

  if (parsed.targetHint) {
    const targetApp = parsed.targetHint;
    return {
      matches,
      targetApp,
      match: matches[targetApp],
      routeScope: targetApp === reference.app ? 'same-app' : 'cross-app',
    };
  }

  const current = matches[reference.app];
  const sibling = matches[otherApp];
  if (current && sibling) {
    if (sibling.specificity > current.specificity) {
      return {
        matches,
        targetApp: otherApp,
        match: sibling,
        routeScope: 'cross-app',
      };
    }
    return {
      matches,
      targetApp: reference.app,
      match: current,
      routeScope: 'same-app',
    };
  }
  if (current) {
    return {
      matches,
      targetApp: reference.app,
      match: current,
      routeScope: 'same-app',
    };
  }
  if (sibling) {
    return {
      matches,
      targetApp: otherApp,
      match: sibling,
      routeScope: 'cross-app',
    };
  }
  return {
    matches,
    targetApp: null,
    match: null,
    routeScope: 'unresolved',
  };
}

export function classifyReference(reference, inventories, publicAssets) {
  const parsed = parseReferenceTarget(reference);
  const allowlisted = ALLOWLIST.find((entry) =>
    entry.matches({
      ...parsed,
      app: reference.app,
      publicAssets,
    }),
  );
  if (allowlisted) {
    return {
      ...reference,
      category: 'allowlisted',
      status: 'ignored',
      routeScope: 'not-a-route',
      targetApp: parsed.targetHint,
      pathname: parsed.pathname,
      matchedRoute: null,
      allowlistId: allowlisted.id,
      reason: allowlisted.reason,
      highConfidenceDead: false,
    };
  }

  const ownership = ownershipFor(reference, parsed, inventories);
  const matchedRoute = ownership.match?.pattern ?? null;

  if (parsed.pathname?.startsWith('/api/')) {
    const valid = Boolean(ownership.match && ownership.match.kind === 'route');
    return {
      ...reference,
      category: 'api',
      status: valid ? 'valid' : 'dead',
      routeScope: ownership.routeScope,
      targetApp: ownership.targetApp,
      pathname: parsed.pathname,
      matchedRoute,
      reason: valid
        ? `Matches ${ownership.targetApp} route handler ${matchedRoute}.`
        : 'No matching App Router route handler exists in either app.',
      highConfidenceDead: !reference.dynamic && !valid,
    };
  }

  if (reference.dynamic) {
    return {
      ...reference,
      category: 'dynamic-template',
      status: ownership.match ? 'validated-pattern' : 'review',
      routeScope: ownership.routeScope,
      targetApp: ownership.targetApp,
      pathname: parsed.pathname,
      matchedRoute,
      reason: ownership.match
        ? `Template shape is compatible with ${ownership.targetApp} route ${matchedRoute}.`
        : 'Dynamic target cannot be proven against the route inventory.',
      highConfidenceDead: false,
    };
  }

  if (ownership.match) {
    return {
      ...reference,
      category: ownership.routeScope,
      status: 'valid',
      routeScope: ownership.routeScope,
      targetApp: ownership.targetApp,
      pathname: parsed.pathname,
      matchedRoute,
      reason: `Matches ${ownership.targetApp} route ${matchedRoute}.`,
      highConfidenceDead: false,
    };
  }

  return {
    ...reference,
    category: 'probable-dead',
    status: 'dead',
    routeScope: 'unresolved',
    targetApp: null,
    pathname: parsed.pathname,
    matchedRoute: null,
    reason: 'No matching page, route handler, or allowlisted target exists.',
    highConfidenceDead: Boolean(parsed.pathname),
  };
}

function walkFiles(root, options = {}) {
  if (!existsSync(root)) return [];
  const files = [];

  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!options.skipDirectory?.(entry.name, absolute)) walk(absolute);
      } else if (!options.includeFile || options.includeFile(entry.name, absolute)) {
        files.push(absolute);
      }
    }
  }

  walk(root);
  return files;
}

export function buildInventory(repoRoot = defaultRepoRoot) {
  const routes = { crm: [], hrm: [] };
  const publicAssets = { crm: new Set(), hrm: new Set() };

  for (const app of APP_NAMES) {
    const appRoot = path.join(repoRoot, 'apps', app);
    const routeRoot = path.join(appRoot, 'src', 'app');
    if (!existsSync(routeRoot)) {
      throw new Error(`Missing App Router root: ${relativePosix(repoRoot, routeRoot)}`);
    }

    const routeFiles = walkFiles(routeRoot, {
      skipDirectory: (name) =>
        name.startsWith('_') ||
        name === 'node_modules' ||
        name === '.next' ||
        name === 'generated',
      includeFile: (name) => ROUTE_FILE.test(name),
    });

    routes[app] = routeFiles
      .map((file) => {
        const relativeToApp = relativePosix(routeRoot, file);
        const pattern = routePatternFromFile(relativeToApp);
        if (!pattern) return null;
        return compileRoute({
          app,
          kind: path.basename(file).startsWith('route.') ? 'route' : 'page',
          pattern,
          file: relativePosix(repoRoot, file),
        });
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          a.pattern.localeCompare(b.pattern) ||
          a.kind.localeCompare(b.kind) ||
          a.file.localeCompare(b.file),
      );

    const publicRoot = path.join(appRoot, 'public');
    for (const file of walkFiles(publicRoot)) {
      publicAssets[app].add(`/${relativePosix(publicRoot, file)}`);
    }
  }

  return { routes, publicAssets };
}

function sourceFilesForApp(repoRoot, app) {
  const sourceRoot = path.join(repoRoot, 'apps', app, 'src');
  return walkFiles(sourceRoot, {
    skipDirectory: (name) =>
      [
        '.next',
        'node_modules',
        'generated',
        'coverage',
        '__tests__',
        '__fixtures__',
      ].includes(name),
    includeFile: (name) =>
      SOURCE_EXTENSION.test(name) &&
      !name.endsWith('.d.ts') &&
      !/\.(?:test|spec)\.[^.]+$/.test(name),
  });
}

export function runIntegrityCheck(repoRoot = defaultRepoRoot) {
  const inventory = buildInventory(repoRoot);
  const references = [];
  const sourceFiles = { crm: 0, hrm: 0 };

  for (const app of APP_NAMES) {
    const files = sourceFilesForApp(repoRoot, app);
    sourceFiles[app] = files.length;
    for (const file of files) {
      const relativeFile = relativePosix(repoRoot, file);
      const source = readFileSync(file, 'utf8');
      references.push(...extractReferences(source, relativeFile, app));
    }
  }

  references.sort(
    (a, b) =>
      a.app.localeCompare(b.app) ||
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.column - b.column ||
      a.raw.localeCompare(b.raw),
  );

  const findings = references.map((reference) =>
    classifyReference(reference, inventory.routes, inventory.publicAssets),
  );
  const categories = Object.fromEntries(
    CATEGORY_ORDER.map((category) => [category, 0]),
  );
  const routeScopes = {
    'same-app': 0,
    'cross-app': 0,
    unresolved: 0,
    'not-a-route': 0,
  };
  for (const finding of findings) {
    categories[finding.category] += 1;
    routeScopes[finding.routeScope] += 1;
  }

  const highConfidenceDead = findings.filter(
    (finding) => finding.highConfidenceDead,
  );
  const dynamicReview = findings.filter(
    (finding) =>
      finding.category === 'dynamic-template' && finding.status === 'review',
  );

  return {
    generatedAt: new Date().toISOString(),
    repoRoot,
    inventory,
    findings,
    summary: {
      sourceFiles,
      routeCounts: {
        crm: {
          pages: inventory.routes.crm.filter(({ kind }) => kind === 'page').length,
          handlers: inventory.routes.crm.filter(({ kind }) => kind === 'route')
            .length,
        },
        hrm: {
          pages: inventory.routes.hrm.filter(({ kind }) => kind === 'page').length,
          handlers: inventory.routes.hrm.filter(({ kind }) => kind === 'route')
            .length,
        },
      },
      references: findings.length,
      filesWithReferences: new Set(findings.map(({ file }) => file)).size,
      categories,
      routeScopes,
      highConfidenceDead: highConfidenceDead.length,
      dynamicReview: dynamicReview.length,
    },
  };
}

function location(finding) {
  return `${finding.file}:${finding.line}:${finding.column}`;
}

function groupByTarget(findings) {
  const groups = new Map();
  for (const finding of findings) {
    const key = [
      finding.app,
      finding.raw,
      finding.targetApp ?? '-',
      finding.matchedRoute ?? '-',
    ].join('|');
    const group = groups.get(key) ?? { finding, locations: [] };
    group.locations.push(location(finding));
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.finding.raw.localeCompare(b.finding.raw) ||
      a.finding.app.localeCompare(b.finding.app),
  );
}

function printGroups(title, findings) {
  if (findings.length === 0) return;
  console.log(title);
  for (const { finding, locations } of groupByTarget(findings)) {
    const route = finding.matchedRoute
      ? ` -> ${finding.targetApp}:${finding.matchedRoute}`
      : finding.targetApp
        ? ` -> ${finding.targetApp} (unresolved)`
        : '';
    console.log(
      `  - [${finding.app}] ${finding.raw}${route} (${locations.length} occurrence${locations.length === 1 ? '' : 's'})`,
    );
    for (const item of locations.slice(0, 3)) console.log(`      ${item}`);
    if (locations.length > 3) console.log(`      ... ${locations.length - 3} more`);
  }
  console.log('');
}

function serializableResult(result) {
  const routes = {};
  const publicAssets = {};
  for (const app of APP_NAMES) {
    routes[app] = result.inventory.routes[app].map(({ regex, ...route }) => route);
    publicAssets[app] = [...result.inventory.publicAssets[app]].sort();
  }
  return {
    ...result,
    inventory: { routes, publicAssets },
  };
}

function printHuman(result, { verbose = false } = {}) {
  const { summary, inventory, findings } = result;
  console.log('== Route/link integrity check ==');
  console.log(`Repo: ${result.repoRoot}`);
  console.log(`Time: ${result.generatedAt}`);
  console.log('');
  console.log(
    `Inventory: CRM ${summary.routeCounts.crm.pages} page(s) + ${summary.routeCounts.crm.handlers} handler(s); ` +
      `HRM ${summary.routeCounts.hrm.pages} page(s) + ${summary.routeCounts.hrm.handlers} handler(s).`,
  );
  console.log(
    `Scanned: ${summary.sourceFiles.crm + summary.sourceFiles.hrm} source file(s), ` +
      `${summary.references} href/redirect/linkUrl literal occurrence(s) in ${summary.filesWithReferences} file(s).`,
  );
  console.log('');
  console.log('Classifications:');
  for (const category of CATEGORY_ORDER) {
    console.log(`  ${category.padEnd(18)} ${summary.categories[category]}`);
  }
  console.log('');
  console.log('Resolved route scope (includes API and dynamic templates):');
  for (const scope of ['same-app', 'cross-app', 'unresolved', 'not-a-route']) {
    console.log(`  ${scope.padEnd(18)} ${summary.routeScopes[scope]}`);
  }
  console.log('');

  const dynamicRoutes = APP_NAMES.flatMap((app) =>
    inventory.routes[app]
      .filter(({ pattern }) => pattern.includes('['))
      .map(({ pattern, kind }) => `${app}:${kind}:${pattern}`),
  );
  if (dynamicRoutes.length) {
    console.log('Dynamic/catch-all routes inventoried:');
    for (const route of dynamicRoutes) console.log(`  - ${route}`);
    console.log('');
  }

  printGroups(
    'Cross-app static literals:',
    findings.filter(({ category }) => category === 'cross-app'),
  );
  printGroups(
    'Cross-app dynamic templates:',
    findings.filter(
      ({ category, routeScope }) =>
        category === 'dynamic-template' && routeScope === 'cross-app',
    ),
  );
  printGroups(
    'API targets:',
    findings.filter(({ category }) => category === 'api'),
  );
  printGroups(
    'Dynamic templates needing review:',
    findings.filter(
      ({ category, status }) =>
        category === 'dynamic-template' && status === 'review',
    ),
  );
  printGroups(
    'Probable dead routes:',
    findings.filter(({ category }) => category === 'probable-dead'),
  );

  const allowlistCounts = new Map();
  for (const finding of findings.filter(
    ({ category }) => category === 'allowlisted',
  )) {
    allowlistCounts.set(
      finding.allowlistId,
      (allowlistCounts.get(finding.allowlistId) ?? 0) + 1,
    );
  }
  if (allowlistCounts.size) {
    console.log('Allowlisted non-route literals:');
    for (const [id, count] of [...allowlistCounts].sort()) {
      console.log(`  - ${id}: ${count}`);
    }
    console.log('');
  }

  if (verbose) {
    console.log('Full route inventory:');
    for (const app of APP_NAMES) {
      for (const route of inventory.routes[app]) {
        console.log(`  - ${app}:${route.kind}:${route.pattern} (${route.file})`);
      }
    }
    console.log('');
    console.log('All classified references:');
    for (const finding of findings) {
      console.log(
        `  - [${finding.category}/${finding.status}] ${finding.app} ${finding.raw} @ ${location(finding)}`,
      );
    }
    console.log('');
  }

  if (summary.highConfidenceDead > 0) {
    console.log(
      `RESULT: FAIL — ${summary.highConfidenceDead} high-confidence dead route occurrence(s).`,
    );
  } else {
    console.log(
      `RESULT: PASS — no high-confidence dead routes (${summary.dynamicReview} unresolved dynamic template(s) are review-only).`,
    );
  }
}

function usage() {
  console.log(`Usage: node scripts/check-route-integrity.mjs [--json] [--verbose]

Builds CRM/HRM App Router inventories and scans production source literals used
by href, redirect/permanentRedirect, and linkUrl. Tests, generated code, browser
anchors, contact links, external origins, and verified public assets do not fail
the gate.`);
}

export function exitCodeFor(result) {
  return result.summary.highConfidenceDead > 0 ? 1 : 0;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help') || args.has('-h')) {
    usage();
    return;
  }
  const unknown = [...args].filter(
    (arg) => arg !== '--json' && arg !== '--verbose',
  );
  if (unknown.length) throw new Error(`Unknown option(s): ${unknown.join(', ')}`);

  const result = runIntegrityCheck(defaultRepoRoot);
  if (args.has('--json')) {
    console.log(JSON.stringify(serializableResult(result), null, 2));
  } else {
    printHuman(result, { verbose: args.has('--verbose') });
  }
  process.exitCode = exitCodeFor(result);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() === modulePath.toLowerCase()
) {
  main().catch((error) => {
    console.error(
      `FATAL: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 2;
  });
}
