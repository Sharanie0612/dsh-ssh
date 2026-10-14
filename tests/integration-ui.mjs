// Opt-in real browser -> authenticated DSH Connection -> SSH -> Linux test.
import assert from 'node:assert/strict'
import { createUiHandler, runUiSmoke } from './ui-smoke.mjs'
import { startLiveServer } from './helpers/live-server.mjs'

const server = await startLiveServer({ handlePage: await createUiHandler() })
try {
  const unauthorized = await fetch(`${server.origin}/api/ssh/hosts`, { method: 'POST', body: '{}' })
  assert.equal(unauthorized.status, 401)
  const crossSite = await fetch(`${server.origin}/api/ssh/hosts`, {
    method: 'POST', body: '{}', headers: { origin: 'https://untrusted.example' },
  })
  assert.equal(crossSite.status, 403)
  console.log('PASS real DSH transport rejects unauthenticated and cross-site requests')
  const result = await runUiSmoke({
    url: server.authenticatedUrl, hostAlias: process.argv[2] ?? 'ubuntu-vm', live: true,
  })
  console.log(JSON.stringify({
    browserChecks: result.checks.length, runtimeErrors: result.errors.length,
    requests: result.calls.length, screenshotPath: result.screenshotPath,
  }, null, 2))
} finally {
  await server.close()
}
// Bundled node-pty can keep finished ConPTY output workers referenced. End only
// this standalone test after all assertions and awaited service cleanup.
process.exit(process.exitCode ?? 0)
