import { dirname, isAbsolute, resolve } from "node:path";
import {
  findProjectRoot,
  loadExtensionConfig,
  resolveEndpoint,
  runAppwriteCli,
  MessageFormatter,
  type AppwriteCliCredentials,
} from "appwrite-utils-helpers";

export interface PassthroughOptions {
  credentials?: AppwriteCliCredentials;
  /**
   * Explicit sidecar path from --config <path>. When set,
   * dirname(resolve(configPath)) is the project root and findProjectRoot is skipped.
   */
  configPath?: string;
}

/**
 * Forward an arbitrary appwrite CLI invocation through our auth bridge.
 * Example: `appwrite-migrate --passthrough -- functions list` → `appwrite functions list`
 */
export async function runPassthrough(args: string[], opts: PassthroughOptions): Promise<void> {
  if (args.length === 0) {
    throw new Error("--passthrough requires at least one argument after `--` (e.g. `--passthrough -- functions list`)");
  }
  let root: string;
  if (opts.configPath) {
    // Explicit --config overrides root discovery
    const absolute = isAbsolute(opts.configPath) ? opts.configPath : resolve(process.cwd(), opts.configPath);
    root = dirname(absolute);
  } else {
    ({ root } = await findProjectRoot());
  }

  // Layer argv → env → sidecar.auth so passthrough always points at the
  // intended Appwrite server. `resolveEndpoint` returns a creds object whenever
  // an endpoint can be found, even without a project ID.
  let sidecarAuth:
    | { endpoint?: string; projectId?: string; apiKey?: string; sessionCookie?: string }
    | undefined;
  try {
    const loaded = await loadExtensionConfig({ cwd: root, resolveOfficial: false });
    sidecarAuth = (loaded.ext as { auth?: typeof loaded.ext.auth }).auth;
  } catch {
    sidecarAuth = undefined;
  }
  const resolvedCreds = resolveEndpoint({
    argv: opts.credentials,
    sidecarAuth,
  });
  if (resolvedCreds) {
    MessageFormatter.info(
      `Configuring appwrite client → ${resolvedCreds.endpoint}`,
      { prefix: "Passthrough" }
    );
  }

  await runAppwriteCli(args, {
    cwd: root,
    stream: true,
    force: false,
    credentials: resolvedCreds ?? opts.credentials,
  });
}
