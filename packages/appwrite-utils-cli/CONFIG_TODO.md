# ConfigManager Implementation - Complete Execution Plan

## 🎯 Mission
Implement a centralized ConfigManager singleton to eliminate redundant initialization, fix spammy logs, and provide single source of truth for configuration management.

## 📊 Current Problems
- ❌ Config loaded 6+ times per operation
- ❌ Auth logs spam console with duplicate messages
- ❌ No caching - files read repeatedly
- ❌ Session state scattered across codebase
- ❌ UtilsController recreated instead of singleton

## ✅ Expected Results
- ✅ Single initialization per CLI session
- ✅ 40-60% reduction in initialization overhead
- ✅ 90%+ reduction in file I/O (session caching)
- ✅ Clean console output (1 message instead of 6+)
- ✅ Automatic session preservation
- ✅ ~150+ lines of duplicate code removed

---

# 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   ConfigManager                          │
│                   (Singleton)                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Uses:                                                   │
│  - ConfigDiscoveryService (find config files)           │
│  - ConfigLoaderService (load & parse)                   │
│  - SessionAuthService (manage sessions with caching)    │
│  - ConfigValidationService (validate config)            │
│  - ConfigMergeService (merge sources)                   │
│                                                          │
│  Provides:                                              │
│  - getInstance() - Singleton access                     │
│  - loadConfig() - Load with caching                     │
│  - getConfig() - Fast synchronous access                │
│  - reloadConfig() - Reload with session preservation    │
│  - getSession() - Session info                          │
│  - validateConfig() - Built-in validation               │
│                                                          │
└─────────────────────────────────────────────────────────┘
           │
           │ Used by
           ▼
┌─────────────────────────────────────────────────────────┐
│              UtilsController                            │
│              (Also Singleton)                           │
├─────────────────────────────────────────────────────────┤
│  - getInstance() - Get singleton                        │
│  - Uses ConfigManager internally                        │
│  - Uses ClientFactory for client/adapter                │
│  - Caches adapter reference                             │
└─────────────────────────────────────────────────────────┘
```

---

# 📋 Phase Breakdown with Agent Assignments

## Phase 1: Service Layer Foundation
**Can run in parallel** - No interdependencies

### 🤖 Agent 1: ConfigDiscoveryService + ConfigLoaderService
**Type**: typescript-master
**Estimated LOC**: 600-800 lines total

#### Files to Create:
1. `src/config/services/ConfigDiscoveryService.ts` (~300 lines)
2. `src/config/services/ConfigLoaderService.ts` (~400 lines)

#### ConfigDiscoveryService Responsibilities:
```typescript
export class ConfigDiscoveryService {
  // Find any config with priority: YAML → TypeScript → appwrite.json
  public findConfig(startDir: string): string | null;

  // Find specific config types
  public findYamlConfig(startDir: string): string | null;
  public findTypeScriptConfig(startDir: string): string | null;
  public findProjectConfig(startDir: string): string | null;

  // Discover collection/table YAMLs
  public async discoverCollections(collectionsDir: string): Promise<DiscoveryResult>;
  public async discoverTables(tablesDir: string): Promise<DiscoveryResult>;
}
```

**Implementation Notes:**
- Search for files in order: `.appwrite/config.yaml`, `.appwrite/config.yml`, `appwriteConfig.ts`, `appwrite.json`
- Search up directory tree (max 5 levels)
- Use existing `fs.existsSync()` and `path.join()` patterns from current code

#### ConfigLoaderService Responsibilities:
```typescript
export class ConfigLoaderService {
  // Load from discovered path (auto-detect type)
  public async loadFromPath(configPath: string): Promise<AppwriteConfig>;

  // Type-specific loaders
  public async loadYaml(yamlPath: string): Promise<AppwriteConfig>;
  public async loadTypeScript(tsPath: string): Promise<AppwriteConfig>;
  public async loadProjectConfig(jsonPath: string): Promise<Partial<AppwriteConfig>>;

