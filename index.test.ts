import { describe, test, expect } from 'bun:test'
import { $ } from 'bun'

describe('CLI integration', () => {
  test('--help shows usage', async () => {
    const result = await $`bun index.ts --help`.quiet()
    const stdout = result.stdout.toString()
    expect(stdout).toContain('stackboi')
    expect(stdout).toContain('init')
    expect(stdout).toContain('new')
    expect(stdout).toContain('add')
    expect(stdout).toContain('view')
    expect(stdout).toContain('pr')
  })

  test('--version shows version', async () => {
    const result = await $`bun index.ts --version`.quiet()
    expect(result.stdout.toString()).toContain('0.1.0')
  })

  test('new --help shows branch argument', async () => {
    const result = await $`bun index.ts new --help`.quiet()
    const stdout = result.stdout.toString()
    expect(stdout).toContain('branch')
  })

  test('add --help shows branch argument', async () => {
    const result = await $`bun index.ts add --help`.quiet()
    const stdout = result.stdout.toString()
    expect(stdout).toContain('branch')
  })

  test('pr --help shows branch argument', async () => {
    const result = await $`bun index.ts pr --help`.quiet()
    const stdout = result.stdout.toString()
    expect(stdout).toContain('branch')
  })

  test('unknown command shows error', async () => {
    const result = await $`bun index.ts unknown`.quiet().nothrow()
    expect(result.exitCode).not.toBe(0)
  })
})
