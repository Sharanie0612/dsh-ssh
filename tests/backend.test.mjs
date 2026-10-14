import assert from 'node:assert/strict'
import { after, before, mock, test } from 'node:test'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { buildArgv, globRemote, grepRemote, listRemote, readRemoteBytes, readRemoteFile, runRemote, shellQuote, shellQuotePath, writeRemoteBytes, writeRemoteFile } from '../lib/ssh.js'
import { listConfiguredHosts, parseSshConfig } from '../lib/hosts.js'
import { createRemoteContexts, resolveRemotePath } from '../lib/session.js'
import { registerTools } from '../lib/tools.js'
import { createRemoteFileSystem } from '../lib/remote-fs.js'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash'
const hasShell = existsSync(bash)
const sshExecutable = 'test-ssh-local'
const ssh = { sshExecutable }
const realSpawn = childProcess.spawn
let fixture
let remote
let calls = []

// Keep the production OpenSSH argument construction, cancellation, stdin and
// output collectors. Replace only the network hop with a real POSIX shell.
before(async () => {
  fixture = await mkdtemp(join(project, '.backend-test-'))
  remote = process.platform === 'win32' ? fixture.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`).replaceAll('\\', '/') : fixture
  mock.method(childProcess, 'spawn', (executable, args, options) => {
    if (executable !== sshExecutable) return realSpawn(executable, args, options)
    calls.push(args)
    return realSpawn(bash, ['--noprofile', '--norc', '-c', `PATH=/usr/bin:/bin:$PATH; ${args.at(-1)}`], options)
  })
  syncBuiltinESMExports()
})
after(async () => {
  mock.restoreAll()
  syncBuiltinESMExports()
  await rm(fixture, { recursive: true, force: true })
})

const shellTest = (name, fn) => test(name, { skip: !hasShell }, fn)

test('host and port validation keep OpenSSH options separate from the target', () => {
  assert.throws(() => buildArgv('-oProxyCommand=bad'), /option/)
  assert.throws(() => buildArgv('host\nother'), /one alias/)
  assert.throws(() => buildArgv('host', { port: 65536 }), /port/)
  assert.equal(buildArgv(' user@host ', { port: 2222, command: 'true' }).at(-2), 'user@host')
  assert.equal(shellQuotePath('-file'), "'./-file'")
  assert.throws(() => shellQuotePath('bad\0path'), /NUL/)
})

test('switching hosts resets cwd and remote names retain whitespace', () => {
  const contexts = createRemoteContexts()
  contexts.set('a', { host: 'one', cwd: '/project' })
  assert.equal(contexts.set('a', { host: 'one' }).cwd, '/project')
  assert.equal(contexts.set('a', { host: 'two' }).cwd, null)
  assert.equal(resolveRemotePath(' name ', { cwd: '/' }), '/ name ')
})

test('SSH catalog applies first-wins globals, wildcard defaults and exclusions', () => {
  const hosts = parseSshConfig('User global\nHost *.dev !blocked.dev\n Port 2222\nHost board.dev blocked.dev\n HostName 127.0.0.1\n User later\nHost *\n IdentityFile "C:/a # key/id"\n')
  assert.equal(hosts.find((host) => host.alias === 'board.dev').port, 2222)
  assert.equal(hosts.find((host) => host.alias === 'blocked.dev').port, 22)
  assert.equal(hosts[0].user, 'global')
  assert.equal(hosts[0].identityFile, 'C:/a # key/id')
})

test('SSH catalog follows sorted Include files and stops include cycles', { skip: process.platform !== 'win32' }, async () => {
  const home = join(fixture, 'home')
  const configs = join(home, '.ssh', 'config.d')
  await mkdir(configs, { recursive: true })
  await writeFile(join(home, '.ssh', 'config'), 'Include "config.d/*.conf"\nHost *\n User fallback\n')
  await writeFile(join(configs, 'a.conf'), 'Host included\n HostName example.test\n Include config\n')
  const result = await listConfiguredHosts({ USERPROFILE: home })
  assert.deepEqual(result.hosts.map((host) => host.alias), ['included'])
  assert.equal(result.hosts[0].user, 'fallback')
})

shellTest('runRemote preserves stderr, cwd and command sequencing', async () => {
  const result = await runRemote({ ...ssh, host: 'fixture', cwd: remote, command: 'printf out; printf err >&2; exit 7' })
  assert.equal(result.stdout, 'out')
  assert.equal(result.stderr, 'err')
  assert.equal(result.exitCode, 7)
  const blocked = await runRemote({ ...ssh, host: 'fixture', cwd: `${remote}/missing`, command: 'printf should-not-run; printf also-not-run' })
  assert.equal(blocked.stdout, '')
  assert.notEqual(blocked.exitCode, 0)
})

shellTest('runRemote respects output limits and does not launch pre-aborted operations', async () => {
  const limited = await runRemote({ ...ssh, host: 'fixture', command: 'printf 123456789', maxOutputBytes: 4 })
  assert.equal(limited.stdout, '1234')
  assert.equal(limited.truncated, true)
  const controller = new AbortController()
  controller.abort()
  const count = calls.length
  const aborted = await runRemote({ ...ssh, host: 'fixture', command: 'true', signal: controller.signal })
  assert.equal(aborted.aborted, true)
  assert.equal(calls.length, count)
})

shellTest('runRemote marks timeouts and cancels an active SSH process', async () => {
  const started = Date.now()
  const timedOut = await runRemote({ ...ssh, host: 'fixture', command: 'exec sleep 3', timeoutMs: 100 })
  assert.equal(timedOut.timedOut, true)
  assert.notEqual(timedOut.exitCode, 0)
  const controller = new AbortController()
  const pending = runRemote({ ...ssh, host: 'fixture', command: 'exec sleep 3', signal: controller.signal })
  setTimeout(() => controller.abort(), 100)
  const aborted = await pending
  assert.equal(aborted.aborted, true)
  assert.notEqual(aborted.exitCode, 0)
  assert.ok(Date.now() - started < 2000, 'timeout and cancellation must complete before inherited pipe handles reach EOF')
})

test('runRemote reports missing SSH executables as spawn failures without crashing on stdin', async () => {
  const result = await runRemote({ host: 'fixture', command: 'true', sshExecutable: join(fixture, 'missing-ssh'), stdin: Buffer.alloc(1024 * 1024) })
  assert.equal(result.exitCode, -1)
  assert.equal(result.spawnFailed, true)
})

shellTest('text reads count the final unterminated line and retain exact UTF-8 writes', async () => {
  const path = `${remote}/utf8 file.txt`
  const content = 'first\n中文 without final newline'
  assert.equal((await writeRemoteFile('fixture', path, content, ssh)).ok, true)
  const read = await readRemoteFile('fixture', path, { ...ssh, offset: 2, limit: 1 })
  assert.equal(read.totalLines, 2)
  assert.deepEqual(read.lines, [{ number: 2, text: '中文 without final newline' }])
  assert.equal(read.truncated, false)
  assert.equal((await readRemoteFile('fixture', `${remote}/missing`, ssh)).ok, false)
})

shellTest('globs handle spaces and shell syntax as data, with precise limits', async () => {
  await mkdir(join(fixture, 'space dir'), { recursive: true })
  await writeFile(join(fixture, 'space dir', 'one.txt'), '')
  await writeFile(join(fixture, 'space dir', 'two.txt'), '')
  const exact = await globRemote('fixture', 'space dir/*.txt', { ...ssh, cwd: remote, limit: 2 })
  assert.deepEqual(exact.paths, ['space dir/one.txt', 'space dir/two.txt'])
  assert.equal(exact.truncated, false)
  const recursive = await globRemote('fixture', '**/*.txt', { ...ssh, cwd: remote, limit: 1 })
  assert.equal(recursive.paths.length, 1)
  assert.equal(recursive.truncated, true)
  const injection = await globRemote('fixture', 'missing*; touch injected', { ...ssh, cwd: remote })
  assert.equal(injection.ok, true)
  assert.deepEqual(injection.paths, [])
  assert.equal(existsSync(join(fixture, 'injected')), false)
  await globRemote('fixture', '$(touch injected)*', { ...ssh, cwd: remote })
  assert.equal(existsSync(join(fixture, 'injected')), false)
})

shellTest('grep distinguishes invalid expressions and no matches and caps results', async () => {
  await writeFile(join(fixture, 'grep.txt'), 'match\nmatch\nmatch\n')
  const invalid = await grepRemote('fixture', '[', { ...ssh, cwd: remote })
  assert.equal(invalid.ok, false)
  const absent = await grepRemote('fixture', 'not present', { ...ssh, cwd: remote })
  assert.equal(absent.ok, true)
  assert.deepEqual(absent.matches, [])
  const found = await grepRemote('fixture', '^match$', { ...ssh, cwd: remote, limit: 2, include: 'grep.txt' })
  assert.equal(found.matches.length, 2)
  assert.equal(found.truncated, true)
})

shellTest('binary transfers near the cap include base64 wrapping and verify SHA-256', async () => {
  const bytes = Buffer.alloc(3 * 1024 * 1024, 0x80)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const path = `${remote}/binary.bin`
  const written = await writeRemoteBytes('fixture', path, bytes, { ...ssh, verifySha256: true, localSha256: sha256 })
  assert.equal(written.ok, true, written.reason)
  const read = await readRemoteBytes('fixture', path, { ...ssh, maxBytes: bytes.length })
  assert.equal(read.ok, true, read.reason)
  assert.deepEqual(read.bytes, bytes)
  assert.equal((await readRemoteBytes('fixture', path, { ...ssh, maxBytes: 4 })).ok, false)
})

shellTest('directory listing preserves names and sizes with a resolved absolute path', async () => {
  await writeFile(join(fixture, ' spaced name '), 'bytes')
  const result = await listRemote('fixture', remote, ssh)
  assert.equal(result.ok, true)
  assert.equal(result.detailed, true)
  const entry = result.entries.find((entry) => entry.name === ' spaced name ')
  assert.equal(entry.size, 5)
  assert.equal(entry.directory, false)
})

shellTest('SSH tools resolve agent defaults and edit replacement text literally', async () => {
  const tools = new Map()
  registerTools({ tools: { register: (tool) => tools.set(tool.name, tool) } }, { ...ssh, maxOutputBytes: 400000, defaultTimeoutMs: 60000, maxTransferBytes: 8 * 1024 * 1024 })
  const exec = { agent: { id: 'test-agent' } }
  await tools.get('ssh_connect').execute({ host: 'fixture', cwd: remote }, exec)
  await writeFile(join(fixture, 'edit.txt'), '\uFEFFold\n')
  const edit = await tools.get('ssh_edit').execute({ path: 'edit.txt', old_string: 'old', new_string: '$& literal $` $\'' }, exec)
  assert.equal(edit.ok, true, edit.reason)
  assert.equal(await readFile(join(fixture, 'edit.txt'), 'utf8'), '\uFEFF$& literal $` $\'\n')
  const result = await tools.get('ssh_exec').execute({ host: 'other-host', command: 'printf other' }, exec)
  assert.equal(result.stdout, 'other')
  assert.equal(calls.at(-1).at(-1), 'printf other')
  assert.ok(tools.get('ssh_read').parameters.required.includes('path'))
  assert.ok(!tools.get('ssh_ls').parameters.required.includes('path'))
})