  // Collection/table loading
  public async loadCollections(collectionsDir: string): Promise<Collection[]>;
  public async loadTables(tablesDir: string): Promise<Collection[]>;
}
```

**Implementation Notes:**
- Extract logic from `src/utils/loadConfigs.ts` lines 100-250
- Extract logic from `src/config/yamlConfig.ts` lines 1-100
- Extract logic from `src/utils/projectConfig.ts` lines 50-150

**appwrite.json Format Support:**
```json
{
  "projectId": "68c9855b0028caa8c65e",
  "projectName": "SmartScraper",
  "settings": { /* settings */ },
  "databases": [
    { "$id": "db1", "name": "Database 1", "enabled": true }
  ],
  "collections": [ /* legacy format */ ],
  "tables": [ /* 1.8+ format */ ],
  "functions": [ /* functions */ ],
  "buckets": [ /* buckets */ ]
}
```

**Conversion Logic:**
- `projectId` → `appwriteProject`
- Detect API mode: `tables` exists → TablesDB, else Legacy
- Merge databases, collections/tables, functions, buckets into AppwriteConfig

**Dependencies:**
- Import from: `appwrite-utils` (types), `js-yaml`, `fs`, `path`
- Use existing: `normalizeYamlData()` from `yamlConverter.ts`

**Testing Requirements:**
- Unit tests for each discovery method
- Test YAML, TypeScript, and appwrite.json loading
- Test collection vs tables detection
- Mock file system for tests

---

### 🤖 Agent 2: SessionAuthService + ConfigValidationService
**Type**: typescript-master
**Estimated LOC**: 500-600 lines total

#### Files to Create:
1. `src/config/services/SessionAuthService.ts` (~350 lines)
2. `src/config/services/ConfigValidationService.ts` (~200 lines)

#### SessionAuthService Responsibilities:
```typescript
export interface SessionAuthInfo {
  endpoint: string;
  projectId: string;
  email?: string;
  cookie: string;
  expiresAt?: string;
}

export class SessionAuthService {
  // Load with intelligent caching
  public async loadSessionPrefs(): Promise<AppwriteSessionPrefs | null>;

  // Find session for endpoint+project
  public async findSession(endpoint: string, projectId: string): Promise<SessionAuthInfo | null>;

  // Validation
  public isValidSession(session: SessionAuthInfo): boolean;

  // Status reporting
  public getAuthenticationStatus(
    endpoint: string,
    projectId: string,
    apiKey?: string,
    session?: SessionAuthInfo | null
  ): AuthenticationStatus;

  // Cache management
  public invalidateCache(): void;
}
```

**Caching Strategy:**
```typescript
private cache: {
  data: AppwriteSessionPrefs | null;
  mtime: number;
  contentHash: string;
  timestamp: number;
} | null = null;

private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
```

**Cache Invalidation Triggers:**
1. TTL expired (5 min)
2. File mtime changed
3. File content hash changed
4. Manual invalidation

**Implementation Notes:**
- Extract logic from `src/utils/sessionAuth.ts` lines 1-230
- Use `crypto.createHash('md5')` for content hashing
- Cache location: `~/.appwrite/prefs.json`
- Use `fs.statSync()` for mtime checks

#### ConfigValidationService Responsibilities:
```typescript
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export class ConfigValidationService {
  // Standard validation (warnings allowed)
  public validate(config: AppwriteConfig): ValidationResult;

  // Strict validation (warnings as errors)
  public validateStrict(config: AppwriteConfig): ValidationResult;

  // Report to console
  public reportResults(validation: ValidationResult, options?: { verbose?: boolean }): void;
}
```

**Implementation Notes:**
- Wrap existing validation logic from `src/config/configValidation.ts`
- Use existing `validateCollectionsTablesConfig()` function
- Use existing `reportValidationResults()` function
- Add strict mode that treats warnings as errors

**Dependencies:**
- Import from: `fs`, `path`, `os`, `crypto`
- Use existing: `sessionAuth.ts` functions as reference

**Testing Requirements:**
- Test session caching (should read file once)
- Test cache invalidation on mtime change
- Test session matching by endpoint+project
- Test validation with various config states

---

### 🤖 Agent 3: ConfigMergeService
**Type**: typescript-master
**Estimated LOC**: 300-400 lines

#### Files to Create:
1. `src/config/services/ConfigMergeService.ts` (~350 lines)

#### ConfigMergeService Responsibilities:
```typescript
export interface ConfigOverrides {
  appwriteEndpoint?: string;
  appwriteProject?: string;
  appwriteKey?: string;
  sessionCookie?: string;
  authMethod?: "session" | "apikey" | "auto";
}

export class ConfigMergeService {
  // Merge session into config
  public mergeSession(config: AppwriteConfig, session: SessionAuthInfo): AppwriteConfig;

  // Apply CLI/env overrides (highest priority)
  public applyOverrides(config: AppwriteConfig, overrides: ConfigOverrides): AppwriteConfig;

  // Merge environment variables (lowest priority)
  public mergeEnvironmentVariables(config: AppwriteConfig): AppwriteConfig;

