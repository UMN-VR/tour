import { configDefaults, defineConfig } from 'vitest/config'
import { defaultClientConditions, defaultServerConditions, type Connect, type Plugin, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { appFiles, babylonBarrels, babylonShaderChunks, builtFrom, crossOriginIsolation, headsetEmulator, lazyFeatures, localSource } from 'foss-earth/vite'
import { bootTerminal, browserRecovery, warmPages } from '@foss-earth/ui/vite'

/** The tour's pages: the campus selector, and FOSS Earth's app with each campus's scene. */
const TOUR_PAGES = {
  selector: 'index.html',
  minneapolis: 'minneapolis/index.html',
  stPaul: 'st-paul/index.html',
  twinCities: 'twin-cities/index.html',
}
/** The campus pages, as the build names them: "/minneapolis/index.html". */
const CAMPUS_PAGES = Object.values(TOUR_PAGES).filter(page => page !== TOUR_PAGES.selector).map(page => `/${page}`)
/** Each campus's repository, checked out beside this one, holds its scene; it is published at /tour/<campus>/scene.json. */
const CAMPUSES = ['minneapolis', 'st-paul', 'twin-cities']
/** This project's GitHub Pages mount; the club's site owns the domain root. */
const BASE = '/tour/'
/** The photographs every campus's scene points to, as the site publishes them. */
const MEDIA = '/tour/twin-cities/media'
const SITE = 'https://umn-vr.github.io'
/**
 * The scene build's output (npm run build:scene): photographs under tour/twin-cities/media/.
 * Without it, the photographs come from the published site.
 */
const PUBLIC = process.env.TOUR_PUBLIC?.trim() || 'public'
const localMedia = existsSync(path.join(PUBLIC, MEDIA))

function getGitOutput(command: string): string | null {
  try {
    return execSync(command, { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

const sourceCommit = getGitOutput('git rev-parse --short=12 HEAD') ?? 'unknown'
// What the tour is built from: a change anywhere else, such as a doc, does not change what runs, so it does not make the build "-dirty".
const BUILT_FROM = ['index.html', ...CAMPUSES, 'src', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'package.json', 'package-lock.json']
const sourceDirty = Boolean(getGitOutput(`git status --short -- ${BUILT_FROM.join(' ')}`))

const require = createRequire(import.meta.url)
const sceneOf = (campus: string): Buffer => readFileSync(require.resolve(`@umn-vr/${campus}/scene.json`))

/** Sends `/` to the campus selector, in `npm run dev` and `npm run preview` alike. */
function tourHome(): Plugin {
  const redirect: Connect.NextHandleFunction = (request, response, next) => {
    if (request.url !== '/') return next()
    response.statusCode = 302
    response.setHeader('Location', BASE)
    response.end()
  }
  return {
    name: 'umn-vr-tour-home',
    configureServer: server => { server.middlewares.use(redirect) },
    configurePreviewServer: server => { server.middlewares.use(redirect) },
  }
}

/**
 * Serves each campus's scene from its checkout while developing, and writes it into the build.
 * The scenes are content, not the app's files, so the app's service worker does not keep them.
 */
function campusScenes(): Plugin {
  let outDir = 'dist'
  let building = false
  const serve: Connect.NextHandleFunction = (request, response, next) => {
    const campus = request.url?.match(/^\/tour\/([a-z-]+)\/scene\.json(?:\?|$)/)?.[1]
    if (!campus || !CAMPUSES.includes(campus)) return next()
    response.setHeader('Content-Type', 'application/json')
    response.end(sceneOf(campus))
  }
  return {
    name: 'umn-vr-campus-scenes',
    // Vitest resolves a build config too, with an out directory of its own: only a build writes.
    configResolved(config) { outDir = path.resolve(config.root, config.build.outDir); building = config.command === 'build' },
    configureServer: server => { server.middlewares.use(serve) },
    closeBundle() {
      if (!building) return
      for (const campus of CAMPUSES) {
        mkdirSync(path.join(outDir, campus), { recursive: true })
        writeFileSync(path.join(outDir, campus, 'scene.json'), sceneOf(campus))
      }
    },
  }
}

/** Without the scene build's output here, the photographs come from the published site. */
const media: Record<string, ProxyOptions> | undefined = localMedia ? undefined : { [MEDIA]: { target: SITE, changeOrigin: true } }

/** Serve local photographs before Vite strips /tour/: their source folder still mirrors the published URL. */
function tourMedia(): Plugin {
  const root = path.resolve(PUBLIC)
  const types: Record<string, string> = { '.jpg': 'image/jpeg', '.json': 'application/json' }
  const serve: Connect.NextHandleFunction = (request, response, next) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
    const file = path.join(root, pathname)
    if (!pathname.startsWith(`${MEDIA}/`) || !file.startsWith(root + path.sep) || !existsSync(file) || !statSync(file).isFile()) return next()
    response.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream')
    createReadStream(file).pipe(response)
  }
  return {
    name: 'umn-vr-tour-media',
    configureServer: server => { if (localMedia) server.middlewares.use(serve) },
    configurePreviewServer: server => { if (localMedia) server.middlewares.use(serve) },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // This repository publishes its own project site, independent of the club's.
  base: BASE,
  publicDir: PUBLIC,
  resolve: {
    // One copy of each, shared with FOSS Earth's source.
    dedupe: ['@babylonjs/core', '@babylonjs/loaders', '3d-tiles-renderer', 'react', 'react-dom'],
    // FOSS Earth is linked from its checkout beside this organization's and used from source,
    // as its app uses its libraries: "source" selects their TypeScript entry points.
    // localSource() watches their TypeScript and CSS source, including CSS @imports,
    // and shares FOSS Earth's node_modules.
    conditions: ['source', ...defaultClientConditions],
    preserveSymlinks: true,
  },
  ssr: { resolve: { conditions: ['source', ...defaultServerConditions] } },
  server: {
    fs: { allow: ['.', '../../foss-earth', '../../Felipegalind0/gamepad-tools', ...CAMPUSES.map(campus => `../${campus}`)] },
    proxy: media,
  },
  preview: { proxy: media },
  // FOSS Earth's About tab shows these.
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __SOURCE_VERSION__: JSON.stringify(`${sourceCommit}${sourceDirty ? '-dirty' : ''}`),
    __REPOSITORY_SLUG__: JSON.stringify('UMN-VR/tour'),
    __PAGES_REPOSITORY_SLUG__: JSON.stringify('UMN-VR/tour'),
  },
  build: {
    // The photographs are published apart from the app (README, "Deploying").
    copyPublicDir: false,
    rolldownOptions: { input: TOUR_PAGES },
  },
  // FOSS Earth's service worker keeps the app's own files on the visitor's device: GitHub Pages lets them go stale after ten minutes.
  // Each page says what it is built from, this repository, FOSS Earth and every package, for the About tab.
  // npm run dev only: a page opened with ?headsetEmulator=quest3 gets an emulated VR headset.
  // Each campus page shows the boot terminal from its first bytes. The selector fetches a campus page as a card is hovered or pressed,
  // and the campus pages' app files once it is idle.
  plugins: [crossOriginIsolation(), localSource(), react(), tourHome(), campusScenes(), tourMedia(), babylonBarrels(), babylonShaderChunks(), lazyFeatures(), browserRecovery({ appId: 'umn-vr-tour' }),
    bootTerminal({ pages: page => CAMPUS_PAGES.includes(page) }), warmPages({ from: `/${TOUR_PAGES.selector}`, pages: CAMPUS_PAGES }), appFiles(), builtFrom(), headsetEmulator()],
  test: {
    // .local/ holds the YouVisit backup and scratch; public/ the generated scene.
    exclude: [...configDefaults.exclude, '.local/**', 'public/**', 'build/**'],
    // FOSS Earth and its libraries are TypeScript source, so they go through the transform too.
    server: { deps: { inline: [/3d-tiles-renderer\//, /foss-earth\//, /@foss-earth\//, /@felipegalind0\//] } },
  },
})