shellTest('SSH edit refuses oversized and non-UTF-8 files without rewriting them', async () => {
  const tools = new Map()
  registerTools({ tools: { register: (tool) => tools.set(tool.name, tool) } }, { ...ssh, defaultTimeoutMs: 60000 })
  const bytes = Buffer.alloc(2 * 1024 * 1024 + 1, 0x61)
  await writeFile(join(fixture, 'too-large.txt'), bytes)
  const large = await tools.get('ssh_edit').execute({ host: 'fixture', path: `${remote}/too-large.txt`, old_string: 'a', new_string: 'b', replace_all: true })
  assert.equal(large.ok, false)
  assert.deepEqual(await readFile(join(fixture, 'too-large.txt')), bytes)
  await writeFile(join(fixture, 'invalid-utf8.bin'), Buffer.from([0xff, 0x61]))
  const invalid = await tools.get('ssh_edit').execute({ host: 'fixture', path: `${remote}/invalid-utf8.bin`, old_string: 'a', new_string: 'b' })
  assert.equal(invalid.ok, false)
  assert.match(invalid.reason, /UTF-8/)
})

shellTest('remote filesystem resolves home-relative paths and exposes valid metadata', async () => {
  const fs = createRemoteFileSystem({ ...ssh, host: 'fixture', cwd: remote })
  const target = await fs.resolve('utf8 file.txt')
  assert.equal(target.targetKey, `${remote}/utf8 file.txt`)
  const info = await fs.stat(target)
  assert.equal(info.type, 'file')
  assert.equal(info.size, Buffer.byteLength('first\n中文 without final newline'))
  assert.equal(await fs.readText(target), 'first\n中文 without final newline')
  assert.equal((await fs.lstat('utf8 file.txt')).type, 'file')
  assert.equal(await fs.stat(await fs.resolve('not-there')), undefined)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(() => fs.resolve('utf8 file.txt', { signal: controller.signal }), (error) => error.code === 'FS_ABORTED')
  await assert.rejects(() => fs.readText({ targetKey: `${remote}/invalid-utf8.bin` }), (error) => error.code === 'FS_NOT_TEXT')
  await writeFile(join(fixture, 'nul.bin'), Buffer.from([0x61, 0x00, 0x62]))
  await assert.rejects(() => fs.readText({ targetKey: `${remote}/nul.bin` }), (error) => error.code === 'FS_NOT_TEXT')
})

shellTest('remote stat follows symlinks while lstat reports the link entry', async (t) => {
  try { await symlink('utf8 file.txt', join(fixture, 'utf8-link'), 'file') } catch (error) {
    if (error.code === 'EPERM') { t.skip('this Windows session cannot create symlinks'); return }
    throw error
  }
  const fs = createRemoteFileSystem({ ...ssh, host: 'fixture', cwd: remote })
  const link = await fs.resolve('utf8-link')
  assert.equal((await fs.stat(link)).type, 'file')
  assert.equal((await fs.lstat('utf8-link')).type, 'symlink')
  assert.equal((await fs.stat(link)).size, Buffer.byteLength('first\n中文 without final newline'))
  assert.equal(await fs.readText(link), 'first\n中文 without final newline')
})
