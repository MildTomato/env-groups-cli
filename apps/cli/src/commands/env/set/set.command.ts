import { Argument, Command, Flag } from "effect/cli";
import type * as CliCommand from "effect/cli/Command";

import { withPermissions } from "../../../command-internal/command-permissions/command-permissions.annotation.ts";
import { compose } from "../../../command-internal/command-permissions/model.ts";
import { withTargetPolicy } from "../../../command-internal/target/target-policy.ts";
import { withJsonErrorHandling } from "../../../shared/output/json-error-handling.ts";
import { withCommandTelemetry } from "../../../telemetry/command-telemetry.ts";
import { projectRefFlag } from "../env.flags.ts";
import { envRuntimeLayer } from "../env.layers.ts";
import { envSet } from "./set.handler.ts";

const config = {
  key: Argument.String("KEY").pipe(
    Argument.withDescription(
      "The key, like STRIPE_SECRET_KEY, or a setting like auth.email.smtp.pass.",
    ),
  ),
  projectRef: projectRefFlag,
  environment: Flag.String("environment").pipe(
    Flag.withDescription("Where to set it. Several at once with commas: preview,development."),
    Flag.withDefault("preview"),
  ),
  visible: Flag.Boolean("visible").pipe(
    Flag.withDescription("Store it as a visible value instead of a secret."),
    Flag.withDefault(false),
  ),
} as const;

export type EnvSetFlags = CliCommand.Command.Config.Infer<typeof config>;

export const envSetCommand = Command.make("set", config).pipe(
  Command.withDescription(
    "Set a value on one or more environments. You type the value at a hidden prompt, or pipe it in; it's never a command-line argument.",
  ),
  Command.withShortDescription("Set a value on one or more environments"),
  Command.withExamples([
    { command: "supabase env set STRIPE_SECRET_KEY", description: "Set it on preview" },
    {
      command: "supabase env set OPENAI_API_KEY --environment preview,development",
      description: "Set it on two environments at once",
    },
    {
      command: "echo -n https://example.com | supabase env set SITE_URL --visible",
      description: "Pipe a visible value in",
    },
  ]),
  withPermissions(
    compose({ operations: [], noApiEffectFlags: ["project-ref", "environment", "visible"] }),
  ),
  Command.withHandler((flags) =>
    envSet(flags).pipe(withCommandTelemetry({ flags }), withJsonErrorHandling),
  ),
  Command.provide(envRuntimeLayer(["env", "set"])),
  withTargetPolicy({
    group: "account",
    consent: "none",
    consentExemptReason: "writes env-groups only, never the project directly",
  }),
);
