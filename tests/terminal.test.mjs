import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import { createTerminalService } from '../lib/terminal.js'

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

/** Same Buffer Readable/done/write/resize/terminate contract as DSH's PTY. */
function fakeHandle() {
  const completion = deferred()
  const output = new PassThrough()
  const inputs = []
  const sizes = []
  let terminationCount = 0
  return {
    output,
    done: completion.promise,
    inputs,
    sizes,
    get terminationCount() { return terminationCount },
    write: async (data) => { inputs.push(data) },
    resize: async (cols, rows) => { sizes.push([cols, rows]) },
    terminate: async () => {
      terminationCount += 1
      output.end()
      completion.resolve({ exitCode: null, signal: 'SIGTERM' })
    },
    finish: (outcome = { exitCode: 0, signal: null }) => {
      output.end()
      completion.resolve(outcome)
    },
    resolveDone: completion.resolve,
    rejectDone: completion.reject,
  }
}

function fixture(t, overrides = {}) {
  const handles = []
  const specs = []
  const lookups = []
  const subprocess = {
    resolveExecutable: async (...args) => { lookups.push(args); return 'C:/Windows/System32/OpenSSH/ssh.exe' },
    spawnTerminal: async (spec) => {
      specs.push(spec)
      const handle = fakeHandle()
      handles.push(handle)
      return handle
    },
    ...overrides,
  }
  const service = createTerminalService({ subprocess }, {
    sshExecutable: 'ssh', connectTimeoutSeconds: 8, disposeGraceMs: 3000,
  })
  t.after(() => service.dispose())
  return { service, handles, specs, lookups, subprocess }
}

test('opens a real PTY request with interactive SSH and validates host/dimensions', async (t) => {
  const { service, specs, lookups } = fixture(t)
  await assert.rejects(service.open({ host: '-oProxyCommand=bad' }), /looks like an option/)
  const term = await service.open({ host: ' dev-board ', cols: 900, rows: '24x' })
  assert.equal(term.cols, 500)
  assert.equal(term.rows, 24)
  assert.equal(term.host, 'dev-board')
  assert.equal(lookups[0][0], 'ssh')
  assert.deepEqual(specs[0].argv, ['C:/Windows/System32/OpenSSH/ssh.exe', '-tt', '-o', 'ConnectTimeout=8', '-o', 'StrictHostKeyChecking=accept-new', 'dev-board'])
  assert.equal(specs[0].terminalType, 'xterm-256color')
  assert.equal(specs[0].cwd, process.cwd())
  assert.equal(specs[0].graceMs, 3000)
  assert.ok(specs[0].signal instanceof AbortSignal)
  assert.deepEqual(service.list(), [term])
})

test('preserves UTF-8 across provider frames, BOM, ANSI escapes, and incomplete EOF', async (t) => {
  const { service, handles } = fixture(t)
  const { id } = await service.open({ host: 'board' })
  const bytes = Buffer.from('\ufeff中文\u001b[31m红色\u001b[0m')
  for (const byte of bytes) {
    handles[0].output.write(Buffer.of(byte))
    await tick()
  }
  handles[0].output.write(Buffer.of(0xe4, 0xb8))
  handles[0].finish({ exitCode: 7, signal: null })
  await tick()
  const result = await service.read({ id, since: 0, holdMs: 0 })
  assert.equal(result.text, '\ufeff中文\u001b[31m红色\u001b[0m\ufffd')
  assert.equal(result.term.exited, true)
  assert.equal(result.term.exitCode, 7)
})

test('wakes long polls on output without consuming another reader history', async (t) => {
  const { service, handles } = fixture(t)
  const { id } = await service.open({ host: 'board' })
  const first = service.read({ id, since: 0, holdMs: 1000 })
  const second = service.read({ id, since: 0, holdMs: 1000 })
  handles[0].output.write(Buffer.from('password: '))
  const [a, b] = await Promise.all([first, second])
  assert.equal(a.text, 'password: ')
  assert.equal(b.text, a.text)
  assert.equal(a.seq, b.seq)
  assert.equal((await service.read({ id, since: a.seq, holdMs: 5 })).text, '')
  assert.equal((await service.read({ id, since: 0, holdMs: 0 })).text, a.text)
})

