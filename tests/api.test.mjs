import test from 'node:test'
import assert from 'node:assert/strict'
import { registerApi } from '../lib/api.js'

const routes = new Map()
const settings = {
  sshExecutable: 'missing-ssh-executable-for-test', defaultTimeoutMs: 100,
  maxTransferBytes: 16, transferTimeoutMs: 100,
}
registerApi({
  effect: callback => callback(),
  connection: { fetch: { register: route => {
    routes.set(route.path, route)
    return () => routes.delete(route.path)
  } } },
}, settings)

async function call(endpoint, body) {
  const response = await routes.get(`/api/ssh/${endpoint}`).fetch(new Request('http://localhost/api', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }))
  return { status: response.status, body: await response.json() }
}

test('JSON API rejects arrays and invalid command timeouts before starting SSH', async () => {
  assert.match((await call('exec', [])).body.reason, /JSON object/)
  for (const timeout_ms of [-1, 0, 1.5, '100', 600001]) {
    const response = await call('exec', { host: 'test', command: 'true', timeout_ms })
    assert.equal(response.status, 400)
    assert.match(response.body.reason, /timeout_ms/)
  }
})

test('file windows require positive integer offsets and limits', async () => {
  for (const params of [{ offset: 0 }, { offset: '1oops' }, { limit: -1 }, { limit: 100001 }]) {
    const response = await call('file', { host: 'test', path: '/file', ...params })
    assert.equal(response.status, 400)
    assert.match(response.body.reason, /offset|limit/)
  }
})

test('binary upload rejects malformed base64 and oversized payloads', async () => {
  for (const content_base64 of ['not base64!', 'Zg', 'Zh==', '====']) {
    const response = await call('file/put', { host: 'test', path: '/file', content_base64 })
    assert.equal(response.status, 400)
    assert.match(response.body.reason, /base64/)
  }
  assert.match((await call('file/put', {
    host: 'test', path: '/file', content_base64: Buffer.alloc(17).toString('base64'),
  })).body.reason, /transfer limit/)
})

test('empty text and binary files pass payload validation', async () => {
  for (const [endpoint, params] of [['write', { content: '' }], ['file/put', { content_base64: '' }]]) {
    const response = await call(endpoint, { host: 'test', path: '/file', ...params })
    assert.equal(response.body.ok, false)
    assert.match(response.body.reason, /spawn|ENOENT/i)
  }
})
