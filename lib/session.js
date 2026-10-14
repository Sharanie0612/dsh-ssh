/**
 * Each Agent's remote working context: which host it is working on, and where on
 * that host its work lives.
 *
 * Without this, every remote call has to repeat the host alias and the working
 * directory, which is exactly the friction the tools exist to remove: "connect to
 * rdkx5 and work in ~/proj" should be said once, and every later `ssh_exec`,
 * `ssh_read`, or `ssh_glob` should follow from it.
 *
 * The context is deliberately **in memory and per Agent**. It is not session log
 * state — nothing the model must see is derived from it, and the prompt states it
 * afresh on every request — so it does not need a session event, and a plugin that
 * appended one could not set the `ignorable` marker the Session requires. A host
 * restart therefore starts with no default, exactly as it starts with no terminal
 * sessions.
 * @module @local/dsh-ssh/session
 */

/** The key used when a caller has no Agent identity, such as a direct API call. */
export const SHARED_CONTEXT_KEY = 'shared'

/**
 * Normalise an Agent identity into a context key.
 * @param agent - the Agent the tool call belongs to, if any.
 * @returns the map key for that Agent's context.
 */
export function contextKey(agent) {
  const id = agent !== null && typeof agent === 'object' ? agent.id : undefined
  return typeof id === 'string' && id !== '' ? id : SHARED_CONTEXT_KEY
}

/**
 * Create the per-Agent context store.
 * @returns the store; `dispose()` releases every entry.
 */
export function createRemoteContexts(fallback = () => undefined) {
  /** @type {Map<string, { host: string, cwd: string | null, branch: string | null, since: number }>} */
  const byAgent = new Map()
  const cleared = new Set()
  let counter = 0

  /**
   * Set or update one Agent's remote context.
   * @param key - the Agent's context key.
   * @param next - the host to select, and optionally the working directory and branch
   * (an empty value keeps the current one).
   * @returns the stored context.
   */
  function set(key, next) {
    counter += 1
    const previous = get(key)
    cleared.delete(key)
    const sameHost = previous?.host === next.host
    const cwd = next.cwd === undefined || next.cwd === null || next.cwd === ''
      ? (sameHost ? previous.cwd : null)
      : next.cwd
    const branch = next.branch === undefined || next.branch === null || next.branch === ''
      ? (sameHost ? previous.branch : null)
      : next.branch
    const stored = { host: next.host, cwd, branch, since: counter }
    byAgent.set(key, stored)
    return stored
  }

  /** Read one Agent's context, or undefined when it has none. */
  function get(key) {
    return cleared.has(key) ? undefined : byAgent.get(key) ?? fallback(key)
  }

  /** Update only the branch for one Agent's context, leaving host and cwd unchanged. */
  function setBranch(key, branch) {
    const previous = get(key)
    if (previous === undefined) return undefined
    counter += 1
    const stored = { ...previous, branch: branch || null, since: counter }
    byAgent.set(key, stored)
    return stored
  }

  /** Forget one Agent's context. */
  function clear(key) {
    const present = get(key) !== undefined
    byAgent.delete(key)
    cleared.add(key)
    return present
  }

  /** How many Agents currently have a context. */
  function size() {
    return byAgent.size
  }

  /** Release every context. */
  function dispose() {
    byAgent.clear()
    cleared.clear()
  }

  return { set, setBranch, get, clear, size, dispose }
}

/**
 * Resolve the host a call should use.
 *
 * An explicit argument always wins; the Agent's context is the fallback. Returning
 * a reason instead of throwing keeps this pure and testable, and lets each caller
 * phrase its own error.
 * @param value - the `host` argument a caller supplied, if any.
 * @param context - the Agent's context, if any.
 * @returns the host to use, or a reason none is available.
 */
export function resolveHost(value, context) {
  if (typeof value === 'string' && value.trim() !== '') return { host: value.trim() }
  if (context !== undefined && typeof context.host === 'string' && context.host !== '') return { host: context.host, fromContext: true }
  return {
    reason: 'no host was given and this session has no default host. '
      + 'Call ssh_connect with a host alias first, or pass host explicitly.',
  }
}

/**
 * Resolve the working directory a call should use.
 * @param value - the `cwd` argument a caller supplied, if any.
 * @param context - the Agent's context, if any.
 * @returns the directory to use, or undefined to let the remote login shell start
 * in the remote home directory.
 */
export function resolveCwd(value, context) {
  if (typeof value === 'string' && value !== '') return value
  const stored = context?.cwd
  return typeof stored === 'string' && stored !== '' ? stored : undefined
}

/**
 * Resolve the remote *path* a call targets.
 *
 * A relative path is joined onto the session directory, which is what makes
 * "relative work uses that directory" true for the path-taking tools and not only
 * for the command runner. An absolute or `~`-relative path, and any path when no
 * session directory is set, is passed through untouched — the remote login shell
 * is what resolves those, and second-guessing it here would break `~`.
 * @param value - the `path` argument a caller supplied, if any.
 * @param context - the Agent's context, if any.
 * @returns the path to use, or undefined when there is neither a path nor a base.
 */
export function resolveRemotePath(value, context) {
  const text = typeof value === 'string' ? value : ''
  const stored = context?.cwd
  const base = typeof stored === 'string' && stored !== '' ? stored.replace(/\/+$/, '') || '/' : undefined
  if (text === '') return base
  if (text.startsWith('/') || text.startsWith('~')) return text
  return base === undefined ? text : `${base.replace(/\/+$/, '')}/${text}`
}
