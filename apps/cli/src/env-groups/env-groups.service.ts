import type { Effect, Option } from "effect";
import { Context } from "effect";

import type {
  EnvGroupsLoginRequiredError,
  EnvGroupsNetworkError,
  EnvGroupsRequestError,
} from "./env-groups.errors.ts";

export type EnvGroupsMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface EnvGroupsShape {
  /** Whether this CLI talks to env-groups: `SUPABASE_ENV_GROUPS_URL` is set. */
  readonly enabled: boolean;
  /** Where env-groups runs, from `SUPABASE_ENV_GROUPS_URL`. */
  readonly baseUrl: string;
  /** The CLI's env-groups token: `SUPABASE_ENV_GROUPS_TOKEN`, else the saved one. */
  readonly readToken: Effect.Effect<Option.Option<string>>;
  /** Saves the token to `<SUPABASE_HOME>/env-groups-token`, readable only by you. */
  readonly saveToken: (token: string) => Effect.Effect<void, EnvGroupsNetworkError>;
  /** A signed-in call to env-groups' API. Paths start with `/api/`. */
  readonly request: (
    method: EnvGroupsMethod,
    path: string,
    body?: unknown,
  ) => Effect.Effect<
    unknown,
    EnvGroupsLoginRequiredError | EnvGroupsNetworkError | EnvGroupsRequestError
  >;
  /** An unsigned call, for the sign-in steps. */
  readonly requestPublic: (
    method: EnvGroupsMethod,
    path: string,
    body?: unknown,
  ) => Effect.Effect<unknown, EnvGroupsNetworkError | EnvGroupsRequestError>;
}

/**
 * The env-groups service: environments for Supabase projects. The CLI's `env` commands talk
 * to it instead of the Management API; it writes values and config onto branches.
 */
export class EnvGroups extends Context.Service<EnvGroups, EnvGroupsShape>()(
  "supabase/cli/EnvGroups",
) {}
