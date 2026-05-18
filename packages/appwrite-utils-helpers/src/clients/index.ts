// Single source of truth for constructing Appwrite SDK clients.
export {
  buildAppwriteClient,
  type ClientBuildInput,
} from "./buildAppwriteClient.js";

// Client factory for creating authenticated Appwrite clients
export { ClientFactory } from "./ClientFactory.js";

// Session authentication utilities
// Note: AppwriteSessionPrefs and SessionAuthInfo are also exported from config/services/index.js
// Only exporting the functions here to avoid duplicate type exports
export {
  loadSessionPrefs,
  getSessionAuth,
  isValidSessionCookie,
  getAvailableSessions,
  findSessionByEndpointAndProject,
  hasSessionAuth,
  getAuthenticationStatus,
} from "./sessionAuth.js";

// Legacy client creation functions
export {
  getClientFromConfig,
  getClientWithAuth,
  getClient,
  getAdapterFromConfig,
  getAdapter,
  checkSessionAuth,
} from "./getClientFromConfig.js";
