import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
const terminalSource = await readFile(new URL('../src/terminal-view.frag.js', import.meta.url), 'utf8')
const tick = () => new Promise((resolve) => setImmediate(resolve))
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

// Run the actual component functions and their event/effect callbacks. A small
// hook harness keeps these regression tests independent of a DSH installation.
class Renderer {
  constructor() {
    this.hooks = []
    this.pending = []
    this.React = {
      Component: class {},
      Suspense: 'suspense',
      lazy: (load) => ({ load }),
      createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
      useState: (initial) => {
        const i = this.index++
        this.hooks[i] ??= { value: typeof initial === 'function' ? initial() : initial }
        return [this.hooks[i].value, (next) => {
          this.hooks[i].value = typeof next === 'function' ? next(this.hooks[i].value) : next
        }]
      },
      useRef: (initial) => {
        const i = this.index++
        this.hooks[i] ??= { current: initial }
        return this.hooks[i]
      },
      useCallback: (callback, deps) => {
        const i = this.index++
        const old = this.hooks[i]
        if (!old || !deps.every((dep, j) => Object.is(dep, old.deps[j]))) this.hooks[i] = { callback, deps }
        return this.hooks[i].callback
      },
      useEffect: (effect, deps) => {
        const i = this.index++
        const old = this.hooks[i]
        if (!old || !deps.every((dep, j) => Object.is(dep, old.deps[j]))) {
          this.pending.push(() => {
            old?.cleanup?.()
            this.hooks[i] = { deps, cleanup: effect() }
          })
        }
      },
    }
  }
  render(component, props) {
    this.index = 0
    this.tree = component(props)
    for (const node of all(this.tree)) if (node.props.ref) node.props.ref.current = { node }
    return this.tree
  }
  effects() { this.pending.splice(0).forEach((run) => run()) }
  unmount() { for (const hook of this.hooks) hook?.cleanup?.() }
}

function all(tree) {
  if (Array.isArray(tree)) return tree.flatMap(all)
  if (tree === null || typeof tree !== 'object') return []
  return [tree, ...all(tree.props?.children)]
}
function button(tree, label) {
  const found = all(tree).find((node) => node.type === 'button' && node.props.children.includes(label))
  assert.ok(found, `missing button ${label}`)
  return found.props
}
const t = (key) => key

function loadClient(renderer, fetch = () => { throw new Error('unexpected fetch') }) {
  let registration
  const context = vm.createContext({
    window: { __ModuleLoader__: { load: (value) => { registration = value } } },
    fetch, document: {}, console,
  })
  vm.runInContext(source, context)
  const require = (name) => {
    assert.equal(name, 'react')
    return renderer.React
  }
  require.async = () => { throw new Error('unexpected chunk load') }
  return registration.factory(require)
}

function applyClient(plugin, services = {}) {
  const seats = [], definitions = [], opens = []
  plugin.apply({
    get: name => services[name],
    effect: (callback, label) => label.endsWith('styles') ? undefined : callback(),
    locale: { bind: () => t, register: () => () => {} },
    sidebarRightTabs: { register: (definition) => { definitions.push(definition); return () => {} } },
    sidebarRight: {
      active: () => ({ id: 'start-tab-7', kind: 'guide' }),
      openTab: (kind, options) => opens.push({ kind, options }),
    },
    slots: {
      inject: (name, callback) => callback(),
      register: (options, component) => { seats.push({ options, component }); return () => {} },
    },
  })
  return { seats, definitions, opens }
}

test('host selection and probe clicks execute without diagnostic ReferenceErrors', () => {
  const renderer = new Renderer()
  const { HostRow } = loadClient(renderer).__testing
  let selects = 0, probes = 0, stopped = false
  const tree = HostRow({
    host: { alias: 'board', hostName: '10.0.0.2', user: null, port: 22 },
    onSelect: () => selects++, onTest: () => probes++, t,
  })
  tree.props.onClick()
  button(tree, 'hosts.test').onClick({ stopPropagation: () => { stopped = true } })
  assert.equal(selects, 1)
  assert.equal(probes, 1)
  assert.equal(stopped, true)
  const nestedButton = {}
  tree.props.onKeyDown({ key: 'Enter', target: nestedButton, currentTarget: tree })
  assert.equal(selects, 1, 'nested probe button must retain its own keyboard action')
})

