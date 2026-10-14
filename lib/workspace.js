import { assertHostToken, runRemote, shellQuotePath } from './ssh.js'

/** Serializable selection, keyed by the DSH Agent/Session identity. */
export function parseWorkspace(value) {
  if (!value || typeof value !== 'object' || typeof value.cwd !== 'string' || !value.cwd.startsWith('/') || value.cwd.includes('\u0000')) {
    throw new Error('SSH workspace must have an absolute remote directory')
  }
  assertHostToken(value.host)
  if (value.file !== null && (typeof value.file !== 'string' || !value.file.startsWith('/') || value.file.includes('\u0000'))) {
    throw new Error('SSH workspace file must be an absolute remote path or null')
  }
  return { host: value.host, cwd: value.cwd, file: value.file }
}

// The public storageDomain contract consumes a schema's parse method. Keeping
// this structural avoids importing a second copy of DSH's schema/runtime.
export const workspaceDomainSpec = {
  name: 'dsh_ssh_workspaces', version: 1, layout: 'per-record',
  tables: { sessions: { valueSchema: { parse: parseWorkspace } } },
}

export function createWorkspaceSelections() {
  const memory = new Map()
  let table = null
  return {
    get: id => table?.get(id) ?? memory.get(id),
    get durable() { return table !== null },
    attach(next) { table = next; return () => { if (table === next) table = null } },
    async put(id, value) {
      const record = parseWorkspace(value)
      if (table) await table.put(id, record)
      memory.set(id, record)
      return record
    },
    async delete(id) {
      if (table) await table.delete(id)
      memory.delete(id)
    },
    clear() { memory.clear() },
  }
}

/** Validate a user-picked directory before changing that Session's SSH target. */
export function createWorkspaceController({ getAgent, selections, contexts, settings, workspaceOf = id => selections.get(id), reconnect = async () => {} }) {
  return {
    get(sessionId) {
      if (!getAgent(sessionId)) throw new Error('the conversation is unavailable; reopen it and try again')
      return { workspace: workspaceOf(sessionId) ?? null, durable: selections.durable }
    },
    async select({ sessionId, host, cwd, file = null, signal }) {
      const agent = getAgent(sessionId)
      if (!agent) throw new Error('the conversation is unavailable; reopen it and try again')
      if (agent.status === 'running') throw new Error('wait for this conversation to finish before changing its SSH workspace')
      assertHostToken(host)
      if (typeof cwd !== 'string' || cwd === '') throw new Error('a remote directory is required')
      if (file !== null && (typeof file !== 'string' || !file.startsWith('/'))) throw new Error('file must be an absolute remote path')
      const check = file === null ? '' : `test -f ${shellQuotePath(file)} || { echo 'ssh: the selected file is unavailable' >&2; exit 2; }; `
      const result = await runRemote({
        ...settings, host, signal, timeoutMs: 15000, maxOutputBytes: 65536,
        command: `cd ${shellQuotePath(cwd)} || exit 2; ${check}printf '%s\\0' "$PWD"`,
      })
      if (result.exitCode !== 0 || result.truncated) throw new Error(result.stderr.trim() || 'cannot resolve that remote directory')
      const absolute = result.stdout.split('\u0000')[0]
      const record = await selections.put(sessionId, { host: host.trim(), cwd: absolute, file })
      await reconnect(sessionId)
      contexts.set(agent.id, record)
      return { workspace: record, durable: selections.durable }
    },
  }
}
