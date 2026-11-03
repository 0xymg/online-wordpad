/* eslint-disable @typescript-eslint/no-require-imports */
/** Font stylesheet discovery must finish before note geometry is measured. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('lib/editor-fonts.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function runtime(withDocument = true) {
  const links = [], timers = new Set(), exports = {};
  const context = {
    exports,
    setTimeout(fn) { timers.add(fn); return fn; },
    clearTimeout(fn) { timers.delete(fn); },
    ...(withDocument ? { document: {
      createElement() {
        const events = {};
        return { addEventListener(name, fn) { events[name] = fn; }, remove() { this.removed = true; }, emit(name) { events[name]?.(); } };
      },
      head: { appendChild(link) { links.push(link); } },
    } } : {}),
  };
  vm.runInNewContext(code, context);
  return { api: exports, links, timers };
}
(async () => {
  const { api, links, timers } = runtime();
  let settled = false;
  api.ensureEditorFont('Inter');
  const pending = api.waitForEditorFontStyles(['"Inter", sans-serif', 'Inter', 'Calibri', 'Unknown']).then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(links.length, 1, 'one link across concurrent discovery');
  assert.equal(settled, false, 'fonts.ready alone must not bypass pending CSS');
  links[0].emit('load');
  await pending;
  assert.equal(settled, true);
  assert.equal(timers.size, 0);
  const failed = api.waitForEditorFontStyles(['Roboto']);
  links[1].emit('error');
  await assert.rejects(failed, /could not load/);
  assert.equal(links[1].removed, true);
  const retry = api.waitForEditorFontStyles(['Roboto']);
  assert.equal(links.length, 3);
  links[2].emit('load');
  await retry;
  const timeout = api.waitForEditorFontStyles(['Lato']);
  for (const timer of timers) timer();
  await assert.rejects(timeout, /did not load/);
  assert.equal(timers.size, 0);
  links[3].emit('load');
  await api.waitForEditorFontStyles(['Lato']);
  await runtime(false).api.waitForEditorFontStyles(['Inter']);
  console.log('PASS note font barrier: pending CSS, deduplication, failure/retry, bounded timeout, late recovery and SSR');
})().catch(error => { console.error(error); process.exitCode = 1; });
