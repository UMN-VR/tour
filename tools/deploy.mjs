// Publishes the tour's own GitHub Pages project at /tour/.
// Existing photographs and old app assets stay in gh-pages; the club site is separate.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const BRANCH = 'refs/heads/gh-pages'
const CAMPUSES = ['minneapolis', 'st-paul', 'twin-cities']
const REQUIRED = ['index.html', 'foss-earth-sw.js', ...CAMPUSES.flatMap(campus => [`${campus}/index.html`, `${campus}/scene.json`])]

function filesOf(base, under = '') {
  return readdirSync(path.join(base, under), { withFileTypes: true }).flatMap(entry => {
    if (entry.name === '.DS_Store') return []
    const name = path.posix.join(under, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Refusing a symbolic link: ${name}`)
    if (entry.name.startsWith('.') || /[\r\n\t\0]/.test(name)) throw new Error(`Refusing a hidden or invalid filename: ${name}`)
    if (entry.isDirectory()) return filesOf(base, name)
    if (!entry.isFile()) throw new Error(`Not a regular file: ${name}`)
    return [[name, path.join(base, name)]]
  }).sort(([a], [b]) => a.localeCompare(b))
}

/** Own publishing branch, with an optional one-time import of the existing tour subtree. */
export function publishTour({ root = ROOT, remote = 'origin', bootstrapFrom, bootstrapRef = BRANCH, mediaDirectory,
  dryRun = false, log = console.log } = {}) {
  const dist = path.join(root, 'dist')
  for (const file of REQUIRED) if (!existsSync(path.join(dist, file))) throw new Error(`Incomplete tour build: missing ${file}. Run npm run build first.`)
  const files = filesOf(dist)
  for (const [name] of files) if (!REQUIRED.includes(name) && !name.startsWith('assets/')) throw new Error(`File outside the tour build: ${name}`)
  if (!files.some(([name]) => name.startsWith('assets/'))) throw new Error('Incomplete tour build: no app assets. Run npm run build first.')
  if (mediaDirectory) {
    const base = path.join(path.resolve(mediaDirectory), 'tour', 'twin-cities', 'media')
    const photographs = filesOf(base)
    if (!photographs.length) throw new Error(`No photographs under ${base}.`)
    files.push(...photographs.map(([name, file]) => [`twin-cities/media/${name}`, file]))
  }

  const stateRoot = process.env.TOUR_DEPLOY_STATE_ROOT || path.join(root, 'build')
  mkdirSync(stateRoot, { recursive: true })
  const state = mkdtempSync(path.join(stateRoot, 'deploy-'))
  const env = { ...process.env, GIT_INDEX_FILE: path.join(state, 'index') }
  const git = (args, input) => execFileSync('git', ['-c', 'pack.threads=2', ...args], {
    cwd: root, env, input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'inherit'],
  }).trim()
  const mediaTreeOf = tree => {
    try { return git(['rev-parse', `${tree}:twin-cities/media`]) } catch { return null }
  }
  try {
    let present = true
    try { git(['ls-remote', '--exit-code', '--heads', remote, BRANCH]) }
    catch (error) { if (error.status === 2) present = false; else throw error }

    let parent = null, importedMedia = null
    if (present) {
      git(['fetch', '--no-tags', '--depth=1', '--', remote, BRANCH])
      parent = git(['rev-parse', 'FETCH_HEAD'])
      git(['read-tree', parent])
    } else {
      if (!bootstrapFrom) throw new Error('No tour gh-pages branch yet. Use --bootstrap-from <old hosting repository> once to preserve the published photographs.')
      git(['fetch', '--no-tags', '--depth=1', '--', bootstrapFrom, bootstrapRef])
      const source = git(['rev-parse', 'FETCH_HEAD'])
      const tourTree = git(['rev-parse', `${source}:tour`])
      importedMedia = mediaTreeOf(tourTree)
      if (!importedMedia) throw new Error('The bootstrap source has no tour/twin-cities/media subtree.')
      git(['read-tree', tourTree])
    }

    // Git objects and an alternate index avoid checking out tens of thousands of photographs.
    const hashes = git(['hash-object', '-w', '--stdin-paths'], files.map(([, file]) => JSON.stringify(file)).join('\n')).split('\n')
    const empty = git(['hash-object', '-w', '--stdin'], '')
    git(['update-index', '--add', '--index-info'], files.map(([name], i) => `100644 ${hashes[i]}\t${name}`).join('\n') + `\n100644 ${empty}\t.nojekyll\n`)
    const tree = git(['write-tree'])
    const mediaTree = mediaTreeOf(tree)
    if (importedMedia && !mediaDirectory && mediaTree !== importedMedia) throw new Error('The imported photograph tree changed unexpectedly.')
    if (parent && tree === git(['rev-parse', `${parent}^{tree}`])) {
      log('The tour gh-pages branch already has this build.')
      return { changed: false, commit: parent, tree, fileCount: files.length, mediaTree }
    }

    const source = git(['rev-parse', '--short=12', 'HEAD'])
    const dirty = git(['status', '--short', '--', 'src', 'index.html', ...CAMPUSES, 'vite.config.ts', 'tools/deploy.mjs', 'package.json', 'package-lock.json'])
    const message = `Deploy the tour at ${source}${dirty ? '-dirty' : ''}${parent ? '' : ' with existing photographs'}`
    // The first commit has no club-site parent: it imports content, not the club's history.
    const commit = git(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message])
    if (dryRun) log(`Prepared tour deployment ${commit}; no publishing branch was updated.`)
    else {
      git(['push', '--', remote, `${commit}:${BRANCH}`])
      log(`Published the tour to its own gh-pages branch: ${files.length} updated files.`)
    }
    return { changed: true, commit, tree, fileCount: files.length, mediaTree }
  } finally { rmSync(state, { recursive: true, force: true }) }
}

function optionsOf(args) {
  const options = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--dry-run') options.dryRun = true
    else {
      const key = { '--remote': 'remote', '--bootstrap-from': 'bootstrapFrom', '--bootstrap-ref': 'bootstrapRef', '--media': 'mediaDirectory' }[arg]
      if (!key || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Usage: npm run deploy -- [--dry-run] [--bootstrap-from <repository>] [--media <public folder>] [--remote <destination>] [--bootstrap-ref <ref>]')
      options[key] = args[++i]
    }
  }
  return options
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) publishTour(optionsOf(process.argv.slice(2)))