test('does not publish process exit until queued terminal output reaches EOF', async (t) => {
  const { service, handles } = fixture(t)
  const { id } = await service.open({ host: 'board' })
  handles[0].resolveDone({ exitCode: 0, signal: null })
  await tick()
  assert.equal(service.list()[0].exited, false)
  const pending = service.read({ id, since: 0, holdMs: 1000 })
  handles[0].output.end(Buffer.from('last line\r\n'))
  const result = await pending
  assert.equal(result.text, 'last line\r\n')
  await tick()
  const final = await service.read({ id, since: result.seq, holdMs: 1000 })
  assert.equal(final.term.exited, true)
  assert.equal(final.term.exitCode, 0)
})

test('reports done rejection and stream errors as visible terminal failures', async (t) => {
  const { service, handles } = fixture(t)
  const one = await service.open({ host: 'board' })
  handles[0].rejectDone(new Error('PTY provider lost'))
  handles[0].output.end()
  await tick()
  const failed = await service.read({ id: one.id, since: 0, holdMs: 0 })
  assert.equal(failed.term.exited, true)
  assert.equal(failed.term.error, 'PTY provider lost')
  const two = await service.open({ host: 'other-board' })
  handles[1].output.destroy(new Error('terminal stream failed'))
  await tick()
  const streamFailed = await service.read({ id: two.id, since: 0, holdMs: 0 })
  assert.equal(streamFailed.term.exited, true)
  assert.equal(streamFailed.term.error, 'terminal stream failed')
})

test('bounds one oversized output frame and signals a recoverable cursor gap', async (t) => {
  const { service, handles } = fixture(t)
  const { id } = await service.open({ host: 'board' })
  handles[0].output.write(Buffer.from('界'.repeat(300000) + '\r\nEND'))
  await tick()
  const result = await service.read({ id, since: 0, holdMs: 0 })
  assert.equal(result.gap, true)
  assert.ok(Buffer.byteLength(result.text) <= 512 * 1024)
  assert.ok(result.text.endsWith('\r\nEND'))
  assert.ok(!result.text.includes('\ufffd'))
  assert.ok(result.since > 0)
  assert.ok(result.seq > result.since)
  assert.equal((await service.read({ id, since: result.seq, holdMs: 0 })).text, '')
})

test('recovers a cursor from a different session instead of polling indefinitely', async (t) => {
  const { service, handles } = fixture(t)
  const { id } = await service.open({ host: 'board' })
  handles[0].output.write(Buffer.from('current output'))
  await tick()
  const result = await service.read({ id, since: 9999, holdMs: 1000 })
  assert.equal(result.gap, true)
  assert.equal(result.text, 'current output')
  assert.equal(result.since, 0)
})

test('preserves raw input and serializes input/resize while updating only accepted sizes', async (t) => {
  const { service, handles } = fixture(t)
  const { id } = await service.open({ host: 'board' })
  const ready = deferred()
  const calls = []
  handles[0].write = async (data) => { calls.push(['write', data]); await ready.promise }
  handles[0].resize = async (cols, rows) => { calls.push(['resize', cols, rows]) }
  const input = service.write(id, '密钥\r\u0003\t\u001b[A')
  const size = service.resize(id, 120, 40)
  await tick()
  assert.deepEqual(calls, [['write', '密钥\r\u0003\t\u001b[A']])
  ready.resolve()
  await input
  assert.equal((await size).cols, 120)
  assert.deepEqual(calls[1], ['resize', 120, 40])
  assert.equal((await service.resize(id, -1, 999)).rows, 200)
  handles[0].resize = async () => { throw new Error('PTY resize refused') }
  await assert.rejects(service.resize(id, 90, 30), /resize refused/)
  assert.equal(service.list()[0].cols, 120)
  assert.equal(service.list()[0].rows, 200)
})

