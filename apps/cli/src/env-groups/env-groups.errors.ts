import { Data } from "effect";

import {
  actionability,
  type CliErrorActionabilityDeclaration,
  ErrorActionabilityId,
  statusCodeActionability,
} from "../shared/telemetry/error-actionability.ts";

/** env-groups couldn't be reached, or answered with something that isn't JSON. */
export class EnvGroupsNetworkError extends Data.TaggedError("EnvGroupsNetworkError")<{
  readonly message: string;
}> {
  get [ErrorActionabilityId](): CliErrorActionabilityDeclaration {
    return actionability.externalNetwork;
  }
}

/**
 * env-groups refused the request. `code` is its stable error code (`missing_keys`,
 * `production_protected`, `not_connected`, ...); `fix` lists the commands it suggests.
 */
export class EnvGroupsRequestError extends Data.TaggedError("EnvGroupsRequestError")<{
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
  readonly fix?: ReadonlyArray<string>;
}> {
  get [ErrorActionabilityId](): CliErrorActionabilityDeclaration {
    if (this.status === 401) return actionability.authLogin;
    return statusCodeActionability(this.status, { notFoundIsInvalidInput: true });
  }
}

/** No env-groups sign-in yet. */
export class EnvGroupsLoginRequiredError extends Data.TaggedError("EnvGroupsLoginRequiredError")<{
  readonly message: string;
}> {
  get [ErrorActionabilityId](): CliErrorActionabilityDeclaration {
    return actionability.authLogin;
  }
}
