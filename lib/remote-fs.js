/**
 * A read-only remote filesystem, shaped like the harness's `ctx.fs` service.
 *
 * This is the substrate for a future "remote workspace" agent preset, where the
 * Agent's own `read`, `glob`, and `grep` tools operate on a board instead of this
 * machine. It is deliberately **read-only**: a provider that cannot write cannot
 * write to the wrong place, so this half can be built and verified on its own
 * before any write path exists.
 *
 * Why it is a plain object rather than a subclass of `@deepseek-ai/dsh-fs`'s
 * `FileSystem`: this package lives outside the profile directory tree, and Node
 * resolves bare specifiers by realpath from a module's own location, so
 * `@deepseek-ai/*` cannot be resolved from here at all — measured, see
 * `docs/design.md` §14. The runtime does expose `ctx.reflect.provide`, so a plain
 * implementation can still be published as the `fs` service inside an isolated
 * realm. The cost is class identity: a consumer's `error instanceof FsError` is
 * false for these errors, so a structured tool-result code is lost while the
 * message survives. {@link RemoteFsError} therefore carries the same `code`
 * vocabulary and names itself `FsError`, so readers of `.code` keep working.
 *
 * Deliberate deviations from the local provider, each a limitation to know about:
 * - Target identity is the normalised absolute path, not a realpath. Two aliases of
 *   one file (a symlinked ancestor) are therefore two targets, and `..` is collapsed
 *   textually rather than by walking the filesystem.
 * - `streamText` answers an async iterable, but reads the file in one bounded
 *   transfer rather than streaming it; a true stream would need a persistent
 *   channel. Results are identical for any file under the cap.
 * - Version tokens are the remote type, size, and nanosecond mtime, so a rewrite
 *   that preserves all three is invisible to a stale-version check.
 * @module @local/dsh-ssh/remote-fs
 */
import { readRemoteBytes, runRemote, shellQuotePath } from './ssh.js'

/** How much text one read or stream will transfer. */
const MAX_TEXT_BYTES = 8 * 1024 * 1024
/** How much binary one `readBytes` will transfer. */
const MAX_BYTES = 8 * 1024 * 1024

/**
 * A filesystem error carrying the harness's error-code vocabulary.
 *
 * It cannot extend the harness's `FsError` — see the module note — so it reproduces
 * the two things consumers actually read: the `code` field and the class name.
 */
export class RemoteFsError extends Error {
  /**
   * @param message - the operator-facing reason.
   * @param code - a harness filesystem code, such as `FS_NOT_FOUND`.
   * @param options - standard `Error` options, used for `cause`.
   */
  constructor(message, code, options) {
    super(message, options)
    this.name = 'FsError'
    this.code = code
  }
}

/** Fail loudly and clearly for everything this provider does not implement. */
function unsupported(method) {
  throw new RemoteFsError(
    `The remote filesystem provider is read-only: ${method} is not implemented.`,
    'FS_IO_ERROR',
  )
}

/** Expand a leading `~` from the remote home directory. */
function expandTilde(text, home) {
  if (text === '~') return home
  if (text.startsWith('~/')) return `${home.replace(/\/+$/, '')}/${text.slice(2)}`
  return text
}

/**
 * Collapse a remote path textually.
 *
 * Both the requested path **and** the base it resolves against may be `~`-relative —
 * the provider's own workspace root is, by default — so the expansion has to happen
 * on each rather than only on the request. Missing that turned a relative path under
 * a `~` root into a literal `/~/…`.
 */
