import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import ts from 'typescript';
import MagicString from 'magic-string';
import { createBundle } from 'dts-buddy';

const output = 'types/index.d.ts';
const repoRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

// Submodules emitted as trivial re-export blocks from the root 'bpmn-elements'
// module. Every name in the source index must already be re-exported by
// `types/bundle.d.ts`.
const reexportSubmodules = [
  { name: 'events', source: 'src/events/index.js' },
  { name: 'eventDefinitions', source: 'src/eventDefinitions/index.js' },
  { name: 'flows', source: 'src/flows/index.js' },
  { name: 'gateways', source: 'src/gateways/index.js' },
  { name: 'tasks', source: 'src/tasks/index.js' },
];

// dts-buddy collapses multiple `export X as Y` aliases of the same source export
// to a single name (the last in source order). We keep the canonical name in
// `bundle.d.ts` and inject the lost BPMN-spec aliases back into the root module
// after the bundle is emitted, so consumers can still
// `import { SendTask } from 'bpmn-elements'`.
const rootAliases = {
  ServiceTask: ['BusinessRuleTask', 'SendTask'],
  SignalTask: ['ManualTask', 'UserTask'],
  SubProcess: ['AdHocSubProcess'],
};

// Point dts-buddy at hand-written bundle entries that re-export the runtime
// classes from `src/*.js`. The root entry carries every public name so the
// submodule re-export blocks (appended below) can simply forward to it.
// `bpmn-elements/errors` keeps its own dts-buddy entry because its `BpmnError`
// is a JS Error subclass — distinct from the root's `BpmnError` activity element.
createBundle({
  project: 'tsconfig.json',
  output,
  modules: {
    'bpmn-elements': 'types/bundle.d.ts',
    'bpmn-elements/errors': 'types/bundle-errors.d.ts',
  },
})
  .then(() => {
    let bundle = readFileSync(output, 'utf8');

    // tsc emits both `export function Foo(...): Foo;` AND `export class Foo { ... }`
    // for constructor functions in JS. The function declaration overshadows the class
    // for type-level constructor checks (`Foo extends new (...args) => any`), so strip it.
    bundle = bundle.replace(/^(\s*)(?:export )?function (\w+)\([^)]*\)[^;]*;\n(\s*)((?:export )?class \2\b)/gm, '$1$3$4');

    // dts-buddy's stripInternal removes `@internal` declarations, properties, and accessors.
    // The symbol-keyed slots are tagged at their usage (`/** @internal */ this[K_FOO] = …`), so
    // dts-buddy drops the property and then tree-shakes the now-unreferenced `K_FOO` symbol const —
    // no need to tag the const itself. It does not strip `@internal` *methods*, `private`, or
    // underscore-named members, so walk class declarations and remove those here.
    bundle = stripClassMembers(bundle);

    // The errors module redeclares ActivityError / RunError that already live in the
    // root bundle. Hoist them so the emitted block re-imports from 'bpmn-elements'.
    bundle = hoistSharedTypes(bundle);

    // Restore BPMN-spec aliases that dts-buddy collapsed away (see `rootAliases`).
    bundle = injectRootAliases(bundle, rootAliases);

    // Append `declare module 'bpmn-elements/<sub>' { export { ... } from 'bpmn-elements' }`
    // for every submodule whose surface is a pure re-export of the root.
    bundle = bundle.replace(/\s*$/, '\n');
    for (const sub of reexportSubmodules) {
      const names = collectExportedNames(resolvePath(repoRoot, sub.source));
      bundle += `\ndeclare module 'bpmn-elements/${sub.name}' {\n\texport { ${names.join(', ')} } from 'bpmn-elements';\n}\n`;
    }

    // The declaration map dts-buddy emits is stale after our rewrites — drop it
    // and remove the sourceMappingURL comment.
    bundle = bundle.replace(/\n*\/\/# sourceMappingURL=.*$/m, '\n');
    rmSync(`${output}.map`, { force: true });

    writeFileSync(output, bundle);
  })
  .catch((err) => {
    throw err;
  });

/**
 * Parse a JS source file and return the external names it exports, in source order.
 * Handles `export { a, b as c }`, `export { a } from './x.js'`, `export class A {}`,
 * and `export function A() {}`. Duplicates are de-duped.
 *
 * @param {string} filePath
 * @returns {string[]}
 */
function collectExportedNames(filePath) {
  const source = readFileSync(filePath, 'utf8');
  const ast = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);

  /** @type {string[]} */
  const names = [];
  const seen = new Set();
  const push = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    names.push(name);
  };

  for (const stmt of ast.statements) {
    if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const element of stmt.exportClause.elements) {
        push(element.name.text);
      }
      continue;
    }
    if ((ts.isClassDeclaration(stmt) || ts.isFunctionDeclaration(stmt)) && hasExportModifier(stmt) && stmt.name) {
      push(stmt.name.text);
    }
  }

  return names;
}

/**
 * @param {string} source
 * @returns {string}
 */
