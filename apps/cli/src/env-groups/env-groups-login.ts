import { hostname } from "node:os";

import { Effect, Option } from "effect";

import { Output } from "../shared/output/output.service.ts";
import { EnvGroupsLoginRequiredError, EnvGroupsRequestError } from "./env-groups.errors.ts";
import { EnvGroups } from "./env-groups.service.ts";

const MAX_CODE_ATTEMPTS = 3;

function read(body: unknown, key: string): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

/** The email the saved env-groups token belongs to, or none when there isn't a working one. */
const currentEmail = Effect.gen(function* () {
  const envGroups = yield* EnvGroups;
  if (Option.isNone(yield* envGroups.readToken)) return Option.none<string>();
  return yield* envGroups.request("GET", "/api/v1/me").pipe(
    Effect.map((me) => Option.fromNullishOr(read(me, "email"))),
    Effect.orElseSucceed(() => Option.none<string>()),
  );
});

/**
 * Signs the CLI in to env-groups by email code: asks for your email, env-groups emails a
 * 6-digit code, you type it in. The CLI keeps its own token for env-groups, separate from
 * your Supabase token.
 */
export const envGroupsSignIn = Effect.fn("envGroups.signIn")(function* () {
  const output = yield* Output;
  const envGroups = yield* EnvGroups;

  const email = yield* output.promptText("Your @supabase.io email, for env-groups:", {
    validate: (v) =>
      /^[^@\s]+@supabase\.io$/i.test(v.trim()) ? undefined : "Use your @supabase.io email.",
  });
  yield* envGroups.requestPublic("POST", "/api/cli/otp", { email: email.trim() });
  yield* output.info(`We emailed a 6-digit code to ${email.trim()}.`);

  for (let attempt = 1; ; attempt++) {
    const code = yield* output.promptText("Code:", {
      validate: (v) => (/^\d{6}$/.test(v.replace(/\s/g, "")) ? undefined : "Enter the 6 digits."),
    });
    const result = yield* envGroups
      .requestPublic("POST", "/api/cli/otp/verify", {
        email: email.trim(),
        code,
        token_name: `Supabase CLI on ${hostname()}`,
      })
      .pipe(
        Effect.map(Option.some),
        Effect.catchTag("EnvGroupsRequestError", (error) =>
          error.code === "unauthorized" && attempt < MAX_CODE_ATTEMPTS
            ? output
                .warn(`${error.message} (${attempt}/${MAX_CODE_ATTEMPTS})`)
                .pipe(Effect.as(Option.none()))
            : Effect.fail(error),
        ),
      );
    if (Option.isNone(result)) continue;
    const token = read(result.value, "access_token");
    if (!token) {
      return yield* new EnvGroupsRequestError({
        status: 500,
        code: "no_token",
        message: "env-groups accepted the code but sent no token.",
      });
    }
    yield* envGroups.saveToken(token);
    return read(result.value, "email") ?? email.trim();
  }
});

/**
 * The extra step at the end of `supabase login` in this fork. Already signed in: nothing to
 * do. Not in a terminal: say how to finish, since a code can't be typed in.
 */
export const envGroupsLoginStep = Effect.gen(function* () {
  // Optional, so upstream `login` (and its tests) run unchanged without env-groups.
  const maybeEnvGroups = yield* Effect.serviceOption(EnvGroups);
  if (Option.isNone(maybeEnvGroups) || !maybeEnvGroups.value.enabled) return;
  const output = yield* Output;

  const signedIn = yield* currentEmail;
  if (Option.isSome(signedIn)) {
    yield* output.info(`Signed in to env-groups as ${signedIn.value}.`);
    return;
  }
  if (!output.interactive) {
    yield* output.warn(
      "Not signed in to env-groups. Run `supabase login` in a terminal, or set SUPABASE_ENV_GROUPS_TOKEN.",
    );
    return;
  }
  const email = yield* envGroupsSignIn();
  yield* output.info(`Signed in to env-groups as ${email}.`);
}).pipe(
  Effect.provideServiceEffect(
    EnvGroups,
    Effect.serviceOption(EnvGroups).pipe(Effect.flatMap(Effect.fromOption)),
  ),
  Effect.catchTag("NoSuchElementError", () => Effect.void),
);

/**
 * Every `env` command starts here: makes sure the CLI is signed in to env-groups, signing in
 * on the spot when there's a terminal to type a code into.
 */
export const ensureEnvGroupsLogin = Effect.gen(function* () {
  const output = yield* Output;
  if (Option.isSome(yield* currentEmail)) return;
  if (!output.interactive) {
    return yield* new EnvGroupsLoginRequiredError({
      message:
        "Not signed in to env-groups. Run `supabase login`, or set SUPABASE_ENV_GROUPS_TOKEN.",
    });
  }
  yield* output.info("Sign in to env-groups first.");
  yield* envGroupsSignIn();
});
