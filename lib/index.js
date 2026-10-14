/**
 * Host half of the SSH plugin.
 *
 * This file owns no rendering. It registers the model-facing tools, the
 * browser-facing API routes, and one prompt section that tells an Agent when the
 * remote tools are the right ones. The browser half is `lib/client.js`, loaded
 * from this package's `dsh.client` manifest.
 *
 * The plugin declares no `Config`, so it imports nothing from the harness
 * installation and installs with no dependency resolution of its own; every
 * value below is a constant, and a caller that wants a different value changes
 * it here.
 * @module @local/dsh-ssh
 */
import { registerApi } from './api.js'
import { createTerminalService } from './terminal.js'
import { registerTools } from './tools.js'
import { contextKey } from './session.js'
import { createWorkspaceController, createWorkspaceSelections, workspaceDomainSpec } from './workspace.js'
import { createProjects, projectDomainSpec } from './projects.js'
import { fileURLToPath } from 'node:url'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-ssh'

/**
 * Services this plugin needs. `tools` is the one it cannot work without;
 * `connection` and `systemPrompt` are used opportunistically so the plugin still
 * loads in a composition that lacks them. The panel half needs `connection`
 * because the page reaches the host only through the harness's shared `/api`
 * handler, which that service owns.
 */
export const inject = ['tools']

/** Resolved plugin settings. No `Config` is declared, so these are the only values. */
const settings = {
  /** The OpenSSH client executable, resolved through `PATH`. */
  sshExecutable: 'ssh',
  /** Per-connection TCP timeout handed to the client. */
  connectTimeoutSeconds: 8,
  /** Wall-clock limit for one remote command. */
  defaultTimeoutMs: 120000,
  /** Largest amount of remote output one tool call or API response carries. */
  maxOutputBytes: 200000,
  /** Largest file the byte-transfer tools and routes move in one call. */
  maxTransferBytes: 32 * 1024 * 1024,
  /** Wall-clock limit for one file transfer. */
  transferTimeoutMs: 300000,
  /** Grace period the subprocess provider gets to end a terminal process tree. */
  disposeGraceMs: 3000,
}

/** The prompt section's name; a scoped section shadows a global one with the same name. */
const SECTION_NAME = 'dsh-ssh:remote-hosts'

/**
 * Register the plugin's Host contributions.
 * @param ctx - the plugin context.
 */
export async function apply(ctx, { workspaceRoot = fileURLToPath(new URL('../.ssh-workspaces/', import.meta.url)) } = {}) {
  const selections = createWorkspaceSelections()
  const projects = createProjects({ root: workspaceRoot, registryOf: () => ctx.get('workspaceRegistry'), settings })
  const workspaceOf = id => {
    const explicit = selections.get(id)
    if (explicit) return explicit
    if (projects.excluded(id)) return undefined
    const agent = ctx.get('agents')?.get(id)
    const session = agent?.session ?? ctx.get('sessions')?.get(id)
    return projects.get(session?.header?.cwd)
  }
  const { contexts } = registerTools(ctx, settings, workspaceOf, async id => { await projects.disconnect(id); await selections.delete(id) })
  ctx.effect(() => () => contexts.dispose(), 'dsh-ssh: session contexts')
  ctx.effect(() => () => selections.clear(), 'dsh-ssh: workspace selections')
  const storageSetup = ctx.inject(['storageDomain'], async (storageCtx) => {
    const domain = await storageCtx.storageDomain.open(workspaceDomainSpec)
    const detach = selections.attach(domain.table('sessions'))
    storageCtx.effect(() => async () => { detach(); await domain.close() }, 'dsh-ssh: durable workspaces')
    const projectDomain = await storageCtx.storageDomain.open(projectDomainSpec)
    const detachProjects = projects.attach(projectDomain.table('projects'), projectDomain.table('disabled'))
    storageCtx.effect(() => async () => { detachProjects(); await projectDomain.close() }, 'dsh-ssh: durable projects')
  })
  const workspaces = { service: null }
  ctx.inject(['agents'], (agentCtx) => {
    const service = createWorkspaceController({ getAgent: id => agentCtx.agents.get(id), selections, contexts, settings, workspaceOf, reconnect: id => projects.reconnect(id) })
    workspaces.service = service
    agentCtx.effect(() => () => { if (workspaces.service === service) workspaces.service = null }, 'dsh-ssh: workspace controller')
  })

  /**
   * The interactive terminal service, once a subprocess provider is mounted.
   *
   * It is optional on purpose: a composition without `subprocess` still serves the
   * panel's host list and command runner, and the terminal routes answer with a
   * reason instead of the plugin failing to load.
   */
  const terminals = { service: null }
  ctx.inject(['subprocess'], (subprocessCtx) => {
    const service = createTerminalService(subprocessCtx, settings)
    terminals.service = service
    subprocessCtx.effect(() => async () => {
      terminals.service = null
      await service.dispose()
    }, 'dsh-ssh: terminals')
  })

  ctx.inject(['connection'], (connectionCtx) => {
    registerApi(connectionCtx, settings, () => terminals.service, () => workspaces.service, () => projects, () => contexts)
  })

  ctx.inject(['systemPrompt'], (promptCtx) => {
    promptCtx.systemPrompt.section({
      name: SECTION_NAME,
      interpolate: false,
      order: promptCtx.systemPrompt.getSectionOrder('TOOL_PTY') + 10,
      text: ({ scope }) => {
        if (ctx.tools.get('ssh_exec', scope) === undefined) return ''
        const key = contextKey(scope)
        const remote = contexts.get(key)
        const selected = workspaceOf(key)
        const workspace = remote === undefined ? '' : 'The user selected this SSH workspace for this conversation: '
          + JSON.stringify({ host: remote.host, cwd: remote.cwd, file: selected?.host === remote.host && selected.cwd === remote.cwd ? selected.file : null })
          + '. Resolve files and commands there with ssh_* tools. This remote path is not a local filesystem path. '
        return [
          workspace,
          'You can work on remote machines over SSH with the `ssh_*` tools.',
          'Call `ssh_hosts` first to see the configured aliases, then pass one as the `host` argument.',
          'When more than one call will target the same machine, call `ssh_connect` once with that host and the',
          'directory the work lives in; every later `ssh_*` call may then omit `host`, and relative work uses that',
          'directory. `ssh_disconnect` forgets it.',
          'Use `ssh_exec`, `ssh_read`, `ssh_write`, `ssh_edit`, `ssh_glob`, `ssh_grep`, and `ssh_ls` for anything on that host,',
          'and `read`, `write`, `edit`, `glob`, and `grep` only for files on this machine.',
          '`ssh_upload` and `ssh_download` move whole files byte for byte, for content a text write cannot carry.',
          'Remote authentication is non-interactive, so a host that requires a typed password is not reachable this way;',
          'ask the user to connect it in the SSH panel instead.',
        ].join(' ')
      },
    })
  })
  // When durable storage is mounted, restoration is part of activation: a
  // reload must not publish tools before their remote defaults have returned.
  if (ctx.get('storageDomain') !== undefined) await storageSetup
}
