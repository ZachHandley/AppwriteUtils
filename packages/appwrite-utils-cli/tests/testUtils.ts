import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { type AppwriteConfig, type CollectionCreate } from 'appwrite-utils';

/**
 * Test utilities for creating temporary directories and test fixtures
 */
export class TestUtils {
  private static tempDirs: string[] = [];

  /**
   * Creates a temporary directory for testing
   */
  static createTempDir(prefix = 'appwrite-test'): string {
    const tempDir = path.join(tmpdir(), `${prefix}-${randomBytes(8).toString('hex')}`);
    fs.mkdirSync(tempDir, { recursive: true });
    this.tempDirs.push(tempDir);
    return tempDir;
  }

  /**
   * Cleans up all created temporary directories
   */
  static cleanup(): void {
    this.tempDirs.forEach(dir => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    });
    this.tempDirs = [];
  }

  /**
   * Creates a test appwrite config
   */
  static createTestAppwriteConfig(overrides: Partial<AppwriteConfig> = {}): AppwriteConfig {
    return {
      appwriteEndpoint: 'http://localhost:8080/v1',
      appwriteProject: 'test-project',
      appwriteKey: 'test-key',
      databases: [
        {
          name: 'test-database',
          $id: 'test-db-id',
          enabled: true,
        }
      ],
      buckets: [],
      teams: [],
      functions: [],
      messaging: [],
      collections: [],
      ...overrides,
    };
  }

  /**
   * Creates a test collection configuration
   */
  static createTestCollection(overrides: Partial<CollectionCreate> = {}): CollectionCreate {
    return {
      name: 'TestCollection',
      $id: 'test-collection',
      documentSecurity: false,
      enabled: true,
      $permissions: [],
      attributes: [
        {
          key: 'name',
          type: 'string',
          size: 255,
          required: true,
          array: false,
        },
        {
          key: 'email',
          type: 'email',
          required: true,
          array: false,
        }
      ],
      indexes: [
        {
          key: 'email_index',
          type: 'unique',
          attributes: ['email'],
        }
      ],
      ...overrides,
    };
  }

  /**
   * Creates a test table configuration (tables API)
   */
  static createTestTable(overrides: any = {}): any {
    return {
      name: 'TestTable',
      tableId: 'test-table',
      databaseId: 'test-db-id',
      documentSecurity: false,
      enabled: true,
      $permissions: [],
      attributes: [
        {
          key: 'title',
          type: 'string',
          size: 255,
          required: true,
          array: false,
        },
        {
          key: 'count',
          type: 'integer',
          required: false,
          min: 0,
          max: 1000,
        }
      ],
      indexes: [
        {
          key: 'title_index',
          type: 'key',
          attributes: ['title'],
        }
      ],
      _isFromTablesDir: true,
      ...overrides,
    };
  }

  /**
   * Creates a test project structure with collections and/or tables
   */
  static createTestProject(options: {
    hasCollections?: boolean;
    hasTables?: boolean;
    hasConflicts?: boolean;
    useYaml?: boolean;
    configDir?: string;
  } = {}): string {
    const {
      hasCollections = true,
      hasTables = false,
      hasConflicts = false,
      useYaml = false,
      configDir,
    } = options;

    const testDir = configDir || this.createTempDir('test-project');

    // Create .appwrite directory
    const appwriteDir = path.join(testDir, '.appwrite');
    fs.mkdirSync(appwriteDir, { recursive: true });

    // Create config file
    const config = this.createTestAppwriteConfig();
    if (useYaml) {
      const yamlContent = `
appwriteEndpoint: ${config.appwriteEndpoint}
appwriteProject: ${config.appwriteProject}
appwriteKey: ${config.appwriteKey}
databases:
  - name: ${config.databases[0].name}
    $id: ${config.databases[0].$id}
    enabled: ${config.databases[0].enabled}
buckets: []
teams: []
functions: []
messaging: []
`;
      fs.writeFileSync(path.join(appwriteDir, 'config.yaml'), yamlContent);
    } else {
      const tsContent = `
import { type AppwriteConfig } from 'appwrite-utils';

const appwriteConfig: AppwriteConfig = ${JSON.stringify(config, null, 2)};

export default appwriteConfig;
`;
      fs.writeFileSync(path.join(testDir, 'appwriteConfig.ts'), tsContent);
    }

    // Create collections directory if requested
    if (hasCollections) {
      const collectionsDir = path.join(testDir, 'collections');
      fs.mkdirSync(collectionsDir);

      const collection = this.createTestCollection();
      if (useYaml) {
        const yamlContent = `
name: ${collection.name}
id: ${collection.$id}
documentSecurity: ${collection.documentSecurity}
enabled: ${collection.enabled}
permissions: []
attributes:
  - key: name
    type: string
    size: 255
    required: true
  - key: email
    type: email
    required: true
indexes:
  - key: email_index
    type: unique
    attributes: [email]
`;
        fs.writeFileSync(path.join(collectionsDir, 'TestCollection.yaml'), yamlContent);
      } else {
        const tsContent = `
import { type CollectionCreate } from 'appwrite-utils';

const TestCollection: CollectionCreate = ${JSON.stringify(collection, null, 2)};

export default TestCollection;
`;
        fs.writeFileSync(path.join(collectionsDir, 'TestCollection.ts'), tsContent);
      }
    }

    // Create tables directory if requested
    if (hasTables) {
      const tablesDir = path.join(testDir, 'tables');
      fs.mkdirSync(tablesDir);

      const table = this.createTestTable();
      if (useYaml) {
        const yamlContent = `
name: ${table.name}
tableId: ${table.tableId}
databaseId: ${table.databaseId}
documentSecurity: ${table.documentSecurity}
enabled: ${table.enabled}
permissions: []
attributes:
  - key: title
    type: string
    size: 255
    required: true
  - key: count
    type: integer
    required: false
    min: 0
    max: 1000
indexes:
  - key: title_index
    type: key
    attributes: [title]
`;
        fs.writeFileSync(path.join(tablesDir, 'TestTable.yaml'), yamlContent);
      } else {
        const tsContent = `
import { type TableCreate } from 'appwrite-utils';

const TestTable: any = ${JSON.stringify(table, null, 2)};

export default TestTable;
`;
        fs.writeFileSync(path.join(tablesDir, 'TestTable.ts'), tsContent);
      }

      // Create conflicting collection if requested
      if (hasConflicts && hasCollections) {
        const conflictTable = this.createTestTable({
          name: 'TestCollection', // Same name as collection
          tableId: 'test-collection-conflict'
        });
        const tsContent = `
const ConflictTable: any = ${JSON.stringify(conflictTable, null, 2)};
export default ConflictTable;
`;
        fs.writeFileSync(path.join(tablesDir, 'ConflictTable.ts'), tsContent);
      }
    }

    return testDir;
  }

  /**
   * Creates mock Appwrite client responses
   */
  static createMockAppwriteResponses() {
    return {
      databases: {
        list: jest.fn().mockResolvedValue({
          databases: [
            {
              $id: 'test-db-id',
              name: 'test-database',
              enabled: true,
              $createdAt: new Date().toISOString(),
              $updatedAt: new Date().toISOString(),
            }
          ],
          total: 1,
        }),
        get: jest.fn().mockResolvedValue({
          $id: 'test-db-id',
          name: 'test-database',
          enabled: true,
          $createdAt: new Date().toISOString(),
          $updatedAt: new Date().toISOString(),
        }),
        listCollections: jest.fn().mockResolvedValue({
          collections: [
            {
              $id: 'test-collection',
              name: 'TestCollection',
              enabled: true,
              documentSecurity: false,
              $permissions: [],
              attributes: [],
              indexes: [],
              $createdAt: new Date().toISOString(),
              $updatedAt: new Date().toISOString(),
            }
          ],
          total: 1,
        }),
      },
      health: {
        get: jest.fn().mockResolvedValue({
          status: 'OK',
          version: '1.6.0',
        }),
      },
    };
  }
}

// Clean up after all tests
afterAll(() => {
  TestUtils.cleanup();
});