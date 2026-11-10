import { Effect, Option } from "effect";

import { ensureEnvGroupsLogin } from "../../../env-groups/env-groups-login.ts";
import { resolveEnvProjectRef } from "../../../env-groups/env-groups-project.ts";
import { EnvGroups } from "../../../env-groups/env-groups.service.ts";
import { Output } from "../../../shared/output/output.service.ts";
import { TelemetryState } from "../../../telemetry/telemetry-state.service.ts";
import { renderTable } from "../env.format.ts";
import type { EnvListFlags } from "./list.command.ts";

type Environment = {
  name: string;
  kind: string;
  key_count: number;
  branch_patterns: string[];
};
type Value = {
  key: string;
  secret: boolean;
  value: string | null;
  version: number;
  inherited_from: string | null;
};

export const envList = Effect.fn("env.list")(function* (flags: EnvListFlags) {
  const output = yield* Output;
  const envGroups = yield* EnvGroups;
  const telemetryState = yield* TelemetryState;

  const body = Effect.gen(function* () {
    yield* ensureEnvGroupsLogin;
    const ref = yield* resolveEnvProjectRef(flags.projectRef);

    if (Option.isSome(flags.environment)) {
      const name = flags.environment.value;
      const values = (yield* envGroups.request(
        "GET",
        `/api/v1/projects/${encodeURIComponent(ref)}/environments/${encodeURIComponent(name)}/values`,
      )) as Value[];
      if (output.format !== "text") {
        yield* output.success("", { project_ref: ref, environment: name, values });
        return;
      }
      if (values.length === 0) {
        yield* output.raw(
          `${name} has no keys yet. Add one with \`supabase env set KEY --environment ${name}\`.\n`,
        );
        return;
      }
      yield* output.raw(
        renderTable(
          ["KEY", "VALUE", "VERSION", "FROM"],
          values.map((v) => [
            v.key,
            v.secret ? "(secret)" : (v.value ?? ""),
            `v${v.version}`,
            v.inherited_from ?? name,
          ]),
        ),
      );
      return;
    }

    const environments = (yield* envGroups.request(
      "GET",
      `/api/v1/projects/${encodeURIComponent(ref)}/environments`,
    )) as Environment[];
    if (output.format !== "text") {
      yield* output.success("", { project_ref: ref, environments });
      return;
    }
    yield* output.raw(
      renderTable(
        ["ENVIRONMENT", "KIND", "KEYS", "BRANCHES"],
        environments.map((e) => [
          e.name,
          e.kind,
          String(e.key_count),
          e.kind === "production"
            ? "production branch"
            : e.kind === "preview"
              ? ["any without a rule", ...e.branch_patterns].join(", ")
              : e.kind === "development"
                ? "local (supabase start)"
                : e.branch_patterns.join(", ") || "none yet",
        ]),
      ),
    );
  });

  return yield* body.pipe(Effect.ensuring(telemetryState.flush));
});