test('rejects controls after natural process exit', async (t) => {
  const { service, handles } = fixture(t)
  const { id } = await service.open({ host: 'board' })
  handles[0].finish()
  await tick()
  await assert.rejects(service.write(id, 'echo bad\r'), /exited/)
  await assert.rejects(service.resize(id, 90, 30), /exited/)
  assert.deepEqual(handles[0].inputs, [])
  assert.deepEqual(handles[0].sizes, [])
})

test('close wakes readers as exited, awaits drain, and shares concurrent termination', async (t) => {
  const { service, handles } = fixture(t)
  const { id } = await service.open({ host: 'board' })
  const read = service.read({ id, since: 0, holdMs: 1000 })
  const a = service.close(id)
  const b = service.close(id)
  assert.strictEqual(a, b)
  assert.equal((await read).term.exited, true)
  await a
  assert.equal(handles[0].terminationCount, 1)
  assert.deepEqual(service.list(), [])
  await assert.rejects(service.read({ id, since: 0, holdMs: 0 }), /no such terminal/)
})

test('failed termination retains ownership so cleanup can be retried', async (t) => {
  const { service, handles } = fixture(t)
  const { id } = await service.open({ host: 'board' })
  const terminate = handles[0].terminate
  handles[0].terminate = async () => { throw new Error('process range still running') }
  await assert.rejects(service.close(id), /still running/)
  assert.equal(service.list().length, 1)
  assert.equal(service.list()[0].error, 'process range still running')
  handles[0].terminate = terminate
  await service.close(id)
  assert.deepEqual(service.list(), [])
})

test('cancels a long poll without leaking its waiter or affecting other reads', async (t) => {
  const { service, handles } = fixture(t)
  const { id } = await service.open({ host: 'board' })
  const controller = new AbortController()
  const cancelled = service.read({ id, since: 0, holdMs: 1000, signal: controller.signal })
  controller.abort()
  await assert.rejects(cancelled, { name: 'AbortError' })
  const next = service.read({ id, since: 0, holdMs: 1000 })
  handles[0].output.write(Buffer.from('ready'))
  assert.equal((await next).text, 'ready')
})

test('counts in-flight allocations against the eight-session limit', async (t) => {
  const lookup = deferred()
  const { service } = fixture(t, { resolveExecutable: () => lookup.promise })
  const opens = Array.from({ length: 8 }, () => service.open({ host: 'board' }))
  await assert.rejects(service.open({ host: 'ninth' }), /limit of 8/)
  lookup.resolve('ssh')
  await Promise.all(opens)
  assert.equal(service.list().length, 8)
})

test('releases a failed allocation slot for the next open', async (t) => {
  const { service, subprocess } = fixture(t)
  const spawn = subprocess.spawnTerminal
  subprocess.spawnTerminal = async () => { throw new Error('ConPTY unavailable') }
  await assert.rejects(service.open({ host: 'board' }), /ConPTY unavailable/)
  subprocess.spawnTerminal = spawn
  assert.equal((await service.open({ host: 'board' })).host, 'board')
})

test('disposal owns and terminates PTYs whose allocation completes after unload', async (t) => {
  const allocation = deferred()
  const handle = fakeHandle()
  const { service } = fixture(t, { spawnTerminal: () => allocation.promise })
  const opening = service.open({ host: 'board' })
  await tick()
  const rejected = assert.rejects(opening, /disposed/)
  const disposing = service.dispose()
  await assert.rejects(service.open({ host: 'board' }), /disposed/)
  allocation.resolve(handle)
  await rejected
  await disposing
  assert.equal(handle.terminationCount, 1)
  assert.deepEqual(service.list(), [])
})

test('disposal reports failed termination and remains retryable', async (t) => {
  const { service, handles } = fixture(t)
  await service.open({ host: 'board' })
  const terminate = handles[0].terminate
  handles[0].terminate = async () => { throw new Error('cleanup failed') }
  await assert.rejects(service.dispose(), /failed to terminate terminal sessions/)
  assert.equal(service.list().length, 1)
  handles[0].terminate = terminate
  await service.dispose()
  assert.deepEqual(service.list(), [])
})
