/**
 * The interactive terminal view, inlined into the generated `lib/client.term.js`
 * chunk by `tools/build-client-chunk.mjs`.
 *
 * This file is a source fragment, not a module: the surrounding chunk gives it
 * `React`, `h`, `XTerm`, `FitAddon`, and `installTerminalStyles`. It exists as a
 * separate file so the terminal view is readable and reviewable without reading a
 * 500 KB generated bundle.
 *
 * Input, resize and output all travel the plugin's own `/api` RPC channel: output
 * is read with a cursor under a bounded long-poll, so the view needs no streaming
 * transport — which this deployment's application-scheme origin cannot carry.
 */

/** How long one read waits for output before answering empty, in milliseconds. */
const HOLD_MS = 8000
/** Consecutive failed reads tolerated before the view reports the session broken. */
const MAX_READ_FAILURES = 5

/** Keep the shared stylesheet until the last mounted SSH terminal releases it. */
function acquireTerminalStyles() {
  installTerminalStyles()
  const tag = document.querySelector('style[data-plugin-css="' + PLUGIN_ID + '/terminal.css"]')
  if (tag === null) return () => {}
  tag.__dshsshUsers = (tag.__dshsshUsers ?? 0) + 1
  return () => {
    tag.__dshsshUsers -= 1
    if (tag.__dshsshUsers === 0) tag.remove()
  }
}

/** Read the host theme's alias tokens as the concrete colours xterm needs. */
function readTerminalTheme(root) {
  const view = document.defaultView
  const style = view === null ? null : view.getComputedStyle(root ?? document.body)
  const value = (name, fallback) => {
    const read = style === null ? '' : style.getPropertyValue(name)
    return read !== undefined && read.trim() !== '' ? read.trim() : fallback
  }
  return {
    background: value('--dsw-alias-bg-base', '#1e1e1e'),
    foreground: value('--dsw-alias-label-primary', '#d4d4d4'),
    cursor: value('--dsw-alias-brand-primary', '#4aa3ff'),
    cursorAccent: value('--dsw-alias-bg-base', '#1e1e1e'),
    selectionBackground: value('--dsw-alias-bg-overlay', '#2b4a6f'),
  }
}

/**
 * One interactive SSH terminal.
 * @param props - locale translate function, the host call function, the target
 * host alias, and the callback returning to the host list.
 * @returns the terminal pane.
 */
