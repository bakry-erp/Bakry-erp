import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const match = html.match(/<script id="bakry-auth-state-bootstrap">([\s\S]*?)<\/script>/);
assert.ok(match, 'early auth bootstrap script exists in index.html');

function runBootstrap({ cloudToken = '', localRole = '' } = {}) {
  const classes = new Set();
  const attributes = new Map();
  const root = {
    classList: {
      add(value) { classes.add(value); },
      contains(value) { return classes.has(value); }
    },
    setAttribute(name, value) { attributes.set(name, value); }
  };
  const context = {
    document: { documentElement: root },
    sessionStorage: { getItem(key) { return key === 'bakry_tenant_token' ? cloudToken : key === 'motomax_session' ? localRole : null; } }
  };
  vm.runInNewContext(match[1], context, { filename: 'bakry-auth-state-bootstrap.js' });
  return { classes, attributes };
}

test('valid local and cloud sessions enter the pending state before first paint', () => {
  assert.ok(runBootstrap({ localRole: 'admin' }).classes.has('bakry-auth-pending'));
  assert.ok(runBootstrap({ cloudToken: 'signed-token' }).classes.has('bakry-auth-pending'));
});

test('a tab without a valid saved session keeps the login screen available', () => {
  assert.equal(runBootstrap().classes.has('bakry-auth-pending'), false);
  assert.equal(runBootstrap({ localRole: 'unknown-role' }).classes.has('bakry-auth-pending'), false);
});
