#!/usr/bin/env node

import { Args, Command } from "@effect/cli"
import { BunContext, BunRuntime } from "@effect/platform-bun"
import { Effect } from "effect"
import { init } from "./commands/init"
import { newStack } from "./commands/new"
import { addBranch } from "./commands/add"
import { view } from "./commands/view"
import { createPR } from "./commands/createpr"
import { showLicense } from "./commands/license"

// Commands (exported for testing)

export const initCommand = Command.make("init", {}, () =>
  Effect.promise(() => init())
)

export const newCommand = Command.make(
  "new",
  { branchName: Args.text({ name: "branch" }).pipe(Args.optional) },
  ({ branchName }) =>
    Effect.promise(() => newStack({ branchName: branchName._tag === "Some" ? branchName.value : undefined }))
)

export const addCommand = Command.make(
  "add",
  { branchName: Args.text({ name: "branch" }).pipe(Args.optional) },
  ({ branchName }) =>
    Effect.promise(() => addBranch({ branchName: branchName._tag === "Some" ? branchName.value : undefined }))
)

export const viewCommand = Command.make("view", {}, () =>
  Effect.promise(() => view())
)

export const createPrCommand = Command.make(
  "pr",
  { branchName: Args.text({ name: "branch" }).pipe(Args.optional) },
  ({ branchName }) =>
    Effect.promise(async () => {
      const result = await createPR({ branchName: branchName._tag === "Some" ? branchName.value : undefined })
      if (!result.success) {
        throw new Error(result.error)
      }
      console.log(`Created PR #${result.prNumber}`)
    })
)

export const licenseCommand = Command.make(
  "license",
  { type: Args.text({ name: "type" }).pipe(Args.optional) },
  ({ type }) =>
    Effect.promise(() => showLicense(type._tag === "Some" ? type.value : undefined))
)

// Main CLI app (exported for testing)
export const command = Command.make("stackboi", {}).pipe(
  Command.withSubcommands([
    initCommand,
    newCommand,
    addCommand,
    viewCommand,
    createPrCommand,
    licenseCommand,
  ])
)

export const cli = Command.run(command, {
  name: "stackboi",
  version: "0.1.0",
})

// Only run when executed directly (not imported)
if (import.meta.main) {
  cli(process.argv).pipe(Effect.provide(BunContext.layer), BunRuntime.runMain)
}
