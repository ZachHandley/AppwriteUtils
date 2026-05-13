import { dirname, isAbsolute, resolve } from "node:path";
import {
  findProjectRoot,
  runAppwriteCli,
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
  await runAppwriteCli(args, {
    cwd: root,
    stream: true,
    force: false,
    credentials: opts.credentials,
  });
}
