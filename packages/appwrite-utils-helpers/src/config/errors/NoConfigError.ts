/**
 * Thrown by ConfigManager.loadConfig() when no Appwrite configuration file
 * (.appwrite/config.yaml, appwriteConfig.ts, appwrite.json, …) can be found
 * in the search directory. Distinct from AuthenticationError so callers can
 * decide which "tolerable" outcomes to swallow — some commands legitimately
 * run without a config file (--init, --deployFunctions with argv creds, …)
 * while others (--generate, --syncExtensions) genuinely need one.
 */
export class NoConfigError extends Error {
  constructor(
    public readonly searchedDir: string,
    public readonly searchedFor: string[],
    message?: string
  ) {
    super(
      message ??
        `No Appwrite configuration found in "${searchedDir}".\n` +
          `Searched for: ${searchedFor.join(", ")}.\n` +
          `Suggestion: Create a configuration file using "npx appwrite-migrate --init" or refer to the documentation.`
    );
    this.name = "NoConfigError";
  }
}