test('remote conversation retains its local project, seeds SSH/file context and opens without sending', async () => {
  const renderer = new Renderer()
  let created, selected, draft, opened, released = 0, sends = 0
  const reference = { ready: Promise.resolve(), release: () => released++ }
  const services = {
    sessions: {
      list: { getSnapshot: () => ({ byId: { source: { cwd: 'E:/project' } } }) },
      create: async options => { created = options; return 'new-remote' },
      retain: id => { assert.equal(id, 'new-remote'); return reference },
    },
    uiWorkspace: {
      workspaces: { list: { getSnapshot: () => ({ items: [{ workspaceId: 'project-1', sessionIds: ['source'] }] }) } },
      openSession: id => { opened = id },
    },
    uiSession: { bindingSource: ref => {
      assert.equal(ref, reference)
      return { getSnapshot: () => ({ props: { inputActions: { setDraft: text => { draft = text }, submit: () => sends++ } } }) }
    } },
  }
  const plugin = loadClient(renderer, async (_url, request) => {
    selected = JSON.parse(request.body)
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, workspace: { host: 'vm', cwd: '/srv/project', file: '/srv/project/main.js' } }) }
  })
  const { seats } = applyClient(plugin, services)
  const start = seats.find(seat => seat.options.name === 'sidebar.right.pane.tab').options.inject('source').startConversation
  await start({ host: 'vm', cwd: '/srv/project', file: '/srv/project/main.js' })
  assert.deepEqual(JSON.parse(JSON.stringify(created)), { workspaceId: 'project-1' })
  assert.equal(selected.session_id, 'new-remote')
  assert.equal(selected.file, '/srv/project/main.js')
  assert.equal(draft, '', 'SSH selection belongs in the UI and system context, not the composer')
  assert.equal(opened, 'new-remote')
  assert.equal(released, 1)
  assert.equal(sends, 0)
})

test('retrying a refused workspace does not create another blank conversation', async () => {
  let creates = 0, rejects = true, releases = 0
  const services = {
    sessions: { list: { getSnapshot: () => ({ byId: { source: { cwd: 'E:/project' } } }) }, create: async () => { creates++; return 'retry-session' }, retain: () => ({ ready: Promise.resolve(), release: () => releases++ }) },
    uiWorkspace: { workspaces: { list: { getSnapshot: () => ({ items: [] }) } }, openSession() {} },
    uiSession: { bindingSource: () => ({ getSnapshot: () => ({ props: { inputActions: { setDraft() {} } } }) }) },
  }
  const plugin = loadClient(new Renderer(), async () => ({ ok: !rejects, status: rejects ? 400 : 200, text: async () => JSON.stringify(rejects ? { ok: false, reason: 'SSH connection refused' } : { ok: true, workspace: { host: 'vm', cwd: '/project', file: null } }) }))
  const start = applyClient(plugin, services).seats.find(seat => seat.options.name === 'sidebar.right.pane.tab').options.inject('source').startConversation
  await assert.rejects(start({ host: 'vm', cwd: '/project' }), /SSH connection refused/)
  rejects = false
  await start({ host: 'vm', cwd: '/project' })
  assert.equal(creates, 1)
  assert.equal(releases, 2)
})

test('guide navigation uses its committed tab actions and preserves open terminals', () => {
  const renderer = new Renderer()
  const plugin = loadClient(renderer)
  const { definitions } = applyClient(plugin)
  assert.equal(definitions[0].keepMounted, true)
  let opened
  const tree = renderer.render(plugin.__testing.SshGuide, {
    t, open: () => { throw new Error('global opener used') },
    useTabInfo: () => ({ tab: { actions: { openTab: (kind, options) => { opened = { kind, options } } } } }),
  })
  tree.props.onClick()
  assert.equal(opened.kind, 'ssh')
  assert.equal(opened.options.replaceTab, true)
})

