import { Duration, Effect, FileSystem, Option, Path } from "effect";

import { CommandSettings } from "../../../config/command-settings.service.ts";
import { ensureEnvGroupsLogin } from "../../../env-groups/env-groups-login.ts";
import { resolveEnvProjectRef } from "../../../env-groups/env-groups-project.ts";
import { EnvGroupsRequestError } from "../../../env-groups/env-groups.errors.ts";
import { EnvGroups } from "../../../env-groups/env-groups.service.ts";
import { Browser } from "../../../shared/runtime/browser.service.ts";
import { Output } from "../../../shared/output/output.service.ts";
import { TelemetryState } from "../../../telemetry/telemetry-state.service.ts";
import type { EnvCheckFlags } from "./check.command.ts";

type Missing = { key: string; label: string; because: string; command: string };
type CheckResult = {
  needed: { key: string; label: string }[];
  environments: { environment: string; missing: Missing[]; paste_url: string | null }[];
  leaked: { path: string; reason: string }[];
  unneeded_references: string[];
};

const WAIT = Duration.minutes(15);
const POLL_EVERY = Duration.seconds(3);

export const envCheck = Effect.fn("env.check")(function* (flags: EnvCheckFlags) {
  const output = yield* Output;
  const envGroups = yield* EnvGroups;
  const settings = yield* CommandSettings;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const telemetryState = yield* TelemetryState;

  const body = Effect.gen(function* () {
    yield* ensureEnvGroupsLogin;
    const ref = yield* resolveEnvProjectRef(flags.projectRef);
    const environments = flags.environment
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    const configPath = path.join(settings.workdir, "supabase", "config.toml");
    const configText = yield* fs.readFileString(configPath).pipe(
      Effect.mapError(
        () =>
          new EnvGroupsRequestError({
            status: 400,
            code: "no_config",
            message: `No ${configPath}. Run \`supabase init\` first.`,
          }),
      ),
    );

    // The CLI stays thin: env-groups reads the file and works out what it needs.
    let result = (yield* envGroups.request(
      "POST",
      `/api/v1/projects/${encodeURIComponent(ref)}/config/check`,
      {
        config: configText,
        environments,
      },
    )) as CheckResult;

    // Real secrets in the file come first: nothing else matters until they're out.
    if (result.leaked.length > 0) {
      const lines = result.leaked.map((l) => `  ${l.path}: ${l.reason}`).join("\n");
      return yield* new EnvGroupsRequestError({
        status: 422,
        code: "secrets_in_config",
        message:
          `config.toml holds a secret, and secrets never go in config.toml:\n${lines}\n\n` +
          "Remove it from the file, then set it with `supabase env set <setting>`.\n" +
          "Replace that secret where it was made (for example in Resend or Google) too: the file may already be in git history, so treat it as leaked.",
      });
    }
    for (const reference of result.unneeded_references) {
      yield* output.info(
        `${reference} doesn't need an env() pointer: env-groups fills it in. You can remove that line.`,
      );
    }

    const browser = yield* Effect.serviceOption(Browser);
    for (const env of result.environments) {
      if (env.missing.length === 0) continue;
      const list = env.missing
        .map((m) => `  ${m.label} (${m.key}): ${m.because}\n    ${m.command}`)
        .join("\n");
      yield* output.raw(
        `${env.environment} is missing:\n${list}\n  Or paste them here: ${env.paste_url}\n\n`,
        "stderr",
      );

      if (flags.noWait || !output.interactive || !env.paste_url) continue;
      if (Option.isSome(browser)) yield* browser.value.open(env.paste_url);
      const waiting = yield* output.task(`Waiting for ${env.environment}'s values...`);
      const deadline = Date.now() + Duration.toMillis(WAIT);
      let stillMissing = env.missing.length;
      while (stillMissing > 0 && Date.now() < deadline) {
        yield* Effect.sleep(POLL_EVERY);
        const again = (yield* envGroups.request(
          "POST",
          `/api/v1/projects/${encodeURIComponent(ref)}/config/check`,
          {
            config: configText,
            environments: [env.environment],
          },
        )) as CheckResult;
        stillMissing = again.environments[0]?.missing.length ?? 0;
      }
      if (stillMissing > 0) yield* waiting.fail();
      else yield* waiting.clear;
    }
    result = (yield* envGroups.request(
      "POST",
      `/api/v1/projects/${encodeURIComponent(ref)}/config/check`,
      {
        config: configText,
        environments,
      },
    )) as CheckResult;
    const missing = result.environments.filter((e) => e.missing.length > 0);
    if (missing.length > 0) {
      return yield* new EnvGroupsRequestError({
        status: 422,
        code: "missing_keys",
        message: `Still missing on ${missing.map((e) => e.environment).join(", ")}. Set them, then run \`supabase env check\` again.`,
      });
    }
    yield* output.success(
      result.needed.length === 0
        ? "config.toml needs no secrets, and holds none."
        : `All set: ${result.needed.map((n) => n.label).join(", ")} on ${environments.join(", ")}.`,
      { project_ref: ref, needed: result.needed, environments },
    );
  });

  return yield* body.pipe(Effect.ensuring(telemetryState.flush));
});
