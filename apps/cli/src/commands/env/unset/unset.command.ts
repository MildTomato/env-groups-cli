import { Argument, Command, Flag } from "effect/cli";
import type * as CliCommand from "effect/cli/Command";

import { withPermissions } from "../../../command-internal/command-permissions/command-permissions.annotation.ts";
import { compose } from "../../../command-internal/command-permissions/model.ts";
import { withTargetPolicy } from "../../../command-internal/target/target-policy.ts";
import { withJsonErrorHandling } from "../../../shared/output/json-error-handling.ts";
import { withCommandTelemetry } from "../../../telemetry/command-telemetry.ts";
import { projectRefFlag } from "../env.flags.ts";
import { envRuntimeLayer } from "../env.layers.ts";
import { envUnset } from "./unset.handler.ts";

const config = {
  key: Argument.String("KEY").pipe(Argument.withDescription("The key to remove.")),
  projectRef: projectRefFlag,
  environment: Flag.String("environment").pipe(
    Flag.withDescription("Where to remove it from."),
    Flag.withDefault("preview"),
  ),
} as const;

export type EnvUnsetFlags = CliCommand.Command.Config.Infer<typeof config>;

export const envUnsetCommand = Command.make("unset", config).pipe(
  Command.withDescription("Remove a value from an environment."),
  Command.withShortDescription("Remove a value from an environment"),
  Command.withExamples([
    {
      command: "supabase env unset STRIPE_SECRET_KEY --environment preview",
      description: "Remove it from preview",
    },
  ]),
  withPermissions(compose({ operations: [], noApiEffectFlags: ["project-ref", "environment"] })),
  Command.withHandler((flags) =>
    envUnset(flags).pipe(withCommandTelemetry({ flags }), withJsonErrorHandling),
  ),
  Command.provide(envRuntimeLayer(["env", "unset"])),
  withTargetPolicy({
    group: "account",
    consent: "none",
    consentExemptReason: "writes env-groups only, never the project directly",
  }),
);
