import { Command, Flag } from "effect/cli";
import type * as CliCommand from "effect/cli/Command";

import { withPermissions } from "../../../command-internal/command-permissions/command-permissions.annotation.ts";
import { compose } from "../../../command-internal/command-permissions/model.ts";
import { withTargetPolicy } from "../../../command-internal/target/target-policy.ts";
import { withJsonErrorHandling } from "../../../shared/output/json-error-handling.ts";
import { withCommandTelemetry } from "../../../telemetry/command-telemetry.ts";
import { projectRefFlag } from "../env.flags.ts";
import { envRuntimeLayer } from "../env.layers.ts";
import { envList } from "./list.handler.ts";

const config = {
  projectRef: projectRefFlag,
  environment: Flag.String("environment").pipe(
    Flag.withDescription("Show one environment's keys. Secrets show by name only."),
    Flag.optional,
  ),
} as const;

export type EnvListFlags = CliCommand.Command.Config.Infer<typeof config>;

export const envListCommand = Command.make("list", config).pipe(
  Command.withDescription(
    "List the project's environments, with how many keys each has and which branches use it. With --environment, list that environment's keys.",
  ),
  Command.withShortDescription("List environments, or one environment's keys"),
  Command.withExamples([
    { command: "supabase env list", description: "Every environment on the linked project" },
    { command: "supabase env list --environment preview", description: "The keys preview has" },
  ]),
  withPermissions(compose({ operations: [], noApiEffectFlags: ["project-ref", "environment"] })),
  Command.withHandler((flags) =>
    envList(flags).pipe(withCommandTelemetry({ flags }), withJsonErrorHandling),
  ),
  Command.provide(envRuntimeLayer(["env", "list"])),
  withTargetPolicy({
    group: "account",
    consent: "none",
    consentExemptReason: "reads env-groups only; writes nothing",
  }),
);
