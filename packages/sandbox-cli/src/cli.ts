import * as Command from "@effect/cli/Command";
import { NodeContext } from "@effect/platform-node";
import { Console, Effect } from "effect";

import { makeSandboxRuntime } from "./runtime.js";
import { SandboxNotFoundError } from "./sandbox-not-found-error.js";
import { SandboxPreflightError } from "./sandbox-preflight-error.js";
import { formatSandboxViewLines } from "./sandbox-view.js";

const runtime = makeSandboxRuntime();

const upCommand = Command.make("up", {}, () =>
  Effect.tryPromise({
    try: () => runtime.lifecycle.up(),
    catch: (error) => toCliError(error),
  }).pipe(
    Effect.flatMap((result) =>
      printSandboxView(
        "Sandbox ready",
        result.record.hostnameSlug,
        result.urls
      ).pipe(
        Effect.zipRight(
          result.aliasesHealthy
            ? Effect.void
            : Console.log(
                "Portless aliases were unavailable, so loopback URLs are active."
              )
        )
      )
    )
  )
);

const downCommand = Command.make("down", {}, () =>
  Effect.tryPromise({
    try: () => runtime.lifecycle.down(),
    catch: (error) => toCliError(error),
  }).pipe(
    Effect.flatMap((result) =>
      Console.log(`Stopped sandbox ${result.hostnameSlug}.`)
    ),
    Effect.catchTag("SandboxNotFoundError", () =>
      Console.log("No sandbox is registered for this worktree.")
    )
  )
);

const statusCommand = Command.make("status", {}, () =>
  Effect.tryPromise({
    try: () => runtime.lifecycle.status(),
    catch: (error) => toCliError(error),
  }).pipe(
    Effect.flatMap((result) =>
      Console.log(`Sandbox status: ${result.record.status}`).pipe(
        Effect.zipRight(
          printSandboxView(
            "Current sandbox",
            result.record.hostnameSlug,
            result.urls
          )
        )
      )
    ),
    Effect.catchTag("SandboxNotFoundError", () =>
      Console.log("No sandbox is registered for this worktree.")
    )
  )
);

const listCommand = Command.make("list", {}, () =>
  Effect.tryPromise({
    try: () => runtime.lifecycle.list(),
    catch: (error) => toCliError(error),
  }).pipe(
    Effect.flatMap((result) =>
      result.entries.length === 0
        ? Console.log("No sandboxes are currently registered.")
        : Effect.all(
            result.entries.map((entry) =>
              Console.log(
                `${entry.record.hostnameSlug} (${entry.record.status})`
              ).pipe(
                Effect.zipRight(
                  Console.log(`  worktree: ${entry.record.worktreePath}`)
                ),
                Effect.zipRight(Console.log(`  app url: ${entry.urls.app}`)),
                Effect.zipRight(Console.log(`  api url: ${entry.urls.api}`)),
                Effect.zipRight(
                  Console.log(`  postgres url: ${entry.urls.postgres}`)
                )
              )
            ),
            { discard: true }
          )
    )
  )
);

const logsCommand = Command.make("logs", {}, () =>
  Effect.tryPromise({
    try: () => runtime.lifecycle.logs(),
    catch: (error) => toCliError(error),
  }).pipe(
    Effect.flatMap((result) => Console.log(result.content)),
    Effect.catchTag("SandboxNotFoundError", () =>
      Console.log("No sandbox is registered for this worktree.")
    )
  )
);

const urlCommand = Command.make("url", {}, () =>
  Effect.tryPromise({
    try: () => runtime.lifecycle.url(),
    catch: (error) => toCliError(error),
  }).pipe(
    Effect.flatMap((result) =>
      printSandboxView("Sandbox URLs", result.record.hostnameSlug, result.urls)
    ),
    Effect.catchTag("SandboxNotFoundError", () =>
      Console.log("No sandbox is registered for this worktree.")
    )
  )
);

const sandboxCommand = Command.make("sandbox").pipe(
  Command.withSubcommands([
    upCommand,
    downCommand,
    statusCommand,
    listCommand,
    logsCommand,
    urlCommand,
  ])
);

const cli = Command.run(sandboxCommand, {
  name: "Task Tracker Sandbox CLI",
  version: "0.1.0",
});

void runCli();

function printSandboxView(
  label: string,
  hostnameSlug: string,
  urls: {
    app: string;
    api: string;
    postgres: string;
    fallbackApp: string;
    fallbackApi: string;
  }
) {
  return Effect.gen(function* printSandboxViewEffect() {
    for (const line of formatSandboxViewLines(label, hostnameSlug, urls)) {
      yield* Console.log(line);
    }
  });
}

function toCliError(
  error: unknown
): SandboxNotFoundError | SandboxPreflightError {
  if (
    error instanceof SandboxNotFoundError ||
    error instanceof SandboxPreflightError
  ) {
    return error;
  }

  return new SandboxPreflightError({
    message: error instanceof Error ? error.message : "Sandbox command failed",
  });
}

async function runCli(): Promise<void> {
  try {
    await Effect.runPromise(
      cli(process.argv).pipe(Effect.provide(NodeContext.layer))
    );
  } catch (error) {
    if (error instanceof SandboxPreflightError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}