  // Deep merge multiple configs
  public mergeSources(sources: Array<Partial<AppwriteConfig>>): AppwriteConfig;
}
```

**Priority Order (highest to lowest):**
1. CLI arguments/overrides (`--endpoint`, `--apiKey`, etc.)
2. Session cookie from ~/.appwrite/prefs.json
3. Config file values (YAML/TS/JSON)
4. Environment variables (`APPWRITE_ENDPOINT`, `APPWRITE_API_KEY`, etc.)

**Environment Variables Supported:**
- `APPWRITE_ENDPOINT`
- `APPWRITE_PROJECT`
- `APPWRITE_API_KEY`
- `APPWRITE_SESSION_COOKIE`

**Implementation Notes:**
- Deep merge objects (use lodash.merge or custom deep merge)
- Preserve array order
- Don't merge undefined/null values (skip them)
- Session adds: `sessionCookie`, `authMethod: "session"`

**Dependencies:**
- Import from: `appwrite-utils` (types)
- Consider: `lodash.merge` for deep merging (or implement custom)

**Testing Requirements:**
- Test merge priority order
- Test session injection
- Test override application
- Test environment variable reading

---

## Phase 2: Core ConfigManager Singleton
**Depends on**: Phase 1 (all services)

### 🤖 Agent 4: ConfigManager Implementation
**Type**: typescript-master
**Estimated LOC**: 800-1000 lines

#### Files to Create:
1. `src/config/ConfigManager.ts` (~900 lines)

#### ConfigManager Complete API:
```typescript
export class ConfigManager {
  // ──────────────────────────────────────────────────
  // SINGLETON PATTERN
  // ──────────────────────────────────────────────────
  private static instance: ConfigManager | null = null;
  public static getInstance(): ConfigManager;
  public static resetInstance(): void;

  // ──────────────────────────────────────────────────
  // STATE (Private)
  // ──────────────────────────────────────────────────
  private cachedConfig: AppwriteConfig | null = null;
  private cachedConfigPath: string | null = null;
  private cachedSession: SessionAuthInfo | null = null;
  private lastLoadTimestamp: number = 0;
  private isInitialized: boolean = false;

  // Service dependencies (injected in constructor)
  private discoveryService: ConfigDiscoveryService;
  private loaderService: ConfigLoaderService;
  private validationService: ConfigValidationService;
  private sessionService: SessionAuthService;
  private mergeService: ConfigMergeService;

  // ──────────────────────────────────────────────────
  // CORE CONFIGURATION METHODS
  // ──────────────────────────────────────────────────
  public async loadConfig(options?: ConfigLoadOptions): Promise<AppwriteConfig>;
  public getConfig(): AppwriteConfig;
  public getConfigPath(): string | null;
  public hasConfig(): boolean;
  public isConfigInitialized(): boolean;
  public invalidateCache(): void;
  public async reloadConfig(options?: Omit<ConfigLoadOptions, "forceReload">): Promise<AppwriteConfig>;

  // ──────────────────────────────────────────────────
  // SESSION MANAGEMENT
  // ──────────────────────────────────────────────────
  public getSession(): SessionAuthInfo | null;
  public hasSession(): boolean;
  public async refreshSession(): Promise<SessionAuthInfo | null>;
  public getAuthStatus(): AuthenticationStatus;
  public clearSession(): void;

  // ──────────────────────────────────────────────────
  // VALIDATION
  // ──────────────────────────────────────────────────
  public validateConfig(reportResults?: boolean): ValidationResult;
  public validateConfigStrict(reportResults?: boolean): ValidationResult;

