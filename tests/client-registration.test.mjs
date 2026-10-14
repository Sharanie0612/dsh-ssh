import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, access } from 'node:fs/promises'
import { testRequire } from './helpers/dependencies.mjs'
import vm from 'node:vm'

const runtime = new URL('../artifacts/runtime/dsh/node_modules/', import.meta.url)
const slotsUrl = new URL('@deepseek-ai/dsh-client-ui-slots/lib/index.js', runtime)
const available = await access(slotsUrl).then(() => true, () => false)

// The previous recording fixture accepted every registration. This test uses
// the installed DSH registry and Cordis effects, including teardown on failure.
test('DSH activates SSH with a list header slot and removes all contributions on unload', { skip: !available && 'Run npm run prepare:test-runtime first' }, async () => {
  const cordis = await import(new URL('@deepseek-ai/cordis/lib/index.js', runtime))
  const slots = await import(slotsUrl)
  const require = testRequire
  const tags = new Set()
  const document = {
    querySelector: () => null,
    createElement: () => { const tag = { dataset: {}, remove: () => tags.delete(tag) }; return tag },
    head: { appendChild: tag => tags.add(tag) },
  }
  function load(code, overrides = {}) {
    let registration
    vm.runInNewContext(code, { document, console, window: { __ModuleLoader__: { load: value => { registration = value } } } })
    return registration.factory(name => overrides[name] ?? require(name))
  }
  const renderer = load(await readFile(new URL('@deepseek-ai/dsh-client-ui-renderer/lib/client.js', runtime), 'utf8'), {
    '@deepseek-ai/cordis': cordis, '@deepseek-ai/dsh-client-ui-slots': slots,
  })
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  const plugin = load(source)
  const ctx = new cordis.Context()
  const definitions = new Set()
  try {
    await ctx.plugin({ apply: ctx => { new renderer.SlotRegistry(ctx) } })
    await ctx.plugin({ inject: ['slots'], apply: ctx => {
      ctx.reflect.provide('locale', { bind: () => key => key, register: () => () => {} })
      ctx.reflect.provide('sidebarRight', { openTab() {} })
      ctx.reflect.provide('sidebarRightTabs', { register: value => { definitions.add(value); return () => definitions.delete(value) } })
      ctx.slots.register({ name: 'root', children: {
        'sidebar.right.tab.guide.entry': { kind: 'keyed', scope: 'session' },
        'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' },
        'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
        'conversation.session.header.actions': { kind: 'list', scope: 'session' },
        'sidebar.workspaces.directoryFlow': { kind: 'single', scope: 'root' },
        'conversation.hero.workspace.directoryFlow': { kind: 'single', scope: 'root' },
      } }, () => null)
      for (const name of ['sidebar.workspaces.directoryFlow', 'conversation.hero.workspace.directoryFlow']) {
        ctx.slots.register({ name }, () => null)
      }
    } })
    // Demonstrate that the original bug really fails in this runtime.
    const broken = source.replace("name: 'conversation.session.header.utilities', id: ID", "name: 'conversation.session.header.utilities', key: ID")
    await assert.rejects(async () => { await ctx.plugin(load(broken)) }, /requires options.id/)
    assert.equal(definitions.size, 0, 'failed activation removes the SSH tab')
    assert.equal(ctx.slots.entries('sidebar.right.tab.guide.entry').length, 0)
    const fiber = await ctx.plugin(plugin)
    assert.equal(definitions.size, 1)
    for (const name of ['sidebar.right.tab.guide.entry', 'sidebar.right.pane.tab', 'conversation.session.header.utilities']) {
      assert.equal(ctx.slots.entries(name).length, 1, name)
    }
    assert.equal(ctx.slots.entries('conversation.session.header.utilities')[0].options.id, '@local/dsh-ssh')
    for (const name of ['sidebar.workspaces.directoryFlow', 'conversation.hero.workspace.directoryFlow']) {
      assert.equal(ctx.slots.entries(name).length, 2, 'the native picker remains registered')
      assert.equal(ctx.slots.entries(name)[0].options.priority, -10, 'SSH choice shadows the native flow')
    }
    await fiber.dispose()
    assert.equal(definitions.size, 0)
    assert.equal(tags.size, 0)
    assert.equal(ctx.slots.entries('sidebar.right.tab.guide.entry').length, 0)
    assert.equal(ctx.slots.entries('sidebar.workspaces.directoryFlow').length, 1, 'unloading restores native selection')
  } finally { await ctx.fiber.dispose() }
})
