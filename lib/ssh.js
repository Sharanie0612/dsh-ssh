/**
 * The plugin's SSH mechanics: drive one remote host through the system OpenSSH
 * client.
 *
 * Every operation is a short-lived `ssh` process. Nothing is multiplexed,
 * daemonised, or cached: a call authenticates the same way the user's own
 * `ssh` does, so the OpenSSH client configuration, `IdentityFile`, agent,
 * `ProxyJump`, and `known_hosts` all apply unchanged.
 *
 * Authentication is deliberately non-interactive (`BatchMode=yes`). A host that
 * needs a password cannot be driven by an Agent, because no one is present to
 * type it; the browser terminal, which is a real interactive session, is where a
 * password belongs. A `BatchMode` host therefore fails with the client's own
 * diagnostic instead of hanging.
 * @module @local/dsh-ssh/ssh
 */
import { spawn } from 'node:child_process'

/** The OpenSSH client executable, resolved through `PATH`. */
export const DEFAULT_SSH = 'ssh'

/** Record separator used to split a multi-part remote answer. */
const PART = '\u001e'

/**
 * Quote one value for a POSIX shell, so a path or pattern survives intact.
 * @param value - the literal text to quote.
 * @returns a single-quoted word safe to interpolate into a remote command line.
 */
export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

/**
 * Quote a remote *path* for the shell while keeping a leading `~` expandable.
 *
 * A single-quoted `~` is a literal tilde, so `cd '~'` fails; the tilde is emitted
 * unquoted and only the remainder is quoted, which the shell then concatenates.
 * Everything else is quoted exactly as {@link shellQuote} does, so a path with
 * spaces, quotes, or `$` still arrives intact.
 * @param path - the remote path a caller supplied, possibly `~`-relative.
 * @returns a shell word that expands to the intended path.
 */
export function shellQuotePath(path) {
  const text = String(path)
  if (text.includes('\u0000')) throw new Error('ssh: a remote path cannot contain NUL')
  if (text === '~') return '~'
  if (text.startsWith('~/')) return `~/${shellQuote(text.slice(2))}`
  return shellQuote(text.startsWith('-') ? `./${text}` : text)
}

/**
 * Reject a host token that the client would read as an option.
 * @param host - alias or `user@hostname` supplied by a caller.
 * @throws when the token is empty or begins with `-`.
 */
export function assertHostToken(host) {
  if (typeof host !== 'string' || host.trim() === '') throw new Error('ssh: a host alias is required')
  if (host.trim().startsWith('-')) throw new Error(`ssh: refusing a host token that looks like an option: ${host}`)
  if (/\s|[\u0000-\u001f\u007f]/.test(host.trim())) throw new Error('ssh: the host must be one alias or user@hostname token')
}

/**
 * Build the client argument vector for one invocation.
 * @param host - alias from the configuration, or `user@hostname`.
 * @param options - resolved plugin settings and per-call intent.
 * @returns the argv to spawn.
 */
export function buildArgv(host, options = {}) {
  assertHostToken(host)
  const argv = [options.sshExecutable ?? DEFAULT_SSH]
  if (options.batch !== false) argv.push('-o', 'BatchMode=yes')
  const timeout = Number.isFinite(options.connectTimeoutSeconds) ? options.connectTimeoutSeconds : 8
  if (timeout > 0) argv.push('-o', `ConnectTimeout=${Math.floor(timeout)}`)
  argv.push('-o', 'StrictHostKeyChecking=accept-new')
  if (options.tty === true) argv.push('-tt')
  if (options.port !== undefined) {
    if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw new Error('ssh: port must be an integer from 1 to 65535')
    argv.push('-p', String(options.port))
  }
  if (options.extraArgs !== undefined) argv.push(...options.extraArgs)
  argv.push(host.trim())
  if (options.command !== undefined) argv.push(options.command)
  return argv
}

