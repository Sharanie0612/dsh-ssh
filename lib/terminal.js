/**
 * Interactive SSH terminals.
 *
 * Each session is one `ssh -tt` process under a real local PTY, allocated by the
 * harness subprocess provider (`ctx.subprocess.spawnTerminal`). A PTY — not a
 * pipe — is the whole point: it is what makes `ssh` allocate a remote terminal,
 * forward window-size changes, and let a remote full-screen program render. The
 * provider's handle exposes exactly what is used here, matching the harness's own
 * terminal controller: `write`, `resize(cols, rows)`, `output`, `done`, and
 * `terminate()`.
 *
 * Output is published as a byte-append log with a sequence number rather than
 * pushed to the browser. That is deliberate: this deployment's page cannot hold
 * an SSE or WebSocket stream open (its origin is an application scheme served
 * over an IPC bridge), so the panel reads with an offset and the host answers
 * either immediately or after a bounded hold. Long-polling keeps output latency
 * low without needing a streaming transport.
 *
 * A session is a plain in-memory record; the plugin owns it and the host owns its
 * process. Nothing is persisted, and a host restart ends every session.
 * @module @local/dsh-ssh/terminal
 */
import { assertHostToken } from './ssh.js'

/** Terminal bytes retained per session before the oldest are dropped. */
const MAX_SESSION_BYTES = 512 * 1024
/** Split large provider frames so one frame cannot bypass the retention cap. */
const MAX_CHUNK_BYTES = 64 * 1024
/** Concurrent sessions across the whole host. */
const MAX_SESSIONS = 8
/** Default and maximum time a read may wait for new output, in milliseconds. */
const DEFAULT_HOLD_MS = 15000
const MAX_HOLD_MS = 30000
/** A session with no reader and no output for this long is reclaimed. */
const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000
/** How often idle sessions are examined. */
const SWEEP_INTERVAL_MS = 60 * 1000

/** The terminal type the remote end is told it is talking to. */
const TERMINAL_TYPE = 'xterm-256color'

/** Largest initial dimension accepted, matching the harness terminal controller's own caps. */
const MAX_COLS = 500
const MAX_ROWS = 200

/** A dimension is usable only as a positive integer within the cap. */
function dimension(value, fallback, cap) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return Math.min(parsed, cap)
}

/**
 * Create the terminal service.
 * @param ctx - a context with `subprocess`; the service registers no effects of its own.
 * @param settings - resolved plugin settings.
 * @returns the service; the caller owns `dispose()`.
 */
