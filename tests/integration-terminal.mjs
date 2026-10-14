// Opt-in live test: real Cordis + DSH LocalSubprocessRuntime + OpenSSH PTY.
// Run `node tests/integration-terminal.mjs <ssh-config-alias>` with key auth.
// Commands change only this test's terminal settings and exit its own shells.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createTerminalService } from '../lib/terminal.js'
import { startLiveServer } from './helpers/live-server.mjs'

const host = process.argv[2] ?? 'ubuntu-vm'
const server = await startLiveServer()
const root = server.ctx
const runtime = root.subprocess
assert.equal(runtime.constructor.name, 'LocalSubprocessRuntime')
const service = createTerminalService(root, { sshExecutable: 'ssh', connectTimeoutSeconds: 8, disposeGraceMs: 3000 })
const nonce = `DSHPTY_${randomBytes(8).toString('hex')}`
let checks = 0

function check(name, validate) {
  validate()
  checks += 1
  console.log(`PASS ${name}`)
}

function plain(text) {
  return text
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
}

function lines(text) { return plain(text).split(/[\r\n]+/).map((line) => line.trim()) }

function reader(id) {
  let cursor = 0
  let text = ''
  return {
    get text() { return text },
    get cursor() { return cursor },
    async until(predicate, budgetMs = 25000) {
      const deadline = Date.now() + budgetMs
      while (Date.now() < deadline) {
        const answer = await service.read({ id, since: cursor, holdMs: Math.min(500, deadline - Date.now()) })
        assert.equal(answer.gap, false, 'live reader must not lose terminal bytes')
        cursor = answer.seq
        text += answer.text
        if (predicate(text, answer)) return answer
        if (answer.term.exited) throw new Error(`SSH exited before expected output: code=${answer.term.exitCode}, error=${answer.term.error ?? ''}, tail=${JSON.stringify(plain(text).slice(-200))}`)
      }
      throw new Error(`Timed out waiting for terminal output: ${JSON.stringify(plain(text).slice(-200))}`)
    },
  }
}

try {
  console.log(`Runtime: Desktop DSH LocalSubprocessRuntime; host: ${host}`)
  const term = await service.open({ host, cols: 100, rows: 30 })
  check('real provider allocates and owns a PTY', () => {
    assert.equal(term.cols, 100)
    assert.equal(term.rows, 30)
    assert.equal(runtime.terminals.size, 1)
  })
  const live = reader(term.id)
  await live.until((text) => /[$#]\s*$/.test(plain(text)))
  check('SSH reaches an interactive shell', () => assert.equal(service.list()[0].exited, false))

  await service.write(term.id, `stty -echo; printf '\\n${nonce}_READY\\n'; printf '中文测试\\n${nonce}_UTF8\\n'\r`)
  await live.until((text) => lines(text).includes(`${nonce}_UTF8`))
  check('typed commands execute and UTF-8 returns intact', () => {
    assert.ok(lines(live.text).includes(`${nonce}_READY`))
    assert.ok(lines(live.text).includes('中文测试'))
  })

  await service.resize(term.id, 120, 40)
  await service.write(term.id, `stty size; printf '${nonce}_SIZE\\n'\r`)
  await live.until((text) => lines(text).includes(`${nonce}_SIZE`))
  check('PTY resize reaches the remote terminal', () => assert.ok(lines(live.text).includes('40 120')))

  const first = reader(term.id)
  const second = reader(term.id)
  const count = (text) => lines(text).filter((line) => line === `${nonce}_MULTI`).length
  const drains = [first.until((text) => count(text) >= 3), second.until((text) => count(text) >= 3)]
  await service.write(term.id, `printf '\\n'; for i in 1 2 3; do printf '${nonce}_MULTI\\n'; done\r`)
  await Promise.all(drains)
  check('independent readers receive all three lines exactly once', () => {
    assert.equal(count(first.text), 3)
    assert.equal(count(second.text), 3)
  })

  // Drain the shell prompt before timing an empty read.
  await live.until((text) => count(text) === 3 && /[$#]\s*$/.test(plain(text)))
  const started = Date.now()
  const empty = await service.read({ id: term.id, since: live.cursor, holdMs: 120 })
  check('empty output read holds and keeps its cursor', () => {
    assert.ok(Date.now() - started >= 100)
    assert.equal(empty.text, '')
    assert.equal(empty.seq, live.cursor)
  })

  await service.write(term.id, `printf '\\n${nonce}_TAIL\\n'; exit 7\r`)
  const ended = await live.until((_text, answer) => answer.term.exited)
  check('final output is delivered before the remote exit code', () => {
    assert.ok(lines(live.text).includes(`${nonce}_TAIL`))
    assert.equal(ended.term.exitCode, 7)
    assert.equal(ended.term.error, undefined)
  })
  await service.close(term.id)
  check('natural exit cleanup releases the real process range', () => {
    assert.equal(service.list().length, 0)
    assert.equal(runtime.terminals.size, 0)
  })

  const closing = await service.open({ host, cols: 80, rows: 24 })
  const closingReader = reader(closing.id)
  await closingReader.until((text) => /[$#]\s*$/.test(plain(text)))
  const held = service.read({ id: closing.id, since: closingReader.cursor, holdMs: 5000 })
  const stopping = service.close(closing.id)
  assert.equal((await held).term.exited, true)
  await stopping
  check('explicit close wakes the poll and terminates its real PTY', () => {
    assert.equal(service.list().length, 0)
    assert.equal(runtime.terminals.size, 0)
  })
  console.log(`All ${checks} live terminal checks passed.`)
} catch (error) {
  process.exitCode = 1
  console.error(error.stack ?? error)
} finally {
  await service.dispose()
  console.log('PASS terminal service cleanup completed')
  await server.close()
  console.log('PASS DSH runtime cleanup completed')
  if (process.env.DSH_TEST_DIAGNOSTICS === '1') {
    console.log('Remaining resources:', process.getActiveResourcesInfo())
    console.log('Remaining handles:', process._getActiveHandles().map(handle => ({ type: handle.constructor.name, ref: handle.hasRef?.(), listening: handle.listening })))
  }
}

// Desktop's bundled node-pty may leave ConPTY output worker MessagePorts
// referenced after the SSH process and the DSH service have finished. The
// application has an explicit process shutdown too. Only exit this standalone
// test after all assertions and both awaited cleanup steps, preserving failure.
process.exit(process.exitCode ?? 0)
