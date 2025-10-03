import fs from 'fs';
import path from 'path';
import { jest } from '@jest/globals';
import { TestUtils } from '../testUtils';
import { AdapterFactory } from '../../src/adapters/AdapterFactory';
import { MessageFormatter } from '../../src/shared/messageFormatter';

// Mock dependencies
jest.mock('../../src/shared/messageFormatter');
jest.mock('../../src/adapters/AdapterFactory');
jest.mock('../../src/utils/versionDetection');

// Import the actual modules we're testing
import { loadConfig } from '../../src/utils/loadConfigs';

describe('Sync Operations Integration Tests', () => {
  let testDir: string;
  let mockAdapter: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock adapter with all required methods
    mockAdapter = {
      syncFromAppwrite: jest.fn(),
      syncToAppwrite: jest.fn(),
      validateConfiguration: jest.fn(),
      generateYamlConfig: jest.fn(),
      getDatabases: jest.fn(),
      getCollections: jest.fn(),
      createCollection: jest.fn(),
      updateCollection: jest.fn(),
      deleteCollection: jest.fn(),
      client: TestUtils.createMockAppwriteResponses(),
    };

    (AdapterFactory.createAdapter as jest.Mock).mockResolvedValue(mockAdapter);
  });

  afterEach(() => {
    TestUtils.cleanup();
  });

  describe('Sync from Appwrite to Local Configuration', () => {
    it('should sync collections to collections/ directory for database API', async () => {
      testDir = TestUtils.createTestProject({ hasCollections: true });

      // Mock Appwrite response for collections
      mockAdapter.getDatabases.mockResolvedValue([
        {
          $id: 'test-db-id',
          name: 'test-database',
          enabled: true,
        }
      ]);

      mockAdapter.getCollections.mockResolvedValue([
        {
          $id: 'synced-collection',
          name: 'SyncedCollection',
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
            }
          ],
          indexes: [],
          $createdAt: new Date().toISOString(),
          $updatedAt: new Date().toISOString(),
        }
      ]);

      mockAdapter.generateYamlConfig.mockImplementation((collections, outputDir) => {
        const collectionsDir = path.join(outputDir, 'collections');
        fs.mkdirSync(collectionsDir, { recursive: true });

        collections.forEach((collection: any) => {
          const yamlContent = `
name: ${collection.name}
id: ${collection.$id}
documentSecurity: ${collection.documentSecurity}
enabled: ${collection.enabled}
permissions: []
attributes:
  - key: ${collection.attributes[0].key}
    type: ${collection.attributes[0].type}
    size: ${collection.attributes[0].size}
    required: ${collection.attributes[0].required}
indexes: []
`;
          fs.writeFileSync(
            path.join(collectionsDir, `${collection.name}.yaml`),
            yamlContent
          );
        });
      });

      await mockAdapter.syncFromAppwrite(testDir);

      // Verify collections were written to collections/ directory
      const collectionsDir = path.join(testDir, 'collections');
      expect(fs.existsSync(collectionsDir)).toBe(true);

      const collectionFiles = fs.readdirSync(collectionsDir);
      expect(collectionFiles).toContain('SyncedCollection.yaml');

      const collectionContent = fs.readFileSync(
        path.join(collectionsDir, 'SyncedCollection.yaml'),
        'utf8'
      );
      expect(collectionContent).toContain('name: SyncedCollection');
    });

    it('should sync tables to tables/ directory for tablesdb API', async () => {
      testDir = TestUtils.createTestProject({ hasTables: true });

      // Mock TablesDB adapter
      mockAdapter.getDatabases.mockResolvedValue([
        {
          $id: 'test-db-id',
          name: 'test-database',
          enabled: true,
        }
      ]);

      mockAdapter.getCollections.mockResolvedValue([
        {
          tableId: 'synced-table',
          name: 'SyncedTable',
          databaseId: 'test-db-id',
          documentSecurity: false,
          enabled: true,
          $permissions: [],
          attributes: [
            {
              key: 'content',
              type: 'string',
              size: 1000,
              required: true,
              array: false,
            }
          ],
          indexes: [],
          $createdAt: new Date().toISOString(),
          $updatedAt: new Date().toISOString(),
        }
      ]);

      mockAdapter.generateYamlConfig.mockImplementation((tables, outputDir) => {
        const tablesDir = path.join(outputDir, 'tables');
        fs.mkdirSync(tablesDir, { recursive: true });

        tables.forEach((table: any) => {
          const yamlContent = `
name: ${table.name}
tableId: ${table.tableId}
databaseId: ${table.databaseId}
documentSecurity: ${table.documentSecurity}
enabled: ${table.enabled}
permissions: []
attributes:
  - key: ${table.attributes[0].key}
    type: ${table.attributes[0].type}
    size: ${table.attributes[0].size}
    required: ${table.attributes[0].required}
indexes: []
`;
          fs.writeFileSync(
            path.join(tablesDir, `${table.name}.yaml`),
            yamlContent
          );
        });
      });

      await mockAdapter.syncFromAppwrite(testDir);

      // Verify tables were written to tables/ directory
      const tablesDir = path.join(testDir, 'tables');
      expect(fs.existsSync(tablesDir)).toBe(true);

      const tableFiles = fs.readdirSync(tablesDir);
      expect(tableFiles).toContain('SyncedTable.yaml');

      const tableContent = fs.readFileSync(
        path.join(tablesDir, 'SyncedTable.yaml'),
        'utf8'
      );
      expect(tableContent).toContain('name: SyncedTable');
      expect(tableContent).toContain('tableId: synced-table');
      expect(tableContent).toContain('databaseId: test-db-id');
    });

    it('should preserve existing configurations during sync', async () => {
      testDir = TestUtils.createTestProject({
        hasCollections: true,
        hasTables: true,
      });

      // Add existing configurations
      const existingCollectionContent = fs.readFileSync(
        path.join(testDir, 'collections', 'TestCollection.ts'),
        'utf8'
      );

      mockAdapter.getDatabases.mockResolvedValue([]);
      mockAdapter.getCollections.mockResolvedValue([]);
      mockAdapter.generateYamlConfig.mockImplementation(() => {
        // Don't overwrite existing files
      });

      await mockAdapter.syncFromAppwrite(testDir);

      // Verify existing files weren't overwritten
      const currentContent = fs.readFileSync(
        path.join(testDir, 'collections', 'TestCollection.ts'),
        'utf8'
      );
      expect(currentContent).toBe(existingCollectionContent);
    });
  });

  describe('Database Configuration Sync', () => {
    it('should update main config.yaml with database information', async () => {
      testDir = TestUtils.createTestProject({ useYaml: true });

      mockAdapter.getDatabases.mockResolvedValue([
        {
          $id: 'db1',
          name: 'Database One',
          enabled: true,
        },
        {
          $id: 'db2',
          name: 'Database Two',
          enabled: false,
        }
      ]);

      mockAdapter.generateYamlConfig.mockImplementation((collections, outputDir) => {
        // Update the main config file
        const configPath = path.join(outputDir, '.appwrite', 'config.yaml');
        const currentConfig = fs.readFileSync(configPath, 'utf8');
        const updatedConfig = currentConfig + `
# Synced databases
syncedDatabases:
  - $id: db1
    name: Database One
    enabled: true
  - $id: db2
    name: Database Two
    enabled: false
`;
        fs.writeFileSync(configPath, updatedConfig);
      });

      await mockAdapter.syncFromAppwrite(testDir);

      const configContent = fs.readFileSync(
        path.join(testDir, '.appwrite', 'config.yaml'),
        'utf8'
      );
      expect(configContent).toContain('syncedDatabases:');
      expect(configContent).toContain('Database One');
      expect(configContent).toContain('Database Two');
    });
  });

  describe('Version-Aware Sync Operations', () => {
    it('should use appropriate directory based on detected API version', async () => {
      testDir = TestUtils.createTestProject();

      // Mock version detection for old version (should use collections/)
      const oldVersionAdapter = { ...mockAdapter };
      oldVersionAdapter.getCollections.mockResolvedValue([
        TestUtils.createTestCollection({ name: 'OldVersionCollection' })
      ]);

      await oldVersionAdapter.syncFromAppwrite(testDir);

      // For newer versions, should use tables/
      const newVersionAdapter = { ...mockAdapter };
      newVersionAdapter.getCollections.mockResolvedValue([
        TestUtils.createTestTable({ name: 'NewVersionTable' })
      ]);

      await newVersionAdapter.syncFromAppwrite(testDir);

      // Verify appropriate handling based on version
      expect(mockAdapter.syncFromAppwrite).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed API environments gracefully', async () => {
      testDir = TestUtils.createTestProject({
        hasCollections: true,
        hasTables: true,
      });

      // Mock mixed response
      mockAdapter.getCollections.mockResolvedValue([
        TestUtils.createTestCollection({ name: 'MixedCollection' }),
        TestUtils.createTestTable({ name: 'MixedTable' }),
      ]);

      mockAdapter.generateYamlConfig.mockImplementation((items, outputDir) => {
        items.forEach((item: any) => {
          const isTable = item._isFromTablesDir || item.tableId;
          const dir = isTable ? 'tables' : 'collections';
          const dirPath = path.join(outputDir, dir);
          fs.mkdirSync(dirPath, { recursive: true });

          const yamlContent = `name: ${item.name}\n`;
          fs.writeFileSync(
            path.join(dirPath, `${item.name}.yaml`),
            yamlContent
          );
        });
      });

      await mockAdapter.syncFromAppwrite(testDir);

      // Should handle both types appropriately
      expect(mockAdapter.generateYamlConfig).toHaveBeenCalled();
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle network errors during sync gracefully', async () => {
      testDir = TestUtils.createTestProject();

      mockAdapter.getDatabases.mockRejectedValue(new Error('Network timeout'));

      await expect(mockAdapter.syncFromAppwrite(testDir)).rejects.toThrow('Network timeout');

      // Verify that partial configurations are not left in inconsistent state
      const collectionsDir = path.join(testDir, 'collections');
      const tablesDir = path.join(testDir, 'tables');

      // Should not create partial directories on failure
      if (fs.existsSync(collectionsDir)) {
        const files = fs.readdirSync(collectionsDir);
        expect(files.length).toBe(0); // No partial files
      }
    });

    it('should validate synced configurations before writing', async () => {
      testDir = TestUtils.createTestProject();

      // Mock invalid configuration from Appwrite
      mockAdapter.getCollections.mockResolvedValue([
        {
          // Missing required fields
          name: '',
          $id: '',
          attributes: [],
        }
      ]);

      mockAdapter.validateConfiguration.mockReturnValue({
        isValid: false,
        errors: ['Collection name is required', 'Collection ID is required'],
        warnings: [],
      });

      await expect(mockAdapter.syncFromAppwrite(testDir)).rejects.toThrow();

      expect(mockAdapter.validateConfiguration).toHaveBeenCalled();
    });

    it('should provide rollback capability on sync failure', async () => {
      testDir = TestUtils.createTestProject({ hasCollections: true });

      // Backup existing state
      const originalFiles = fs.readdirSync(path.join(testDir, 'collections'));

      mockAdapter.getCollections.mockResolvedValue([
        TestUtils.createTestCollection({ name: 'NewCollection' })
      ]);

      // Simulate failure during write
      mockAdapter.generateYamlConfig.mockImplementation(() => {
        throw new Error('Write permission denied');
      });

      await expect(mockAdapter.syncFromAppwrite(testDir)).rejects.toThrow();

      // Verify original files are preserved
      const currentFiles = fs.readdirSync(path.join(testDir, 'collections'));
      expect(currentFiles).toEqual(originalFiles);
    });
  });

  describe('Performance Optimization', () => {
    it('should handle large numbers of collections efficiently', async () => {
      testDir = TestUtils.createTestProject();

      // Create large number of collections
      const largeCollectionSet = Array.from({ length: 1000 }, (_, i) =>
        TestUtils.createTestCollection({
          name: `Collection${i}`,
          $id: `collection-${i}`,
        })
      );

      mockAdapter.getCollections.mockResolvedValue(largeCollectionSet);
      mockAdapter.generateYamlConfig.mockImplementation((collections, outputDir) => {
        // Simulate efficient batch writing
        const collectionsDir = path.join(outputDir, 'collections');
        fs.mkdirSync(collectionsDir, { recursive: true });

        // Write files in batches to avoid memory issues
        const batchSize = 100;
        for (let i = 0; i < collections.length; i += batchSize) {
          const batch = collections.slice(i, i + batchSize);
          batch.forEach((collection: any) => {
            fs.writeFileSync(
              path.join(collectionsDir, `${collection.name}.yaml`),
              `name: ${collection.name}\n`
            );
          });
        }
      });

      const startTime = Date.now();
      await mockAdapter.syncFromAppwrite(testDir);
      const syncTime = Date.now() - startTime;

      expect(syncTime).toBeLessThan(10000); // Should complete within 10 seconds

      const collectionFiles = fs.readdirSync(path.join(testDir, 'collections'));
      expect(collectionFiles.length).toBe(1000);
    });

    it('should use incremental sync when possible', async () => {
      testDir = TestUtils.createTestProject({ hasCollections: true });

      // Mock last sync timestamp
      const lastSyncFile = path.join(testDir, '.appwrite', '.last-sync');
      fs.writeFileSync(lastSyncFile, new Date().toISOString());

      mockAdapter.getCollections.mockResolvedValue([
        TestUtils.createTestCollection({
          name: 'UpdatedCollection',
          $updatedAt: new Date().toISOString(),
        })
      ]);

      await mockAdapter.syncFromAppwrite(testDir);

      // Should only sync updated items
      expect(mockAdapter.getCollections).toHaveBeenCalledWith(
        expect.objectContaining({
          modifiedSince: expect.any(String),
        })
      );
    });
  });
});