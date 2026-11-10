import { Config, Effect, Option } from "effect";

/**
 * The `env` commands are off unless `SUPABASE_ENV_GROUPS_URL` points at an env-groups server.
 * Without it, the CLI behaves exactly like upstream.
 */
export const resolveEnvGroupsEnabled = Config.option(Config.String("SUPABASE_ENV_GROUPS_URL")).pipe(
  Effect.map((url) => Option.isSome(url) && url.value.trim().length > 0),
  Effect.orElseSucceed(() => false),
);
