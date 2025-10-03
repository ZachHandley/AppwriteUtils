import fs from 'fs';
import path from 'path';
import { jest } from '@jest/globals';
import { TestUtils } from '../testUtils';
import { loadConfig, loadConfigWithPath, findAppwriteConfig } from '../../src/utils/loadConfigs';
import { MessageFormatter } from '../../src/shared/messageFormatter';

// Mock MessageFormatter to capture log messages
jest.mock('../../src/shared/messageFormatter', () => ({
  MessageFormatter: {
    success: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock version detection
jest.mock('../../src/utils/versionDetection', () => ({
  detectAppwriteVersionCached: jest.fn().mockResolvedValue({
    serverVersion: '1.6.0',
    apiMode: 'database',
  }),
  fetchServerVersion: jest.fn().mockResolvedValue('1.6.0'),
  isVersionAtLeast: jest.fn((version, target) => {
    if (!version) return false;
    return version >= target;
  }),
}));

describe('loadConfigs - Dual Schema Support', () => {
  let testDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    TestUtils.cleanup();
  });

  describe('findAppwriteConfig', () => {
    it('should find YAML config in .appwrite directory', () => {
      testDir = TestUtils.createTestProject({ useYaml: true });
      const configPath = findAppwriteConfig(testDir);
      expect(configPath).toBe(testDir);
    });

    it('should find TypeScript config as fallback', () => {
      testDir = TestUtils.createTestProject({ useYaml: false });
      const configPath = findAppwriteConfig(testDir);
      expect(configPath).toBe(testDir);
    });

    it('should return null when no config found', () => {
      testDir = TestUtils.createTempDir();
      const configPath = findAppwriteConfig(testDir);
      expect(configPath).toBeNull();
    });
  });

  describe('Dual Folder Loading', () => {
    it('should load collections from collections/ directory only', async () => {
      testDir = TestUtils.createTestProject({
        hasCollections: true,
        hasTables: false,
      });

      const config = await loadConfig(testDir);

      expect(config.collections).toHaveLength(1);
      expect(config.collections[0].name).toBe('TestCollection');
      expect(config.collections[0]._isFromTablesDir).toBeUndefined();
      expect(MessageFormatter.success).toHaveBeenCalledWith(
        'Loading from collections/ directory: 1 files found',
        { prefix: 'Config' }
      );
    });

    it('should load tables from tables/ directory only', async () => {
      testDir = TestUtils.createTestProject({
        hasCollections: false,
        hasTables: true,
      });

      const config = await loadConfig(testDir);

      expect(config.collections).toHaveLength(1);
      expect(config.collections[0].name).toBe('TestTable');
      expect(config.collections[0]._isFromTablesDir).toBe(true);
      expect(MessageFormatter.success).toHaveBeenCalledWith(
        'Loading from tables/ directory: 1 files found',
        { prefix: 'Config' }
      );
    });

    it('should load from both collections/ and tables/ directories', async () => {
      testDir = TestUtils.createTestProject({
        hasCollections: true,
        hasTables: true,
      });

      const config = await loadConfig(testDir);

      expect(config.collections).toHaveLength(2);

      const collection = config.collections.find((c: any) => !c._isFromTablesDir);
      const table = config.collections.find((c: any) => c._isFromTablesDir);

      expect(collection).toBeDefined();
      expect(collection.name).toBe('TestCollection');

      expect(table).toBeDefined();
      expect(table.name).toBe('TestTable');
      expect(table._isFromTablesDir).toBe(true);

      expect(MessageFormatter.success).toHaveBeenCalledWith(
        'Loading from collections/ directory: 1 files found',
        { prefix: 'Config' }
      );
      expect(MessageFormatter.success).toHaveBeenCalledWith(
        'Loading from tables/ directory: 1 files found',
        { prefix: 'Config' }
      );
    });

    it('should handle naming conflicts with collections/ taking priority', async () => {
      testDir = TestUtils.createTestProject({
        hasCollections: true,
        hasTables: true,
        hasConflicts: true,
      });

      const config = await loadConfig(testDir);

      // Should have 2 items: original collection + one table (conflict skipped)
      expect(config.collections).toHaveLength(2);

      // Check that the collection takes priority
      const collectionItems = config.collections.filter((c: any) => !c._isFromTablesDir);
      expect(collectionItems).toHaveLength(1);
      expect(collectionItems[0].name).toBe('TestCollection');

      // Check warning was logged
      expect(MessageFormatter.warning).toHaveBeenCalledWith(
        expect.stringContaining('Found 1 naming conflicts'),
        { prefix: 'Config' }
      );
    });
  });

  describe('YAML Support', () => {
    it('should load YAML collections', async () => {
      testDir = TestUtils.createTestProject({
        hasCollections: true,
        useYaml: true,
      });

      const config = await loadConfig(testDir);

      expect(config.collections).toHaveLength(1);
      expect(config.collections[0].name).toBe('TestCollection');
      expect(config.collections[0].$id).toBe('test-collection');
      expect(config.collections[0].attributes).toHaveLength(2);
    });

    it('should load YAML tables', async () => {
      testDir = TestUtils.createTestProject({
        hasTables: true,
        useYaml: true,
      });

      const config = await loadConfig(testDir);

      expect(config.collections).toHaveLength(1);
      expect(config.collections[0].name).toBe('TestTable');
      expect(config.collections[0]._isFromTablesDir).toBe(true);
    });

    it('should load mixed YAML and TypeScript files', async () => {
      testDir = TestUtils.createTestProject({
        hasCollections: true,
        useYaml: false,
      });

      // Add a YAML table alongside TypeScript collection
      const tablesDir = path.join(testDir, 'tables');
      fs.mkdirSync(tablesDir);

      const yamlContent = `
name: YamlTable
tableId: yaml-table
databaseId: test-db-id
documentSecurity: false
enabled: true
permissions: []
attributes:
  - key: content
    type: string
    size: 1000
    required: true
indexes: []
`;
      fs.writeFileSync(path.join(tablesDir, 'YamlTable.yaml'), yamlContent);

      const config = await loadConfig(testDir);

      expect(config.collections).toHaveLength(2);
      expect(config.collections.some((c: any) => c.name === 'TestCollection')).toBe(true);
      expect(config.collections.some((c: any) => c.name === 'YamlTable')).toBe(true);
    });
  });

  describe('Legacy Single Directory Support', () => {
    it('should fall back to legacy collections/ directory when no dual directories', async () => {
      testDir = TestUtils.createTempDir();

      // Create config without .appwrite structure
      const config = TestUtils.createTestAppwriteConfig();
      const tsContent = `
import { type AppwriteConfig } from 'appwrite-utils';
const appwriteConfig: AppwriteConfig = ${JSON.stringify(config, null, 2)};
export default appwriteConfig;
`;
      fs.writeFileSync(path.join(testDir, 'appwriteConfig.ts'), tsContent);

      // Create only collections directory (legacy)
      const collectionsDir = path.join(testDir, 'collections');
      fs.mkdirSync(collectionsDir);

      const collection = TestUtils.createTestCollection();
      const collectionContent = `
const TestCollection = ${JSON.stringify(collection, null, 2)};
export default TestCollection;
`;
      fs.writeFileSync(path.join(collectionsDir, 'TestCollection.ts'), collectionContent);

      const loadedConfig = await loadConfig(testDir);

      expect(loadedConfig.collections).toHaveLength(1);
      expect(loadedConfig.collections[0].name).toBe('TestCollection');
      expect(MessageFormatter.info).toHaveBeenCalledWith(
        'Using legacy single directory: collections/',
        { prefix: 'Config' }
      );
    });
  });

  describe('loadConfigWithPath', () => {
    it('should return both config and actual config path', async () => {
      testDir = TestUtils.createTestProject({ useYaml: true });

      const result = await loadConfigWithPath(testDir);

      expect(result.config).toBeDefined();
      expect(result.actualConfigPath).toContain('config.yaml');
      expect(result.config.appwriteProject).toBe('test-project');
    });

    it('should handle .appwrite directory path directly', async () => {
      testDir = TestUtils.createTestProject({ useYaml: true });
      const appwriteDir = path.join(testDir, '.appwrite');

      const result = await loadConfigWithPath(appwriteDir);

      expect(result.config).toBeDefined();
      expect(result.actualConfigPath).toContain('config.yaml');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when no config found', async () => {
      testDir = TestUtils.createTempDir();

      await expect(loadConfig(testDir)).rejects.toThrow('No valid configuration found');
    });

    it('should handle malformed YAML gracefully', async () => {
      testDir = TestUtils.createTestProject({ useYaml: true });

      // Create malformed YAML collection
      const collectionsDir = path.join(testDir, 'collections');
      fs.writeFileSync(path.join(collectionsDir, 'BadCollection.yaml'), 'invalid: yaml: content:');

      const config = await loadConfig(testDir);

      // Should still load other valid collections
      expect(config).toBeDefined();
      // The malformed collection should be skipped
    });

    it('should handle missing TypeScript exports gracefully', async () => {
      testDir = TestUtils.createTestProject({ useYaml: false });

      // Create TypeScript file with no export
      const collectionsDir = path.join(testDir, 'collections');
      fs.writeFileSync(path.join(collectionsDir, 'NoExport.ts'), 'const collection = {};');

      const config = await loadConfig(testDir);

      expect(config).toBeDefined();
      // Should still have the original test collection
      expect(config.collections.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large numbers of collections and tables', async () => {
      testDir = TestUtils.createTempDir();

      // Create config
      const config = TestUtils.createTestAppwriteConfig();
      const tsContent = `export default ${JSON.stringify(config, null, 2)};`;
      fs.writeFileSync(path.join(testDir, 'appwriteConfig.ts'), tsContent);

      // Create many collections
      const collectionsDir = path.join(testDir, 'collections');
      fs.mkdirSync(collectionsDir);

      for (let i = 0; i < 50; i++) {
        const collection = TestUtils.createTestCollection({
          name: `Collection${i}`,
          $id: `collection-${i}`,
        });
        const content = `export default ${JSON.stringify(collection, null, 2)};`;
        fs.writeFileSync(path.join(collectionsDir, `Collection${i}.ts`), content);
      }

      // Create many tables
      const tablesDir = path.join(testDir, 'tables');
      fs.mkdirSync(tablesDir);

      for (let i = 0; i < 30; i++) {
        const table = TestUtils.createTestTable({
          name: `Table${i}`,
          tableId: `table-${i}`,
        });
        const content = `export default ${JSON.stringify(table, null, 2)};`;
        fs.writeFileSync(path.join(tablesDir, `Table${i}.ts`), content);
      }

      const startTime = Date.now();
      const loadedConfig = await loadConfig(testDir);
      const loadTime = Date.now() - startTime;

      expect(loadedConfig.collections).toHaveLength(80); // 50 collections + 30 tables
      expect(loadTime).toBeLessThan(5000); // Should load within 5 seconds
    });
  });
});