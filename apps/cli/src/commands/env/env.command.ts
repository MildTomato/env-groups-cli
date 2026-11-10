import { Command } from "effect/cli";

import { envListCommand } from "./list/list.command.ts";

/**
 * `supabase env`: environments for a project, through env-groups. Registered only when
 * `SUPABASE_ENV_GROUPS_URL` is set (see `resolveEnvGroupsEnabled`).
 */
export const envCommand = Command.make("env").pipe(
  Command.withDescription(
    "Manage environments through env-groups: set a value once, and every branch on that environment gets it.",
  ),
  Command.withShortDescription("Manage environments (env-groups)"),
  Command.withSubcommands([envListCommand]),
);
