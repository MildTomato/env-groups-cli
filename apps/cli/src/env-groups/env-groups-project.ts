import { Config, Data, Effect, FileSystem, Option, Path } from "effect";

import { CommandSettings } from "../config/command-settings.service.ts";
import { readProjectLinkFile } from "../shared/config/project-link.ts";
import {
  actionability,
  type CliErrorActionabilityDeclaration,
  ErrorActionabilityId,
} from "../shared/telemetry/error-actionability.ts";

export class EnvProjectRefRequiredError extends Data.TaggedError("EnvProjectRefRequiredError")<{
  readonly message: string;
}> {
  get [ErrorActionabilityId](): CliErrorActionabilityDeclaration {
    return actionability.missingProjectRef;
  }
}

/**
 * Which project an `env` command acts on: `--project-ref`, then `SUPABASE_PROJECT_ID`, then the
 * linked project (`supabase/.link.json`, or the older `supabase/.temp/project-ref`).
 */
export const resolveEnvProjectRef = Effect.fn("env.resolveProjectRef")(function* (
  flag: Option.Option<string>,
) {
  if (Option.isSome(flag) && flag.value.trim()) return flag.value.trim();
  const fromEnv = yield* Config.option(Config.String("SUPABASE_PROJECT_ID")).pipe(
    Effect.orElseSucceed(() => Option.none<string>()),
  );
  if (Option.isSome(fromEnv) && fromEnv.value.trim()) return fromEnv.value.trim();

  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const settings = yield* CommandSettings;
  const link = yield* readProjectLinkFile(fs, path, settings.workdir).pipe(
    Effect.orElseSucceed(() => Option.none()),
  );
  if (Option.isSome(link)) return link.value.project.ref;
  const legacy = yield* fs
    .readFileString(path.join(settings.workdir, "supabase", ".temp", "project-ref"))
    .pipe(Effect.option);
  if (Option.isSome(legacy) && legacy.value.trim()) return legacy.value.trim();

  return yield* new EnvProjectRefRequiredError({
    message: "No project. Pass --project-ref, or run `supabase link` first.",
  });
});
