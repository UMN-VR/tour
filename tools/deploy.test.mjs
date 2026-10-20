import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { publishTour } from './deploy.mjs'

const repository = fileURLToPath(new URL('../', import.meta.url))
const fixtures = process.env.UMN_DEPLOY_TEST_ROOT || path.join(repository, 'build', 'checks')
const folders = []
const campuses = ['minneapolis', 'st-paul', 'twin-cities']
const photograph = Buffer.from([0xff, 0xd8, 0x00, 0x11, 0xff, 0xd9])

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
const blob = (root, revision, file) => execFileSync('git', ['show', `${revision}:${file}`], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] })
const put = (root, file, contents) => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
  writeFileSync(path.join(root, file), contents)
}

function initRepository(root) {
  mkdirSync(root, { recursive: true })
  git(root, ['init', '--initial-branch=main'])
  git(root, ['config', 'user.name', 'Deployment tests'])
  git(root, ['config', 'user.email', 'deployment-tests@example.invalid'])
}

function fixture() {
  mkdirSync(fixtures, { recursive: true })
  const folder = mkdtempSync(path.join(fixtures, 'tour-deploy-'))
  folders.push(folder)
  const root = path.join(folder, 'tour')
  const remote = path.join(folder, 'tour.git')
  const legacy = path.join(folder, 'club.git')
  const club = path.join(folder, 'club')
  git(folder, ['init', '--bare', remote])
  git(folder, ['init', '--bare', legacy])

  initRepository(root)
  put(root, 'README.md', 'The independently published tour.')
  git(root, ['add', 'README.md'])
  git(root, ['commit', '-m', 'Tour source'])
  git(root, ['remote', 'add', 'origin', remote])

  initRepository(club)
  git(club, ['checkout', '-b', 'gh-pages'])
  put(club, 'index.md', 'Club landing page')
  put(club, '_config.yml', 'theme: minima')
  put(club, 'Media /club.jpg', 'Club photograph')
  put(club, 'assets/club-old.js', 'An asset owned by the club')
  put(club, 'tour/index.html', 'An older tour selector')
  put(club, 'tour/assets/old-tour.js', 'An older tour asset')
  put(club, 'tour/twin-cities/media/published.jpg', photograph)
  put(club, 'tour/twin-cities/media/nested/metadata.json', '{"published":true}')
  for (const campus of campuses) {
    put(club, `tour/${campus}/index.html`, `An older ${campus} page`)
    put(club, `tour/${campus}/scene.json`, JSON.stringify({ id: campus, entities: [] }))
  }
  git(club, ['add', '.'])
  git(club, ['commit', '-m', 'Existing club and tour publication'])
  git(club, ['remote', 'add', 'origin', legacy])
  git(club, ['push', 'origin', 'gh-pages'])
  const legacyCommit = git(club, ['rev-parse', 'HEAD'])
  const mediaTree = git(club, ['rev-parse', 'HEAD:tour/twin-cities/media'])

  put(root, 'dist/index.html', '<script src="/tour/assets/new-tour.js"></script>')
  put(root, 'dist/foss-earth-sw.js', 'The new tour service worker')
  put(root, 'dist/foss-earth-isolate.js', 'A file this deployer does not name')
  put(root, 'dist/assets/new-tour.js', 'The new tour app')
  for (const campus of campuses) {
    put(root, `dist/${campus}/index.html`, `The new ${campus} page`)
    put(root, `dist/${campus}/scene.json`, JSON.stringify({ id: campus, entities: [] }))
  }
  const publish = options => publishTour({ root, log: () => {}, ...options })
  const refs = () => git(remote, ['for-each-ref', '--format=%(refname) %(objectname)'])
  return { folder, root, remote, legacy, legacyCommit, mediaTree, publish, refs }
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

describe('the tour-owned Git publisher', () => {
  it('seeds its own publication from only the legacy tour subtree, preserving the media tree', async () => {
    const { root, remote, legacy, legacyCommit, mediaTree, publish } = fixture()
    const result = await publish({ bootstrapFrom: legacy })
    expect(result.changed).toBe(true)
    expect(result.fileCount).toBeGreaterThan(0)
    expect(git(remote, ['rev-parse', 'refs/heads/gh-pages'])).toBe(result.commit)
    expect(git(root, ['rev-list', '--parents', '-n', '1', result.commit]).split(' ')).toEqual([result.commit])
    expect(git(root, ['rev-parse', `${result.commit}:twin-cities/media`])).toBe(mediaTree)
    expect(result.mediaTree).toBe(mediaTree)
    expect(blob(root, result.commit, 'twin-cities/media/published.jpg')).toEqual(photograph)
    expect(blob(root, result.commit, 'assets/old-tour.js').toString()).toBe('An older tour asset')
    expect(blob(root, result.commit, 'assets/new-tour.js').toString()).toBe('The new tour app')
    for (const campus of campuses) {
      expect(blob(root, result.commit, `${campus}/index.html`).toString()).toBe(`The new ${campus} page`)
    }
    const files = git(root, ['ls-tree', '-r', '--name-only', result.commit]).split('\n')
    expect(files).toContain('.nojekyll')
    expect(files).toContain('index.html')
    expect(files).toContain('foss-earth-sw.js')
    expect(files).toContain('foss-earth-isolate.js')
    expect(files).not.toContain('index.md')
    expect(files).not.toContain('_config.yml')
    expect(files).not.toContain('assets/club-old.js')
    expect(files.some(file => file.startsWith('Media ') || file.startsWith('tour/'))).toBe(false)
    expect(git(legacy, ['rev-parse', 'refs/heads/gh-pages'])).toBe(legacyCommit)
  })

  it('keeps older assets and photographs, uses its own parent, and skips an identical second publication', async () => {
    const { root, remote, legacy, mediaTree, publish } = fixture()
    const first = await publish({ bootstrapFrom: legacy })
    rmSync(path.join(root, 'dist/assets/new-tour.js'))
    put(root, 'dist/assets/newer-tour.js', 'A newer tour app')
    put(root, 'dist/index.html', '<script src="/tour/assets/newer-tour.js"></script>')
    const second = await publish()
    expect(second.changed).toBe(true)
    expect(git(root, ['rev-list', '--parents', '-n', '1', second.commit]).split(' ')).toEqual([second.commit, first.commit])
    expect(blob(root, second.commit, 'assets/old-tour.js').toString()).toBe('An older tour asset')
    expect(blob(root, second.commit, 'assets/new-tour.js').toString()).toBe('The new tour app')
    expect(blob(root, second.commit, 'assets/newer-tour.js').toString()).toBe('A newer tour app')
    expect(git(root, ['rev-parse', `${second.commit}:twin-cities/media`])).toBe(mediaTree)
    const unchanged = await publish()
    expect(unchanged.changed).toBe(false)
    expect(unchanged.commit).toBe(second.commit)
    expect(unchanged.tree).toBe(second.tree)
    expect(git(remote, ['rev-parse', 'refs/heads/gh-pages'])).toBe(second.commit)
  })

  it('adds separately prepared photographs without replacing previously published media', async () => {
    const { folder, root, legacy, publish } = fixture()
    await publish({ bootstrapFrom: legacy })
    const mediaDirectory = path.join(folder, 'public')
    const added = Buffer.from([0xff, 0xd8, 0x22, 0x33, 0xff, 0xd9])
    put(mediaDirectory, 'tour/twin-cities/media/new.jpg', added)
    const result = await publish({ mediaDirectory })
    expect(result.changed).toBe(true)
    expect(blob(root, result.commit, 'twin-cities/media/published.jpg')).toEqual(photograph)
    expect(blob(root, result.commit, 'twin-cities/media/new.jpg')).toEqual(added)
    expect(blob(root, result.commit, 'twin-cities/media/nested/metadata.json').toString()).toBe('{"published":true}')
  })

  it('validates a first publication in dry-run mode without writing any remote refs', async () => {
    const { root, legacy, publish, refs } = fixture()
    const before = refs()
    const result = await publish({ bootstrapFrom: legacy, dryRun: true })
    expect(result.changed).toBe(true)
    expect(git(root, ['rev-parse', `${result.commit}^{tree}`])).toBe(result.tree)
    expect(refs()).toBe(before)
  })

  it('requires an explicit bootstrap source when its publication does not exist', async () => {
    const { publish, refs } = fixture()
    const before = refs()
    await expect(Promise.resolve().then(() => publish())).rejects.toThrow(/bootstrap/i)
    expect(refs()).toBe(before)
  })

  const invalidBuilds = [
    ['a missing campus scene', root => rmSync(path.join(root, 'dist/st-paul/scene.json'))],
    ['a symlink asset', root => {
      put(root, 'outside.js', 'A file outside the build')
      symlinkSync(path.join(root, 'outside.js'), path.join(root, 'dist/assets/link.js'))
    }],
    ['an empty assets directory', root => rmSync(path.join(root, 'dist/assets/new-tour.js'))],
  ]
  it.each(invalidBuilds)('rejects %s before changing the remote', async (_description, invalidate) => {
    const { root, legacy, publish, refs } = fixture()
    const before = refs()
    invalidate(root)
    // An unusable destination proves build validation happens before remote access.
    await expect(Promise.resolve().then(() => publish({
      remote: path.join(root, 'no-such-remote'), bootstrapFrom: legacy,
    }))).rejects.toThrow(/Incomplete tour build|Refusing a symbolic link/)
    expect(refs()).toBe(before)
  })
})

describe('the publishing commit', () => {
  it('names the source the page itself names, with its -dirty mark or without one', async () => {
    const { root, legacy, publish } = fixture()
    const page = source => put(root, 'dist/index.html', `<meta name="foss-earth-app-source" content="${source}"><script src="/tour/assets/new-tour.js"></script>`)
    page('0123456789ab')
    const clean = await publish({ bootstrapFrom: legacy })
    expect(git(root, ['log', '-1', '--format=%s', clean.commit])).toBe('Deploy the tour at 0123456789ab with existing photographs')
    page('0123456789ab-dirty')
    const dirty = await publish()
    expect(git(root, ['log', '-1', '--format=%s', dirty.commit])).toBe('Deploy the tour at 0123456789ab-dirty')
    expect(existsSync(path.join(root, 'deployed-from.json'))).toBe(false)
  })
})
