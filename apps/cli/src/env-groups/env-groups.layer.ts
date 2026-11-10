import { Config, Effect, FileSystem, Layer, Option, Path, Redacted } from "effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

import { CommandSettings } from "../config/command-settings.service.ts";
import {
  EnvGroupsLoginRequiredError,
  EnvGroupsNetworkError,
  EnvGroupsRequestError,
} from "./env-groups.errors.ts";
import { EnvGroups, type EnvGroupsMethod } from "./env-groups.service.ts";

export const ENV_GROUPS_DEFAULT_URL = "http://localhost:3100";
const TOKEN_FILE = "env-groups-token";

/** Reads env-groups' `{ error: { code, message, details } }` shape, tolerating anything else. */
function readError(status: number, body: unknown): EnvGroupsRequestError {
  const error =
    typeof body === "object" && body !== null && "error" in body
      ? (body as { error: { code?: unknown; message?: unknown; details?: unknown } }).error
      : undefined;
  const details = error?.details;
  const fix =
    typeof details === "object" && details !== null && "fix" in details
      ? (details as { fix?: unknown }).fix
      : undefined;
  return new EnvGroupsRequestError({
    status,
    code: typeof error?.code === "string" ? error.code : "unexpected_status",
    message: typeof error?.message === "string" ? error.message : `env-groups answered ${status}`,
    details,
    fix: Array.isArray(fix) ? fix.filter((f): f is string => typeof f === "string") : undefined,
  });
}

export const envGroupsLayer = Layer.effect(
  EnvGroups,
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const settings = yield* CommandSettings;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const configuredUrl = (yield* Config.option(Config.String("SUPABASE_ENV_GROUPS_URL")).pipe(
      Effect.orElseSucceed(() => Option.none<string>()),
    )).pipe(Option.filter((url) => url.trim().length > 0));
    const baseUrl = configuredUrl.pipe(
      Option.map((url) => url.trim().replace(/\/+$/, "")),
      Option.getOrElse(() => ENV_GROUPS_DEFAULT_URL),
    );
    const envToken = yield* Config.option(Config.Redacted("SUPABASE_ENV_GROUPS_TOKEN")).pipe(
      Effect.orElseSucceed(() => Option.none<Redacted.Redacted<string>>()),
    );
    const tokenPath = path.join(settings.supabaseHome, TOKEN_FILE);

    const readToken = Effect.gen(function* () {
      if (Option.isSome(envToken)) return Option.some(Redacted.value(envToken.value));
      const saved = yield* fs.readFileString(tokenPath).pipe(Effect.option);
      return saved.pipe(
        Option.map((t) => t.trim()),
        Option.filter((t) => t.length > 0),
      );
    });

    const send = (request: HttpClientRequest.HttpClientRequest) =>
      httpClient
        .execute(request.pipe(HttpClientRequest.setHeader("User-Agent", settings.userAgent)))
        .pipe(
          Effect.flatMap((response) =>
            response.text.pipe(
              Effect.map((text) => {
                let body: unknown = undefined;
                try {
                  body = text ? JSON.parse(text) : undefined;
                } catch {
                  body = text;
                }
                return { status: response.status, body };
              }),
            ),
          ),
          Effect.mapError(
            (cause) =>
              new EnvGroupsNetworkError({
                message: `couldn't reach env-groups at ${baseUrl}: ${String(cause)}. Is it running?`,
              }),
          ),
        );

    const call = (method: EnvGroupsMethod, apiPath: string, body: unknown, token?: string) =>
      Effect.gen(function* () {
        let request = HttpClientRequest.make(method)(`${baseUrl}${apiPath}`).pipe(
          HttpClientRequest.acceptJson,
        );
        if (token !== undefined) request = request.pipe(HttpClientRequest.bearerToken(token));
        if (body !== undefined) request = request.pipe(HttpClientRequest.bodyJsonUnsafe(body));
        const response = yield* send(request);
        if (response.status >= 400) return yield* readError(response.status, response.body);
        return response.body;
      });

    return EnvGroups.of({
      enabled: Option.isSome(configuredUrl),
      baseUrl,
      readToken,
      saveToken: (token: string) =>
        Effect.gen(function* () {
          // The folder stays readable (0755) like the CLI's own; the token file is private.
          yield* fs.makeDirectory(settings.supabaseHome, { recursive: true, mode: 0o755 });
          yield* fs.writeFileString(tokenPath, token, { mode: 0o600 });
        }).pipe(
          Effect.mapError(
            (cause) =>
              new EnvGroupsNetworkError({
                message: `couldn't save the env-groups token: ${String(cause)}`,
              }),
          ),
        ),
      request: (method: EnvGroupsMethod, apiPath: string, body?: unknown) =>
        Effect.gen(function* () {
          const token = yield* readToken;
          if (Option.isNone(token)) {
            return yield* new EnvGroupsLoginRequiredError({
              message: "Not signed in to env-groups. Run `supabase login`.",
            });
          }
          return yield* call(method, apiPath, body, token.value);
        }),
      requestPublic: (method: EnvGroupsMethod, apiPath: string, body?: unknown) =>
        call(method, apiPath, body),
    });
  }),
);
