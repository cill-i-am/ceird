import { fileURLToPath } from "node:url";

import * as Command from "@effect/cli/Command";
import * as Options from "@effect/cli/Options";
import { NodeContext } from "@effect/platform-node";
import type {
  ComposeProjectNameType as ComposeProjectName,
  MissingSandboxResource,
  SandboxNameType as SandboxName,
  SandboxStatus,
  SandboxUrls,
} from "@task-tracker/sandbox-core";
import { validateSandboxName } from "@task-tracker/sandbox-core";
import { Cause, Console, Effect, Exit, Option } from "effect";

import { SandboxProcessService } from "./process.js";
import { SandboxLifecycleService } from "./runtime.js";
import {
  SANDBOX_NOT_FOUND_ERROR_TAG,
  SandboxNotFoundError,
} from "./sandbox-not-found-error.js";
import {
  SandboxPreflightError,
  toSandboxPreflightError,
} from "./sandbox-preflight-error.js";
import {
  formatSandboxStartupProgressLine,
  formatSandboxViewLines,
} from "./sandbox-view.js";
import type { SandboxStartupProgressEvent } from "./startup-progress.js";
import { detectSandboxTerminalStyle } from "./terminal-style.js";

const terminalStyle = detectSandboxTerminalStyle();
const nameOption = Options.text("name").pipe(
  Options.withAlias("n"),
  Options.optional
);
const serviceOption = Options.text("service").pipe(Options.optional);

const upCommand = Command.make("up", { name: nameOption }, ({ name }) =>
  parseSandboxNameOption(name).pipe(
    Effect.tap(() => Console.log("Starting sandbox...")),
    Effect.flatMap((explicitSandboxName) =>
      SandboxLifecycleService.up({
        explicitSandboxName,
        reportProgress: printSandboxStartupProgress,
      })
    ),
    Effect.flatMap((result) =>
      printSandboxView("Sandbox ready", result.record, result.urls)
    )
  )
);

const downCommand = Command.make("down", { name: nameOption }, ({ name }) =>
  parseSandboxNameOption(name).pipe(
    Effect.flatMap((explicitSandboxName) =>
      SandboxLifecycleService.down({
        explicitSandboxName,
      })
    ),
    Effect.flatMap((result) =>
      Console.log(`Stopped sandbox ${result.sandboxName}.`)
    ),
    Effect.catchTag(SANDBOX_NOT_FOUND_ERROR_TAG, () =>
      Console.log("No sandbox is registered for this worktree or name.")
    )
  )
);

const statusCommand = Command.make("status", { name: nameOption }, ({ name }) =>
  parseSandboxNameOption(name).pipe(
    Effect.flatMap((explicitSandboxName) =>
      SandboxLifecycleService.status({
        explicitSandboxName,
      })
    ),
    Effect.flatMap((result) =>
      printSandboxView("Current sandbox", result.record, result.urls)
    ),
    Effect.catchTag(SANDBOX_NOT_FOUND_ERROR_TAG, () =>
      Console.log("No sandbox is registered for this worktree or name.")
    )
  )
);

const listCommand = Command.make("list", {}, () =>
  SandboxLifecycleService.list().pipe(
    Effect.flatMap((result) =>
      result.entries.length === 0
        ? Console.log("No sandboxes are currently registered.")
        : Effect.forEach(
            result.entries,
            (entry) =>
              printSandboxView(
                `${entry.record.sandboxName} (${entry.record.status})`,
                entry.record,
                entry.urls
              ),
            { discard: true }
          )
    )
  )
);

const logsCommand = Command.make(
  "logs",
  { name: nameOption, service: serviceOption },
  ({ name, service }) =>
    parseSandboxNameOption(name).pipe(
      Effect.flatMap((explicitSandboxName) =>
        parseServiceOption(service).pipe(
          Effect.flatMap((parsedService) =>
            SandboxLifecycleService.logs({
              explicitSandboxName,
              service: parsedService,
            })
          )
        )
      ),
      Effect.flatMap((result) => Console.log(result.content)),
      Effect.catchTag(SANDBOX_NOT_FOUND_ERROR_TAG, () =>
        Console.log("No sandbox is registered for this worktree or name.")
      )
    )
);

