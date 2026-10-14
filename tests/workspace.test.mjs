import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspaceController, createWorkspaceSelections, parseWorkspace } from '../lib/workspace.js'
import { createRemoteContexts } from '../lib/session.js'

test('durable remote selections restore defaults independently for each conversation', async () => {
  const records = new Map()
  let writes = 0
  const table = { get: id => records.get(id), async put(id, value) { writes++; records.set(id, value) } }
  const selections = createWorkspaceSelections()
  const detach = selections.attach(table)
  await selections.put('one', { host: 'vm', cwd: '/工程 with spaces', file: '/工程 with spaces/app.js' })
  const restored = createWorkspaceSelections()
  restored.attach(table)
  const contexts = createRemoteContexts(id => restored.get(id))
  assert.equal(contexts.get('one').cwd, '/工程 with spaces')
  assert.equal(contexts.get('two'), undefined)
  contexts.set('one', { host: 'vm' })
  assert.equal(contexts.get('one').cwd, '/工程 with spaces')
  contexts.clear('one')
  assert.equal(contexts.get('one'), undefined)
  contexts.set('one', { host: 'other' })
  assert.equal(contexts.get('one').cwd, null)
  assert.equal(writes, 1)
  assert.equal(selections.durable, true)
  detach()
  assert.equal(selections.durable, false)
})

test('workspace storage fails atomically and rejects malformed targets', async () => {
  const selections = createWorkspaceSelections()
  selections.attach({ get() {}, async put() { throw new Error('disk full') } })
  await assert.rejects(selections.put('one', { host: 'vm', cwd: '/project', file: null }), /disk full/)
  assert.equal(selections.get('one'), undefined)
  for (const value of [
    { host: '-oProxyCommand=bad', cwd: '/project', file: null },
    { host: 'vm', cwd: 'relative', file: null },
    { host: 'vm', cwd: '/project\0bad', file: null },
    { host: 'vm', cwd: '/project', file: 'relative' },
  ]) assert.throws(() => parseWorkspace(value))
})

test('workspace admission rejects unknown and running conversations before SSH or mutation', async () => {
  const selections = createWorkspaceSelections()
  const contexts = createRemoteContexts()
  const running = { id: 'running', status: 'running' }
  const service = createWorkspaceController({ getAgent: id => id === 'running' ? running : undefined, selections, contexts, settings: {} })
  assert.throws(() => service.get('missing'), /unavailable/)
  await assert.rejects(service.select({ sessionId: 'missing', host: 'vm', cwd: '/project' }), /unavailable/)
  await assert.rejects(service.select({ sessionId: 'running', host: 'vm', cwd: '/project' }), /finish/)
  assert.equal(contexts.size(), 0)
})