  // ──────────────────────────────────────────────────
  // ADVANCED / CONVENIENCE
  // ──────────────────────────────────────────────────
  public watchConfig(callback: (config: AppwriteConfig) => void | Promise<void>): () => void;
  public mergeOverrides(overrides: ConfigOverrides): AppwriteConfig;
  public getCollections(filter?: (c: Collection) => boolean): Collection[];
  public getDatabases(): Database[];
  public getBuckets(): Bucket[];
  public getFunctions(): AppwriteFunction[];
}
```

#### loadConfig() Implementation Flow:
```typescript
async loadConfig(options = {}) {
  // 1. Return cache if available and not forcing reload
  if (this.cachedConfig && !options.forceReload) {
    return this.getCachedConfigWithOverrides(options.overrides);
  }

  // 2. Discover config file
  const discoveredPath = this.discoveryService.findConfig(options.configDir || process.cwd());
  if (!discoveredPath) throw new Error("No config found");

  // 3. Load config from file
  let config = await this.loaderService.loadFromPath(discoveredPath);

  // 4. Load session authentication
  const session = options.sessionOverride ||
                  await this.sessionService.findSession(config.appwriteEndpoint, config.appwriteProject);

  // 5. Merge session into config
  if (session) {
    config = this.mergeService.mergeSession(config, session);
    this.cachedSession = session;
  }

  // 6. Apply CLI/env overrides
  if (options.overrides) {
    config = this.mergeService.applyOverrides(config, options.overrides);
  }

  // 7. Validate if requested
  if (options.validate) {
    const validation = options.strictMode
      ? this.validationService.validateStrict(config)
      : this.validationService.validate(config);

    if (options.reportValidation) {
      this.validationService.reportResults(validation);
    }

    if (options.strictMode && !validation.isValid) {
      throw new Error("Config validation failed in strict mode");
    }
  }

  // 8. Cache the config (frozen for immutability)
  this.cachedConfig = Object.freeze(config);
  this.cachedConfigPath = discoveredPath;
  this.lastLoadTimestamp = Date.now();
  this.isInitialized = true;

  return config;
}
```

#### reloadConfig() Implementation:
```typescript
async reloadConfig(options = {}) {
  // Preserve current session during reload
  const currentSession = this.cachedSession;

  return this.loadConfig({
    ...options,
    forceReload: true,
    sessionOverride: currentSession || undefined,
  });
}
```

**Implementation Notes:**
- Use `Object.freeze()` to make config immutable
- Inject all 5 services in constructor
- Comprehensive JSDoc for all public methods
- Error messages should be actionable (suggest solutions)

**Dependencies:**
- Import all Phase 1 services
- Import types from `appwrite-utils`
- Import `MessageFormatter` for errors

**Testing Requirements:**
- Test singleton pattern (getInstance always returns same instance)
- Test caching behavior
- Test session preservation on reload
- Test override priority
- Test validation integration
- Mock all 5 services for isolation

---

## Phase 3: Integration Layer
**Depends on**: Phase 2 (ConfigManager)

### 🤖 Agent 5: ClientFactory + UtilsController Updates
**Type**: typescript-master
**Estimated LOC**: 400-500 lines

#### Files to Create:
1. `src/utils/ClientFactory.ts` (~150 lines)

#### Files to Modify:
1. `src/utilsController.ts` (~350 lines of changes)

#### ClientFactory Responsibilities:
```typescript
export class ClientFactory {
  /**
   * Create authenticated client and adapter from config
   * Config already contains resolved session/API key from ConfigManager
   */
  public static async createFromConfig(
    config: AppwriteConfig
  ): Promise<{ client: Client; adapter: DatabaseAdapter }> {
    // Create client
    const client = new Client()
      .setEndpoint(config.appwriteEndpoint)
      .setProject(config.appwriteProject);

    // Apply authentication (already resolved by ConfigManager)
    if (config.sessionCookie) {
      client.setSession(config.sessionCookie);
    } else if (config.appwriteKey) {
      client.setKey(config.appwriteKey);
    } else {
      throw new Error("No authentication method available");
    }

    // Create adapter with version detection (uses AdapterFactory cache)
    const { adapter } = await AdapterFactory.createFromConfig(config);

    return { client, adapter };
  }
}
```

**Implementation Notes:**
- Simple wrapper around existing `getClientWithAuth()` and `AdapterFactory`
- No new logic - just clean separation of concerns
- Config comes pre-loaded with session from ConfigManager

#### UtilsController Changes:

**Add Singleton Pattern:**
```typescript
export class UtilsController {
  private static instance: UtilsController | null = null;
  private isInitialized: boolean = false;

  public static getInstance(
    currentUserDir: string,
    directConfig?: DirectConfigOptions
  ): UtilsController {
    if (!UtilsController.instance) {
      UtilsController.instance = new UtilsController(currentUserDir, directConfig);
    }
    return UtilsController.instance;
  }

  public static clearInstance(): void {
    UtilsController.instance = null;
  }
}
```

**Replace Config Loading:**
```typescript
// BEFORE (lines 196-270)
async init(options = {}) {
  if (!this.config) {
    const { config, configPath } = await loadConfigWithPath(
      this.appwriteFolderPath,
      options
    );
    this.config = config;
  }

  this.appwriteServer = getClientWithAuth(...);

  const { adapter } = await getAdapterFromConfig(...);
  this.adapter = adapter;

  // Log spam here!
  MessageFormatter.info("Database adapter initialized...");
}