const urlCommand = Command.make("url", { name: nameOption }, ({ name }) =>
  parseSandboxNameOption(name).pipe(
    Effect.flatMap((explicitSandboxName) =>
      SandboxLifecycleService.url({
        explicitSandboxName,
      })
    ),
    Effect.flatMap((result) =>
      printSandboxView("Sandbox URLs", result.record, result.urls)
    ),
    Effect.catchTag(SANDBOX_NOT_FOUND_ERROR_TAG, () =>
      Console.log("No sandbox is registered for this worktree or name.")
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
  version: "0.2.0",
});

function printSandboxView(
  label: string,
  record: {
    readonly sandboxName: SandboxName;
    readonly composeProjectName: ComposeProjectName;
    readonly status: SandboxStatus;
  },
  urls: SandboxUrls
) {
  return Effect.forEach(
    formatSandboxViewLines(label, record, urls),
    (line) => Console.log(line),
    { discard: true }
  );
}

function printSandboxStartupProgress(
  event: SandboxStartupProgressEvent
): Effect.Effect<void, never, never> {
  return Console.log(formatSandboxStartupProgressLine(event, terminalStyle));
}

export function parseServiceOption(
  service: Option.Option<string>
): Effect.Effect<
  MissingSandboxResource | undefined,
  SandboxPreflightError,
  never
> {
  if (Option.isNone(service)) {
    return Effect.void.pipe(
      Effect.as(undefined as MissingSandboxResource | undefined)
    );
  }

  return service.value === "app" ||
    service.value === "api" ||
    service.value === "postgres"
    ? Effect.succeed(service.value)
    : Effect.fail(
        new SandboxPreflightError({
          message: `Invalid service '${service.value}'. Expected one of: app, api, postgres.`,
        })
      );
}

function parseSandboxNameOption(
  name: Option.Option<string>
): Effect.Effect<SandboxName | undefined, SandboxPreflightError, never> {
  if (Option.isNone(name)) {
    return Effect.void.pipe(Effect.as(undefined as SandboxName | undefined));
  }

  return Effect.try({
    try: () => validateSandboxName(name.value),
    catch: (error) =>
      toSandboxPreflightError(error, {
        message: "Sandbox name is invalid.",
        preserveMessage: true,
      }),
  });
}

export function getSandboxPreflightMessage(
  exit: Exit.Exit<unknown, unknown>
): string | undefined {
  if (Exit.isSuccess(exit)) {
    return undefined;
  }

  const failure = Cause.failureOption(exit.cause);
  return Option.isSome(failure) &&
    failure.value instanceof SandboxPreflightError
    ? failure.value.message
    : undefined;
}

function runCli() {
  return Effect.gen(function* () {
    const argv = (yield* SandboxProcessService.argv()).filter(
      (argument, index) => !(index > 1 && argument === "--")
    );
    const exit = yield* cli(argv).pipe(
      Effect.provide(NodeContext.layer),
      Effect.exit
    );
    const preflightMessage = getSandboxPreflightMessage(exit);

    if (preflightMessage) {
      yield* Console.error(preflightMessage);
      yield* SandboxProcessService.setExitCode(1);
      return;
    }

    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      const message =
        Option.isSome(failure) && failure.value instanceof SandboxNotFoundError
          ? failure.value.message
          : Cause.squash(exit.cause);
      yield* Console.error(
        message instanceof Error ? message.message : String(message)
      );
      yield* SandboxProcessService.setExitCode(1);
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void Effect.runPromise(
    runCli().pipe(
      Effect.provide(SandboxLifecycleService.Default),
      Effect.provide(SandboxProcessService.Default)
    )
  );
}