test('fallback opener passes a real Start tab ID to the global controller', () => {
  const result = applyClient(loadClient(new Renderer()))
  const guide = result.seats.find((seat) => seat.options.name === 'sidebar.right.tab.guide.entry')
  guide.options.inject().open()
  assert.equal(result.opens[0].options.replaceTab, 'start-tab-7')
})

test('API requests use the desktop shared channel and surface host errors', async () => {
  const sent = []
  let answer = { ok: true, hosts: [] }, status = 200
  const plugin = loadClient(new Renderer(), async (url, init) => {
    sent.push({ url, init })
    return { ok: status === 200, status, text: async () => JSON.stringify(answer) }
  })
  const { seats } = applyClient(plugin)
  const call = seats.find((seat) => seat.options.name === 'sidebar.right.pane.tab').options.inject().call
  const signal = new AbortController().signal
  await call('hosts', undefined, signal)
  assert.equal(new URL(sent[0].url, 'https://example.test/dsh/').pathname, '/api/ssh/hosts')
  assert.equal(sent[0].init.method, 'POST')
  assert.equal(sent[0].init.body, '{}')
  assert.equal(sent[0].init.signal, signal)
  answer = { ok: false, reason: 'SSH authentication failed' }; status = 400
  await assert.rejects(call('probe', { host: 'board' }), /SSH authentication failed/)
})

test('directory navigation and refresh work, and stale previews cannot replace a newer selection', async () => {
  const renderer = new Renderer()
  const { SshBrowser } = loadClient(renderer).__testing
  const previews = new Map(), calls = []
  const call = async (endpoint, payload) => {
    calls.push({ endpoint, payload })
    if (endpoint === 'ls') return { path: payload.path, resolvedPath: payload.path === '~' ? '/home/user' : payload.path, entries: [
      { name: 'a.txt', directory: false }, { name: 'b.txt', directory: false },
    ] }
    const pending = deferred(); previews.set(payload.path, pending); return pending.promise
  }
  const props = { t, call, host: 'board', onBack: () => {} }
  renderer.render(SshBrowser, props); renderer.effects(); await tick()
  let tree = renderer.render(SshBrowser, props)
  const rows = all(tree).filter((node) => typeof node.type === 'function')
  const first = rows[0].props.onOpen(), second = rows[1].props.onOpen()
  previews.get('/home/user/b.txt').resolve({ lines: [{ number: 1, text: 'latest' }] }); await second
  previews.get('/home/user/a.txt').resolve({ lines: [{ number: 1, text: 'stale' }] }); await first
  tree = renderer.render(SshBrowser, props)
  const content = all(tree).flatMap(node => node.props.children).filter(value => typeof value === 'string').join('\n')
  assert.ok(content.includes('latest'))
  assert.ok(!content.includes('stale'))
  await button(tree, 'files.up').onClick()
  assert.equal(calls.at(-1).payload.path, '/home')
  tree = renderer.render(SshBrowser, props)
  await button(tree, 'files.refresh').onClick()
  assert.equal(calls.at(-1).payload.path, '/home')
  renderer.unmount()
})

test('command runner rejects rapid duplicate submissions before a render', async () => {
  const renderer = new Renderer()
  const { SshPanel } = loadClient(renderer).__testing
  const pending = deferred(), commands = []
  const call = async (endpoint, payload) => {
    if (endpoint === 'hosts') return { hosts: [{ alias: 'board', hostName: '10.0.0.2', user: null, port: 22 }] }
    if (endpoint === 'exec') { commands.push(payload); return pending.promise }
    throw new Error(endpoint)
  }
  const props = { t, call }
  renderer.render(SshPanel, props); renderer.effects(); await tick()
  let tree = renderer.render(SshPanel, props)
  all(tree).find((node) => node.type === 'input').props.onChange({ target: { value: 'pwd' } })
  tree = renderer.render(SshPanel, props)
  const run = button(tree, 'command.run').onClick
  const first = run(), second = run()
  assert.equal(commands.length, 1)
  pending.resolve({ result: { stdout: '/home/user\n', stderr: '', exitCode: 0 } })
  await Promise.all([first, second])
  assert.ok(JSON.stringify(renderer.render(SshPanel, props)).includes('/home/user'))
  renderer.unmount()
})

