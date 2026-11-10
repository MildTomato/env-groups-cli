import { Duration, Effect, FileSystem, Option, Path } from "effect";

import { CommandSettings } from "../config/command-settings.service.ts";
import { Browser } from "../shared/runtime/browser.service.ts";
import { Output } from "../shared/output/output.service.ts";
import { ensureEnvGroupsLogin } from "./env-groups-login.ts";
import { resolveEnvProjectRef } from "./env-groups-project.ts";
import { EnvGroups } from "./env-groups.service.ts";

const WAIT = Duration.minutes(10);
const POLL_EVERY = Duration.seconds(3);

type Repo = { full_name: string; project_ref: string | null };

/** `owner/repo` from the folder's `origin` remote, when it's on GitHub. */
const githubRepoOfWorkdir = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const settings = yield* CommandSettings;
  const gitConfig = yield* fs
    .readFileString(path.join(settings.workdir, ".git", "config"))
    .pipe(Effect.option);
  if (Option.isNone(gitConfig)) return Option.none<string>();
  const origin = /\[remote "origin"\][^[]*?url\s*=\s*(\S+)/.exec(gitConfig.value)?.[1];
  const match = origin ? /github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(origin) : null;
  return Option.fromNullishOr(match?.[1]);
});

/**
 * The extra step at the end of `supabase link` in this fork: connect the folder's GitHub repo
 * to the project through env-groups' GitHub app. Installs the app first when it isn't on the
 * repo yet (that page needs your browser), then links. Off without SUPABASE_ENV_GROUPS_URL.
 */
export const envGroupsLinkRepoStep = Effect.gen(function* () {
  const maybeEnvGroups = yield* Effect.serviceOption(EnvGroups);
  if (Option.isNone(maybeEnvGroups) || !maybeEnvGroups.value.enabled) return;
  const envGroups = maybeEnvGroups.value;
  const output = yield* Output;

  const repoName = yield* githubRepoOfWorkdir;
  if (Option.isNone(repoName)) {
    yield* output.info("No GitHub remote here, so the env-groups GitHub app isn't connected.");
    return;
  }
  const ref = yield* resolveEnvProjectRef(Option.none());
  yield* ensureEnvGroupsLogin;

  const findRepo = envGroups
    .request("GET", "/api/v1/github/repositories")
    .pipe(
      Effect.map((repos) =>
        (repos as Repo[]).find((r) => r.full_name.toLowerCase() === repoName.value.toLowerCase()),
      ),
    );

  let repo = yield* findRepo;
  if (repo === undefined) {
    const installUrl = `${envGroups.baseUrl}/github/install`;
    if (!output.interactive) {
      yield* output.warn(
        `Install the env-groups GitHub app on ${repoName.value}, then run \`supabase link\` again: ${installUrl}`,
      );
      return;
    }
    yield* output.raw(
      `Install the env-groups GitHub app on ${repoName.value}:\n  ${installUrl}\n\n`,
      "stderr",
    );
    const browser = yield* Effect.serviceOption(Browser);
    if (Option.isSome(browser)) yield* browser.value.open(installUrl);
    const waiting = yield* output.task("Waiting for the GitHub app...");
    const deadline = Date.now() + Duration.toMillis(WAIT);
    while (repo === undefined && Date.now() < deadline) {
      yield* Effect.sleep(POLL_EVERY);
      repo = yield* findRepo;
    }
    if (repo === undefined) {
      yield* waiting.fail();
      yield* output.warn(`The app wasn't installed on ${repoName.value} within 10 minutes.`);
      return;
    }
    yield* waiting.clear;
  }

  if (repo.project_ref === ref) {
    yield* output.info(`${repo.full_name} is connected to this project through env-groups.`);
    return;
  }
  yield* envGroups.request("PUT", "/api/v1/github/repositories", {
    full_name: repo.full_name,
    project_ref: ref,
  });
  yield* output.info(
    `Connected ${repo.full_name} to this project. env-groups now checks its pull requests and deploys its pushes.`,
  );
});
