import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { testRequire, browserExecutable } from './helpers/dependencies.mjs'
import { createUiHandler } from './ui-smoke.mjs'
import { startLiveServer } from './helpers/live-server.mjs'

const { chromium } = testRequire('playwright')
const host = process.argv[2] ?? 'ubuntu-vm'
let server, browser, page
const handles = [], releases = [], agents = []
const pageHandler = await createUiHandler({
  async registerWorkspace(path) {
    const workspace = await server.ctx.workspaceRegistry.create(path)
    return { workspaceId: workspace.id, title: workspace.title, path: workspace.path }
  },
  async registerSession(id, options) {
    const workspace = server.ctx.workspaceRegistry.get(options.workspaceId)
    assert.ok(workspace)
    const handle = await server.ctx.sessionPersistence.create({ id, version: server.sessionVersion, isSeeded: false, cwd: workspace.path, createdAt: Date.now() })
    handles.push(handle)
    await handle.flush()
    await workspace.attachSession(id)
    const agent = { id, session: { id, header: handle.header }, status: 'idle', ctx: server.ctx }
    agents.push(agent); releases.push(server.ctx.agents.enter(agent))
  },
})
try {
  server = await startLiveServer({ handlePage: pageHandler, nativeWorkspaces: true })
  browser = await chromium.launch({ executablePath: browserExecutable, headless: true })
  page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  page.setDefaultTimeout(10000)
  const errors = []
  page.on('pageerror', error => { errors.push(error.message); console.error('BROWSER ERROR:', error.message) })
  await page.goto(server.authenticatedUrl)
  const url = new URL(server.origin + '/'); url.searchParams.set('projects', '1'); url.searchParams.set('lang', 'zh')
  await page.goto(url.href)
  await page.getByRole('button', { name: '添加工作区', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '添加工作区' })
  await dialog.getByLabel('SSH 主机', { exact: true }).selectOption(host)
  const pathInput = dialog.getByRole('textbox', { name: '远端目录' })
  await pathInput.fill('/etc')
  await dialog.getByRole('button', { name: '打开', exact: true }).click()
  await dialog.getByRole('button', { name: '添加此目录' }).waitFor()
  await page.waitForFunction(() => !document.querySelector('.dshssh-workspace-footer button:last-child').disabled)
  await dialog.getByRole('button', { name: '▣ apt', exact: true }).click()
  await assert.doesNotReject(async () => { await page.waitForFunction(() => document.querySelector('input[aria-label="远端目录"]').value === '/etc/apt') })
  await dialog.getByRole('button', { name: '上级', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('input[aria-label="远端目录"]').value === '/etc')
  console.log('PASS directory clicks and Up navigate the VM graphically')
  await page.screenshot({ path: 'artifacts/add-vm-workspace.png' })
  const created = page.waitForResponse(response => response.url().endsWith('/api/ssh/projects/create'))
  await dialog.getByRole('button', { name: '添加此目录' }).click()
  const answer = await (await created).json()
  assert.equal(answer.ok, true)
  await dialog.waitFor({ state: 'hidden' })
  await page.getByText(`etc · ${host} (SSH)`, { exact: true }).waitFor()
  const native = server.ctx.workspaceRegistry.get(answer.workspace.workspaceId)
  assert.ok(native); assert.equal(native.title, `etc · ${host} (SSH)`)
  console.log('PASS graphical add flow creates a real native DSH workspace with its SSH title')
  const repeat = await page.request.post(new URL('api/ssh/projects/create', url).href, { data: { host, cwd: '/etc' } })
  assert.equal((await repeat.json()).workspace.workspaceId, native.id)
  assert.equal(server.ctx.workspaceRegistry.list().length, 1)
  console.log('PASS adding the same remote directory reuses its native workspace identity')
  await page.getByRole('button', { name: '新会话', exact: true }).click()
  const composer = page.getByRole('textbox', { name: 'Describe your task' })
  await composer.waitFor()
  assert.equal(await composer.inputValue(), '')
  await page.getByText(`SSH · ${host} · /etc`, { exact: false }).waitFor()
  const agent = agents[0]
  assert.ok(native.sessionIds.includes(agent.id))
  const execution = { agent, signal: new AbortController().signal }
  const read = await server.ctx.tools.get('ssh_read').execute({ path: 'hostname' }, execution)
  assert.equal(read.ok, true); assert.ok(read.lines[0].text)
  const prompt = await server.ctx.systemPrompt.assemble({ scope: agent })
  assert.ok(prompt.sections.some(section => section.text.includes(`"host":"${host}"`) && section.text.includes('"cwd":"/etc"')))
  console.log('PASS a native workspace conversation starts with an empty composer and automatically uses VM tools and prompt context')
  await server.reload()
  const restored = await server.ctx.tools.get('ssh_read').execute({ path: 'hostname' }, execution)
  assert.equal(restored.ok, true)
  console.log('PASS native workspace SSH defaults survive plugin reload')
  const unrelated = { id: randomUUID(), session: { header: { cwd: 'E:/unrelated-project' } } }
  const unrelatedPrompt = await server.ctx.systemPrompt.assemble({ scope: unrelated })
  assert.ok(!unrelatedPrompt.sections.some(section => section.text.includes('The user selected this SSH workspace')))
  await server.ctx.tools.get('ssh_disconnect').execute({}, execution)
  await server.reload()
  const disconnectedPrompt = await server.ctx.systemPrompt.assemble({ scope: agent })
  assert.ok(!disconnectedPrompt.sections.some(section => section.text.includes('The user selected this SSH workspace')))
  assert.deepEqual(errors, [])
  console.log('PASS local workspace isolation and durable disconnect; zero browser errors')
} catch (error) {
  console.error('PAGE:', await page?.locator('body').innerText().catch(() => 'unavailable'))
  await page?.screenshot({ path: 'artifacts/project-failure.png' }).catch(() => {})
  throw error
} finally {
  await browser?.close()
  for (const release of releases) release()
  for (const handle of handles) await handle.close()
  await server?.close()
}
process.exit(0)
