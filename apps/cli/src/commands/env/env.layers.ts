import { Layer } from "effect";

import { httpClientLayer } from "../../auth/http-debug.layer.ts";
import { commandSettingsLayer } from "../../config/command-settings.layer.ts";
import { debugLoggerLayer } from "../../command-internal/debug-logger.layer.ts";
import { envGroupsLayer } from "../../env-groups/env-groups.layer.ts";
import { browserLayer } from "../../shared/runtime/browser.layer.ts";
import { commandRuntimeLayer } from "../../shared/runtime/command-runtime.layer.ts";
import { stdinLayer } from "../../shared/runtime/stdin.layer.ts";
import { telemetryStateLayer } from "../../telemetry/telemetry-state.layer.ts";

/**
 * A lean runtime for the `env` commands. They talk to env-groups, not the Management API, so
 * like `login` they don't build the platform-API client (which needs a Supabase token).
 */
export const envRuntimeLayer = (commandPath: ReadonlyArray<string>) => {
  const settings = commandSettingsLayer.pipe(Layer.provide(debugLoggerLayer));
  const httpClient = httpClientLayer.pipe(Layer.provide(debugLoggerLayer));
  const envGroups = envGroupsLayer.pipe(Layer.provide(httpClient), Layer.provide(settings));
  return Layer.mergeAll(
    settings,
    httpClient,
    envGroups,
    telemetryStateLayer,
    commandRuntimeLayer(commandPath),
    stdinLayer,
    browserLayer,
  );
};