// AFTER
async init(options = {}) {
  const configManager = ConfigManager.getInstance();

  // Load config if not already loaded
  if (!configManager.hasConfig()) {
    await configManager.loadConfig({
      configDir: this.currentUserDir,
      validate: options.validate,
      strictMode: options.strictMode,
    });
  }

  const config = configManager.getConfig();

  // Create client and adapter (session already in config)
  const { client, adapter } = await ClientFactory.createFromConfig(config);

  this.appwriteServer = client;
  this.adapter = adapter;
  this.config = config;

  // Log only on FIRST initialization
  if (!this.isInitialized) {
    const apiMode = adapter.getApiMode();
    MessageFormatter.info(`Database adapter initialized (apiMode: ${apiMode})`, { prefix: "Adapter" });
    this.isInitialized = true;
  } else {
    logger.debug("Adapter reused from cache");
  }
}
```

**Simplify reloadConfig():**
```typescript
// BEFORE (lines 308-326)
async reloadConfig() {
  const preserveAuth = this.createSessionPreservationOptions();
  this.config = await loadConfig(this.appwriteFolderPath, {
    preserveAuth,
  });

  this.appwriteServer = getClientWithAuth(...);
  const { adapter } = await getAdapterFromConfig(...);

  // Log spam here!
  MessageFormatter.info("Database adapter re-initialized...");
}

// AFTER
async reloadConfig() {
  const configManager = ConfigManager.getInstance();

  // Session preservation is automatic
  const config = await configManager.reloadConfig();

  // Recreate client and adapter
  const { client, adapter } = await ClientFactory.createFromConfig(config);

  this.appwriteServer = client;
  this.adapter = adapter;
  this.config = config;

  logger.debug("Config reloaded, adapter refreshed");
}
```

**Remove Session Preservation Methods:**
- DELETE: `createSessionPreservationOptions()` (lines 269-290) - No longer needed
- DELETE: `extractSessionInfo()` (lines 987-1019) - No longer needed
- DELETE: `getSessionInfo()` (lines 318-338) - Replaced by `ConfigManager.getAuthStatus()`

**Expected Line Count Changes:**
- Add: ~50 lines (singleton pattern)
- Remove: ~100 lines (session preservation logic)
- Simplify: ~50 lines (init/reload)
- **Net: -100 to -150 lines**

**Dependencies:**
- Import `ConfigManager` from `src/config/ConfigManager.js`
- Import `ClientFactory` from `src/utils/ClientFactory.js`
- Use existing `logger` for debug messages

**Testing Requirements:**
- Test singleton getInstance/clearInstance
- Test init() with and without directConfig
- Test reloadConfig() preserves session
- Mock ConfigManager and ClientFactory

---

## Phase 4: Log Spam Fixes (Independent)
**Can run in parallel with Phase 1**

### 🤖 Agent 6: Fix Spammy Logs
**Type**: typescript-master
**Estimated LOC**: ~50 lines of changes

#### Files to Modify:

**1. `src/utils/getClientFromConfig.ts`**

Changes:
```typescript
// Line 46
MessageFormatter.info("Using explicit session authentication...")
→ logger.debug("Using explicit session authentication", { prefix: "Auth" });

// Line 59
MessageFormatter.info("Using session authentication...")
→ logger.debug("Using session authentication", { prefix: "Auth" });

// Line 73
MessageFormatter.info("Using API key authentication...")
→ logger.debug("Using API key authentication", { prefix: "Auth" });
```

**2. `src/shared/operationQueue.ts`**

Changes:
```typescript
// Line 79
MessageFormatter.success("✅ Cleared processing state caches")
→ logger.debug("Cleared processing state caches", { operation: "clearProcessingState" });
```

**Rationale:**
- These are internal implementation details, not user-facing actions
- Debug logs are still available for troubleshooting (check logs)
- Keeps console clean for actual user-relevant messages

**Result:**
- Before: 6+ "Using API key authentication" messages
- After: 0 info messages, available in debug logs

**Dependencies:**
- Import `logger` from `src/shared/logging.js`

**Testing Requirements:**
- Verify messages don't appear in console at info level
- Verify messages still appear in log files
- Test with LOG_LEVEL=debug shows messages

---

## Phase 5: CLI Entry Points
**Depends on**: Phase 2 (ConfigManager) + Phase 3 (UtilsController)

### 🤖 Agent 7: Update CLI Entry Points
**Type**: typescript-master
**Estimated LOC**: ~150 lines of changes

#### Files to Modify:

**1. `src/main.ts`**

Changes:
```typescript
// Line 428 - Replace instantiation
const controller = new UtilsController(process.cwd(), finalDirectConfig);
→ const controller = UtilsController.getInstance(process.cwd(), finalDirectConfig);