function stripClassMembers(source) {
  const ast = ts.createSourceFile('bundle.d.ts', source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const magic = new MagicString(source);

  /** @param {ts.Node} node */
  function visit(node) {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      for (const member of node.members) {
        if (hasPrivateModifier(member) || hasUnderscoreName(member)) {
          magic.remove(member.getFullStart(), member.getEnd());
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(ast, visit);

  return magic.toString();
}

/** @param {ts.Node} node */
function hasPrivateModifier(node) {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return !!modifiers?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword);
}

/** @param {ts.ClassElement} node */
function hasUnderscoreName(node) {
  const name = node.name;
  if (!name || !ts.isIdentifier(name)) return false;
  return name.text.startsWith('_');
}

/**
 * @param {string} source
 * @returns {string}
 */
function hoistSharedTypes(source) {
  const ast = ts.createSourceFile('bundle.d.ts', source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const magic = new MagicString(source);

  /** @type {ts.ModuleDeclaration[]} */
  const modules = [];
  for (const stmt of ast.statements) {
    if (ts.isModuleDeclaration(stmt) && ts.isStringLiteral(stmt.name) && stmt.name.text.startsWith('bpmn-elements')) {
      modules.push(stmt);
    }
  }

  const root = modules.find((m) => /** @type {ts.StringLiteral} */ (m.name).text === 'bpmn-elements');
  if (!root || !root.body || !ts.isModuleBlock(root.body)) return source;

  // Collect exported declarations from the root module, keyed by name. Submodule
  // redeclarations only count as hoist candidates when the root has the *same* kind
  // — `BpmnError` is a class in `bpmn-elements/errors` but a function (activity
  // factory) in root, so it must not be aliased onto the root export.
  /** @type {Map<string, ts.SyntaxKind>} */
  const rootExports = new Map();
  for (const stmt of root.body.statements) {
    if (!hasExportModifier(stmt)) continue;
    const name = getDeclName(stmt);
    if (name) rootExports.set(name, stmt.kind);
  }

  for (const mod of modules) {
    if (mod === root) continue;
    if (!mod.body || !ts.isModuleBlock(mod.body)) continue;

    const stripped = new Set();
    let insertBefore = null;

    for (const stmt of mod.body.statements) {
      if (insertBefore === null && !ts.isImportDeclaration(stmt)) insertBefore = stmt;

      const name = getDeclName(stmt);
      if (!name) continue;
      const rootKind = rootExports.get(name);
      if (rootKind === undefined || rootKind !== stmt.kind) continue;

      // The declaration is redundant — strip it. If it was exported, replace with a
      // `export { name } from 'bpmn-elements'` so the symbol is still re-exported.
      magic.remove(stmt.getFullStart(), stmt.getEnd());
      stripped.add({ name, exported: hasExportModifier(stmt) });
    }

    if (stripped.size === 0) continue;

    const imported = [...stripped]
      .filter((s) => !s.exported)
      .map((s) => s.name)
      .sort();
    const reexported = [...stripped]
      .filter((s) => s.exported)
      .map((s) => s.name)
      .sort();

    // Re-exports (`export { X } from 'bpmn-elements'`) don't introduce a local
    // binding — they're invisible to surviving declarations in the same module.
    // Pair the re-export with a value import so the name resolves both ways.
    let block = '';
    if (imported.length) block += `\timport type { ${imported.join(', ')} } from 'bpmn-elements';\n`;
    if (reexported.length) {
      block += `\timport { ${reexported.join(', ')} } from 'bpmn-elements';\n`;
      block += `\texport { ${reexported.join(', ')} };\n`;
    }

    if (block && insertBefore) {
      magic.appendLeft(insertBefore.getFullStart(), `\n${block}`);
    }
  }

  return magic.toString();
}

/**
 * Insert `export const Alias: typeof Canonical;` lines into the root
 * 'bpmn-elements' module, for every alias whose canonical name is exported.
 *
 * @param {string} source
 * @param {Record<string, string[]>} aliasMap canonical name → alias names
 * @returns {string}
 */
function injectRootAliases(source, aliasMap) {
  const ast = ts.createSourceFile('bundle.d.ts', source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);

  let root = null;
  for (const stmt of ast.statements) {
    if (ts.isModuleDeclaration(stmt) && ts.isStringLiteral(stmt.name) && stmt.name.text === 'bpmn-elements') {
      root = stmt;
      break;
    }
  }
  if (!root || !root.body || !ts.isModuleBlock(root.body)) return source;

  const exported = new Set();
  for (const stmt of root.body.statements) {
    if (!hasExportModifier(stmt)) continue;
    const name = getDeclName(stmt);
    if (name) exported.add(name);
  }

  const lines = [];
  for (const [canonical, aliases] of Object.entries(aliasMap)) {
    if (!exported.has(canonical)) continue;
    for (const alias of aliases) {
      if (exported.has(alias)) continue;
      lines.push(`\texport const ${alias}: typeof ${canonical};`);
    }
  }
  if (lines.length === 0) return source;

  const magic = new MagicString(source);
  // Insert immediately before the closing brace of the root module body.
  const insertAt = root.body.getEnd() - 1;
  magic.appendLeft(insertAt, `${lines.join('\n')}\n`);
  return magic.toString();
}

/** @param {ts.Node} node */
function hasExportModifier(node) {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return !!modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

/**
 * @param {ts.Node} node
 * @returns {string | null}
 */
function getDeclName(node) {
  if (
    ts.isClassDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node)
  ) {
    return node.name?.text ?? null;
  }
  if (ts.isVariableStatement(node)) {
    const decls = node.declarationList.declarations;
    if (decls.length === 1 && ts.isIdentifier(decls[0].name)) return decls[0].name.text;
  }
  return null;
}
