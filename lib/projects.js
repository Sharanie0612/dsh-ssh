import { mkdir, realpath } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, basename } from 'node:path'
import { parseWorkspace } from './workspace.js'
import { runRemote, shellQuotePath, assertHostToken } from './ssh.js'

export function parseProject(value) {
  const remote = parseWorkspace(value)
  if (typeof value.path !== 'string' || typeof value.title !== 'string') throw new Error('invalid SSH project')
  return { ...remote, path: value.path, title: value.title }
}

export const projectDomainSpec = {
  name: 'dsh_ssh_projects', version: 1, layout: 'per-record',
  tables: { projects: { valueSchema: { parse: parseProject } }, disabled: { valueSchema: { parse: v => { if (v !== true) throw new Error('invalid disconnected session'); return v } } } },
}

export function createProjects({ root, registryOf, settings }) {
  let table, disabled
  const memory = new Map(), disconnected = new Set(), pending = new Map()
  const key = path => createHash('sha256').update(path).digest('hex')
  return {
    attach(projects, exclusions) { table = projects; disabled = exclusions; return () => { table = disabled = undefined } },
    get(path) { return typeof path === 'string' ? table?.get(key(path)) ?? memory.get(key(path)) : undefined },
    excluded(id) { return disabled?.get(id) === true || disconnected.has(id) },
    async disconnect(id) { if (disabled) await disabled.put(id, true); disconnected.add(id) },
    async reconnect(id) { if (disabled) await disabled.delete(id); disconnected.delete(id) },
    async create({ host, cwd, title, signal }) {
      const registry = registryOf()
      if (!registry || !table) throw new Error('SSH workspaces require the DSH workspace registry and durable storage')
      assertHostToken(host)
      if (typeof cwd !== 'string' || !cwd.trim() || cwd.includes('\0')) throw new Error('a remote directory is required')
      const result = await runRemote({ ...settings, host, signal, timeoutMs: 15000, maxOutputBytes: 65536,
        command: `cd ${shellQuotePath(cwd)} || exit 2; printf '%s\\0' "$PWD"` })
      if (result.exitCode !== 0 || result.truncated) throw new Error(result.stderr.trim() || 'cannot open the remote directory')
      const resolved = parseWorkspace({ host, cwd: result.stdout.split('\0')[0], file: null })
      const identity = key(JSON.stringify([host, resolved.cwd]))
      if (pending.has(identity)) return pending.get(identity)
      const operation = (async () => {
        // Native DSH workspaces require a real local directory. This empty,
        // plugin-owned carrier stores session identity only; project content is
        // read on the selected SSH host. Never download or mirror user files.
        const directory = join(root, identity)
        await mkdir(directory, { recursive: true })
        const path = await realpath(directory)
        const prior = this.get(path)
        const label = typeof title === 'string' && title.trim() ? title.trim() : `${basename(resolved.cwd) || '/'} · ${host} (SSH)`
        const record = parseProject({ ...resolved, path, title: prior?.title ?? label })
        await table.put(key(path), record)
        memory.set(key(path), record)
        const workspace = await registry.create(path, record.title)
        return { project: record, workspace: { workspaceId: workspace.id, path: workspace.path, title: workspace.title } }
      })().finally(() => pending.delete(identity))
      pending.set(identity, operation)
      return operation
    },
  }
}
