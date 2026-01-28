#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

const PLATFORMS = {
  'darwin-arm64': '@0xrohan10/stackboi-darwin-arm64',
  'darwin-x64': '@0xrohan10/stackboi-darwin-x64',
  'linux-x64': '@0xrohan10/stackboi-linux-x64',
  'linux-arm64': '@0xrohan10/stackboi-linux-arm64',
  'win32-x64': '@0xrohan10/stackboi-win32-x64',
}

function getPlatformPackage() {
  const platform = process.platform
  const arch = process.arch
  const key = `${platform}-${arch}`

  const pkg = PLATFORMS[key]
  if (!pkg) {
    console.error(`Unsupported platform: ${platform}-${arch}`)
    console.error(`Supported platforms: ${Object.keys(PLATFORMS).join(', ')}`)
    process.exit(1)
  }

  return pkg
}

function getBinaryPath() {
  const pkg = getPlatformPackage()

  try {
    const pkgPath = require.resolve(`${pkg}/package.json`)
    const pkgDir = path.dirname(pkgPath)
    const pkgJson = require(pkgPath)
    const binName = pkgJson.bin?.sb || 'sb'
    return path.join(pkgDir, binName)
  } catch {
    console.error(`Failed to find binary for your platform.`)
    console.error(`Please ensure ${pkg} is installed.`)
    console.error(`Try: npm install ${pkg}`)
    process.exit(1)
  }
}

const binaryPath = getBinaryPath()
const args = process.argv.slice(2)

const result = spawnSync(binaryPath, args, {
  stdio: 'inherit',
  env: process.env,
})

if (result.error) {
  console.error(`Failed to run sb: ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
