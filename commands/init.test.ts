import { test, expect, describe } from 'bun:test'
import { parseGitVersion, createDefaultConfig, CONFIG_FILE } from './init'

describe('parseGitVersion', () => {
  test('parses standard git version string', () => {
    const result = parseGitVersion('git version 2.43.0')
    expect(result).toEqual({ major: 2, minor: 43 })
  })

  test('parses git version with extra info', () => {
    const result = parseGitVersion('git version 2.38.1 (Apple Git-135)')
    expect(result).toEqual({ major: 2, minor: 38 })
  })

  test('returns null for invalid version string', () => {
    const result = parseGitVersion('not a version')
    expect(result).toBeNull()
  })

  test('parses single digit versions', () => {
    const result = parseGitVersion('git version 2.8.0')
    expect(result).toEqual({ major: 2, minor: 8 })
  })
})

describe('createDefaultConfig', () => {
  test('creates config with correct schema', () => {
    const config = createDefaultConfig('main')

    expect(config.version).toBe(1)
    expect(config.stacks).toEqual([])
    expect(config.settings.rerere).toEqual({
      enabled: true,
      autoupdate: true,
    })
    expect(config.settings.defaultBaseBranch).toBe('main')
  })

  test('uses provided default branch', () => {
    const config = createDefaultConfig('develop')
    expect(config.settings.defaultBaseBranch).toBe('develop')
  })

  test('config has all required fields', () => {
    const config = createDefaultConfig('master')

    expect(config).toHaveProperty('version')
    expect(config).toHaveProperty('stacks')
    expect(config).toHaveProperty('settings')
    expect(config.settings).toHaveProperty('rerere')
    expect(config.settings).toHaveProperty('defaultBaseBranch')
    expect(config.settings.rerere).toHaveProperty('enabled')
    expect(config.settings.rerere).toHaveProperty('autoupdate')
  })
})

describe('CONFIG_FILE constant', () => {
  test('is .stackboi.json', () => {
    expect(CONFIG_FILE).toBe('.stackboi.json')
  })
})