function TerminalView(props) {
  const t = props.t
  const call = props.call
  const host = props.host
  const onBack = props.onBack
  const holder = React.useRef(null)
  const [state, setState] = React.useState({ phase: 'opening' })

  React.useEffect(() => {
    const element = holder.current
    if (element === null || element === undefined) return undefined
    const removeStyles = acquireTerminalStyles()
    const controller = new AbortController()
    setState({ phase: 'opening' })
    let disposed = false
    let termId = null
    let cursor = 0
    let resizeTimer = null
    let inputQueue = Promise.resolve()

    const term = new XTerm.Terminal({
      allowProposedApi: false,
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      minimumContrastRatio: 4.5,
      scrollback: 5000,
      theme: readTerminalTheme(element),
    })
    const fit = new FitAddon.FitAddon()
    term.loadAddon(fit)
    term.open(element)

    const send = (endpoint, payload) => call(endpoint, payload, controller.signal)
    const status = (next) => { if (!disposed) setState(next) }

    /** Read output forever, one long-poll at a time, until the session ends. */
    const pump = async () => {
      let consecutiveFailures = 0
      while (!disposed) {
        let answer
        try {
          answer = await send('term/read', { id: termId, since: cursor, hold_ms: HOLD_MS })
          consecutiveFailures = 0
        } catch (error) {
          if (disposed) return
          // A carrier may bound a long request even though the session is healthy,
          // so a few failures are retried before the view gives up on the session.
          consecutiveFailures += 1
          if (consecutiveFailures <= MAX_READ_FAILURES) {
            await new Promise((resolve) => setTimeout(resolve, 250 * consecutiveFailures))
            continue
          }
          status({ phase: 'error', reason: String(error?.message ?? error) })
          return
        }
        if (disposed) return
        // The retained window dropped bytes this view never rendered; clearing is
        // the only honest recovery, because the stream cannot be spliced.
        if (answer.gap === true) term.reset()
        cursor = Number.isInteger(answer.seq) ? answer.seq : cursor
        if (typeof answer.text === 'string' && answer.text !== '') term.write(answer.text)
        if (answer.term?.exited === true) {
          status({ phase: 'exited', exitCode: answer.term.exitCode })
          return
        }
      }
    }

    const start = async () => {
      try {
        fit.fit()
      } catch {
        /* the pane may not be laid out yet; the initial size falls back below */
      }
      let opened
      try {
        // Let opening finish even when the user leaves. Aborting its HTTP reply
        // would lose the new session's ID and prevent cleanup on the host.
        opened = await call('term/open', { host, cols: term.cols, rows: term.rows })
      } catch (error) {
        status({ phase: 'error', reason: String(error?.message ?? error) })
        return
      }
      const openedId = opened?.term?.id
      if (typeof openedId !== 'string' || openedId === '') {
        status({ phase: 'error', reason: 'the host returned no terminal ID' })
        return
      }
      if (disposed) {
        call('term/close', { id: openedId }).catch(() => {})
        return
      }
      termId = openedId
      if (opened.term.exited === true) {
        status({ phase: 'exited', exitCode: opened.term.exitCode })
      } else {
        status({ phase: 'open' })
      }
      refit()
      term.focus()
      void pump()
    }

    const input = term.onData((data) => {
      if (termId === null) return
      // Parallel POST requests can arrive out of order and scramble keystrokes.
      // Queue each chunk behind the previous one, including large paste events.
      inputQueue = inputQueue.then(async () => {
        if (disposed || termId === null) return
        await send('term/write', { id: termId, data })
      }).catch((error) => {
        status({ phase: 'error', reason: String(error?.message ?? error) })
      })
    })

    /** Keep the remote PTY's size in step with the pane, without flooding it. */
    const refit = () => {
      try {
        fit.fit()
      } catch {
        return
      }
      if (termId === null) return
      if (resizeTimer !== null) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        resizeTimer = null
        if (disposed || termId === null) return
        send('term/resize', { id: termId, cols: term.cols, rows: term.rows }).catch((error) => {
          status({ phase: 'error', reason: String(error?.message ?? error) })
        })
      }, 150)
    }
    const sizes = typeof ResizeObserver === 'function' ? new ResizeObserver(refit) : null
    sizes?.observe(element)

    // The host switches light and dark by an attribute on the body, so the
    // palette is re-read rather than frozen at mount.
    const themeWatch = typeof MutationObserver === 'function' ? new MutationObserver(() => {
      term.options.theme = readTerminalTheme(element)
    }) : null
    themeWatch?.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-ds-dark-theme'] })
    themeWatch?.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-ds-dark-theme'] })

    void start()

    return () => {
      disposed = true
      controller.abort()
      sizes?.disconnect()
      themeWatch?.disconnect()
      if (resizeTimer !== null) clearTimeout(resizeTimer)
      try {
        input.dispose()
      } catch {
        /* the terminal may already be disposed */
      }
      const id = termId
      termId = null
      try {
        term.dispose()
      } catch {
        /* disposing twice is not an error worth surfacing */
      }
      removeStyles()
      if (id !== null) call('term/close', { id }).catch(() => {})
    }
  }, [host, call])

  const statusText = state.phase === 'opening'
    ? t('term.connecting', { host })
    : state.phase === 'open'
      ? t('term.connected')
      : state.phase === 'exited'
        ? t('term.exited', { code: String(state.exitCode ?? '?') })
        : t('term.failed', { reason: String(state.reason ?? '') })

  return h('div', { className: 'dshssh-term' },
    h('div', { className: 'dshssh-termbar' },
      h('button', { type: 'button', className: 'dshssh-btn', onClick: onBack }, t('term.back')),
      h('span', { className: 'dshssh-termhost' }, host),
      h('span', { className: 'dshssh-termstate', 'data-phase': state.phase }, statusText)),
    h('div', { className: 'dshssh-termbody', ref: holder }))
}

exports.TerminalView = TerminalView
