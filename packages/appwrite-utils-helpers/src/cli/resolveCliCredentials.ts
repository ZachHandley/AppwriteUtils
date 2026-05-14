import type { AppwriteCliCredentials } from "./appwriteCliRunner.js";

export interface ResolveCliCredentialsInput {
  /** Credentials extracted from CLI argv (--endpoint --projectId --apiKey). */
  argv?: {
    endpoint?: string;
    projectId?: string;
    apiKey?: string;
  };
  /** The `auth:` block from a loaded sidecar (AppwriteUtilsExtension.auth). */
  sidecarAuth?: {
    endpoint?: string;
    projectId?: string;
    apiKey?: string;
    sessionCookie?: string;
  };
  /** Override `process.env` for testing. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Merge credential sources by per-field precedence: argv > APPWRITE_* env > sidecar.auth.
 * Returns `undefined` if `endpoint` and `projectId` aren't both resolvable —
 * `runAppwriteCli` will then fall back to `~/.appwrite/prefs.json` short-circuit.
 *
 * Env vars consumed: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY.
 */
export function resolveCliCredentials(
  input?: ResolveCliCredentialsInput
): AppwriteCliCredentials | undefined {
  const argv = input?.argv;
  const sidecarAuth = input?.sidecarAuth;
  const env = input?.env ?? process.env;

  // Treat empty strings as "not set" so an empty argv value can't override env/sidecar.
  const pick = (
    ...candidates: Array<string | undefined>
  ): string | undefined => {
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.length > 0) {
        return candidate;
      }
    }
    return undefined;
  };

  const endpoint = pick(argv?.endpoint, env.APPWRITE_ENDPOINT, sidecarAuth?.endpoint);
  const projectId = pick(argv?.projectId, env.APPWRITE_PROJECT_ID, sidecarAuth?.projectId);
  const apiKey = pick(argv?.apiKey, env.APPWRITE_API_KEY, sidecarAuth?.apiKey);

  if (!endpoint || !projectId) {
    return undefined;
  }

  return {
    endpoint,
    projectId,
    ...(apiKey ? { apiKey } : {}),
  };
}

/**
 * Endpoint-only sibling of {@link resolveCliCredentials}. Returns a credentials
 * object with just `endpoint` populated when `endpoint` alone is resolvable
 * from argv → env → sidecar. Useful before `appwrite init project` runs (no
 * projectId yet) so we can still pre-configure `appwrite client --endpoint`.
 *
 * If a project ID and/or API key are resolvable alongside the endpoint, they
 * are included — the result is a superset of "endpoint-only", never less.
 * Returns `undefined` if no endpoint can be resolved anywhere.
 */
export function resolveEndpoint(
  input?: ResolveCliCredentialsInput
): AppwriteCliCredentials | undefined {
  const argv = input?.argv;
  const sidecarAuth = input?.sidecarAuth;
  const env = input?.env ?? process.env;

  const pick = (
    ...candidates: Array<string | undefined>
  ): string | undefined => {
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.length > 0) {
        return candidate;
      }
    }
    return undefined;
  };

  const endpoint = pick(argv?.endpoint, env.APPWRITE_ENDPOINT, sidecarAuth?.endpoint);
  if (!endpoint) return undefined;

  const projectId = pick(argv?.projectId, env.APPWRITE_PROJECT_ID, sidecarAuth?.projectId);
  const apiKey = pick(argv?.apiKey, env.APPWRITE_API_KEY, sidecarAuth?.apiKey);

  return {
    endpoint,
    ...(projectId ? { projectId } : {}),
    ...(apiKey ? { apiKey } : {}),
  };
}