// Remove manual config loading (lines 338-365)
// ConfigManager handles this automatically
```

**2. `src/interactiveCLI.ts`**

Changes:
```typescript
// Line 199 - Use getInstance
private async initControllerIfNeeded(directConfig?: any): Promise<void> {
  if (!this.controller) {
    this.controller = new UtilsController(this.currentDir, directConfig);
    →
    this.controller = UtilsController.getInstance(this.currentDir, directConfig);
    await this.controller.init();
  }
}

// Lines 213, 217 - Use getInstance for recreation
this.controller = new UtilsController(this.currentDir, directConfig);
→
UtilsController.clearInstance();
this.controller = UtilsController.getInstance(this.currentDir, directConfig);
```

**3. `src/cli/commands/configCommands.ts`**

Changes:
```typescript
// In migrateTypeScriptConfig() after migration completes (line 30)
await migrateConfig((cli as any).currentDir);

// Add after migration:
UtilsController.clearInstance();
ConfigManager.resetInstance();
(cli as any).controller = undefined;
```

**Dependencies:**
- Import `ConfigManager` where needed
- Import updated `UtilsController` with getInstance()

**Testing Requirements:**
- Test interactive CLI still works
- Test config reload in interactive mode
- Test singleton persistence across commands
- Test config migration clears instances

---

# 🚀 Execution Strategy

## Dependency Graph
```
Phase 1 (Parallel):
├── Agent 1: ConfigDiscoveryService + ConfigLoaderService
├── Agent 2: SessionAuthService + ConfigValidationService
└── Agent 3: ConfigMergeService

Phase 2 (After Phase 1):
└── Agent 4: ConfigManager (needs all Phase 1 services)

Phase 3 (After Phase 2):
└── Agent 5: ClientFactory + UtilsController (needs ConfigManager)

Phase 4 (Independent):
└── Agent 6: Log Spam Fixes (can run anytime)

Phase 5 (After Phase 3):
└── Agent 5: CLI Entry Points (needs UtilsController singleton)
```

## Recommended Launch Sequence

### Step 1: Launch Parallel Agents (Immediately)
```bash
# Launch 4 agents simultaneously
Task 1: Agent 1 (ConfigDiscoveryService + ConfigLoaderService)
Task 2: Agent 2 (SessionAuthService + ConfigValidationService)
Task 3: Agent 3 (ConfigMergeService)
Task 4: Agent 6 (Log Spam Fixes - independent)
```

### Step 2: Launch ConfigManager (When Step 1 complete)
```bash
# Wait for Phase 1 services to be ready
Task 5: Agent 4 (ConfigManager)
```

### Step 3: Launch Integration (When Step 2 complete)
```bash
# Wait for ConfigManager to be ready
Task 6: Agent 5 (ClientFactory + UtilsController)
```

### Step 4: Launch CLI Updates (When Step 3 complete)
```bash
# Wait for UtilsController singleton to be ready
Task 7: Agent 7 (CLI Entry Points)
```

## Parallel Execution Timeline
```
Time →
0min  ┌─ Agent 1 ────────────────┐
      ├─ Agent 2 ────────────────┤
      ├─ Agent 3 ────────────────┤
      └─ Agent 6 ───────┘
                                  ↓
30min                    ┌─ Agent 4 ──────────┐
                                               ↓
50min                              ┌─ Agent 5 ─────────┐
                                                        ↓
70min                                        ┌─ Agent 7 ────┐
                                                              ↓
85min                                                    [COMPLETE]
```

**Estimated Total Time**: 85 minutes with parallel execution
**Estimated Sequential Time**: 4-5 hours

---

# 📝 Detailed File Specifications

## Service Files Structure

### ConfigDiscoveryService.ts
```typescript
/**
 * Service for discovering Appwrite configuration files
 * Priority: YAML → TypeScript → appwrite.json
 */
export interface DiscoveryResult {
  found: boolean;
  path?: string;
  type: 'yaml' | 'typescript' | 'json' | 'none';
}

export class ConfigDiscoveryService {
  private readonly YAML_FILENAMES = [
    '.appwrite/config.yaml',
    '.appwrite/config.yml',
    '.appwrite/appwriteConfig.yaml',
    '.appwrite/appwriteConfig.yml'
  ];

