/**
 * The plugin's host catalog: read the OpenSSH client configuration and turn each
 * concrete `Host` block into one connectable entry.
 *
 * The catalog is a read-only projection. Nothing here writes configuration,
 * stores credentials, or caches connection state; a caller re-reads the file to
 * pick up an edit.
 * @module @local/dsh-ssh/hosts
 */
import { glob, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'

/** A host alias is concrete only when it names no wildcard. */
const WILDCARD = /[*?!]/

/** Directives this module projects; the rest are read and ignored. */
const PROJECTED = new Set(['hostname', 'user', 'port', 'identityfile', 'proxyjump', 'hostkeyalias'])

/** The port used when the configuration names none. */
export const DEFAULT_PORT = 22

/**
 * Resolve the OpenSSH client configuration path.
 * @param env - environment supplying `USERPROFILE` on Windows.
 * @returns the absolute path of `~/.ssh/config`.
 */
export function sshConfigPath(env = process.env) {
  const home = process.platform === 'win32' && env.USERPROFILE ? env.USERPROFILE : homedir()
  return join(home, '.ssh', 'config')
}

/**
 * Remove a trailing comment, honouring a `#` that begins a line or follows whitespace,
 * so a `#` inside a token survives.
 */
function stripComment(line) {
  let quote = null
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '\\' && quote !== "'") { i += 1; continue }
    if (line[i] === quote) { quote = null; continue }
    if (quote === null && (line[i] === '"' || line[i] === "'")) { quote = line[i]; continue }
    if (quote === null && line[i] === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i)
  }
  return line
}

/** Remove one enclosing pair of double quotes. */
function unquote(value) {
  const trimmed = value.trim()
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1)
  return trimmed
}

/**
 * Split one directive line written as `Key value` or `Key=value`.
 * @returns the lower-cased key and its value, or undefined for a line that names no directive.
 */
function splitDirective(line) {
  const match = /^([A-Za-z][A-Za-z0-9]*)\s*(?:=|\s)\s*(.*)$/.exec(line)
  if (match === null) return null
  return [match[1].toLowerCase(), match[2].trim()]
}

/**
 * Collect the file's `Host` blocks in order.
 *
 * This follows the client's own reading rules for the projected keys: a block
 * applies to every alias it names, the first value obtained for a key wins, and
 * `Match` closes the current block because its conditions cannot be evaluated
 * here. The file reader expands `Include` directives before parsing.
 * @param text - configuration file contents.
 * @returns blocks, each with its aliases and first-wins projected options.
 */
export function parseSshConfigBlocks(text) {
  const blocks = []
  let current = { aliases: ['*'], options: {} }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim()
    if (line === '') continue
    const directive = splitDirective(line)
    if (directive === null) continue
    const [key, rawValue] = directive
    const value = unquote(rawValue)
    if (key === 'host') {
      current = { aliases: value.split(/\s+/).filter((alias) => alias !== ''), options: {} }
      blocks.push(current)
      continue
    }
    if (key === 'match') {
      current = null
      continue
    }
    if (current === null || !PROJECTED.has(key)) continue
    if (!blocks.includes(current)) blocks.push(current)
    if (current.options[key] === undefined) current.options[key] = value
  }
  return blocks
}

/**
 * Project the configuration onto concrete, connectable host entries.
 * @param text - configuration file contents.
 * @returns entries sorted by alias; wildcard aliases are dropped.
 */
export function parseSshConfig(text) {
  const blocks = parseSshConfigBlocks(text)
  const aliases = [...new Set(blocks.flatMap((block) => block.aliases).filter((alias) => !WILDCARD.test(alias)))]
  const matches = (alias, patterns) => {
    let included = false
    for (const pattern of patterns) {
      const excluded = pattern.startsWith('!')
      const literal = excluded ? pattern.slice(1) : pattern
      const expression = literal.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
      if (!new RegExp(`^${expression}$`, 'i').test(alias)) continue
      if (excluded) return false
      included = true
    }
    return included
  }
  const byAlias = aliases.map((alias) => {
    const options = {}
    for (const block of blocks) {
      if (!matches(alias, block.aliases)) continue
      for (const [key, value] of Object.entries(block.options)) if (options[key] === undefined) options[key] = value
    }
    return [alias, options]
  })
  return byAlias
    .map(([alias, options]) => {
      const port = Number.parseInt(options.port ?? '', 10)
      return {
        alias,
        hostName: options.hostname ?? alias,
        user: options.user ?? null,
        port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : DEFAULT_PORT,
        identityFile: options.identityfile ?? null,
        proxyJump: options.proxyjump ?? null,
        hostKeyAlias: options.hostkeyalias ?? null,
      }
    })
    .sort((left, right) => left.alias.localeCompare(right.alias))
}

/**
 * Read and project the OpenSSH client configuration.
 * @param env - environment supplying `USERPROFILE` on Windows.
 * @returns the configuration path and its concrete entries, empty when no file exists.
 * @throws when the file exists but cannot be read.
 */
export async function listConfiguredHosts(env = process.env) {
  const path = sshConfigPath(env)
  const includeBase = dirname(path)
  const home = dirname(includeBase)
  const expand = async (file, ancestors = []) => {
    if (ancestors.includes(file) || ancestors.length >= 16) return ''
    let source
    try { source = await readFile(file, 'utf8') } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return ''
      throw error
    }
    const lines = []
    for (const raw of source.split(/\r?\n/)) {
      const directive = splitDirective(stripComment(raw).trim())
      if (directive?.[0] !== 'include') { lines.push(raw); continue }
      const words = directive[1].match(/"[^"]*"|'[^']*'|[^\s]+/g) ?? []
      for (const word of words) {
        let pattern = word.replace(/^(["'])(.*)\1$/, '$2')
        if (pattern.startsWith('~/') || pattern.startsWith('~\\')) pattern = join(home, pattern.slice(2))
        if (!isAbsolute(pattern)) pattern = resolve(includeBase, pattern)
        const files = []
        for await (const candidate of glob(pattern.replace(/\\/g, '/'))) files.push(candidate)
        for (const candidate of files.sort()) lines.push(await expand(candidate, [...ancestors, file]))
      }
    }
    return lines.join('\n')
  }
  const text = await expand(path)
  return { path, hosts: parseSshConfig(text) }
}
