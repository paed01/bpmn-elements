import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
import MagicString from 'magic-string';
import { createBundle } from 'dts-buddy';

const output = 'types/index.d.ts';

// Point dts-buddy at hand-written bundle entries that re-export the runtime
// classes from `src/*.js` once each plus the shared interfaces from
// `types/interfaces.d.ts`. This gives a single source of truth per name
// (no `_1` aliases) and avoids cross-sub-module duplication.
createBundle({
  project: 'tsconfig.json',
  output,
  modules: {
    'bpmn-elements': 'types/bundle.d.ts',
    'bpmn-elements/errors': 'types/bundle-errors.d.ts',
    'bpmn-elements/events': 'types/bundle-events.d.ts',
    'bpmn-elements/eventDefinitions': 'types/bundle-eventDefinitions.d.ts',
    'bpmn-elements/flows': 'types/bundle-flows.d.ts',
    'bpmn-elements/gateways': 'types/bundle-gateways.d.ts',
    'bpmn-elements/tasks': 'types/bundle-tasks.d.ts',
  },
})
  .then(() => {
    let bundle = readFileSync(output, 'utf8');

    // tsc emits both `export function Foo(...): Foo;` AND `export class Foo { ... }`
    // for constructor functions in JS. The function declaration overshadows the class
    // for type-level constructor checks (`Foo extends new (...args) => any`), so strip it.
    bundle = bundle.replace(/^(\s*)(?:export )?function (\w+)\([^)]*\)[^;]*;\n(\s*)((?:export )?class \2\b)/gm, '$1$3$4');

    // dts-buddy's stripInternal only catches `PropertySignature` (interface members),
    // not class members. Walk class declarations and remove members marked `@internal`
    // or `private` so they don't leak into the public bundle.
    bundle = stripClassMembers(bundle);

    // dts-buddy emits a self-contained type tree per module, so types exported from
    // the root (`bpmn-elements`) get re-declared inside every sub-module that references
    // them. Strip those redeclarations and `import type` from the root instead.
    bundle = hoistSharedTypes(bundle);

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
 * @param {string} source
 * @returns {string}
 */
function stripClassMembers(source) {
  const ast = ts.createSourceFile('bundle.d.ts', source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const magic = new MagicString(source);

  const referencedSymbols = new Set();

  /** @param {ts.Node} node */
  function visit(node) {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      for (const member of node.members) {
        if (isInternalMember(member) || hasPrivateModifier(member) || hasUnderscoreName(member) || hasComputedSymbolName(member)) {
          magic.remove(member.getFullStart(), member.getEnd());
        } else {
          // surviving members may reference symbol constants; record them so the
          // orphan-declaration sweep below doesn't drop those.
          recordSymbolReferences(member, referencedSymbols);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(ast, visit);

  // Symbol-keyed slots are inherently private storage; any `const K_FOO: unique symbol;`
  // left without references is dead weight in the public bundle.
  /** @param {ts.Node} node */
  function dropOrphanSymbols(node) {
    if (ts.isVariableStatement(node)) {
      const decls = node.declarationList.declarations;
      if (decls.length === 1) {
        const decl = decls[0];
        if (
          ts.isIdentifier(decl.name) &&
          decl.type &&
          (decl.type.kind === ts.SyntaxKind.UniqueKeyword) === false &&
          ts.isTypeOperatorNode(decl.type) &&
          decl.type.operator === ts.SyntaxKind.UniqueKeyword
        ) {
          if (!referencedSymbols.has(decl.name.text)) {
            magic.remove(node.getFullStart(), node.getEnd());
          }
        }
      }
    }
    ts.forEachChild(node, dropOrphanSymbols);
  }
  ts.forEachChild(ast, dropOrphanSymbols);

  return magic.toString();
}

/** @param {ts.Node} node */
function isInternalMember(node) {
  const jsdoc = ts.getJSDocTags(node);
  return jsdoc.some((tag) => tag.tagName.escapedText === 'internal');
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

/** @param {ts.ClassElement} node */
function hasComputedSymbolName(node) {
  const name = node.name;
  return !!name && ts.isComputedPropertyName(name) && ts.isIdentifier(name.expression);
}

/**
 * @param {ts.Node} root
 * @param {Set<string>} out
 */
function recordSymbolReferences(root, out) {
  /** @param {ts.Node} node */
  function visit(node) {
    if (ts.isIdentifier(node) && /^K_[A-Z0-9_]+$/.test(node.text)) {
      out.add(node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(root);
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

  // Collect names exported from the root module — these are the candidates for hoisting.
  const rootExports = new Set();
  for (const stmt of root.body.statements) {
    if (!hasExportModifier(stmt)) continue;
    const name = getDeclName(stmt);
    if (name) rootExports.add(name);
  }

  for (const mod of modules) {
    if (mod === root) continue;
    if (!mod.body || !ts.isModuleBlock(mod.body)) continue;

    const stripped = new Set();
    let insertBefore = null;

    for (const stmt of mod.body.statements) {
      if (insertBefore === null && !ts.isImportDeclaration(stmt)) insertBefore = stmt;

      // private redeclarations have no `export` modifier; sub-module's own exports stay.
      if (hasExportModifier(stmt)) continue;

      const name = getDeclName(stmt);
      if (name && rootExports.has(name)) {
        magic.remove(stmt.getFullStart(), stmt.getEnd());
        stripped.add(name);
      }
    }

    if (stripped.size === 0) continue;

    const imports = [...stripped].sort();
    const importStmt = `\timport type { ${imports.join(', ')} } from 'bpmn-elements';\n`;

    if (insertBefore) {
      magic.appendLeft(insertBefore.getFullStart(), `\n${importStmt}`);
    }
  }

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