  private readonly TS_FILENAMES = ['appwriteConfig.ts'];

  private readonly JSON_FILENAMES = [
    'appwrite.json',
    'appwrite.config.json'
  ];

  // Implementation...
}
```

### SessionAuthService.ts
```typescript
/**
 * Service for managing Appwrite CLI session authentication
 * Implements intelligent caching to minimize file I/O
 */
export interface SessionCache {
  data: AppwriteSessionPrefs | null;
  mtime: number;
  contentHash: string;
  timestamp: number;
}

export class SessionAuthService {
  private cache: SessionCache | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly PREFS_PATH = path.join(os.homedir(), '.appwrite', 'prefs.json');

  // Implementation...
}
```

---

# 🧪 Testing Requirements

## Unit Tests Required

### Phase 1 Services
- [ ] ConfigDiscoveryService
  - [ ] Test YAML discovery
  - [ ] Test TypeScript discovery
  - [ ] Test appwrite.json discovery
  - [ ] Test directory tree traversal
  - [ ] Test priority order

- [ ] ConfigLoaderService
  - [ ] Test YAML loading
  - [ ] Test TypeScript loading
  - [ ] Test appwrite.json loading
  - [ ] Test collections vs tables detection
  - [ ] Test projectId → appwriteProject conversion
  - [ ] Test malformed file handling

- [ ] SessionAuthService
  - [ ] Test session caching (should read file once)
  - [ ] Test cache invalidation on mtime change
  - [ ] Test cache invalidation on content change
  - [ ] Test session matching by endpoint+project
  - [ ] Test expired session detection

- [ ] ConfigValidationService
  - [ ] Test standard validation
  - [ ] Test strict validation (warnings as errors)
  - [ ] Test report formatting

- [ ] ConfigMergeService
  - [ ] Test override priority order
  - [ ] Test session merging
  - [ ] Test environment variable merging
  - [ ] Test deep merge of nested objects

### Phase 2 ConfigManager
- [ ] Test singleton pattern
  - [ ] getInstance returns same instance
  - [ ] resetInstance clears singleton

- [ ] Test configuration loading
  - [ ] loadConfig caches result
  - [ ] Subsequent calls return cached config
  - [ ] forceReload bypasses cache

- [ ] Test session preservation
  - [ ] reloadConfig preserves session
  - [ ] Session auto-loaded from prefs.json

- [ ] Test overrides
  - [ ] CLI overrides take highest priority
  - [ ] mergeOverrides applies correctly

- [ ] Test validation integration
  - [ ] validate option triggers validation
  - [ ] strict mode treats warnings as errors

### Phase 3 Integration
- [ ] ClientFactory
  - [ ] Test client creation with session
  - [ ] Test client creation with API key
  - [ ] Test error when no auth available

- [ ] UtilsController
  - [ ] Test singleton getInstance
  - [ ] Test init with ConfigManager
  - [ ] Test reloadConfig simplification
  - [ ] Test log deduplication

### Phase 4 Log Fixes
- [ ] Test auth logs are debug level
- [ ] Test cache clear logs are debug level
- [ ] Test info logs still work for user actions

### Phase 5 CLI
- [ ] Test main.ts uses getInstance
- [ ] Test interactive CLI uses getInstance
- [ ] Test config migration clears instances

## Integration Tests Required
- [ ] End-to-end config loading flow
- [ ] Session authentication flow
- [ ] Config reload with session preservation
- [ ] Override application in real CLI commands

---

# 📦 Dependencies & Imports

## New Dependencies (None Required)
All functionality uses existing dependencies:
- `fs`, `path`, `os` (Node.js built-ins)
- `js-yaml` (already in package.json)
- `appwrite-utils` (internal package)
- `node-appwrite` (already in package.json)

## Import Patterns

```typescript
// Services
import { ConfigDiscoveryService } from './services/ConfigDiscoveryService.js';
import { ConfigLoaderService } from './services/ConfigLoaderService.js';
import { SessionAuthService } from './services/SessionAuthService.js';
import { ConfigValidationService } from './services/ConfigValidationService.js';
import { ConfigMergeService } from './services/ConfigMergeService.js';

// ConfigManager
import { ConfigManager } from './config/ConfigManager.js';

// Utilities
import { ClientFactory } from './utils/ClientFactory.js';
import { UtilsController } from './utilsController.js';

// Types
import type { AppwriteConfig, Collection, Database } from 'appwrite-utils';
import type { Client, Databases, Storage } from 'node-appwrite';

