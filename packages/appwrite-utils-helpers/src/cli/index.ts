// Official Appwrite CLI runner with auth bridging
export {
  runAppwriteCli,
  injectCredentials,
  hasCliPrefsFor,
  resolveCredentialsFromEnv,
} from "./appwriteCliRunner.js";
export type {
  AppwriteCliCredentials,
  AppwriteCliRunOptions,
  AppwriteCliResult,
} from "./appwriteCliRunner.js";

// Auth helpers around the official CLI's `login` / `logout` / `whoami` / `client`
export * from "./appwriteCliAuth.js";

// Config bridge between AppwriteUtils sidecar and official appwrite.config.json
export * from "./configBridge.js";

// Per-field credential merge (argv > APPWRITE_* env > sidecar.auth)
export { resolveCliCredentials } from "./resolveCliCredentials.js";
export type { ResolveCliCredentialsInput } from "./resolveCliCredentials.js";

// Per-function/per-site YAML discovery + aggregation into appwrite/{functions,sites}.json
export {
  discoverPerFunctionConfigs,
  discoverPerFunctionConfig,
  buildAggregatedFunctionsJson,
  discoverPerSiteConfigs,
  discoverPerSiteConfig,
  buildAggregatedSitesJson,
} from "./perFunctionAggregator.js";
export type {
  DiscoveredPerFunctionConfig,
  DiscoveredPerSiteConfig,
} from "./perFunctionAggregator.js";
