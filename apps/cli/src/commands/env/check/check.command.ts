import { Command, Flag } from "effect/cli";
import type * as CliCommand from "effect/cli/Command";

import { withPermissions } from "../../../command-internal/command-permissions/command-permissions.annotation.ts";
import { compose } from "../../../command-internal/command-permissions/model.ts";
import { withTargetPolicy } from "../../../command-internal/target/target-policy.ts";
import { withJsonErrorHandling } from "../../../shared/output/json-error-handling.ts";
import { withCommandTelemetry } from "../../../telemetry/command-telemetry.ts";
import { projectRefFlag } from "../env.flags.ts";
import { envRuntimeLayer } from "../env.layers.ts";
import { envCheck } from "./check.handler.ts";

const config = {
  projectRef: projectRefFlag,
  environment: Flag.String("environment").pipe(
    Flag.withDescription("Which environments to check, with commas."),
    Flag.withDefault("production,preview"),
  ),
  noWait: Flag.Boolean("no-wait").pipe(
    Flag.withDescription("List what's missing instead of opening the paste page and waiting."),
    Flag.withDefault(false),
  ),
} as const;

export type EnvCheckFlags = CliCommand.Command.Config.Infer<typeof config>;

export const envCheckCommand = Command.make("check", config).pipe(
  Command.withDescription(
    "Check config.toml against env-groups: which secrets the features you turned on need, which are missing, and whether any real secret was written into the file.",
  ),
  Command.withShortDescription("Check what config.toml needs, and that it holds no secrets"),
  Command.withExamples([
    { command: "supabase env check", description: "Check production and preview" },
  ]),
  withPermissions(
    compose({ operations: [], noApiEffectFlags: ["project-ref", "environment", "no-wait"] }),
  ),
  Command.withHandler((flags) =>
    envCheck(flags).pipe(withCommandTelemetry({ flags }), withJsonErrorHandling),
  ),
  Command.provide(envRuntimeLayer(["env", "check"])),
  withTargetPolicy({
    group: "account",
    consent: "none",
    consentExemptReason: "reads env-groups; writes nothing",
  }),
);
