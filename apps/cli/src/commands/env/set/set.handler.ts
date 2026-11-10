import { Effect, Option } from "effect";

import { ensureEnvGroupsLogin } from "../../../env-groups/env-groups-login.ts";
import { resolveEnvProjectRef } from "../../../env-groups/env-groups-project.ts";
import { EnvGroupsRequestError } from "../../../env-groups/env-groups.errors.ts";
import { EnvGroups } from "../../../env-groups/env-groups.service.ts";
import { Output } from "../../../shared/output/output.service.ts";
import { Stdin } from "../../../shared/runtime/stdin.service.ts";
import { TelemetryState } from "../../../telemetry/telemetry-state.service.ts";
import type { EnvSetFlags } from "./set.command.ts";

export const envSet = Effect.fn("env.set")(function* (flags: EnvSetFlags) {
  const output = yield* Output;
  const envGroups = yield* EnvGroups;
  const stdin = yield* Stdin;
  const telemetryState = yield* TelemetryState;

  const body = Effect.gen(function* () {
    yield* ensureEnvGroupsLogin;
    const ref = yield* resolveEnvProjectRef(flags.projectRef);
    const environments = flags.environment
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    // Never an argument (PRD R2.4): a hidden prompt in a terminal, otherwise piped in.
    const value = stdin.isTTY
      ? yield* output.promptPassword(`Value for ${flags.key} (${environments.join(", ")}):`)
      : Option.getOrElse(yield* stdin.readPipedText, () => "").replace(/\r?\n$/, "");
    if (value.length === 0) {
      return yield* new EnvGroupsRequestError({
        status: 400,
        code: "invalid_request",
        message: `No value for ${flags.key}. Type it at the prompt, or pipe it in.`,
      });
    }

    const result = (yield* envGroups.request(
      "PUT",
      `/api/v1/projects/${encodeURIComponent(ref)}/values`,
      {
        environments,
        values: [{ key: flags.key, value, secret: !flags.visible }],
      },
    )) as { environments: string[]; keys: string[] };

    yield* output.success(`Saved ${flags.key} on ${result.environments.join(", ")}.`, {
      project_ref: ref,
      key: flags.key,
      environments: result.environments,
      secret: !flags.visible,
    });
  });

  return yield* body.pipe(Effect.ensuring(telemetryState.flush));
});