function loadTerminal(renderer, call) {
  const tag = { __dshsshUsers: 0, remove: () => { tag.removed = true } }
  let terminal
  class Terminal {
    constructor() { terminal = this; this.cols = 80; this.rows = 24; this.options = {} }
    loadAddon() {}
    open() {}
    focus() {}
    onData(callback) { this.input = callback; return { dispose() {} } }
    write() {}
    reset() {}
    dispose() { this.disposed = true }
  }
  const document = { querySelector: () => tag, defaultView: null, body: {}, documentElement: {} }
  const context = vm.createContext({
    React: renderer.React, h: renderer.React.createElement,
    XTerm: { Terminal }, FitAddon: { FitAddon: class { fit() {} } },
    PLUGIN_ID: '@local/dsh-ssh', installTerminalStyles: () => () => {},
    document, AbortController, setTimeout, clearTimeout, exports: {},
  })
  vm.runInContext(terminalSource, context)
  renderer.render(context.exports.TerminalView, { t, call, host: 'board', onBack() {} })
  renderer.effects()
  return { terminal, tag }
}

test('workspace selector preserves local folder picking and blocks repeated adoption', async () => {
  const renderer = new Renderer()
  const { SshWorkspaceFlow } = loadClient(renderer).__testing
  const choice = deferred(), adopted = []
  let picks = 0
  const props = { open: true, busy: false, t,
    call: async endpoint => { assert.equal(endpoint, 'hosts'); return { hosts: [{ alias: 'vm' }] } },
    pickLocal: () => { picks++; return choice.promise }, onPicked: path => adopted.push(path), onCancel() {},
  }
  renderer.render(SshWorkspaceFlow, props); renderer.effects(); await tick()
  button(renderer.render(SshWorkspaceFlow, props), 'project.local').onClick()
  const tree = renderer.render(SshWorkspaceFlow, props)
  const choose = button(tree, 'project.chooseLocal').onClick
  const first = choose(), second = choose()
  assert.equal(picks, 1)
  choice.resolve('E:/existing-project')
  await Promise.all([first, second])
  assert.deepEqual(adopted, ['E:/existing-project'])
  renderer.unmount()
})

test('terminal input POSTs remain in keystroke order and report rejected writes', async () => {
  const renderer = new Renderer(), firstWrite = deferred(), reads = deferred(), writes = []
  const call = async (endpoint, payload) => {
    if (endpoint === 'term/open') return { term: { id: 't1' } }
    if (endpoint === 'term/read') return reads.promise
    if (endpoint === 'term/write') {
      writes.push(payload.data)
      if (writes.length === 1) return firstWrite.promise
      throw new Error('write refused')
    }
    return {}
  }
  const { terminal } = loadTerminal(renderer, call); await tick()
  terminal.input('a'); terminal.input('b'); await tick()
  assert.deepEqual(writes, ['a'])
  firstWrite.resolve({ ok: true }); await tick()
  assert.deepEqual(writes, ['a', 'b'])
  assert.ok(renderer.hooks.some((hook) => hook?.value?.reason === 'write refused'))
  renderer.unmount(); reads.resolve({ term: { exited: true } }); await tick()
})

test('leaving while terminal opens still closes the eventual host session', async () => {
  const renderer = new Renderer(), opening = deferred(), calls = []
  const call = async (endpoint, payload, signal) => {
    calls.push({ endpoint, payload, signal })
    if (endpoint === 'term/open') return opening.promise
    return {}
  }
  const { terminal, tag } = loadTerminal(renderer, call)
  assert.equal(calls[0].signal, undefined, 'opening response must survive view disposal')
  renderer.unmount()
  opening.resolve({ term: { id: 'late-terminal' } }); await tick()
  assert.equal(calls.at(-1).endpoint, 'term/close')
  assert.equal(calls.at(-1).payload.id, 'late-terminal')
  assert.equal(terminal.disposed, true)
  assert.equal(tag.removed, true)
})
