#!/usr/bin/env bun

/**
 * Release script for stackboi
 * Increments version, updates all package.json files, tags, and publishes
 */

import { $ } from 'bun'
import * as path from 'node:path'

const ROOT = path.resolve(import.meta.dir, '..')
const NPM_DIR = path.join(ROOT, 'npm')

const PLATFORMS = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64', 'win32-x64']

type BumpType = 'major' | 'minor' | 'patch'

function parseVersion(version: string): [number, number, number] {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) {
    throw new Error(`Invalid version format: ${version}`)
  }
  return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])]
}

function bumpVersion(version: string, bump: BumpType): string {
  const [major, minor, patch] = parseVersion(version)

  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
  }
}

async function updatePackageJson(filePath: string, newVersion: string): Promise<void> {
  const pkg = await Bun.file(filePath).json()
  pkg.version = newVersion

  // Update optionalDependencies if present (main package)
  if (pkg.optionalDependencies) {
    for (const dep of Object.keys(pkg.optionalDependencies)) {
      if (dep.startsWith('@stackboi/')) {
        pkg.optionalDependencies[dep] = newVersion
      }
    }
  }

  await Bun.write(filePath, JSON.stringify(pkg, null, 2) + '\n')
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  // Parse bump type
  let bump: BumpType | null = null
  if (args.includes('--major')) bump = 'major'
  else if (args.includes('--minor')) bump = 'minor'
  else if (args.includes('--patch')) bump = 'patch'

  // Parse OTP
  const otpArg = args.find((arg) => arg.startsWith('--otp='))
  const otp = otpArg?.split('=')[1]

  if (!bump) {
    console.error('Usage: bun scripts/release.ts --patch|--minor|--major [--otp=CODE]')
    process.exit(1)
  }

  // Get current version
  const rootPkg = await Bun.file(path.join(ROOT, 'package.json')).json()
  const currentVersion = rootPkg.version
  const newVersion = bumpVersion(currentVersion, bump)

  console.log(`Releasing: ${currentVersion} → ${newVersion}\n`)

  // Check for uncommitted changes
  const status = await $`git status --porcelain`.cwd(ROOT).text()
  if (status.trim()) {
    console.error('Error: Working directory has uncommitted changes')
    process.exit(1)
  }

  // Update all package.json files
  console.log('Updating package.json files...')

  // Update root package.json
  await updatePackageJson(path.join(ROOT, 'package.json'), newVersion)
  console.log('  Updated package.json')

  // Update platform package.json files
  for (const platform of PLATFORMS) {
    const pkgPath = path.join(NPM_DIR, platform, 'package.json')
    await updatePackageJson(pkgPath, newVersion)
    console.log(`  Updated npm/${platform}/package.json`)
  }

  // Git commit and tag
  console.log('\nCreating git commit and tag...')
  await $`git add -A`.cwd(ROOT)
  await $`git commit -m ${`v${newVersion}`}`.cwd(ROOT)
  await $`git tag v${newVersion}`.cwd(ROOT)
  console.log(`  Created tag v${newVersion}`)

  // Publish (use spawn with inherit for interactive passkey auth)
  console.log('\nPublishing to npm...')
  const publishArgs = otp ? ['scripts/publish.ts', `--otp=${otp}`] : ['scripts/publish.ts']
  const publishProc = Bun.spawn(['bun', ...publishArgs], {
    cwd: ROOT,
    stdio: ['inherit', 'inherit', 'inherit'],
  })
  const publishExitCode = await publishProc.exited

  if (publishExitCode !== 0) {
    console.error('\nPublish failed. You may need to:')
    console.error('  1. Fix the issue')
    console.error('  2. Run: bun run publish:all')
    console.error('  3. Push: git push && git push --tags')
    process.exit(1)
  }

  // Push to remote
  console.log('\nPushing to remote...')
  await $`git push`.cwd(ROOT)
  await $`git push --tags`.cwd(ROOT)

  console.log(`\nReleased v${newVersion}`)
}

main()