// Logging
import { logger } from './shared/logging.js';
import { MessageFormatter } from './shared/messageFormatter.js';
```

---

# ✅ Success Criteria

## Functional Requirements
- [ ] ConfigManager singleton can load all config types (YAML, TS, JSON)
- [ ] appwrite.json format fully supported
- [ ] Session authentication works with caching
- [ ] Config validation integrated
- [ ] Override priority works correctly (CLI > Session > File > Env)
- [ ] UtilsController singleton pattern working
- [ ] All existing CLI commands work unchanged
- [ ] Interactive CLI works unchanged

## Performance Requirements
- [ ] Config loaded once per CLI session (not 6+ times)
- [ ] Session file read once per 5 minutes (not every operation)
- [ ] 40-60% reduction in initialization time
- [ ] 90%+ reduction in file I/O

## Code Quality Requirements
- [ ] All services have unit tests (>80% coverage)
- [ ] ConfigManager has integration tests
- [ ] Comprehensive JSDoc for public APIs
- [ ] TypeScript strict mode passes
- [ ] No breaking changes to existing APIs

## User Experience Requirements
- [ ] Auth log spam eliminated (6+ messages → 1 message)
- [ ] Cache clear messages moved to debug
- [ ] Clear error messages with actionable suggestions
- [ ] Session preservation automatic (no manual passing)

---

# 🔄 Backward Compatibility

## Guaranteed Compatible
- All existing CLI commands work unchanged
- Interactive CLI continues working
- Config files (YAML/TS) continue working
- Session authentication continues working
- No changes to exported public APIs

## Internal Changes (Not User-Facing)
- Config loading internals refactored
- UtilsController uses singleton internally
- Log levels adjusted for internal messages

## Migration Path
- No migration required for users
- Existing configs work as-is
- New features (appwrite.json) are additive

---

# 📞 Questions for Clarification

## Resolved
- ✅ appwrite.json format specification (provided by user)
- ✅ Should we do gradual migration? (NO - implement fully)
- ✅ Should old code continue working? (YES - backward compatible)

## For Discussion
- [ ] Should environment variables be read from .env files or only process.env?
- [ ] Should watchConfig() be enabled by default in development?
- [ ] Should we add config version tracking for future migrations?

---

# 📚 Reference Materials

## Existing Code to Reference
- `src/utils/loadConfigs.ts` - Current config loading
- `src/config/yamlConfig.ts` - YAML loading
- `src/utils/projectConfig.ts` - appwrite.json loading
- `src/utils/sessionAuth.ts` - Session management
- `src/config/configValidation.ts` - Validation logic
- `src/adapters/AdapterFactory.ts` - Adapter creation with caching
- `src/utils/getClientFromConfig.ts` - Client creation

## appwrite.json Format (From User)
```json
{
  "projectId": "68c9855b0028caa8c65e",
  "projectName": "SmartScraper",
  "settings": {
    "services": { /* ... */ },
    "auth": { /* ... */ }
  },
  "databases": [
    { "$id": "db1", "name": "Database 1", "enabled": true }
  ],
  "collections": [ /* legacy */ ],
  "tables": [ /* 1.8+ */ ],
  "functions": [ /* ... */ ],
  "buckets": [ /* ... */ ]
}
```

---

# 🎬 Final Checklist Before Launch

## Pre-Launch
- [ ] All agents assigned
- [ ] Dependencies clarified
- [ ] File specifications complete
- [ ] Test requirements defined
- [ ] Success criteria agreed

## During Implementation
- [ ] Phase 1 agents launched (Agents 1-3, 6)
- [ ] Phase 1 complete, Phase 2 launched (Agent 4)
- [ ] Phase 2 complete, Phase 3 launched (Agent 5)
- [ ] Phase 3 complete, Phase 5 launched (Agent 7)

## Post-Implementation
- [ ] All unit tests passing
- [ ] Integration tests passing
- [ ] Build succeeds (bun run build)
- [ ] Existing commands tested
- [ ] Interactive CLI tested
- [ ] Session auth tested
- [ ] Log spam verified eliminated
- [ ] Performance improvements measured

---

# 🚨 Rollback Plan

If critical issues arise:
1. All changes are in new files (services, ConfigManager, ClientFactory)
2. Old code still exists (not deleted, just unused)
3. Can revert UtilsController changes
4. Can revert CLI entry point changes
5. Service files can be removed without breaking anything

**Rollback is LOW RISK** - new code is additive, not replacement.

---

**END OF CONFIGURATION TODO**
**Ready for parallel agent execution**
