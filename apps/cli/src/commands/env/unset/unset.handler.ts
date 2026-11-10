import { Effect } from "effect";

import { ensureEnvGroupsLogin } from "../../../env-groups/env-groups-login.ts";
import { resolveEnvProjectRef } from "../../../env-groups/env-groups-project.ts";
import { EnvGroups } from "../../../env-groups/env-groups.service.ts";
import { Output } from "../../../shared/output/output.service.ts";
import { TelemetryState } from "../../../telemetry/telemetry-state.service.ts";
import type { EnvUnsetFlags } from "./unset.command.ts";

export const envUnset = Effect.fn("env.unset")(function* (flags: EnvUnsetFlags) {
  const output = yield* Output;
  const envGroups = yield* EnvGroups;
  const telemetryState = yield* TelemetryState;

  const body = Effect.gen(function* () {
    yield* ensureEnvGroupsLogin;
    const ref = yield* resolveEnvProjectRef(flags.projectRef);
    yield* envGroups.request(
      "DELETE",
      `/api/v1/projects/${encodeURIComponent(ref)}/environments/${encodeURIComponent(flags.environment)}/values/${encodeURIComponent(flags.key)}`,
    );
    yield* output.success(`Removed ${flags.key} from ${flags.environment}.`, {
      project_ref: ref,
      key: flags.key,
      environment: flags.environment,
    });
  });

  return yield* body.pipe(Effect.ensuring(telemetryState.flush));
});
