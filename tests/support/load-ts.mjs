// Loads the app's plain TypeScript modules (no React, no bundler) into a vm context so unit tests can run them as they
// ship. Type-only syntax is transpiled away; `import` lines are dropped, so a module's dependencies must be loaded
// into the same context first (see loadDashboardMetrics).
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

export function loadTs(file, context) {
  const source = fs.readFileSync(file, 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export (const|let) /gm, 'var ').replace(/^export /gm, '');
  vm.runInContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context);
  return context;
}

/** Values built inside the vm belong to another realm; a JSON round trip makes them comparable with assert.deepEqual. */
export const plain = (value) => JSON.parse(JSON.stringify(value));

export function loadDashboardMetrics() {
  const context = vm.createContext({});
  loadTs('src/utils/reservationsExport.ts', context);
  return loadTs('src/utils/dashboardMetrics.ts', context);
}
