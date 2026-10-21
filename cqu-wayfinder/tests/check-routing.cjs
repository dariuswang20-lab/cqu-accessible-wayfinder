const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../dist/app.js'), 'utf8');
const sandbox = { document: { addEventListener() {} } };
vm.runInNewContext(source + '\n;globalThis.routing = { shortestPath, findAlternate };', sandbox);
const { shortestPath, findAlternate } = sandbox.routing;
const baseline = {
  origin: 'entrance', destination: 'room205', mobility: 'wheelchair',
  priority: 'balanced', liftClosed: false, eastClosed: false, crowded: false
};

test('wheelchair route uses the lift and never the stairs', () => {
  const route = shortestPath(baseline);
  assert.ok(route);
  assert.ok(route.path.includes('lift1'));
  assert.ok(route.path.includes('lift2'));
  assert.ok(!route.path.includes('stairs2'));
});

test('closed lift makes the upper floor unreachable without stairs', () => {
  assert.equal(shortestPath({ ...baseline, liftClosed: true }), null);
});

test('walking user retains a route when the lift is closed', () => {
  const route = shortestPath({ ...baseline, mobility: 'walking', liftClosed: true });
  assert.ok(route);
  assert.ok(route.path.includes('stairs2'));
});

test('closed corridor creates a detour without passing through a classroom', () => {
  const normal = shortestPath(baseline);
  const detour = shortestPath({ ...baseline, eastClosed: true });
  assert.ok(detour);
  assert.ok(detour.meters > normal.meters);
  assert.ok(!detour.path.includes('room201'));
  assert.ok(!detour.path.includes('center2') || !detour.path.includes('east2'));
});

test('alternative route differs from the recommendation', () => {
  const route = shortestPath(baseline);
  const alternate = findAlternate(baseline, route);
  assert.ok(alternate);
  assert.notDeepEqual([...alternate.path], [...route.path]);
});