export function createTerminalService(ctx, settings = {}) {
  /** @type {Map<string, object>} */
  const sessions = new Map()
  const allocations = new Set()
  const lifetime = new AbortController()
  let counter = 0
  let disposed = false
  let disposal

  /** Wake every reader waiting on a session. */
  function wake(session) {
    const waiters = [...session.waiters]
    session.waiters.clear()
    for (const waiter of waiters) waiter()
  }

  /**
   * Append remote output to the session's log, dropping the oldest bytes once the
   * cap is reached. Dropping advances `startSeq`, so a reader that fell behind
   * learns it must reset its screen instead of silently splicing two eras.
   */
  function append(session, text) {
    if (text === '') return
    const bytes = Buffer.from(text, 'utf8')
    for (let offset = 0; offset < bytes.length;) {
      let end = Math.min(offset + MAX_CHUNK_BYTES, bytes.length)
      // Keep every retained frame a complete UTF-8 string, including when the
      // provider emitted a very large frame containing multibyte characters.
      while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1
      const part = bytes.subarray(offset, end).toString('utf8')
      session.chunks.push(part)
      session.bytes += end - offset
      session.nextSeq += 1
      offset = end
      while (session.bytes > MAX_SESSION_BYTES) {
        const dropped = session.chunks.shift()
        session.bytes -= Buffer.byteLength(dropped, 'utf8')
        session.startSeq += 1
      }
    }
    session.lastActivity = Date.now()
    wake(session)
  }

  /** The public description of one session. */
  function describe(session) {
    return {
      id: session.id,
      host: session.host,
      cols: session.cols,
      rows: session.rows,
      exited: session.exited,
      exitCode: session.exitCode,
      signal: session.signal,
      createdAt: session.createdAt,
      ...(session.error === undefined ? {} : { error: session.error }),
    }
  }

  /** Resolve a session or fail with a reason the panel can show. */
  function require(id) {
    const session = sessions.get(id)
    if (session === undefined) throw new Error(`no such terminal: ${id}`)
    return session
  }

  /** Reclaim sessions no reader has touched for the idle window. */
  const sweep = setInterval(() => {
    const now = Date.now()
    for (const session of [...sessions.values()]) {
      if (session.waiters.size > 0) continue
      if (now - session.lastActivity < IDLE_TIMEOUT_MS) continue
      void close(session.id).catch(() => {})
    }
  }, SWEEP_INTERVAL_MS)
  sweep.unref?.()

  /**
   * Open a terminal on a host.
   * @param options - host alias, and the initial window size.
   * @returns the new session's description.
   */
  function open(options = {}) {
    if (disposed) return Promise.reject(new Error('the terminal service has been disposed'))
    if (sessions.size + allocations.size >= MAX_SESSIONS) {
      return Promise.reject(new Error(`the terminal limit of ${MAX_SESSIONS} is reached; close an unused session first`))
    }
    const allocation = allocate(options)
    allocations.add(allocation)
    void allocation.then(() => allocations.delete(allocation), () => allocations.delete(allocation))
    return allocation
  }

  async function allocate(options) {
    assertHostToken(options.host)
    const host = options.host.trim()
    const cols = dimension(options.cols, 80, MAX_COLS)
    const rows = dimension(options.rows, 24, MAX_ROWS)
    const ssh = await ctx.subprocess.resolveExecutable(settings.sshExecutable ?? 'ssh', undefined, lifetime.signal)
    lifetime.signal.throwIfAborted()
    const argv = [ssh, '-tt']
    const timeout = Number.isFinite(settings.connectTimeoutSeconds) ? Math.floor(settings.connectTimeoutSeconds) : 8
    if (timeout > 0) argv.push('-o', `ConnectTimeout=${timeout}`)
    argv.push('-o', 'StrictHostKeyChecking=accept-new', host)

    const handle = await ctx.subprocess.spawnTerminal({
      argv,
      // The provider requires a fully specified local spawn request. This is
      // ssh's local directory; the remote login shell chooses its own directory.
      cwd: settings.terminalCwd ?? process.cwd(),
      cols,
      rows,
      terminalType: TERMINAL_TYPE,
      graceMs: settings.disposeGraceMs ?? 3000,
      signal: lifetime.signal,
    })
    counter += 1
    const session = {
      id: `t${counter}-${Date.now().toString(36)}`,
      host,
      cols,
      rows,
      handle,
      chunks: [],
      bytes: 0,
      startSeq: 0,
      nextSeq: 0,
      exited: false,
      exitCode: null,
      signal: null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      waiters: new Set(),
      operations: Promise.resolve(),
      closing: undefined,
    }
    sessions.set(session.id, session)

    session.drained = consume(session)
    // A provider may finish allocation after disposal even if it ignores abort.
    // Keep the process owned so dispose can await and retry its termination.
    if (disposed) throw new Error('the terminal service has been disposed')

    return describe(session)
  }

  /** Decode continuously and publish exit only after every queued byte is read. */
  async function consume(session) {
    const decoder = new TextDecoder('utf-8', { ignoreBOM: true })
    // Observe rejection immediately: process failure may precede stream EOF.
    const outcome = Promise.resolve(session.handle.done).then(
      (value) => ({ value }), (error) => ({ error }),
    )
    try {
      for await (const chunk of session.handle.output) {
        append(session, decoder.decode(typeof chunk === 'string' ? Buffer.from(chunk) : chunk, { stream: true }))
      }
      append(session, decoder.decode())
      const result = await outcome
      if ('error' in result) throw result.error
      session.exitCode = result.value?.exitCode ?? null
      session.signal = result.value?.signal ?? null
    } catch (error) {
      session.error = String(error?.message ?? error)
    } finally {
      session.exited = true
      session.lastActivity = Date.now()
      wake(session)
    }
  }

  /**
   * Read output after a sequence number, waiting briefly when there is none.
   *
   * A read whose `since` precedes the retained window answers `gap: true` and
   * returns the retained tail, so the panel can clear its screen instead of
   * showing spliced history.
   * @param options - session id, the last sequence number seen, and the hold budget.
   * @returns the output after `since` and the new sequence number.
   */
  async function read(options) {
    const session = require(options.id)
    options.signal?.throwIfAborted()
    session.lastActivity = Date.now()
    const since = Number.isInteger(options.since) && options.since >= 0 ? options.since : 0
    const holdMs = Math.min(
      Number.isInteger(options.holdMs) && options.holdMs >= 0 ? options.holdMs : DEFAULT_HOLD_MS,
      MAX_HOLD_MS,
    )

    const collect = () => {
      const gap = since < session.startSeq || since > session.nextSeq
      const from = gap ? session.startSeq : since
      const parts = session.chunks.slice(from - session.startSeq)
      return {
        term: describe(session),
        gap,
        since: from,
        seq: session.nextSeq,
        text: parts.join(''),
      }
    }

    if (session.nextSeq !== since || session.exited || holdMs === 0) return collect()

    await new Promise((resolve, reject) => {
      const finish = (error) => {
        clearTimeout(timer)
        session.waiters.delete(wakeup)
        options.signal?.removeEventListener('abort', abort)
        if (error === undefined) resolve()
        else reject(error)
      }
      const wakeup = () => finish()
      const abort = () => finish(options.signal.reason ?? new DOMException('The operation was aborted', 'AbortError'))
      const timer = setTimeout(wakeup, holdMs)
      session.waiters.add(wakeup)
      options.signal?.addEventListener('abort', abort, { once: true })
    })
    return collect()
  }

  /** Send input to the remote terminal. */
  async function write(id, data) {
    const session = require(id)
    return enqueue(session, async () => {
      requireRunning(session)
      session.lastActivity = Date.now()
      if (typeof data === 'string' && data !== '') await session.handle.write(data)
      return { id }
    })
  }

  /** Change the terminal's window size, which the PTY forwards to the remote end. */
  async function resize(id, cols, rows) {
    const session = require(id)
    return enqueue(session, async () => {
      requireRunning(session)
      session.lastActivity = Date.now()
      const nextCols = dimension(cols, session.cols, MAX_COLS)
      const nextRows = dimension(rows, session.rows, MAX_ROWS)
      await session.handle.resize(nextCols, nextRows)
      session.cols = nextCols
      session.rows = nextRows
      return describe(session)
    })
  }

  /** Preserve input/resize request order even with asynchronous providers. */
  function enqueue(session, operation) {
    const pending = session.operations.then(operation)
    session.operations = pending.catch(() => {})
    return pending
  }

  function requireRunning(session) {
    if (session.exited || session.closing !== undefined) throw new Error('the terminal has exited')
  }

  /** End a session and its process, then release it. */
  function close(id) {
    const session = require(id)
    if (session.closing !== undefined) return session.closing
    session.exited = true
    wake(session)
    session.closing = (async () => {
      await session.operations
      await session.handle.terminate()
      await session.drained
      sessions.delete(id)
      session.lastActivity = Date.now()
      return { id, closed: true }
    })().catch((error) => {
      // A failed provider termination must stay owned and retryable.
      session.closing = undefined
      session.error = String(error?.message ?? error)
      throw error
    })
    return session.closing
  }

  /** Every live session, newest last. */
  function list() {
    return [...sessions.values()].map(describe)
  }

  /** Release every session; awaited by plugin unload. */
  function dispose() {
    if (disposal !== undefined) return disposal
    disposed = true
    clearInterval(sweep)
    lifetime.abort(new Error('the terminal service has been disposed'))
    disposal = (async () => {
      await Promise.allSettled([...allocations])
      const results = await Promise.allSettled([...sessions.keys()].map((id) => close(id)))
      const failures = results.filter((result) => result.status === 'rejected').map((result) => result.reason)
      if (failures.length > 0) throw new AggregateError(failures, 'failed to terminate terminal sessions')
    })().catch((error) => {
      disposal = undefined
      throw error
    })
    return disposal
  }

  return { open, read, write, resize, close, list, dispose }
}
