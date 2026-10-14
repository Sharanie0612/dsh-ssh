// Opt-in SSH filesystem/tool test. Only a unique /tmp directory is modified.
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { runRemote, shellQuote, readRemoteBytes, writeRemoteBytes, writeRemoteFile } from '../lib/ssh.js'
import { createRemoteFileSystem } from '../lib/remote-fs.js'
import { startLiveServer } from './helpers/live-server.mjs'

const host = process.argv[2] ?? 'ubuntu-vm'
const server = await startLiveServer()
const ssh = { sshExecutable: 'ssh', connectTimeoutSeconds: 8, timeoutMs: 15000 }
const command = value => runRemote({ ...ssh, host, command: value })
let directory
let checks = 0
function pass(name) { checks++; console.log(`PASS ${name}`) }
try {
  const created = await command('mktemp -d /tmp/dsh-ssh-test.XXXXXXXX')
  assert.equal(created.exitCode, 0, created.stderr)
  directory = created.stdout.trim()
  assert.match(directory, /^\/tmp\/dsh-ssh-test\.[A-Za-z0-9]+$/)
  const agent = { id: 'ssh-live-regression' }
  const exec = { agent, signal: new AbortController().signal }
  const call = (name, args) => server.ctx.tools.get(name).execute(args, exec)
  await call('ssh_connect', { host, cwd: directory, probe: true })
  await call('ssh_write', { path: 'text.txt', content: 'first\n中文 without final newline' })
  const read = await call('ssh_read', { path: 'text.txt' })
  assert.equal(read.totalLines, 2)
  assert.equal(read.lines[1].text, '中文 without final newline')
  pass('registered DSH tools use the selected SSH workspace and preserve UTF-8/last line')
  await call('ssh_edit', { path: 'text.txt', old_string: 'first', new_string: '$& is literal' })
  assert.equal((await call('ssh_read', { path: 'text.txt' })).lines[0].text, '$& is literal')
  pass('SSH editing writes replacement tokens literally')
  const payload = randomBytes(1024 * 1024 + 17)
  const digest = createHash('sha256').update(payload).digest('hex')
  const file = `${directory}/binary.bin`
  const written = await writeRemoteBytes(host, file, payload, { ...ssh, verifySha256: true, localSha256: digest })
  assert.equal(written.ok, true, written.reason)
  assert.equal(written.sha256, digest)
  const received = await readRemoteBytes(host, file, { ...ssh, maxBytes: payload.length })
  assert.equal(received.ok, true, received.reason)
  assert.deepEqual(received.bytes, payload)
  pass('1 MiB binary SSH round trip verifies SHA-256 and a transfer at its size cap')
  assert.equal((await writeRemoteFile(host, `${directory}/empty.txt`, '', ssh)).ok, true)
  const empty = await readRemoteBytes(host, `${directory}/empty.txt`, ssh)
  assert.equal(empty.size, 0)
  pass('empty remote files can be created and read')
  assert.equal((await command(`ln -s text.txt ${shellQuote(`${directory}/text-link`)}`)).exitCode, 0)
  const fs = createRemoteFileSystem({ ...ssh, host, cwd: directory })
  const link = await fs.resolve('text-link')
  assert.equal((await fs.stat(link)).type, 'file')
  assert.equal((await fs.lstat('text-link')).type, 'symlink')
  assert.equal(await fs.readText(link), '$& is literal\n中文 without final newline')
  pass('real Linux symlinks have distinct stat/lstat semantics and remain readable')
  await call('ssh_disconnect', {})
  console.log(`All ${checks} live backend checks passed.`)
} finally {
  if (directory) {
    const files = ['text.txt', 'binary.bin', 'empty.txt', 'text-link'].map(name => shellQuote(`${directory}/${name}`)).join(' ')
    const cleanup = await command(`rm -f -- ${files} && rmdir -- ${shellQuote(directory)}`)
    assert.equal(cleanup.exitCode, 0, cleanup.stderr)
  }
  await server.close()
}
