import assert from 'node:assert/strict'
import { createUiHandler, runWorkspaceUiSmoke } from './ui-smoke.mjs'
import { startLiveServer } from './helpers/live-server.mjs'

const host = process.argv[2] ?? 'ubuntu-vm'
let server
const agents = new Map()
const releases = []
function registerSession(id) {
  // The browser shell substitutes DSH's create/navigation UI, without starting
  // a paid LLM turn. Backend identity, storage, prompts and SSH use real services.
  const agent = { id, session: { id }, status: 'idle', ctx: server.ctx }
  agents.set(id, agent)
  releases.push(server.ctx.agents.enter(agent))
}
const page = await createUiHandler({ registerSession })
server = await startLiveServer({ handlePage: page })
registerSession('source')
try {
  const results = await runWorkspaceUiSmoke({ url: server.authenticatedUrl, hostAlias: host })
  for (const result of results) {
    const agent = agents.get(result.sessionId)
    const exec = { agent, signal: new AbortController().signal }
    const listed = await server.ctx.tools.get('ssh_ls').execute({}, exec)
    assert.equal(listed.ok, true)
    assert.equal(listed.resolvedPath, '/etc')
    const read = await server.ctx.tools.get('ssh_read').execute({ path: 'hostname' }, exec)
    assert.equal(read.ok, true)
    assert.ok(read.lines[0].text)
    const prompt = await server.ctx.systemPrompt.assemble({ scope: agent })
    const text = prompt.sections.map(section => section.text).join('\n')
    assert.ok(text.includes(`"host":"${host}"`))
    assert.ok(text.includes('"cwd":"/etc"'))
    assert.equal(text.includes('"file":"/etc/hostname"'), result.file)
  }
  console.log('PASS each selected conversation routes relative tools and its system prompt to the VM')
  await server.reload()
  for (const result of results) {
    const listed = await server.ctx.tools.get('ssh_ls').execute({}, { agent: agents.get(result.sessionId) })
    assert.equal(listed.ok, true)
    assert.equal(listed.resolvedPath, '/etc')
  }
  const other = { id: 'unselected', session: { id: 'unselected' }, status: 'idle' }
  await assert.rejects(server.ctx.tools.get('ssh_ls').execute({}, { agent: other }), /no default host/)
  console.log('PASS durable selections survive plugin reload without leaking into another conversation')
  await server.ctx.tools.get('ssh_disconnect').execute({}, { agent: agents.get(results[0].sessionId) })
  await server.reload()
  await assert.rejects(server.ctx.tools.get('ssh_ls').execute({}, { agent: agents.get(results[0].sessionId) }), /no default host/)
  assert.equal((await server.ctx.tools.get('ssh_ls').execute({}, { agent: agents.get(results[1].sessionId) })).resolvedPath, '/etc')
  console.log('PASS disconnect clears only that conversation’s durable SSH selection')
} finally {
  for (const release of releases) release()
  await server.close()
}