/** Append a bounded slice of a stream to an accumulator, reporting the first overflow. */
function makeSink(limit) {
  const chunks = []
  let bytes = 0
  let truncated = false
  return {
    push(chunk) {
      if (bytes >= limit) {
        truncated = true
        return
      }
      const room = limit - bytes
      if (chunk.length > room) {
        chunks.push(chunk.subarray(0, room))
        bytes += room
        truncated = true
        return
      }
      chunks.push(chunk)
      bytes += chunk.length
    },
    get truncated() {
      return truncated
    },
    text() {
      return Buffer.concat(chunks).toString('utf8')
    },
  }
}

/**
 * Run one command on a remote host and collect its result.
 *
 * The command is passed as a single argument, so the remote login shell — not
 * this process — performs word splitting, which is what a caller typing the
 * command into a shell expects.
 * @param options - host, command, working directory, limits, and cancellation.
 * @returns the exit status, decoded output, and whether a bound was hit.
 */
export function runRemote(options) {
  const {
    host,
    command,
    cwd,
    stdin,
    timeoutMs = 120000,
    maxOutputBytes = 200000,
    signal,
    sshExecutable,
    connectTimeoutSeconds,
  } = options
  if (typeof command !== 'string') throw new Error('ssh: command must be a string')
  if (signal?.aborted === true) {
    return Promise.resolve({ exitCode: -1, stdout: '', stderr: 'ssh: operation aborted', timedOut: false, truncated: false, spawnFailed: false, aborted: true })
  }
  const remote = cwd !== undefined && cwd !== null && cwd !== '' ? `cd ${shellQuotePath(cwd)} || exit $?; ${command}` : command
  const argv = buildArgv(host, { sshExecutable, connectTimeoutSeconds, command: remote, batch: true })
  const outputLimit = Number.isFinite(maxOutputBytes) && maxOutputBytes > 0 ? Math.floor(maxOutputBytes) : 200000
  const stdoutSink = makeSink(outputLimit)
  const stderrSink = makeSink(outputLimit)

  return new Promise((resolve) => {
    let child
    try {
      child = spawn(argv[0], argv.slice(1), { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    } catch (error) {
      resolve({ exitCode: -1, stdout: '', stderr: `ssh: ${String(error?.message ?? error)}`, timedOut: false, truncated: false, spawnFailed: true, aborted: false })
      return
    }
    let timedOut = false
    let aborted = false
    let spawnFailed = false
    let settled = false
    const timer = timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true
          stderrSink.push(Buffer.from(`ssh: command timed out after ${timeoutMs} ms`))
          stop()
        }, timeoutMs)
      : undefined
    const onAbort = () => { aborted = true; stop() }
    const finish = (exitCode) => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolve({
        exitCode,
        stdout: stdoutSink.text(),
        stderr: stderrSink.text(),
        timedOut,
        truncated: stdoutSink.truncated || stderrSink.truncated,
        spawnFailed,
        aborted,
      })
    }
    const stop = () => {
      child.kill()
      // Proxy processes can keep inherited pipe handles open after ssh exits.
      // Close our ends so a timeout/abort cannot wait forever for their EOF.
      child.stdin?.destroy()
      child.stdout?.destroy()
      child.stderr?.destroy()
      finish(-1)
    }
    child.stdout.on('data', (chunk) => stdoutSink.push(chunk))
    child.stderr.on('data', (chunk) => stderrSink.push(chunk))
    child.on('error', (error) => {
      spawnFailed = true
      stderrSink.push(Buffer.from(`ssh: ${String(error?.message ?? error)}`))
      finish(-1)
    })
    child.on('close', (code) => finish(code ?? -1))
    if (child.stdin !== null) {
      // OpenSSH can close stdin before a large upload finishes (authentication
      // failure, missing directory). Its pipe error must not crash the harness.
      child.stdin.on('error', (error) => {
        if (error.code !== 'EPIPE' && error.code !== 'ECONNRESET') stderrSink.push(Buffer.from(`ssh stdin: ${error.message}`))
      })
      if (stdin === undefined) child.stdin.end()
      else child.stdin.end(stdin)
    }
    if (signal !== undefined) {
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

/**
 * Probe one host: connect, and report what the far end is.
 *
 * `BatchMode` makes this fail fast rather than prompt, so a password-only host
 * is reported as unreachable with the client's own message.
 * @param host - alias or `user@hostname`.
 * @param options - resolved plugin settings.
 * @returns reachability plus the identifying facts a caller can display.
 */
export async function probeHost(host, options = {}) {
  const result = await runRemote({
    host,
    command: 'printf "%s\\n" "$(hostname)" "$(uname -sr)" "$(id -un)" "$HOME"',
    timeoutMs: options.probeTimeoutMs ?? 15000,
    maxOutputBytes: 8192,
    sshExecutable: options.sshExecutable,
    connectTimeoutSeconds: options.connectTimeoutSeconds,
    signal: options.signal,
  })
  if (result.exitCode !== 0) {
    return {
      reachable: false,
      host,
      reason: (result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`).slice(0, 2000),
    }
  }
  const [hostname = '', system = '', user = '', home = ''] = result.stdout.split('\n')
  return { reachable: true, host, hostname, system, user, home }
}

/**
 * Read a window of a remote text file with 1-based line numbers.
 *
 * The window and the total line count come from one round trip: `wc -l` and
 * `sed` print on either side of a record separator, so a single result carries
 * both and a large file is never transferred whole.
 * @param host - host alias.
 * @param path - absolute or host-relative file path.
 * @param options - `offset`, `limit`, and resolved plugin settings.
 * @returns numbered lines, the total line count, and whether the window was cut short.
 */
export async function readRemoteFile(host, path, options) {
  const offset = Number.isInteger(options.offset) && options.offset > 0 ? options.offset : 1
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 2000
  const end = offset + limit - 1
  const quoted = shellQuotePath(path)
  const command = `if [ -d ${quoted} ]; then echo 'ssh: that path is a directory' >&2; exit 2; fi; `
    + `count=$(awk 'END { print NR }' < ${quoted}) || exit $?; printf '%s' "$count"; printf '${PART}'; sed -n '${offset},${end}p' < ${quoted}`
  const result = await runRemote({
    host,
    command,
    timeoutMs: options.timeoutMs ?? 60000,
    maxOutputBytes: options.maxOutputBytes ?? 400000,
    sshExecutable: options.sshExecutable,
    connectTimeoutSeconds: options.connectTimeoutSeconds,
    signal: options.signal,
  })
  if (result.exitCode !== 0) {
    return { ok: false, host, path, reason: (result.stderr.trim() || `exit code ${result.exitCode}`).slice(0, 2000) }
  }
  const split = result.stdout.indexOf(PART)
  if (split === -1) return { ok: false, host, path, reason: 'the remote read produced no complete header' }
  const totalLines = Number(result.stdout.slice(0, split).trim())
  if (!Number.isInteger(totalLines) || totalLines < 0) return { ok: false, host, path, reason: 'the remote read did not report a valid line count' }
  const body = result.stdout.slice(split + 1)
  const rawLines = body.length === 0 ? [] : body.replace(/\n$/, '').split('\n')
  return {
    ok: true,
    host,
    path,
    offset,
    totalLines: Number.isInteger(totalLines) ? totalLines : 0,
    truncated: result.truncated || (Number.isInteger(totalLines) && offset + rawLines.length - 1 < totalLines),
    lines: rawLines.map((text, index) => ({ number: offset + index, text })),
  }
}

/**
 * Replace a remote file's whole contents.
 * @param host - host alias.
 * @param path - target path; its parent directory must exist.
 * @param content - the exact UTF-8 text to write.
 * @param options - resolved plugin settings.
 * @returns the byte count written, or a failure reason.
 */
export async function writeRemoteFile(host, path, content, options) {
  const bytes = Buffer.byteLength(content, 'utf8')
  const result = await runRemote({
    host,
    command: `cat > ${shellQuotePath(path)} && wc -c < ${shellQuotePath(path)} | tr -d ' \\t'`,
    stdin: content,
    timeoutMs: options.timeoutMs ?? 60000,
    sshExecutable: options.sshExecutable,
    connectTimeoutSeconds: options.connectTimeoutSeconds,
    signal: options.signal,
  })
  if (result.exitCode !== 0) {
    return { ok: false, reason: (result.stderr.trim() || `exit code ${result.exitCode}`).slice(0, 2000) }
  }
  const written = /^\d+$/.test(result.stdout.trim()) ? Number(result.stdout.trim()) : NaN
  if (!Number.isInteger(written) || written !== bytes) return { ok: false, reason: `the remote write reported ${result.stdout.trim() || 'no size'} bytes, expected ${bytes}` }
  return { ok: true, bytes: written, expectedBytes: bytes }
}

/**
 * Expand a glob pattern on the remote host.
 *
 * `globstar` is enabled so `**` crosses directories, which is the shape an Agent
 * uses for a search; a pattern matching nothing yields no rows rather than a
 * literal echo, because `nullglob` is set.
 * @param host - host alias.
 * @param pattern - glob pattern, interpreted relative to `cwd`.
 * @param options - `cwd`, `limit`, and resolved plugin settings.
 * @returns matching host paths, sorted.
 */
export async function globRemote(host, pattern, options) {
  const cwd = options.cwd ?? '~'
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 200
  // Expand a variable as a glob, never as shell code. Empty IFS preserves spaces
  // in patterns; explicit bash also works when the SSH login shell is /bin/sh.
  const script = 'shopt -s globstar nullglob dotglob; cd -- "$1" || exit 2; '
    + `IFS=; pattern=$2; matches=( $pattern ); if (( \${#matches[@]} )); then printf '%s\\0' "\${matches[@]:0:${limit + 1}}"; fi`
  const command = `command -v bash >/dev/null 2>&1 || { echo 'ssh: glob requires bash on this host' >&2; exit 127; }; `
    + `bash -c ${shellQuote(script)} -- ${shellQuotePath(cwd)} ${shellQuote(pattern)}`
  const result = await runRemote({
    host,
    command,
    timeoutMs: options.timeoutMs ?? 60000,
    maxOutputBytes: options.maxOutputBytes ?? 200000,
    sshExecutable: options.sshExecutable,
    connectTimeoutSeconds: options.connectTimeoutSeconds,
    signal: options.signal,
  })
  if (result.exitCode !== 0) {
    return { ok: false, reason: (result.stderr.trim() || `exit code ${result.exitCode}`).slice(0, 2000) }
  }
  const paths = result.stdout.split('\u0000').filter((line) => line !== '')
  return { ok: true, cwd, pattern, paths: paths.slice(0, limit), truncated: result.truncated || paths.length > limit }
}

/**
 * Search remote file contents.
 *
 * `ripgrep` is used when the host has it and `grep -rn` otherwise, so the
 * operation works on a minimal board image without installing anything.
 * @param host - host alias.
 * @param pattern - regular expression, in ripgrep syntax when ripgrep is present.
 * @param options - `cwd`, `include`, `limit`, and resolved plugin settings.
 * @returns matching lines as `path:line:text`.
 */
export async function grepRemote(host, pattern, options) {
  const cwd = options.cwd ?? '~'
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 200
  const include = options.include
  // The pattern reaches the searcher through `-e`, so a pattern beginning with a
  // dash is data rather than an option, and `--` is never needed. Permission
  // errors from unreadable directories are noise: they go to /dev/null so a
  // partial search still reports the matches it found.
  const rg = `rg --line-number --no-heading --color never ${include !== undefined ? `--glob ${shellQuote(include)} ` : ''}`
    + `-e ${shellQuote(pattern)} . 2>/dev/null`
  const grep = `grep -rn --binary-files=without-match ${include !== undefined ? `--include=${shellQuote(include)} ` : ''}`
    + `-e ${shellQuote(pattern)} . 2>/dev/null`
  const command = `cd ${shellQuotePath(cwd)} || exit 2; `
    + `if command -v rg >/dev/null 2>&1; then ${rg}; else ${grep}; fi`
  const result = await runRemote({
    host,
    command,
    timeoutMs: options.timeoutMs ?? 90000,
    maxOutputBytes: options.maxOutputBytes ?? 400000,
    sshExecutable: options.sshExecutable,
    connectTimeoutSeconds: options.connectTimeoutSeconds,
    signal: options.signal,
  })
  // Exit code 1 is "no matches" and exit code 2 can mean permission errors on
  // unreadable subdirectories. Preserve partial output, but an error with no
  // output (including an invalid regex) must not masquerade as no matches.
  if (result.exitCode !== 0 && result.exitCode !== 1 && result.stdout.trim() === '') return { ok: false, reason: (result.stderr.trim() || `exit code ${result.exitCode}`).slice(0, 2000) }
  const lines = result.stdout.split('\n').filter((line) => line !== '')
  return { ok: true, cwd, pattern, matches: lines.slice(0, limit), truncated: result.truncated || lines.length > limit }
}

/**
 * List one remote directory, one level deep, with each entry's type and size.
 *
 * GNU `find -printf` is used when the host has it, which is what makes a size
 * column possible in one round trip; otherwise the listing falls back to
 * `ls -A -p` and reports `detailed: false`, so a caller can tell an absent size
 * from a zero one.
 *
 * Fields are **NUL-delimited**, not newline- and tab-delimited, and the resolved
 * path is separated by NUL too. That is not decoration: a directory on a working
 * board really does contain names with control bytes, carriage returns, and bytes
 * that are not valid UTF-8, and a newline-delimited protocol misaligns every field
 * after such a name — which showed up as a real entry reported with a fragment
 * name and a bogus size. No path can contain NUL, so the framing is unambiguous.
 * A name that is not valid UTF-8 still decodes with replacement characters, but its
 * own entry, type, and size stay correct and distinguishable.
 * @param host - host alias.
 * @param path - remote directory.
 * @param options - resolved plugin settings.
 * @returns the resolved path and entries, sorted with directories first then by name.
 */
export async function listRemote(host, path, options) {
  const quoted = shellQuotePath(path)
  const detailed = `find . -mindepth 1 -maxdepth 1 -printf '%y\\0%s\\0%f\\0'`
  const command = `cd ${quoted} 2>/dev/null || { echo 'ssh: no such directory' >&2; exit 2; }; `
    + `pwd; printf '\\0'; `
    + `if ${detailed} >/dev/null 2>&1; then ${detailed}; else ls -A -p; fi`
  const result = await runRemote({
    host,
    command,
    timeoutMs: options.timeoutMs ?? 30000,
    maxOutputBytes: options.maxOutputBytes ?? 200000,
    sshExecutable: options.sshExecutable,
    connectTimeoutSeconds: options.connectTimeoutSeconds,
    signal: options.signal,
  })
  if (result.exitCode !== 0) {
    return { ok: false, reason: (result.stderr.trim() || `exit code ${result.exitCode}`).slice(0, 2000) }
  }
  const separator = result.stdout.indexOf('\u0000')
  const resolvedPath = (separator === -1 ? result.stdout : result.stdout.slice(0, separator)).replace(/\n$/, '')
  const listing = separator === -1 ? '' : result.stdout.slice(separator + 1)
  const entries = listing.includes('\u0000') ? parseNulDelimited(listing) : parsePlainListing(listing)
  entries.sort((left, right) => (left.directory === right.directory
    ? left.name.localeCompare(right.name)
    : left.directory ? -1 : 1))
  return {
    ok: true,
    host,
    path,
    ...resolvedPath === '' ? {} : { resolvedPath },
    detailed: listing.includes('\u0000'),
    truncated: result.truncated,
    entries,
  }
}

/**
 * Make a remote name safe to display.
 *
 * A working board really does contain names with control bytes and carriage
 * returns. Printed raw they render as nothing, or as a line reset that corrupts the
 * rows around them — which is exactly how a real entry in a user's project listed
 * as garbage. The **raw** name is kept verbatim because a caller must pass it back
 * in a path; this is only the form a person reads.
 * @param name - the decoded entry name.
 * @returns the name with control characters escaped, unchanged when it has none.
 */
export function escapeDisplayName(name) {
  if (!/[\u0000-\u001f\u007f]/.test(name)) return name
  const named = { 7: '\\a', 8: '\\b', 9: '\\t', 10: '\\n', 11: '\\v', 12: '\\f', 13: '\\r' }
  return name.replace(/[\u0000-\u001f\u007f]/g, (character) => {
    const code = character.codePointAt(0)
    return named[code] ?? `\\x${code.toString(16).padStart(2, '0')}`
  })
}

/**
 * Read `type\0size\0name\0` triples.
 * @param listing - the NUL-delimited listing.
 * @returns the entries; a trailing partial triple is ignored rather than guessed at.
 */
function parseNulDelimited(listing) {
  const fields = listing.split('\u0000')
  if (fields.length > 0 && fields[fields.length - 1] === '') fields.pop()
  const entries = []
  for (let index = 0; index + 2 < fields.length; index += 3) {
    const size = Number.parseInt(fields[index + 1], 10)
    const name = fields[index + 2]
    const displayName = escapeDisplayName(name)
    entries.push({
      name,
      ...displayName === name ? {} : { displayName },
      directory: fields[index] === 'd',
      ...Number.isInteger(size) ? { size } : {},
    })
  }
  return entries
}

/** Read the newline-delimited `ls -A -p` fallback, which carries no sizes. */
function parsePlainListing(listing) {
  return listing
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line !== '' && line !== '.' && line !== '..')
    .map((line) => {
      const name = line.replace(/\/$/, '')
      const displayName = escapeDisplayName(name)
      return {
        name,
        ...displayName === name ? {} : { displayName },
        directory: line.endsWith('/'),
      }
    })
}

/**
 * Read a remote file as raw bytes, base64-encoded on the far side.
 *
 * Base64 is what keeps this binary-safe: the transport, the CSV-free shell
 * quoting, and the JSON result are all text, and a `cat` of arbitrary bytes would
 * corrupt them. The size is checked on the host before the file is encoded, so an
 * oversized file costs one round trip rather than a transfer.
 * @param host - host alias.
 * @param path - remote file.
 * @param options - `maxBytes` and resolved plugin settings.
 * @returns the decoded bytes and the remote size.
 */
export async function readRemoteBytes(host, path, options) {
  const maxBytes = Number.isInteger(options.maxBytes) && options.maxBytes > 0 ? options.maxBytes : 8 * 1024 * 1024
  const quoted = shellQuotePath(path)
  const command = `command -v base64 >/dev/null 2>&1 || { echo 'ssh: this host has no base64' >&2; exit 127; }; `
    + `if [ -d ${quoted} ]; then echo 'ssh: that path is a directory' >&2; exit 2; fi; `
    // A failed read must be reported as a failed read: an empty or non-numeric
    // size would otherwise reach the numeric test below and produce a shell
    // diagnostic instead of the caller's own reason.
    + `size=$(wc -c < ${quoted} 2>/dev/null | tr -d ' \\t') || { echo 'ssh: cannot read that path' >&2; exit 2; }; `
    + `case "$size" in ''|*[!0-9]*) echo 'ssh: cannot read that path' >&2; exit 2;; esac; `
    + `printf '%s\\n' "$size"; `
    + `if [ "$size" -gt ${maxBytes} ]; then echo "ssh: file is $size bytes, above the ${maxBytes}-byte limit" >&2; exit 3; fi; `
    + `printf '\\036'; base64 < ${quoted}`
  const result = await runRemote({
    host,
    command,
    timeoutMs: options.timeoutMs ?? 120000,
    // BSD base64 wraps at 64 columns and GNU at 76. Include line framing in
    // the output budget so files near the transfer cap can still be decoded.
    maxOutputBytes: Math.ceil(maxBytes / 3) * 4 + Math.ceil((Math.ceil(maxBytes / 3) * 4) / 64) * 2 + 512,
    sshExecutable: options.sshExecutable,
    connectTimeoutSeconds: options.connectTimeoutSeconds,
    signal: options.signal,
  })
  if (result.exitCode !== 0) {
    return { ok: false, reason: (result.stderr.trim() || `exit code ${result.exitCode}`).slice(0, 2000) }
  }
  if (result.truncated) return { ok: false, reason: 'the remote file read was truncated' }
  const split = result.stdout.indexOf('\u001e')
  if (split === -1) return { ok: false, reason: 'the remote read produced no separator' }
  const size = Number(result.stdout.slice(0, split).trim())
  const encoded = result.stdout.slice(split + 1).replace(/\s+/g, '')
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return { ok: false, reason: 'the remote read produced invalid base64' }
  const bytes = Buffer.from(encoded, 'base64')
  if (!Number.isInteger(size) || size < 0 || size > maxBytes) return { ok: false, reason: 'the remote read did not report a valid size within the transfer limit' }
  if (bytes.length !== size) {
    return { ok: false, reason: `the remote file changed while it was read: reported ${size} bytes, decoded ${bytes.length}` }
  }
  return { ok: true, host, path, size, bytes, truncated: result.truncated }
}

/**
 * Write raw bytes to a remote file, base64-encoded on the way out.
 *
 * The payload travels on stdin rather than as an argument, so a large file is not
 * bounded by the command-length limit, and the written size is read back from the
 * host so a short write is reported instead of believed.
 * @param host - host alias.
 * @param path - remote file; its parent directory must exist.
 * @param bytes - the exact bytes to write.
 * @param options - `verifySha256`, `localSha256`, and resolved plugin settings.
 * @returns the written and expected byte counts, plus the verified digest when asked.
 */
export async function writeRemoteBytes(host, path, bytes, options) {
  const quoted = shellQuotePath(path)
  const digestStep = options.verifySha256 === true
    ? ` && { sha256sum < ${quoted} 2>/dev/null || shasum -a 256 < ${quoted} 2>/dev/null || echo '?'; } | awk '{print $1}'`
    : ''
  const command = `command -v base64 >/dev/null 2>&1 || { echo 'ssh: this host has no base64' >&2; exit 127; }; `
    + `base64 -d > ${quoted} || exit 2; wc -c < ${quoted} | tr -d ' \\t'${digestStep}`
  const result = await runRemote({
    host,
    command,
    stdin: `${bytes.toString('base64')}\n`,
    timeoutMs: options.timeoutMs ?? 120000,
    maxOutputBytes: 64 * 1024,
    sshExecutable: options.sshExecutable,
    connectTimeoutSeconds: options.connectTimeoutSeconds,
    signal: options.signal,
  })
  if (result.exitCode !== 0) {
    return { ok: false, reason: (result.stderr.trim() || `exit code ${result.exitCode}`).slice(0, 2000) }
  }
  const parts = result.stdout.trim().split('\n')
  const written = Number.parseInt(parts[0] ?? '', 10)
  const remoteSha256 = options.verifySha256 === true ? (parts[1] ?? '').trim() : undefined
  if (written !== bytes.length) {
    return { ok: false, reason: `the remote write reported ${written} bytes, expected ${bytes.length}` }
  }
  if (options.verifySha256 === true && options.localSha256 !== undefined && remoteSha256 !== options.localSha256) {
    return { ok: false, reason: `the remote digest ${remoteSha256} does not match the local digest ${options.localSha256}` }
  }
  return { ok: true, host, path, bytes: written, ...remoteSha256 === undefined ? {} : { sha256: remoteSha256 } }
}

