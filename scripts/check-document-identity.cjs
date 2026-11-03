/* eslint-disable @typescript-eslint/no-require-imports */
/** Focused pure-contract tests; no browser, user document or storage is touched. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const file = path.resolve(__dirname, '../lib/document-identity.ts');
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
const api = new Function('exports', compiled + ';return exports;')({});
const { identityKind, isDocumentIdentity, allocateDocumentIdentity, planDocumentIdentities, resolveIdentityReference } = api;
const token = n => n.toString(16).padStart(32, '0');
const id = (prefix, n) => `${prefix}_${token(n)}`;
const entropy = (start = 100) => { let n = start; return () => token(n++); };

test('typed opaque IDs are canonical and independent of names, positions and native Word IDs', () => {
  assert.equal(identityKind(id('sec', 1)), 'section'); assert.equal(isDocumentIdentity(id('sec', 1), 'target'), false);
  for (const invalid of ['FixtureTarget', '0', '-1', 'section-1', id('tgt', 1).toUpperCase(), '', null, {}]) assert.equal(identityKind(invalid), null);
  const made = allocateDocumentIdentity('target', new Set(), () => '550E8400-E29B-41D4-A716-446655440000');
  assert.equal(made, 'tgt_550e8400e29b41d4a716446655440000'); assert.equal(made.length, 36);
});
test('allocation retries collisions without mutating occupied IDs or accepting weak entropy', () => {
  const occupied = new Set([id('nte', 1), id('nte', 2)]), initial = [...occupied];
  assert.equal(allocateDocumentIdentity('note', occupied, entropy(1)), id('nte', 3)); assert.deepEqual([...occupied], initial);
  assert.throws(() => allocateDocumentIdentity('note', occupied, () => 'timestamp-123'), /entropy/);
  let calls = 0; assert.throws(() => allocateDocumentIdentity('note', occupied, () => { calls++; return token(1); }), /unique/); assert.equal(calls, 32);
});
test('load preserves valid identities and allocates only absent or invalid definitions', () => {
  const records = [{ key: 's0', kind: 'section', id: id('sec', 1) }, { key: 's1', kind: 'section' }, { key: 'n0', kind: 'note', id: '4' }];
  const before = JSON.stringify(records), plan = planDocumentIdentities(records, { mode: 'preserve', createToken: entropy() });
  assert.equal(plan.assignments[0].id, id('sec', 1)); assert.deepEqual(plan.assignments.map(a => a.reason), ['preserved', 'missing', 'invalid']);
  assert.equal(resolveIdentityReference(id('sec', 1), 'section', plan).status, 'mapped'); assert.equal(JSON.stringify(records), before);
});
test('inherited object keys never become identity kinds, even from malformed external input', () => {
  let calls = 0; const createToken = () => { calls++; return token(calls); };
  for (const kind of ['toString', '__proto__', 'constructor', 'hasOwnProperty']) {
    assert.throws(() => allocateDocumentIdentity(kind, new Set(), createToken), /identity kind/);
    assert.throws(() => planDocumentIdentities([{ key: 'malformed', kind }], { mode: 'clone', createToken }), /identity kind/);
  }
  assert.equal(calls, 0, 'reject malformed kinds before allocating any IDs');
});
test('fresh IDs cannot steal IDs from later incoming definitions', () => {
  const plan = planDocumentIdentities([{ key: 'missing', kind: 'target' }, { key: 'later', kind: 'target', id: id('tgt', 1) }], { mode: 'preserve', createToken: entropy(1) });
  assert.equal(plan.assignments[0].id, id('tgt', 2)); assert.equal(plan.assignments[1].id, id('tgt', 1));
});
test('duplicate definitions get distinct IDs but their references stay explicitly ambiguous', () => {
  const old = id('tgt', 1), plan = planDocumentIdentities([{ key: 'a', kind: 'target', id: old }, { key: 'b', kind: 'target', id: old }], { mode: 'preserve', createToken: entropy() });
  assert.equal(new Set(plan.assignments.map(a => a.id)).size, 2); assert.equal(plan.remap.has(old), false);
  assert.equal(resolveIdentityReference(old, 'target', plan, new Set([old])).status, 'ambiguous');
});
test('destination collisions remap only the incoming graph', () => {
  const old = id('tgt', 1), occupied = new Set([old]);
  const plan = planDocumentIdentities([{ key: 'incoming', kind: 'target', id: old }], { mode: 'preserve', occupied, createToken: entropy() });
  assert.equal(plan.assignments[0].reason, 'collision'); assert.notEqual(plan.assignments[0].id, old);
  assert.equal(resolveIdentityReference(old, 'target', plan).id, plan.assignments[0].id); assert.deepEqual([...occupied], [old]);
});
test('copy allocates every cloned definition and remaps all internal edges', () => {
  const records = [{ key: 'heading', kind: 'target', id: id('tgt', 1) }, { key: 'ref', kind: 'field', id: id('fld', 2) }, { key: 'note', kind: 'note', id: id('nte', 3) }, { key: 'source', kind: 'source', id: id('src', 4) }];
  const plan = planDocumentIdentities(records, { mode: 'clone', createToken: entropy() });
  for (const record of records) { const assigned = plan.assignments.find(a => a.key === record.key); assert.notEqual(assigned.id, record.id); assert.equal(resolveIdentityReference(record.id, record.kind, plan).id, assigned.id); }
  const external = id('tgt', 99); assert.equal(resolveIdentityReference(external, 'target', plan).status, 'unresolved');
  assert.equal(resolveIdentityReference(external, 'target', plan, new Set([external])).status, 'existing');
  assert.equal(resolveIdentityReference(id('src', 4), 'target', plan).status, 'invalid');
});
test('bad definition keys fail before allocating any IDs', () => {
  let calls = 0; const createToken = () => { calls++; return token(calls); };
  assert.throws(() => planDocumentIdentities([{ key: 'same', kind: 'section' }, { key: 'same', kind: 'section' }], { mode: 'clone', createToken }), /unique/);
  assert.equal(calls, 0);
  assert.throws(() => planDocumentIdentities([], { mode: 'unknown', createToken }), /mode/);
});
test('a migrated graph is idempotent and requires no entropy on the next load', () => {
  const first = planDocumentIdentities([{ key: 's', kind: 'section' }, { key: 'n', kind: 'note' }], { mode: 'preserve', createToken: entropy() });
  const second = planDocumentIdentities(first.assignments.map(a => ({ key: a.key, kind: a.kind, id: a.id })), { mode: 'preserve', createToken: () => { throw new Error('should not allocate'); } });
  assert.deepEqual(second.assignments.map(a => a.id), first.assignments.map(a => a.id));
});