function normalizePath(requested, cwd, home) {
  const text = typeof requested === 'string' ? requested.trim() : ''
  if (text === '') throw new RemoteFsError('file_path must be a non-empty string', 'FS_NOT_FOUND')
  const expanded = expandTilde(text, home)
  const rawBase = typeof cwd === 'string' && cwd !== '' ? cwd : home
  const base = expandTilde(rawBase, home)
  const combined = expanded.startsWith('/') ? expanded : `${base.replace(/\/+$/, '')}/${expanded}`
  const segments = []
  for (const segment of combined.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return `/${segments.join('/')}`
}

/** Throw when a caller's signal has already been aborted. */
function throwIfAborted(signal) {
  if (signal?.aborted === true) throw new RemoteFsError('operation aborted', 'FS_ABORTED')
}

/**
 * Create the provider.
 * @param settings - the target host, the workspace root, and SSH settings.
 * @returns a read-only implementation of the `ctx.fs` surface the file tools use.
 */
export function createRemoteFileSystem(settings) {
  const host = settings.host
  if (typeof host !== 'string' || host.trim() === '') throw new Error('remote-fs: a host is required')
  const ssh = {
    sshExecutable: settings.sshExecutable ?? 'ssh',
    connectTimeoutSeconds: settings.connectTimeoutSeconds ?? 8,
  }
  const root = typeof settings.cwd === 'string' && settings.cwd !== '' ? settings.cwd : '~'
  /** The remote home directory, fetched once: it cannot change for a live host. */
  let homeRequest
  const home = async () => {
    homeRequest ??= runRemote({ ...ssh, host, command: 'printf %s "$HOME"', timeoutMs: 30000 }).then((result) => {
      const value = result.stdout.trim()
      if (result.exitCode !== 0 || value === '') {
        homeRequest = undefined
        throw new RemoteFsError(`cannot resolve the home directory on ${host}: ${result.stderr.trim() || `exit ${result.exitCode}`}`, 'FS_IO_ERROR')
      }
      return value
    })
    return homeRequest
  }

  /** The absolute display path and target key for one requested path. */
  const target = async (path, options) => {
    throwIfAborted(options?.signal)
    const displayPath = normalizePath(path, options?.cwd ?? root, await home())
    throwIfAborted(options?.signal)
    return { targetKey: displayPath, displayPath }
  }

  /**
   * One round trip for the metadata the harness's `stat` returns.
   *
   * Fields are NUL-delimited for the same reason the directory listing is: a remote
   * name can contain anything but NUL, so NUL is the only unambiguous framing.
   */
  const statOf = async (absolutePath, signal, follow = true) => {
    throwIfAborted(signal)
    const quoted = shellQuotePath(absolutePath)
    const flags = follow ? '-L ' : ''
    const command = `if [ ! -e ${quoted} ]${follow ? '' : ` && [ ! -L ${quoted} ]`}; then exit 3; fi; `
      + `${follow ? '' : `if [ -L ${quoted} ]; then t=symlink; el`}if [ -d ${quoted} ]; then t=directory; elif [ -f ${quoted} ]; then t=file; else t=other; fi; `
      + `s=$(stat ${flags}-c '%s' ${quoted} 2>/dev/null || stat ${flags}-f '%z' ${quoted} 2>/dev/null) || exit 2; `
      + `m=$(stat ${flags}-c '%y' ${quoted} 2>/dev/null || stat ${flags}-f '%m' ${quoted} 2>/dev/null) || exit 2; `
      + `printf '%s\\0%s\\0%s\\0' "$t" "$s" "$m"`
    const result = await runRemote({ ...ssh, host, command, timeoutMs: 30000, maxOutputBytes: 4096, signal })
    throwIfAborted(signal)
    if (result.exitCode === 3) return undefined
    if (result.exitCode !== 0) {
      throw new RemoteFsError(`cannot stat "${absolutePath}" on ${host}: ${result.stderr.trim() || `exit ${result.exitCode}`}`, 'FS_IO_ERROR')
    }
    const [type = '', size = '', mtime = ''] = result.stdout.split('\u0000')
    const parsedSize = Number.parseInt(size, 10)
    return {
      version: `${type}:${size}:${mtime}`,
      type,
      ...Number.isInteger(parsedSize) ? { size: parsedSize } : {},
    }
  }

  return {
    /** The remote workspace root this provider treats as the default directory. */
    get root() {
      return root
    },
    get sandboxMode() {
      return undefined
    },
    /** Host-backed mapping is not offered: this world is reached only over SSH. */
    processPathFromHostPath() {
      return undefined
    },
    processPath(target) {
      return String(target.targetKey)
    },
    fileUrl() {
      return undefined
    },
    contains(parent, child) {
      const from = String(parent.targetKey)
      const to = String(child.targetKey)
      return to === from || to.startsWith(from.replace(/\/+$/, '') + '/')
    },

    resolve: target,
    async lstat(path, options, signal) {
      return statOf((await target(path, { ...options, signal })).targetKey, signal, false)
    },

    async stat(resolved, signal) {
      return statOf(String(resolved?.targetKey ?? ''), signal)
    },

    async readText(resolved, signal) {
      throwIfAborted(signal)
      const path = String(resolved?.targetKey ?? '')
      const info = await statOf(path, signal)
      if (info === undefined) throw new RemoteFsError(`cannot read "${resolved?.displayPath ?? path}": not found`, 'FS_NOT_FOUND')
      if (info.type !== 'file') throw new RemoteFsError(`cannot read "${resolved?.displayPath ?? path}": not a regular file`, 'FS_NOT_REGULAR_FILE')
      const result = await readRemoteBytes(host, path, {
        ...ssh,
        timeoutMs: 120000,
        maxBytes: MAX_TEXT_BYTES,
        signal,
      })
      throwIfAborted(signal)
      if (result.ok !== true) {
        throw new RemoteFsError(`cannot read "${resolved?.displayPath ?? path}": ${result.reason}`, 'FS_IO_ERROR')
      }
      if (result.bytes.subarray(0, 8192).includes(0)) {
        throw new RemoteFsError(`cannot read "${resolved?.displayPath ?? path}": binary file`, 'FS_NOT_TEXT')
      }
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(result.bytes)
      } catch (cause) {
        throw new RemoteFsError(`cannot read "${resolved?.displayPath ?? path}": invalid UTF-8 text`, 'FS_NOT_TEXT', { cause })
      }
    },

    /** An async iterable of text, read in one bounded transfer (see the module note). */
    streamText(resolved, signal) {
      return (async function* stream() {
        const text = await this.readText(resolved, signal)
        const slice = 64 * 1024
        for (let offset = 0; offset < text.length; offset += slice) yield text.slice(offset, offset + slice)
        if (text.length === 0) yield ''
      }).call(this)
    },

    async readBytes(resolved, signal, maxBytes) {
      throwIfAborted(signal)
      const path = String(resolved?.targetKey ?? '')
      const info = await statOf(path, signal)
      if (info === undefined) throw new RemoteFsError(`cannot read "${resolved?.displayPath ?? path}": not found`, 'FS_NOT_FOUND')
      if (info.type !== 'file') throw new RemoteFsError(`cannot read "${resolved?.displayPath ?? path}": not a regular file`, 'FS_NOT_REGULAR_FILE')
      const result = await readRemoteBytes(host, path, {
        ...ssh,
        maxBytes: Number.isInteger(maxBytes) && maxBytes > 0 ? Math.min(maxBytes, MAX_BYTES) : MAX_BYTES,
        signal,
      })
      throwIfAborted(signal)
      if (result.ok !== true) {
        throw new RemoteFsError(`cannot read "${resolved?.displayPath ?? path}": ${result.reason}`, 'FS_IO_ERROR')
      }
      return result.bytes
    },

    // ---- deliberately unsupported in the read-only provider ------------------
    writeText() {
      return unsupported('writeText')
    },
    editText() {
      return unsupported('editText')
    },
    readByteRange() {
      return unsupported('readByteRange')
    },
    listDir() {
      return unsupported('listDir')
    },
    watch() {
      return unsupported('watch')
    },
  }
}

/** The remote read cap, exported so a caller can reason about `streamText`. */
export const REMOTE_FS_MAX_TEXT_BYTES = MAX_TEXT_BYTES
