#!/usr/bin/env bun

/**
 * Build script for stackboi
 * Compiles platform-specific binaries and sets up npm packages
 */

import { $ } from 'bun'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(import.meta.dir, '..')
const NPM_DIR = path.join(ROOT, 'npm')
const DIST_DIR = path.join(ROOT, 'dist')

interface Platform {
  name: string
  os: string
  arch: string
  bunTarget: string
  ext: string
}

const PLATFORMS: Platform[] = [
  { name: 'darwin-arm64', os: 'darwin', arch: 'arm64', bunTarget: 'bun-darwin-arm64', ext: '' },
  { name: 'darwin-x64', os: 'darwin', arch: 'x64', bunTarget: 'bun-darwin-x64', ext: '' },
  { name: 'linux-x64', os: 'linux', arch: 'x64', bunTarget: 'bun-linux-x64', ext: '' },
  { name: 'linux-arm64', os: 'linux', arch: 'arm64', bunTarget: 'bun-linux-arm64', ext: '' },
  { name: 'win32-x64', os: 'win32', arch: 'x64', bunTarget: 'bun-windows-x64', ext: '.exe' },
]

async function getVersion(): Promise<string> {
  const pkg = await Bun.file(path.join(ROOT, 'package.json')).json()
  return pkg.version
}

async function buildPlatform(platform: Platform, version: string): Promise<void> {
  const outDir = path.join(NPM_DIR, platform.name)
  const binName = `sb${platform.ext}`
  const outPath = path.join(outDir, binName)

  console.log(`Building for ${platform.name}...`)

  // Compile binary
  const result =
    await $`bun build --compile --minify --target=${platform.bunTarget} ${path.join(ROOT, 'index.ts')} --outfile ${outPath}`.nothrow()

  if (result.exitCode !== 0) {
    console.error(`Failed to build for ${platform.name}: ${result.stderr.toString()}`)
    return
  }

  // Create package.json for this platform
  const pkgJson = {
    name: `@stackboi/${platform.name}`,
    version,
    description: `sb binary for ${platform.name}`,
    license: 'MIT',
    repository: {
      type: 'git',
      url: 'https://github.com/stackboi/stackboi',
    },
    os: [platform.os],
    cpu: [platform.arch],
    bin: {
      sb: `./${binName}`,
    },
  }

  await Bun.write(path.join(outDir, 'package.json'), JSON.stringify(pkgJson, null, 2) + '\n')

  console.log(`  Built ${outPath}`)
}

async function buildAll(): Promise<void> {
  const version = await getVersion()
  console.log(`Building stackboi v${version}\n`)

  // Clean and create directories
  await $`rm -rf ${DIST_DIR}`.nothrow()
  fs.mkdirSync(DIST_DIR, { recursive: true })

  for (const dir of fs.readdirSync(NPM_DIR)) {
    const platformDir = path.join(NPM_DIR, dir)
    if (fs.statSync(platformDir).isDirectory()) {
      // Remove old binaries but keep directory
      for (const file of fs.readdirSync(platformDir)) {
        if (file !== 'package.json') {
          fs.unlinkSync(path.join(platformDir, file))
        }
      }
    }
  }

  // Build for each platform
  for (const platform of PLATFORMS) {
    await buildPlatform(platform, version)
  }

  // Copy CLI wrapper to dist
  fs.copyFileSync(path.join(ROOT, 'bin', 'cli.js'), path.join(DIST_DIR, 'cli.js'))

  console.log('\nBuild complete!')
}

async function buildCurrent(): Promise<void> {
  const version = await getVersion()
  const platform = `${process.platform}-${process.arch}`
  const platformConfig = PLATFORMS.find((p) => p.name === platform)

  if (!platformConfig) {
    console.error(`Unsupported platform: ${platform}`)
    process.exit(1)
  }

  console.log(`Building stackboi v${version} for current platform (${platform})\n`)

  fs.mkdirSync(DIST_DIR, { recursive: true })
  await buildPlatform(platformConfig, version)

  console.log('\nBuild complete!')
}

// Parse args
const args = process.argv.slice(2)
if (args.includes('--current')) {
  buildCurrent()
} else {
  buildAll()
}
