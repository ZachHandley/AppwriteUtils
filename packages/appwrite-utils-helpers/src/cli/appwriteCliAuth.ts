import {
  injectCredentials,
  runAppwriteCli,
  type AppwriteCliCredentials,
} from "./appwriteCliRunner.js";

/**
 * Result of inspecting the current Appwrite CLI auth state via `appwrite whoami`.
 */
export interface CliWhoamiResult {
  /** True if a session/credential is set. */
  authenticated: boolean;
  endpoint?: string;
  projectId?: string;
  /** Email if session auth is in use. */
  email?: string;
}

/**
 * Strip ANSI escape sequences from CLI output so plain text can be regex-scanned.
 */
function stripAnsi(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/\x1B\[[0-9;]*[A-Za-z]/g, "");
}

/**
 * Heuristics for the official CLI's `whoami` output.
 *
 * Notes on output format (see tmp/appwrite-cli/lib/commands/generic.ts):
 *   - When no session is present, the CLI writes "No user is signed in" to stderr
 *     via the `error()` helper and returns with exit code 0.
 *   - When a session exists, the CLI calls `drawTable([{ ID, Name, Email, "MFA enabled", Endpoint }])`.
 *     With `--json`, it calls `console.log(data)` on the same array; this is `util.inspect`
 *     output (JS literal), NOT valid JSON. So we always parse from the rendered text.
 *
 * We:
 *   - Detect the "not signed in" message in stdout or stderr.
 *   - Scan stdout for the first email-shaped token and the first http(s) URL for the endpoint.
 */
function parseWhoamiOutput(stdout: string, stderr: string): CliWhoamiResult {
  const cleanStdout = stripAnsi(stdout);
  const cleanStderr = stripAnsi(stderr);

  const notSignedInPattern = /no user is signed in/i;
  if (
    notSignedInPattern.test(cleanStderr) ||
    notSignedInPattern.test(cleanStdout)
  ) {
    return { authenticated: false };
  }

  const emailMatch = cleanStdout.match(
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  );
  const endpointMatch = cleanStdout.match(/https?:\/\/[^\s│|]+/);

  // If we didn't recover any structured fields, treat as unauthenticated.
  if (!emailMatch && !endpointMatch) {
    return { authenticated: false };
  }

  const result: CliWhoamiResult = { authenticated: true };
  if (endpointMatch) {
    result.endpoint = endpointMatch[0].replace(/[│|]+$/, "").trim();
  }
  if (emailMatch) {
    result.email = emailMatch[0];
  }
  return result;
}

/**
 * Run `appwrite whoami` and return parsed info. Does NOT trigger auth bridging
 * — only reads the current state.
 */
export async function appwriteWhoami(): Promise<CliWhoamiResult> {
  try {
    const result = await runAppwriteCli(["whoami"], {
      skipAuthBridge: true,
      force: false,
      env: { NO_COLOR: "1" },
    });
    return parseWhoamiOutput(result.stdout, result.stderr);
  } catch {
    // Non-zero exit (no session, transport failure, etc.) — treat as unauthenticated.
    return { authenticated: false };
  }
}

/**
 * Run `appwrite login` interactively. Streams to the terminal so the user can
 * complete the prompts. Resolves when the CLI exits.
 *
 * Returns the post-login whoami result.
 */
export async function appwriteLogin(opts?: {
  endpoint?: string;
  /** MFA factor selection (e.g. "totp"). Passed as `--mfa <factor>`. Optional. */
  mfa?: string;
}): Promise<CliWhoamiResult> {
  const args: string[] = ["login"];
  if (opts?.endpoint) {
    args.push("--endpoint", opts.endpoint);
  }
  if (opts?.mfa) {
    args.push("--mfa", opts.mfa);
  }

  await runAppwriteCli(args, {
    stream: true,
    skipAuthBridge: true,
    force: false,
  });

  return appwriteWhoami();
}

/**
 * Run `appwrite logout`. Tolerates the case where no session is active.
 */
export async function appwriteLogout(): Promise<void> {
  try {
    await runAppwriteCli(["logout"], {
      skipAuthBridge: true,
      force: true,
    });
  } catch (err) {
    // No active session, or the CLI failed to reach the server while logging out.
    // Either way we don't want to throw — the caller's intent ("be logged out")
    // is satisfied.
    const message = err instanceof Error ? err.message : String(err);
    if (process.env.DEBUG) {
      // eslint-disable-next-line no-console
      console.debug(`appwrite logout returned non-zero: ${message}`);
    }
  }
}

/**
 * Run `appwrite client` with the given credentials. Sets up non-interactive auth.
 * Equivalent to calling injectCredentials() in appwriteCliRunner, but exposed
 * here so callers can do auth setup as a discrete step without piggy-backing on
 * a delegated command.
 */
export async function appwriteSetClient(
  creds: AppwriteCliCredentials,
): Promise<void> {
  await injectCredentials(creds);
}
