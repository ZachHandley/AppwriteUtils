/**
 * Single source of truth for constructing the Appwrite node-SDK `Client`.
 *
 * Before this existed, EIGHT call sites in the helpers package independently
 * open-coded the same `new Client().setEndpoint().setProject() +
 * headers['cookie'] + X-Appwrite-Mode: admin` dance — meaning any change to
 * the wire shape (new header, mode-detection tweak, etc.) had to be made in
 * eight places. The probe paths (testSession, probeCredentials,
 * versionDetection) and the production paths (ClientFactory, ConfigManager,
 * AdapterFactory) duplicated each other, so a subtle inconsistency between
 * "what we use to test if a cookie works" and "what we use to push" was
 * always a refactor away from happening.
 *
 * This module fixes that: every Client now flows through `buildAppwriteClient`.
 *
 * Wire-shape rules (do NOT change without grepping every call site):
 *  - Cookie auth → raw `headers['cookie']` (full HTTP Cookie string from
 *    `~/.appwrite/prefs.json`) + `X-Appwrite-Mode: admin`. NEVER `setSession()`
 *    — the SDK's setSession only attaches the SDK's own cookie name, doesn't
 *    reproduce what the official `appwrite` CLI writes.
 *  - API key auth → `client.setKey(key)` + `X-Appwrite-Mode: default`.
 *  - Cookie wins over API key in "auto" mode (mirrors ClientFactory's
 *    pre-refactor preference at the original ClientFactory.ts:147-160).
 *
 * @packageDocumentation
 */

import { Client } from "node-appwrite";

/**
 * Inputs for constructing (or rebinding) an Appwrite SDK client.
 */
export interface ClientBuildInput {
  /** Appwrite endpoint URL (e.g. `https://cloud.appwrite.io/v1`). */
  endpoint: string;
  /** Project ID this client targets. */
  projectId: string;
  /** Optional API key for non-session authentication. */
  apiKey?: string;
  /** Optional full HTTP Cookie header string (e.g. `a_session_console=...`). */
  sessionCookie?: string;
  /**
   * Authentication preference. Defaults to `"auto"`:
   *   - `"session"`: only use the cookie. Throws (caller's responsibility to check) if missing.
   *   - `"apikey"`: only use the API key. Caller must ensure it's present.
   *   - `"auto"`: prefer cookie when present, fall back to API key.
   */
  authMethod?: "session" | "apikey" | "auto";
  /**
   * When provided, rebind THIS client's endpoint/project/headers instead of
   * constructing a new instance. Used by probe loops (e.g. testSession
   * iterating over candidate cookies) so the same client identity survives
   * across attempts and into the eventual production operation.
   */
  reuse?: Client;
}

/**
 * Construct or rebind an Appwrite SDK Client with the canonical wire shape.
 *
 * Returns the client (the same instance as `input.reuse` if provided). Does
 * NOT verify auth — the result is "configured but unverified." Callers that
 * need verification should run a probe (`SessionAuthService.testSession`) or
 * call `ClientFactory.verifyAuthentication`.
 */
export function buildAppwriteClient(input: ClientBuildInput): Client {
  const client = input.reuse ?? new Client();
  client.setEndpoint(input.endpoint).setProject(input.projectId);

  // Clear any prior cookie/mode headers when rebinding — otherwise stale
  // headers from a previous candidate session leak into the new attempt.
  // The set-or-clear assignment below handles both new and reuse paths.
  const headers = client.headers as Record<string, string>;

  const authMethod = input.authMethod ?? "auto";
  const cookie = input.sessionCookie?.trim();
  const key = input.apiKey?.trim();

  const useCookie =
    authMethod === "session" ||
    (authMethod !== "apikey" && !!cookie);

  if (useCookie && cookie) {
    headers["cookie"] = cookie;
    headers["X-Appwrite-Mode"] = "admin";
    // Strip any prior API-key state (no-op for fresh clients; relevant when
    // rebinding from a previous apikey-mode build).
    delete headers["X-Appwrite-Key"];
  } else if ((authMethod === "apikey" || authMethod === "auto") && key) {
    client.setKey(key);
    headers["X-Appwrite-Mode"] = "default";
    // Strip any prior cookie state.
    delete headers["cookie"];
  } else {
    // No usable auth supplied. Caller's responsibility — we return a
    // bare endpoint+project client. Probes will fail authentication;
    // production paths should have already checked for this and surfaced
    // the "No authentication method available" diagnostic.
    delete headers["cookie"];
    delete headers["X-Appwrite-Mode"];
    delete headers["X-Appwrite-Key"];
  }

  return client;
}
