#!/usr/bin/env bun

/**
 * Publish script for stackboi
 * Publishes all platform packages and the main package to npm
 */

import { $ } from 'bun'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(import.meta.dir, '..')
const NPM_DIR = path.join(ROOT, 'npm')

const PLATFORMS = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64', 'win32-x64']

async function publishPackage(
  dir: string,
  name: string,
  dryRun: boolean,
  otp?: string,
): Promise<boolean> {
  console.log(`Publishing ${name}...`)

  const args = ['publish', '--access', 'public']
  if (dryRun) args.push('--dry-run')
  if (otp) args.push('--otp', otp)

  // Use spawn with inherit to allow interactive passkey auth
  const proc = Bun.spawn(['npm', ...args], {
    cwd: dir,
    stdio: ['inherit', 'inherit', 'inherit'],
  })

  const exitCode = await proc.exited

  if (exitCode !== 0) {
    console.error(`  Failed to publish ${name}`)
    return false
  }

  console.log(`  Published ${name}`)
  return true
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const otpArg = args.find((arg) => arg.startsWith('--otp='))
  const otp = otpArg?.split('=')[1]

  if (dryRun) {
    console.log('DRY RUN - No packages will be published\n')
  }

  // First, build all platforms
  console.log('Building all platforms...\n')
  const buildResult = await $`bun scripts/build.ts`.cwd(ROOT).nothrow()
  if (buildResult.exitCode !== 0) {
    console.error('Build failed, aborting publish')
    process.exit(1)
  }

  console.log('\nPublishing platform packages...\n')

  // Publish platform packages first
  for (const platform of PLATFORMS) {
    const pkgDir = path.join(NPM_DIR, platform)
    const binPath = path.join(pkgDir, platform.includes('win32') ? 'sb.exe' : 'sb')

    if (!fs.existsSync(binPath)) {
      console.log(`  Skipping ${platform} (no binary found)`)
      continue
    }

    const success = await publishPackage(pkgDir, `@0xrohan10/stackboi-${platform}`, dryRun, otp)
    if (!success && !dryRun) {
      console.error('Aborting due to publish failure')
      process.exit(1)
    }
  }

  console.log('\nPublishing main package...\n')

  // Publish main package
  const success = await publishPackage(ROOT, 'stackboi', dryRun, otp)
  if (!success) {
    process.exit(1)
  }

  console.log('\nPublish complete!')
}

main()
