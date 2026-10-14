window.__ModuleLoader__.load({
  id: '@local/dsh-ssh',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** This plugin's package name; also the sidebar tab type's registration id. */
    const ID = '@local/dsh-ssh'
    /** Locale namespace for this plugin's visible text. */
    const NS = 'dsh-ssh'
    /** The tab kind, and therefore the page the guide opens. */
    const KIND = 'ssh'
    /** The endpoint prefix this plugin's host half registers, inside the shared channel. */
    const ENDPOINT_PREFIX = 'ssh'

    const CSS = `
.dshssh-root{display:flex;flex-direction:column;gap:12px;padding:12px 14px 20px;height:100%;box-sizing:border-box;overflow:auto;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}

/* ── section heading ── */
.dshssh-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.dshssh-title{color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:500;letter-spacing:.04em;text-transform:uppercase}

/* ── buttons ── */
.dshssh-btn{font:inherit;font-size:12px;line-height:1;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:6px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.dshssh-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dshssh-btn:disabled{color:var(--dsw-alias-label-tertiary);cursor:default;opacity:.6}
.dshssh-btn:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:-1px}

/* ── host list ── */
.dshssh-list{display:flex;flex-direction:column;gap:6px}

/* ── host row ── */
.dshssh-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l3,var(--dsw-alias-border-l1));border-radius:10px;background:var(--dsw-alias-bg-layer-1);cursor:pointer;text-align:left;width:100%;font:inherit;color:inherit;box-sizing:border-box}
.dshssh-row:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.dshssh-row:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:-2px}
.dshssh-row[aria-selected="true"]{border-color:var(--dsw-alias-brand-primary)}

/* ── status dot ── */
.dshssh-dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--dsw-alias-state-idle-primary)}
.dshssh-dot[data-state="ok"]{background:var(--dsw-alias-state-success-primary)}
.dshssh-dot[data-state="bad"]{background:var(--dsw-alias-state-error-primary)}
.dshssh-dot[data-state="busy"]{background:var(--dsw-alias-state-warn-primary)}

/* ── name / description text ── */
.dshssh-name{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.dshssh-alias{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshssh-target{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:11px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* ── notes and errors ── */
.dshssh-note{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:12px}
.dshssh-error{color:var(--dsw-alias-state-error-primary);font-size:12px;border:.5px solid var(--dsw-alias-state-error-primary);border-radius:8px;padding:8px 10px;word-break:break-word}

/* ── cards ── */
.dshssh-card{border:.5px solid var(--dsw-alias-border-l3,var(--dsw-alias-border-l1));border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:12px 14px;display:flex;flex-direction:column;gap:8px}

/* ── key-value pairs ── */
.dshssh-kv{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;font-size:12px}
.dshssh-kv dt{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.dshssh-kv dd{margin:0;word-break:break-all}

/* ── command input row ── */
.dshssh-compose{display:flex;gap:8px;align-items:center}
.dshssh-input{flex:1;min-width:0;font:inherit;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;padding:6px 10px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
.dshssh-input:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:-1px}
.dshssh-branch{font:inherit;font-size:12px;padding:5px 8px;border-radius:6px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);cursor:pointer;max-width:140px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshssh-branch:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:-1px}
.dshssh-branch:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}

/* ── output ── */
.dshssh-out{margin:0;padding:10px 12px;border-radius:8px;background:var(--dsw-alias-bg-base);border:.5px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1));font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word;max-height:340px;overflow:auto}

/* ── exit status ── */
.dshssh-exit{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:11px}

/* ── path display ── */
.dshssh-path{flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshssh-chevron{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));flex:none}

/* ── guide entry card (matches the harness guide pattern) ── */
.dshssh-guide{box-sizing:border-box;width:100%;min-height:56px;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l3,var(--dsw-alias-border-l1));border-radius:var(--dsl-guide-entry-radius,var(--dsw-radius-xl,16px));cursor:pointer;align-items:center;gap:14px;padding:14px 20px;display:flex}
.dshssh-guide:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.dshssh-guide:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:-2px}
.dshssh-guide-icon{width:26px;height:26px;color:var(--dsw-alias-label-secondary);flex:none;justify-content:center;align-items:center;display:flex}
.dshssh-guide-text{flex-direction:column;flex:1;gap:3px;min-width:0;display:flex}
.dshssh-guide-title{white-space:nowrap;text-overflow:ellipsis;font-size:14px;line-height:1.4;overflow:hidden}
.dshssh-guide-description{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));white-space:nowrap;text-overflow:ellipsis;font-size:11px;line-height:1.4;overflow:hidden}

/* ── terminal view wrapper ── */
.dshssh-term{display:flex;flex-direction:column;height:100%;min-height:0;gap:8px;padding:10px 12px 12px;box-sizing:border-box}
.dshssh-termbar{display:flex;align-items:center;gap:8px;flex:none}
.dshssh-termhost{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshssh-termstate{margin-left:auto;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshssh-termstate[data-phase="exited"]{color:var(--dsw-alias-state-warn-primary)}
.dshssh-termstate[data-phase="error"]{color:var(--dsw-alias-state-error-primary)}
.dshssh-termbody{flex:1;min-height:0;overflow:hidden;padding:4px;border:.5px solid var(--dsw-alias-border-l3,var(--dsw-alias-border-l1));border-radius:10px;background:var(--dsw-alias-bg-base)}

/* ── workspace dialog ── */
.dshssh-workspace-overlay{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
.dshssh-workspace-dialog{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:.5px solid var(--dsw-alias-border-l3,var(--dsw-alias-border-l1));border-radius:16px;width:560px;max-width:100%;max-height:85vh;display:flex;flex-direction:column;padding:24px;gap:16px;box-shadow:0 16px 60px rgba(0,0,0,.18);font-size:14px}
.dshssh-workspace-tabs{display:flex;gap:8px}
.dshssh-workspace-tabs button{font:inherit;font-size:12px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:6px;padding:5px 12px;cursor:pointer}
.dshssh-workspace-tabs button:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshssh-workspace-tabs button[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.dshssh-workspace-dialog input,.dshssh-workspace-dialog select{background:var(--dsw-alias-bg-base);color:inherit;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;padding:9px 10px;min-width:0;box-sizing:border-box;font:inherit;font-size:13px}
.dshssh-workspace-dialog input:focus-visible,.dshssh-workspace-dialog select:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:-1px}
.dshssh-workspace-dialog label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.dshssh-workspace-directory-list{overflow:auto;min-height:100px;max-height:240px;display:flex;flex-direction:column;gap:4px}
.dshssh-workspace-footer{display:flex;justify-content:flex-end;gap:8px}

/* ── chat status / workspace badge ── */
.dshssh-chat-status{white-space:pre-wrap;word-break:break-word}
.dshssh-workspace-badge{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:4px 8px;border:.5px solid var(--dsw-alias-border-l3,var(--dsw-alias-border-l1));border-radius:6px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
`

    /** Install the panel stylesheet once; the disposer removes it. */
    function installStyles() {
      const tagId = `${ID}/Panel.css`
      if (document.querySelector(`style[data-plugin-css="${CSS_ESCAPE(tagId)}"]`) !== null) return () => {}
      const el = document.createElement('style')
      el.dataset.plugin = ID
      el.dataset.pluginCss = tagId
      el.textContent = CSS
      document.head.appendChild(el)
      return () => el.remove()
    }

    /** Escape a value for use inside an attribute selector. */
    function CSS_ESCAPE(value) {
      return String(value).replace(/["\\]/g, '\\$&')
    }

    /** The tab's glyph, drawn with the theme's accent so it reads on both themes. */
    function SshGlyph({ size = 22 }) {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('rect', { key: 'b', x: 2.2, y: 4, width: 19.6, height: 13.2, rx: 2.4 }),
        h('path', { key: 'c', d: 'M5.6 8.3 7.9 10.4 5.6 12.5' }),
        h('path', { key: 'd', d: 'M10.4 12.9h4.6' }),
        h('path', { key: 'e', d: 'M12 17.2v2.6' }),
        h('path', { key: 'f', d: 'M8.4 20.6h7.2' }),
      )
    }

    /**
     * One host row: its alias, its resolved target, and the state of the last probe.
     * @param props - host entry, its probe state, and row callbacks.
     * @returns a selectable button row.
     */
    function HostRow({ host, state, selected, onSelect, onTest, t }) {
      const target = `${host.user == null ? '' : `${host.user}@`}${host.hostName}${host.port === 22 ? '' : `:${host.port}`}`
      const detail = state === undefined
        ? target
        : state.phase === 'busy'
          ? `${target} — ${t('hosts.testing')}`
          : state.phase === 'ok'
            ? `${target} — ${state.probe.user}@${state.probe.hostname} · ${state.probe.system}`
            : `${target} — ${state.reason}`
      const dotState = state === undefined ? 'idle' : state.phase === 'busy' ? 'busy' : state.phase === 'ok' ? 'ok' : 'bad'
      return h(
        'div',
        { className: 'dshssh-row', role: 'button', tabIndex: 0, 'aria-selected': String(selected), onClick: onSelect,
          onKeyDown: (event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect() } } },
        h('span', { className: 'dshssh-dot', 'data-state': dotState }),
        h('span', { className: 'dshssh-name' },
          h('span', { className: 'dshssh-alias' }, host.alias),
          h('span', { className: 'dshssh-target', title: detail }, detail)),
        h('button', {
          type: 'button',
          className: 'dshssh-btn',
          disabled: state !== undefined && state.phase === 'busy',
          onClick: (event) => { event.stopPropagation(); onTest() },
        }, t('hosts.test')),
      )
    }

    /**
     * The parent of an absolute remote path.
     *
     * The result is always absolute, which is the invariant the browser relies on:
     * a non-absolute input falls back to the root rather than producing a relative
     * path the next listing request would resolve against the remote home. The root
     * is its own parent.
     * @param path - an absolute path, or anything else.
     * @returns the parent path, always absolute.
     */
    function parentRemotePath(path) {
      const text = typeof path === 'string' ? path.replace(/\/+$/, '') : ''
      if (!text.startsWith('/')) return '/'
      const cut = text.lastIndexOf('/')
      return cut <= 0 ? '/' : text.slice(0, cut)
    }

    /**
     * Join one entry name onto an absolute remote path.
     * @param base - the current absolute path.
     * @param name - the entry name.
     * @returns the child path, always absolute.
     */
    function joinRemotePath(base, name) {
      const root = typeof base === 'string' && base.startsWith('/') ? base : '/'
      const prefix = root === '/' ? '' : root.replace(/\/+$/, '')
      return `${prefix}/${name}`
    }

    /**
     * A human byte count.
     * @param bytes - a size, or anything else.
     * @returns the formatted size, or an empty string when the size is unknown, so
     * an absent size never reads as "0 B".
     */
    function formatBytes(bytes) {
      if (!Number.isInteger(bytes) || bytes < 0) return ''
      if (bytes < 1024) return `${bytes} B`
      const units = ['KiB', 'MiB', 'GiB', 'TiB']
      let value = bytes / 1024
      let unit = 0
      while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit += 1
      }
      return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
    }

    /** One remote directory entry: a directory opens, a file previews. */
    function BrowserRow({ entry, size, onOpen }) {
      return h('div', {
        className: 'dshssh-row',
        role: 'button',
        tabIndex: 0,
        onClick: onOpen,
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpen()
          }
        },
      },
        h('span', { className: 'dshssh-name' },
          // The label is the escaped form; the path is built from the raw name, so a
          // control character can neither corrupt the row nor break navigation.
          h('span', { className: 'dshssh-alias' }, entry.directory
            ? `${entry.displayName ?? entry.name}/`
            : (entry.displayName ?? entry.name)),
          size === '' ? null : h('span', { className: 'dshssh-target' }, size)),
        entry.directory ? h('span', { className: 'dshssh-chevron' }, '\u203a') : null)
    }

    /**
     * The remote file browser: one directory at a time, with a text preview for a
     * file. It only reads — the Agent owns writes, and this is for looking.
     * @param props - locale translate function, the host call function, the target
     * host alias, an optional starting path, and the callback returning to the host list.
     * @returns the browser pane.
     */
    function SshBrowser(props) {
      const t = props.t
      const call = props.call
      const host = props.host
      const onBack = props.onBack
      const startPath = typeof props.initialPath === 'string' && props.initialPath !== '' ? props.initialPath : '~'
      const [state, setState] = React.useState({
        phase: 'loading', path: startPath, resolved: '', entries: [], error: null,
      })
      const [preview, setPreview] = React.useState(null)
      const alive = React.useRef(true)
      const listingRequest = React.useRef(0)
      const previewRequest = React.useRef(0)
      const previewHolder = React.useRef(null)
      const conversationPending = React.useRef(false)
      const [conversation, setConversation] = React.useState({ phase: 'idle' })
      const startConversation = async (file = null) => {
        if (conversationPending.current || state.phase !== 'ready') return
        conversationPending.current = true
        setConversation({ phase: 'opening' })
        try {
          await props.startConversation({ host, cwd: state.resolved || state.path, file })
          if (alive.current) setConversation({ phase: 'ready' })
        } catch (error) {
          if (alive.current) setConversation({ phase: 'error', reason: String(error?.message ?? error) })
        } finally { conversationPending.current = false }
      }
      React.useEffect(() => {
        if (preview !== null) previewHolder.current?.scrollIntoView?.({ block: 'nearest' })
      }, [preview?.path, preview?.phase])

      const load = React.useCallback(async (path) => {
        const request = ++listingRequest.current
        previewRequest.current += 1
        setState((current) => ({ ...current, path, phase: 'loading', error: null }))
        setPreview(null)
        try {
          const answer = await call('ls', { host, path })
          if (!alive.current || request !== listingRequest.current) return
          setState({
            phase: 'ready',
            path,
            resolved: answer.resolvedPath ?? answer.path ?? path,
            entries: Array.isArray(answer.entries) ? answer.entries : [],
            error: null,
          })
        } catch (caught) {
          if (alive.current && request === listingRequest.current) setState((current) => ({ ...current, phase: 'error', error: String(caught.message ?? caught) }))
        }
      }, [call, host])

      React.useEffect(() => {
        alive.current = true
        load(startPath)
        return () => {
          alive.current = false
          listingRequest.current += 1
          previewRequest.current += 1
        }
      }, [load, startPath])

      const openFile = async (entry) => {
        const request = ++previewRequest.current
        const path = joinRemotePath(state.resolved, entry.name)
        setPreview({ phase: 'loading', path })
        try {
          const answer = await call('file', { host, path, limit: 300 })
          if (!alive.current || request !== previewRequest.current) return
          setPreview({
            phase: 'ready',
            path,
            lines: Array.isArray(answer.lines) ? answer.lines : [],
            totalLines: answer.totalLines ?? 0,
            truncated: answer.truncated === true,
          })
        } catch (caught) {
          if (alive.current && request === previewRequest.current) setPreview({ phase: 'error', path, error: String(caught.message ?? caught) })
        }
      }

      const shown = state.resolved !== '' ? state.resolved : state.path
      return h('div', { className: 'dshssh-root' },
        h('div', { className: 'dshssh-head' },
          h('button', { type: 'button', className: 'dshssh-btn', onClick: onBack }, t('files.hosts')),
          h('span', { className: 'dshssh-title' }, host)),
        h('div', { className: 'dshssh-compose' },
          h('button', {
            type: 'button',
            className: 'dshssh-btn',
            disabled: state.phase === 'loading',
            onClick: () => load(parentRemotePath(shown)),
          }, t('files.up')),
          h('button', {
            type: 'button',
            className: 'dshssh-btn',
            disabled: state.phase === 'loading',
            onClick: () => load(shown),
          }, t('files.refresh')),
          h('span', { className: 'dshssh-path', title: shown }, shown)),
        typeof props.startConversation !== 'function' ? null : h('div', { className: 'dshssh-compose' },
          h('button', { type: 'button', className: 'dshssh-btn', disabled: state.phase !== 'ready' || conversation.phase === 'opening', onClick: () => startConversation() },
            conversation.phase === 'opening' ? t('chat.opening') : t('chat.directory'))),
        conversation.phase === 'error' ? h('div', { className: 'dshssh-error' }, conversation.reason) : null,
        conversation.phase === 'ready' ? h('div', { className: 'dshssh-note dshssh-chat-status' }, t('chat.ready')) : null,
        state.error === null ? null : h('div', { className: 'dshssh-error' }, state.error),
        state.phase === 'loading' && state.entries.length === 0
          ? h('div', { className: 'dshssh-note' }, t('files.loading'))
          : state.entries.length === 0
            ? h('div', { className: 'dshssh-note' }, t('files.empty'))
            : h('div', { className: 'dshssh-list' }, state.entries.map((entry) => h(BrowserRow, {
                key: entry.name,
                entry,
                size: formatBytes(entry.size),
                onOpen: () => {
                  if (state.phase !== 'ready') return
                  return entry.directory ? load(joinRemotePath(state.resolved, entry.name)) : openFile(entry)
                },
              }))),
        preview === null ? null : h('div', { className: 'dshssh-card', ref: previewHolder },
          h('span', { className: 'dshssh-path', title: preview.path }, preview.path),
          typeof props.startConversation !== 'function' || preview.phase !== 'ready' ? null : h('button', {
            type: 'button', className: 'dshssh-btn', disabled: conversation.phase === 'opening', onClick: () => startConversation(preview.path),
          }, t('chat.file')),
          preview.phase === 'loading'
            ? h('div', { className: 'dshssh-note' }, t('files.loading'))
            : preview.phase === 'error'
              ? h('div', { className: 'dshssh-error' }, preview.error)
              : h('pre', { className: 'dshssh-out' },
                  `${preview.lines.map((line) => `${line.number}: ${line.text}`).join('\n')}`
                  + (preview.truncated ? `\n\n(${preview.totalLines} lines total; showing the first ${preview.lines.length})` : ''))))
    }

    /**
     * The SSH panel: the configured hosts, each host's reachability, and a command
     * box that runs one command on the selected host and shows its result.
     * @param props - locale translate function, the host call function, and the framework's tab hook.
     * @returns the tab body.
     */
    function SshPanel(props) {
      const t = props.t
      const call = props.call
      const [hosts, setHosts] = React.useState(null)
      const [configPath, setConfigPath] = React.useState('')
      const [error, setError] = React.useState(null)
      const [selected, setSelected] = React.useState(null)
      const [states, setStates] = React.useState({})
      const [command, setCommand] = React.useState('')
      const [running, setRunning] = React.useState(false)
      const [output, setOutput] = React.useState(null)
      const [terminalFor, setTerminalFor] = React.useState(null)
      const [browsing, setBrowsing] = React.useState(null)
      const [workspace, setWorkspace] = React.useState(null)
      // Branch selection: pins one remote Git branch for targeted edits.
      const [branches, setBranches] = React.useState([])
      const [branch, setBranch] = React.useState('')
      const [branchLoading, setBranchLoading] = React.useState(false)
      const alive = React.useRef(true)
      const loadRequest = React.useRef(0)
      const commandPending = React.useRef(false)
      React.useEffect(() => {
        alive.current = true
        return () => {
          alive.current = false
          loadRequest.current += 1
        }
      }, [])

      const load = React.useCallback(async () => {
        const request = ++loadRequest.current
        setError(null)
        try {
          const payload = await call('hosts')
          if (!alive.current || request !== loadRequest.current) return
          const entries = Array.isArray(payload.hosts) ? payload.hosts : []
          setHosts(entries)
          setConfigPath(payload.configPath ?? '')
          setSelected((current) => (current !== null && entries.some((host) => host.alias === current) ? current : (entries[0]?.alias ?? null)))
        } catch (caught) {
          if (alive.current && request === loadRequest.current) setError(String(caught.message ?? caught))
        }
      }, [call])

      React.useEffect(() => { load() }, [load])

      // Load remote Git branches when the selected host changes, so the branch
      // dropdown is ready by the time the user looks at it.
      const loadBranches = React.useCallback(async (alias) => {
        if (!alias) return
        setBranchLoading(true)
        setBranches([])
        try {
          const payload = await call('branches', { host: alias })
          if (!alive.current) return
          setBranches(Array.isArray(payload.branches) ? payload.branches : [])
        } catch {
          if (alive.current) setBranches([])
        } finally {
          if (alive.current) setBranchLoading(false)
        }
      }, [call])

      React.useEffect(() => {
        if (selected) loadBranches(selected)
      }, [selected, loadBranches])

      React.useEffect(() => {
        if (typeof props.sessionId !== 'string') return
        let active = true
        call('workspace/get', { session_id: props.sessionId }).then((answer) => {
          if (!active || !answer.workspace) return
          setWorkspace(answer.workspace)
          setSelected(answer.workspace.host)
        }).catch(() => {})
        return () => { active = false }
      }, [call, props.sessionId])

      const test = React.useCallback(async (alias) => {
        setStates((current) => ({ ...current, [alias]: { phase: 'busy' } }))
        try {
          const payload = await call('probe', { host: alias })
          if (!alive.current) return
          const probe = payload.probe
          setStates((current) => ({
            ...current,
            [alias]: probe.reachable ? { phase: 'ok', probe } : { phase: 'bad', reason: probe.reason },
          }))
        } catch (caught) {
          if (alive.current) setStates((current) => ({ ...current, [alias]: { phase: 'bad', reason: String(caught.message ?? caught) } }))
        }
      }, [call])

      const run = React.useCallback(async () => {
        if (selected === null || command.trim() === '' || commandPending.current) return
        commandPending.current = true
        setRunning(true)
        setOutput(null)
        setError(null)
        try {
          const payload = await call('exec', { host: selected, command })
          if (alive.current) setOutput(payload.result)
        } catch (caught) {
          if (alive.current) setError(String(caught.message ?? caught))
        } finally {
          commandPending.current = false
          if (alive.current) setRunning(false)
        }
      }, [call, selected, command])

      const host = hosts === null ? null : hosts.find((entry) => entry.alias === selected) ?? null

      // Every hook above runs on every render, so these switches keep the hook order
      // stable while showing one host's browser or terminal in place of the host list.
      if (browsing !== null) {
        return h(PanelBoundary, null, h(SshBrowser, {
          host: browsing,
          t,
          call,
          onBack: () => setBrowsing(null),
          initialPath: workspace?.host === browsing ? workspace.cwd : '~',
          startConversation: props.startConversation,
        }))
      }

      if (terminalFor !== null) {
        return h(PanelBoundary, null,
          h(React.Suspense, {
            fallback: h('div', { className: 'dshssh-root' }, h('div', { className: 'dshssh-note' }, t('term.loading'))),
          }, h(LazyTerminal, {
            host: terminalFor,
            t,
            call,
            onBack: () => setTerminalFor(null),
          })))
      }

      return h('div', { className: 'dshssh-root' },
        h('div', { className: 'dshssh-head' },
          h('span', { className: 'dshssh-title' }, t('hosts.title')),
          h('button', { type: 'button', className: 'dshssh-btn', onClick: load }, t('hosts.refresh'))),
        error !== null ? h('div', { className: 'dshssh-error' }, error) : null,
        hosts === null
          ? h('div', { className: 'dshssh-note' }, t('hosts.loading'))
          : hosts.length === 0
            ? h('div', { className: 'dshssh-note' }, t('hosts.empty'))
            : h('div', { className: 'dshssh-list' }, hosts.map((entry) => h(HostRow, {
              key: entry.alias,
              host: entry,
              state: states[entry.alias],
              selected: entry.alias === selected,
              onSelect: () => { setSelected(entry.alias); setOutput(null); setError(null) },
              onTest: () => test(entry.alias),
              t,
            }))),
        configPath !== '' ? h('div', { className: 'dshssh-note' }, configPath) : null,
        host === null ? null : h('div', { className: 'dshssh-card' },
          h('dl', { className: 'dshssh-kv' },
            h('dt', null, t('hosts.user')), h('dd', null, host.user ?? '—'),
            h('dt', null, t('hosts.port')), h('dd', null, String(host.port)),
            host.identityFile != null ? h('dt', null, 'key') : null,
            host.identityFile != null ? h('dd', null, host.identityFile) : null,
            host.proxyJump != null ? h('dt', null, 'jump') : null,
            host.proxyJump != null ? h('dd', null, host.proxyJump) : null),
          h('div', { className: 'dshssh-compose' },
            h('input', {
              className: 'dshssh-input',
              value: command,
              placeholder: t('command.placeholder', { host: host.alias }),
              spellCheck: false,
              onChange: (event) => setCommand(event.target.value),
              disabled: running,
              onKeyDown: (event) => { if (event.key === 'Enter' && !event.nativeEvent?.isComposing) run() },
            }),
            h('button', { type: 'button', className: 'dshssh-btn', disabled: running || command.trim() === '', onClick: run },
              running ? t('command.running') : t('command.run')),
            // Branch selector: pins one remote Git branch for targeted edits.
            // Only rendered inside the host card, so it appears in SSH mode.
            branches.length > 0 ? h('select', {
              className: 'dshssh-branch',
              value: branch,
              disabled: branchLoading,
              title: t('branch.label'),
              onChange: (event) => {
                setBranch(event.target.value)
                setLastAction(`branch: ${event.target.value}`)
              },
            },
              h('option', { value: '' }, branchLoading ? t('branch.loading') : t('branch.label')),
              ...branches.map((name) => h('option', { key: name, value: name }, name)))
              : branchLoading ? h('span', { className: 'dshssh-note' }, t('branch.loading')) : null,
            h('button', { type: 'button', className: 'dshssh-btn', onClick: () => setBrowsing(host.alias) },
              t('files.open')),
            h('button', { type: 'button', className: 'dshssh-btn', onClick: () => setTerminalFor(host.alias) },
              t('term.open')))),
        output === null ? null : h('div', { className: 'dshssh-card' },
          h('pre', { className: 'dshssh-out' },
            (output.stdout === '' ? '' : output.stdout.replace(/\n$/, ''))
            + (output.stderr === '' ? '' : `${output.stdout === '' ? '' : '\n'}[stderr]\n${output.stderr.replace(/\n$/, '')}`)
            || '(no output)'),
          h('div', { className: 'dshssh-exit' },
            `exit ${output.exitCode}`
            + (output.timedOut ? ' · timeout' : '')
            + (output.truncated ? ' · truncated' : ''))),
      )
    }

    /** A fallback so a render fault shows a message instead of blanking the pane. */
    class PanelBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      render() {
        if (this.state.error !== null) {
          return h('div', { className: 'dshssh-root' },
            h('div', { className: 'dshssh-error' }, String(this.state.error?.message ?? this.state.error)))
        }
        return this.props.children
      }
    }

    /**
     * The interactive terminal, loaded on demand.
     *
     * xterm is inlined in this package's own chunk so the startup bundle stays
     * small; a failure to load it is reported by the surrounding boundary rather
     * than taken as a reason to blank the pane.
     */
    const LazyTerminal = React.lazy(async () => {
      const chunk = await require.async('./client.term.js')
      return { default: chunk.TerminalView }
    })

    /** The tab body the sidebar mounts. */
    function SshBody(props) {
      return h(PanelBoundary, null, h(SshPanel, props))
    }

    function SshWorkspaceBadge({ sessionId, call }) {
      const [workspace, setWorkspace] = React.useState(null)
      React.useEffect(() => {
        let active = true
        call('workspace/get', { session_id: sessionId }).then((answer) => {
          if (active) setWorkspace(answer.workspace)
        }).catch(() => {})
        return () => { active = false }
      }, [call, sessionId])
      if (!workspace) return null
      const target = `SSH · ${workspace.host} · ${workspace.file || workspace.cwd}`
      return h('span', { className: 'dshssh-workspace-badge', title: target }, target)
    }

    /**
     * Branch selector for the conversation header, shown to the left of the mode
     * selector. Appears only when the remote host has Git branches — that is,
     * in SSH mode with a repository.
     */
    function BranchSelector(props) {
      const t = props.t
      const call = props.call
      const [branches, setBranches] = React.useState([])
      const [branch, setBranch] = React.useState('')
      const [loading, setLoading] = React.useState(true)
      const alive = React.useRef(true)
      React.useEffect(() => () => { alive.current = false }, [])

      React.useEffect(() => {
        let cancelled = false
        setLoading(true)
        call('branches', { host: '' }).then((payload) => {
          if (cancelled || !alive.current) return
          const list = Array.isArray(payload.branches) ? payload.branches : []
          setBranches(list)
          if (list.length > 0) setBranch(list[0])
        }).catch(() => {
          if (!cancelled && alive.current) setBranches([])
        }).finally(() => {
          if (!cancelled && alive.current) setLoading(false)
        })
        return () => { cancelled = true }
      }, [call])

      // Hidden until we know there are branches: the selector only belongs in
      // SSH mode with a repository.
      if (loading || branches.length === 0) return null

      return h('select', {
        className: 'dshssh-branch',
        value: branch,
        title: t('branch.label'),
        style: { maxWidth: 120 },
        onChange: (event) => setBranch(event.target.value),
      },
        h('option', { value: '' }, t('branch.label')),
        ...branches.map((name) => h('option', { key: name, value: name }, name)))
    }

    /** The guide card that opens this plugin's page. */
    function SshGuide(props) {
      const t = props.t
      // The guide seat supplies the enclosing Start tab's hook. Its actions turn
      // replaceTab:true into that tab's ID and preserve the acting session.
      const tab = typeof props.useTabInfo === 'function' ? props.useTabInfo().tab : null
      const [err, setErr] = React.useState(null)
      return h('button', {
        type: 'button',
        className: 'dshssh-guide',
        'data-sidebar-right-guide-entry': KIND,
        onClick: () => {
          setErr(null)
          try {
            if (typeof tab?.actions?.openTab === 'function') {
              tab.actions.openTab(KIND, { replaceTab: true })
            } else if (typeof props.open === 'function') {
              props.open()
            } else {
              throw new Error('sidebarRight.openTab is not available')
            }
          } catch (e) {
            setErr(String(e?.message ?? e))
          }
        },
      },
        h('span', { className: 'dshssh-guide-icon' }, h(SshGlyph, { size: 26 })),
        h('span', { className: 'dshssh-guide-text' },
          h('span', { className: 'dshssh-guide-title' }, t('guide.new')),
          h('span', { className: 'dshssh-guide-description' }, t('guide.description')),
          err !== null ? h('span', {
            className: 'dshssh-guide-description',
            style: { color: 'var(--dsw-alias-state-error-primary)' },
          }, err) : null))
    }

    function SshWorkspaceFlow(props) {
      const { open, busy, t, call, pickLocal, onPicked, onCancel } = props
      const [mode, setMode] = React.useState('ssh')
      const [hosts, setHosts] = React.useState([])
      const [host, setHost] = React.useState('')
      const [path, setPath] = React.useState('~')
      const [inputPath, setInputPath] = React.useState('~')
      const [title, setTitle] = React.useState('')
      const [listing, setListing] = React.useState({ phase: 'idle', entries: [] })
      const [error, setError] = React.useState(null)
      const [saving, setSaving] = React.useState(false)
      const pending = React.useRef(false)
      const request = React.useRef(0)
      const dialog = React.useRef(null)
      const lifetime = React.useRef(0)
      React.useEffect(() => {
        const generation = ++lifetime.current
        if (!open) return
        setError(null)
        call('hosts', {}).then(answer => {
          if (generation !== lifetime.current) return
          setHosts(answer.hosts ?? [])
          setHost(current => answer.hosts.some(item => item.alias === current) ? current : '')
        }).catch(reason => { if (generation === lifetime.current) setError(String(reason.message ?? reason)) })
        return () => { lifetime.current++; request.current++ }
      }, [open, call])
      const load = React.useCallback(async (nextPath) => {
        const sequence = ++request.current
        setError(null); setListing({ phase: 'loading', entries: [] })
        try {
          const answer = await call('ls', { host, path: nextPath })
          if (sequence !== request.current) return
          const resolved = answer.resolvedPath ?? answer.path
          setPath(resolved); setInputPath(resolved)
          setListing({ phase: 'ready', entries: answer.entries.filter(entry => entry.directory || entry.kind === 'directory' || entry.kind === 'symlink') })
        } catch (reason) {
          if (sequence === request.current) { setError(String(reason.message ?? reason)); setListing({ phase: 'error', entries: [] }) }
        }
      }, [call, host])
      React.useEffect(() => {
        if (open && host && mode === 'ssh') load('~')
        return () => { request.current++ }
      }, [open, host, mode, load])
      React.useEffect(() => {
        if (open) dialog.current?.querySelector?.('button')?.focus()
      }, [open])
      if (!open) return null
      const working = busy || saving
      const choose = async () => {
        if (pending.current || working) return
        pending.current = true; setSaving(true); setError(null)
        const generation = lifetime.current
        try {
          if (mode === 'local') {
            const directory = await pickLocal()
            if (generation === lifetime.current) directory === null ? onCancel() : onPicked(directory)
          } else {
            const answer = await call('projects/create', { host, cwd: path, title })
            if (generation === lifetime.current) onPicked(answer.workspace.path)
          }
        } catch (reason) { if (generation === lifetime.current) setError(String(reason.message ?? reason)) }
        finally { pending.current = false; setSaving(false) }
      }
      const keyDown = event => {
        if (event.key === 'Escape' && !working) { event.stopPropagation(); onCancel() }
        if (event.key === 'Tab') {
          const controls = [...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')]
          const first = controls[0], last = controls[controls.length - 1]
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
        }
      }
      return h('div', { className: 'dshssh-workspace-overlay' },
        h('section', { className: 'dshssh-workspace-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': t('project.add'), ref: dialog, onKeyDown: keyDown },
          h('strong', null, t('project.add')),
          h('div', { className: 'dshssh-workspace-tabs' }, ...['local', 'ssh'].map(value => h('button', { key: value, type: 'button', className: 'dshssh-btn', 'aria-pressed': mode === value, disabled: working, onClick: () => { setMode(value); setError(null) } }, t('project.' + value)))),
          mode === 'local' ? h('p', null, t('project.localDescription')) : h(React.Fragment, null,
            h('label', null, t('project.host'), h('select', { 'aria-label': t('project.host'), value: host, disabled: working, onChange: event => setHost(event.target.value) }, h('option', { value: '', disabled: true }, t('project.chooseHost')), ...hosts.map(item => h('option', { key: item.alias, value: item.alias }, item.alias)))),
            hosts.length === 0 ? h('p', null, t('hosts.empty')) : null,
            h('div', { className: 'dshssh-compose' }, h('input', { 'aria-label': t('project.path'), value: inputPath, disabled: working, style: { flex: 1 }, onChange: event => setInputPath(event.target.value), onKeyDown: event => { if (event.key === 'Enter') { event.preventDefault(); load(inputPath) } } }),
              h('button', { type: 'button', className: 'dshssh-btn', disabled: !host || working, onClick: () => load(inputPath) }, t('project.go')),
              h('button', { type: 'button', className: 'dshssh-btn', disabled: !host || working || listing.phase !== 'ready', onClick: () => load(parentRemotePath(path)) }, t('files.up'))),
            h('div', { className: 'dshssh-workspace-directory-list', 'aria-label': t('project.directories'), 'aria-busy': listing.phase === 'loading' },
              listing.phase === 'loading' ? h('span', null, t('files.loading')) : null,
              ...listing.entries.map(entry => h('button', { key: entry.name, type: 'button', className: 'dshssh-row', disabled: working, onClick: () => load(joinRemotePath(path, entry.name)) }, '▣ ', entry.name)),
              listing.phase === 'ready' && listing.entries.length === 0 ? h('span', null, t('project.noDirectories')) : null),
            h('label', null, t('project.name'), h('input', { value: title, placeholder: t('project.autoName'), disabled: working, onChange: event => setTitle(event.target.value) }))),
          error ? h('div', { role: 'alert', className: 'dshssh-error' }, error) : null,
          h('div', { className: 'dshssh-workspace-footer' },
            h('button', { type: 'button', className: 'dshssh-btn', disabled: working, onClick: onCancel }, t('project.cancel')),
            h('button', { type: 'button', className: 'dshssh-btn', disabled: working || (mode === 'ssh' && (!host || listing.phase !== 'ready' || inputPath !== path)), onClick: choose }, working ? t('project.adding') : t(mode === 'local' ? 'project.chooseLocal' : 'project.addDirectory')))))
    }

    return {
      /** Component and path helpers used by regression and rendering tests. */
      __testing: { parentRemotePath, joinRemotePath, formatBytes, HostRow, SshBrowser, SshPanel, SshGuide, SshWorkspaceFlow, BranchSelector },
      inject: ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        /**
         * Call one of this plugin's host endpoints.
         *
         * These are exact **Fetch routes** on the harness's shared `/api` handler,
         * so they are called with plain `fetch` — not `ctx.connection.rpc.call`.
         * The two are not interchangeable: `rpc.call` posts a request envelope and
         * expects a `{ type: 'server-response', rpcId, result }` envelope back,
         * which only the channel's single RPC interceptor produces, and that
         * interceptor belongs to the Typert gateway. A Fetch route answers with the
         * handler's own JSON, in the shared handler's first dispatch step.
         *
         * The page's origin is the desktop application scheme, and its `/api`
         * requests are carried to the host by the same bridge that serves the
         * harness's own API calls, so a document-relative URL is correct here.
         * @param endpoint - endpoint name below the plugin's prefix, such as `hosts`.
         * @param payload - JSON payload; sent as the request body.
         * @param signal - optional cancellation signal.
         * @returns the handler's JSON answer, whose `ok` is true.
         * @throws when the transport failed or the handler reported a failure.
         */
        const call = async (endpoint, payload, signal) => {
          const response = await fetch(`/api/${ENDPOINT_PREFIX}/${endpoint}`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload ?? {}),
            ...(signal === undefined ? {} : { signal }),
          })
          const text = await response.text()
          let answer = null
          try {
            answer = text === '' ? null : JSON.parse(text)
          } catch {
            throw new Error(`unexpected response (HTTP ${response.status})`)
          }
          if (!response.ok || answer === null || answer.ok !== true) {
            throw new Error(answer?.reason ?? `HTTP ${response.status}`)
          }
          return answer
        }
        // Retry a partially created conversation instead of creating orphaned
        // duplicates when SSH is temporarily unavailable.
        const pendingConversations = new Map()
        const startConversation = async (sourceSessionId, target) => {
          const sessions = ctx.get?.('sessions')
          const uiWorkspace = ctx.get?.('uiWorkspace')
          const uiSession = ctx.get?.('uiSession')
          if (!sessions || !uiWorkspace || !uiSession || typeof sourceSessionId !== 'string') {
            throw new Error(t('chat.unavailable'))
          }
          const workspace = uiWorkspace.workspaces.list.getSnapshot().items.find(item => item.sessionIds.includes(sourceSessionId))
          const source = sessions.list.getSnapshot().byId[sourceSessionId]
          if (!workspace && !source?.cwd) throw new Error(t('chat.unavailable'))
          const key = JSON.stringify([sourceSessionId, target])
          let id = pendingConversations.get(key)
          if (!id) {
            id = await sessions.create(workspace ? { workspaceId: workspace.workspaceId } : { cwd: source.cwd })
            pendingConversations.set(key, id)
          }
          const reference = sessions.retain(id, { source: 'ssh-workspace' })
          try {
            await reference.ready
            const selected = await call('workspace/select', { session_id: id, ...target })
            const input = uiSession.bindingSource(reference).getSnapshot().props.inputActions
            if (typeof input?.setDraft !== 'function') throw new Error(t('chat.unavailable'))
            input.setDraft('')
            uiWorkspace.openSession(id)
            pendingConversations.delete(key)
            return { sessionId: id, workspace: selected.workspace }
          } finally { reference.release() }
        }
        /**
         * Fallback opener for compositions without the guide tab hook. The
         * controller takes an actual tab ID, unlike tab.actions.openTab.
         * Errors propagate to the caller so the guide card can show them instead of
         * silently doing nothing — the earlier version swallowed every exception,
         * which made a broken click indistinguishable from a working one.
         */
        const open = () => {
          if (typeof ctx.sidebarRight?.openTab !== 'function') {
            throw new Error('sidebarRight.openTab is not available')
          }
          const active = ctx.sidebarRight.active?.()
          ctx.sidebarRight.openTab(KIND, active?.kind === 'guide' ? { replaceTab: active.id } : {})
        }
        ctx.effect(() => ctx.locale.register(NS, {
          en: {
            'project.add': 'Add workspace', 'project.local': 'Local', 'project.ssh': 'SSH virtual machine',
            'project.host': 'SSH host', 'project.path': 'Remote directory', 'project.go': 'Open', 'project.directories': 'Directories',
            'project.chooseHost': 'Choose an SSH host',
            'project.name': 'Workspace name', 'project.autoName': 'Use directory and host name', 'project.cancel': 'Cancel',
            'project.adding': 'Adding…', 'project.addDirectory': 'Add this directory', 'project.chooseLocal': 'Choose local folder',
            'project.localDescription': 'Select a folder on this computer.', 'project.noDirectories': 'No subdirectories. You can add this directory.',
            title: 'SSH',
            'guide.new': 'New SSH session',
            'guide.description': 'Pick a host from ~/.ssh/config',
            'chat.directory': 'New conversation in this directory',
            'chat.file': 'New conversation about this file',
            'chat.opening': 'Opening conversation…',
            'chat.ready': 'The new conversation is open. Add your request in its message box and send.',
            'chat.unavailable': 'Open SSH from a conversation in your project to start a remote conversation.',
            'hosts.title': 'Hosts',
            'hosts.refresh': 'Refresh',
            'hosts.loading': 'Reading ~/.ssh/config…',
            'hosts.empty': 'No hosts in ~/.ssh/config. Add a Host block there, then refresh.',
            'hosts.test': 'Test',
            'hosts.testing': 'Testing…',
            'hosts.user': 'user',
            'hosts.port': 'port',
            'command.placeholder': 'Run a command on {host}',
            'command.run': 'Run',
            'command.running': 'Running…',
            'files.open': 'Files',
            'files.hosts': 'Hosts',
            'files.up': 'Up',
            'files.refresh': 'Refresh',
            'files.loading': 'Reading the directory…',
            'files.empty': 'This directory is empty.',
            'branch.label': 'Branch',
            'branch.loading': 'Loading branches…',
            'term.open': 'Terminal',
            'term.back': 'Hosts',
            'term.loading': 'Loading the terminal…',
            'term.connecting': 'Connecting to {host}…',
            'term.connected': 'connected',
            'term.exited': 'session ended (exit {code})',
            'term.failed': 'failed: {reason}',
          },
          zh: {
            'project.add': '添加工作区', 'project.local': '本机', 'project.ssh': 'SSH 虚拟机',
            'project.host': 'SSH 主机', 'project.path': '远端目录', 'project.go': '打开', 'project.directories': '目录',
            'project.chooseHost': '选择 SSH 主机',
            'project.name': '工作区名称', 'project.autoName': '自动使用目录和主机名', 'project.cancel': '取消',
            'project.adding': '正在添加…', 'project.addDirectory': '添加此目录', 'project.chooseLocal': '选择本机文件夹',
            'project.localDescription': '选择这台电脑上的文件夹。', 'project.noDirectories': '没有子目录，可以添加当前目录。',
            title: 'SSH',
            'guide.new': '新建 SSH 会话',
            'guide.description': '从 ~/.ssh/config 选择主机',
            'chat.directory': '在此目录新建对话',
            'chat.file': '针对该文件新建对话',
            'chat.opening': '正在打开对话…',
            'chat.ready': '新对话已打开。请在消息框补充需求后发送。',
            'chat.unavailable': '请从工程内的对话打开 SSH 页面，再新建远端对话。',
            'hosts.title': '主机',
            'hosts.refresh': '刷新',
            'hosts.loading': '正在读取 ~/.ssh/config…',
            'hosts.empty': '~/.ssh/config 中没有主机。请先添加 Host 配置再刷新。',
            'hosts.test': '测试',
            'hosts.testing': '测试中…',
            'hosts.user': '用户',
            'hosts.port': '端口',
            'command.placeholder': '在 {host} 上执行命令',
            'command.run': '执行',
            'command.running': '执行中…',
            'files.open': '文件',
            'files.hosts': '主机',
            'files.up': '上级',
            'files.refresh': '刷新',
            'files.loading': '正在读取目录…',
            'files.empty': '该目录为空。',
            'branch.label': '分支',
            'branch.loading': '加载分支…',
            'term.open': '终端',
            'term.back': '主机',
            'term.loading': '正在加载终端…',
            'term.connecting': '正在连接 {host}…',
            'term.connected': '已连接',
            'term.exited': '会话已结束（退出码 {code}）',
            'term.failed': '失败：{reason}',
          },
        }), 'dsh-ssh: copy')
        ctx.effect(() => installStyles(), 'dsh-ssh: styles')
        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: ID,
          kind: KIND,
          multiple: true,
          keepMounted: true,
          priority: 'extension',
          title: () => t('title'),
          guide: [{
            id: 'new',
            order: 30,
            title: () => t('guide.new'),
            description: () => t('guide.description'),
            icon: SshGlyph,
          }],
        }), 'dsh-ssh: type')
        ctx.effect(() => ctx.slots.inject('sidebar.right.tab.guide.entry', () => ctx.slots.register({
          name: 'sidebar.right.tab.guide.entry',
          key: ID,
          locale: NS,
          inject: () => ({ t, open }),
        }, SshGuide)), 'dsh-ssh: guide')
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: ID,
          locale: NS,
          inject: (sessionId) => ({ t, call, sessionId, startConversation: target => startConversation(sessionId, target) }),
        }, SshBody)), 'dsh-ssh: body')
        ctx.effect(() => ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities', id: ID, order: -10, locale: NS,
          inject: sessionId => ({ sessionId, call }),
        }, SshWorkspaceBadge)), 'dsh-ssh: conversation workspace')
        // Branch selector in the conversation header, to the left of the mode
        // selector (agent-preset is order -10; this is -20 so it appears before it).
        ctx.effect(() => ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
          name: 'conversation.session.header.actions', id: `${ID}/branch`, order: -20, locale: NS,
          inject: () => ({ t, call }),
        }, BranchSelector)), 'dsh-ssh: branch selector')
        for (const slot of ['sidebar.workspaces.directoryFlow', 'conversation.hero.workspace.directoryFlow']) {
          ctx.effect(() => ctx.slots.inject(slot, () => ctx.slots.register({
            name: slot, priority: -10, locale: NS,
            inject: () => ({ t, call, pickLocal: () => {
              const native = globalThis.__DSH_DIRECTORY_PICKER__
              return native ? native.pick() : ctx.get('uiWorkspace').pickDirectory()
            } }),
          }, SshWorkspaceFlow)), 'dsh-ssh: ' + slot)
        }
      },
    }
  },
})
