import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertAllowedWrite } from './allowed_writes.mjs';

const ctx = { digestNumber: 174 };
const allowed = (req) => assert.doesNotThrow(() => assertAllowedWrite(req, ctx));
const refused = (req, context = ctx) =>
  assert.throws(() => assertAllowedWrite(req, context), /write refused/);

test('the three allowed shapes pass', () => {
  allowed({ method: 'POST', path: '/issues/5/labels', body: { labels: ['P2'] } });
  allowed({
    method: 'POST',
    path: '/issues/5/labels',
    body: { labels: ['P1', 'needs-verification'] },
  });
  allowed({ method: 'POST', path: '/issues/174/comments', body: { body: 'text' } });
  allowed({ method: 'PATCH', path: '/issues/174', body: { body: 'text' } });
});

test('replacing or removing labels is refused', () => {
  refused({ method: 'PUT', path: '/issues/5/labels', body: { labels: ['P2'] } });
  refused({ method: 'DELETE', path: '/issues/5/labels', body: {} });
  refused({ method: 'DELETE', path: '/issues/5/labels/P2', body: {} });
});

test('editing anything but the digest body is refused', () => {
  refused({ method: 'PATCH', path: '/issues/174', body: { state: 'closed' } });
  refused({ method: 'PATCH', path: '/issues/174', body: { labels: ['P0'] } });
  refused({ method: 'PATCH', path: '/issues/174', body: { body: 'x', state: 'closed' } });
  refused({ method: 'PATCH', path: '/issues/5', body: { body: 'x' } });
});

test('comments are allowed only on the digest issue', () => {
  refused({ method: 'POST', path: '/issues/5/comments', body: { body: 'x' } });
  refused({ method: 'POST', path: '/issues/174/comments', body: { body: 'x' } }, {});
});

test('label sets outside one P label plus needs-verification are refused', () => {
  refused({ method: 'POST', path: '/issues/5/labels', body: { labels: ['P0', 'P1'] } });
  refused({ method: 'POST', path: '/issues/5/labels', body: { labels: ['bug'] } });
  refused({ method: 'POST', path: '/issues/5/labels', body: { labels: ['P2', 'bug'] } });
  refused({ method: 'POST', path: '/issues/5/labels', body: { labels: ['needs-verification'] } });
  refused({ method: 'POST', path: '/issues/5/labels', body: { labels: ['P2', 'P2'] } });
  refused({ method: 'POST', path: '/issues/5/labels', body: { labels: [] } });
  refused({ method: 'POST', path: '/issues/5/labels', body: { labels: 'P2' } });
  refused({ method: 'POST', path: '/issues/5/labels', body: { labels: ['P2'], extra: 1 } });
});

test('the digest issue is never labeled', () => {
  refused({ method: 'POST', path: '/issues/174/labels', body: { labels: ['P2'] } });
});

test('other endpoints and malformed paths are refused', () => {
  refused({ method: 'POST', path: '/issues', body: { title: 'x' } });
  refused({ method: 'POST', path: '/issues/5/assignees', body: { assignees: ['a'] } });
  refused({ method: 'POST', path: '/issues/5/labels/../comments', body: { labels: ['P2'] } });
  refused({ method: 'POST', path: '/issues/05/labels', body: { labels: ['P2'] } });
  refused({ method: 'POST', path: '/issues/5/labels?x=1', body: { labels: ['P2'] } });
  refused({ method: 'POST', path: '/issues/$(id)/labels', body: { labels: ['P2'] } });
});
