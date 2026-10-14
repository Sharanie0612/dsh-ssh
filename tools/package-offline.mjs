import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const root = fileURLToPath(new URL('../', import.meta.url))
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const npm = process.env.npm_execpath
if (!npm) throw new Error('Run this script with npm run pack:offline')
const directory = join(root, 'releases')
await mkdir(directory, { recursive: true })
const result = JSON.parse(execFileSync(process.execPath, [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', directory], {
  cwd: root, maxBuffer: 1024 * 1024, timeout: 60000,
  env: { ...process.env, npm_config_cache: join(root, 'artifacts', 'npm-cache') },
}).toString())[0]
if (!result || /[\\/]/.test(result.filename)) throw new Error('unexpected npm pack result')
const filename = `dsh-ssh-${manifest.version}.tgz`
await rename(join(directory, result.filename), join(directory, filename))
const bytes = await readFile(join(directory, filename))
const sha256 = createHash('sha256').update(bytes).digest('hex')
await writeFile(join(directory, filename + '.sha256'), `${sha256}  ${filename}\n`)
await writeFile(join(directory, 'latest.json'), JSON.stringify({ name: manifest.name, version: manifest.version, filename, bytes: bytes.length, sha256 }, null, 2) + '\n')
console.log(`${filename}: ${bytes.length} bytes; SHA-256 ${sha256}`)
