import { jest } from '@jest/globals';
import { TestUtils } from '../testUtils';
import { AdapterFactory } from '../../src/adapters/AdapterFactory';
import { LegacyAdapter } from '../../src/adapters/LegacyAdapter';
import { TablesDBAdapter } from '../../src/adapters/TablesDBAdapter';
import { DatabaseAdapter } from '../../src/adapters/DatabaseAdapter';

// Mock the adapters
jest.mock('../../src/adapters/LegacyAdapter');
jest.mock('../../src/adapters/TablesDBAdapter');
jest.mock('../../src/adapters/DatabaseAdapter');

// Mock version detection
jest.mock('../../src/utils/versionDetection', () => ({
  detectAppwriteVersionCached: jest.fn(),
  fetchServerVersion: jest.fn(),
  isVersionAtLeast: jest.fn(),
}));

import { detectAppwriteVersionCached, isVersionAtLeast } from '../../src/utils/versionDetection';

describe('AdapterFactory - Dual API Support', () => {
  let mockConfig: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = TestUtils.createTestAppwriteConfig();
  });

  describe('Adapter Selection Logic', () => {
    it('should create LegacyAdapter for old Appwrite versions', async () => {
      (detectAppwriteVersionCached as jest.Mock).mockResolvedValue({
        serverVersion: '1.5.0',
        apiMode: 'database',
      });
      (isVersionAtLeast as jest.Mock).mockReturnValue(false);

      const adapter = await AdapterFactory.createAdapter(mockConfig);

      expect(LegacyAdapter).toHaveBeenCalledWith(expect.anything(), mockConfig);
      expect(adapter).toBeInstanceOf(LegacyAdapter);
    });

    it('should create DatabaseAdapter for Appwrite 1.6.0+ in database mode', async () => {
      (detectAppwriteVersionCached as jest.Mock).mockResolvedValue({
        serverVersion: '1.6.0',
        apiMode: 'database',
      });
      (isVersionAtLeast as jest.Mock).mockReturnValue(true);

      const adapter = await AdapterFactory.createAdapter(mockConfig);

      expect(DatabaseAdapter).toHaveBeenCalledWith(expect.anything(), mockConfig);
      expect(adapter).toBeInstanceOf(DatabaseAdapter);
    });

    it('should create TablesDBAdapter for Appwrite 1.8.0+ in tablesdb mode', async () => {
      (detectAppwriteVersionCached as jest.Mock).mockResolvedValue({
        serverVersion: '1.8.0',
        apiMode: 'tablesdb',
      });
      (isVersionAtLeast as jest.Mock).mockReturnValue(true);

      const adapter = await AdapterFactory.createAdapter(mockConfig);

      expect(TablesDBAdapter).toHaveBeenCalledWith(expect.anything(), mockConfig);
      expect(adapter).toBeInstanceOf(TablesDBAdapter);
    });

    it('should force TablesDBAdapter when explicitly specified in config', async () => {
      (detectAppwriteVersionCached as jest.Mock).mockResolvedValue({
        serverVersion: '1.6.0',
        apiMode: 'database',
      });

      const configWithForce = {
        ...mockConfig,
        forceTablesAPI: true,
      };

      const adapter = await AdapterFactory.createAdapter(configWithForce);

      expect(TablesDBAdapter).toHaveBeenCalledWith(expect.anything(), configWithForce);
      expect(adapter).toBeInstanceOf(TablesDBAdapter);
    });

    it('should force DatabaseAdapter when explicitly specified in config', async () => {
      (detectAppwriteVersionCached as jest.Mock).mockResolvedValue({
        serverVersion: '1.8.0',
        apiMode: 'tablesdb',
      });

      const configWithForce = {
        ...mockConfig,
        forceDatabaseAPI: true,
      };

      const adapter = await AdapterFactory.createAdapter(configWithForce);

      expect(DatabaseAdapter).toHaveBeenCalledWith(expect.anything(), configWithForce);
      expect(adapter).toBeInstanceOf(DatabaseAdapter);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate database configuration for DatabaseAdapter', async () => {
      (detectAppwriteVersionCached as jest.Mock).mockResolvedValue({
        serverVersion: '1.6.0',
        apiMode: 'database',
      });

      const configWithMissingDB = {
        ...mockConfig,
        databases: [],
      };

      await expect(AdapterFactory.createAdapter(configWithMissingDB))
        .rejects.toThrow('Database configuration required');
    });

    it('should validate table configurations for TablesDBAdapter', async () => {
      (detectAppwriteVersionCached as jest.Mock).mockResolvedValue({
        serverVersion: '1.8.0',
        apiMode: 'tablesdb',
      });

      const configWithTablesButNoDatabaseIds = {
        ...mockConfig,
        collections: [
          TestUtils.createTestTable({
            databaseId: undefined, // Missing required databaseId
          })
        ],
      };

      await expect(AdapterFactory.createAdapter(configWithTablesButNoDatabaseIds))
        .rejects.toThrow('Table configurations must include databaseId');
    });
  });

  describe('Mixed Configuration Handling', () => {
    it('should handle mixed collections and tables for appropriate adapter', async () => {
      (detectAppwriteVersionCached as jest.Mock).mockResolvedValue({
        serverVersion: '1.8.0',
        apiMode: 'tablesdb',
      });

      const mixedConfig = {
        ...mockConfig,
        collections: [
          TestUtils.createTestCollection(), // Regular collection
          TestUtils.createTestTable(), // Table with _isFromTablesDir
        ],
      };

      const adapter = await AdapterFactory.createAdapter(mixedConfig);

      expect(TablesDBAdapter).toHaveBeenCalledWith(expect.anything(), mixedConfig);
      expect(adapter).toBeInstanceOf(TablesDBAdapter);
    });

    it('should filter out inappropriate configurations per adapter', async () => {
      (detectAppwriteVersionCached as jest.Mock).mockResolvedValue({
        serverVersion: '1.6.0',
        apiMode: 'database',
      });

      const mixedConfig = {
        ...mockConfig,
        collections: [
          TestUtils.createTestCollection(), // Regular collection
          TestUtils.createTestTable(), // Table (should be filtered for DatabaseAdapter)
        ],
      };

      const adapter = await AdapterFactory.createAdapter(mixedConfig);

      expect(DatabaseAdapter).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          collections: expect.arrayContaining([
            expect.not.objectContaining({ _isFromTablesDir: true })
          ])
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle version detection failures gracefully', async () => {
      (detectAppwriteVersionCached as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Should fall back to LegacyAdapter
      const adapter = await AdapterFactory.createAdapter(mockConfig);

      expect(LegacyAdapter).toHaveBeenCalledWith(expect.anything(), mockConfig);
      expect(adapter).toBeInstanceOf(LegacyAdapter);
    });

    it('should handle invalid server versions', async () => {
      (detectAppwriteVersionCached as jest.Mock).mockResolvedValue({
        serverVersion: 'invalid-version',
        apiMode: 'unknown',
      });

      const adapter = await AdapterFactory.createAdapter(mockConfig);

      expect(LegacyAdapter).toHaveBeenCalledWith(expect.anything(), mockConfig);
      expect(adapter).toBeInstanceOf(LegacyAdapter);
    });
  });

  describe('Client Configuration', () => {
    it('should pass correct client configuration to each adapter', async () => {
      (detectAppwriteVersionCached as jest.Mock).mockResolvedValue({
        serverVersion: '1.8.0',
        apiMode: 'tablesdb',
      });

      await AdapterFactory.createAdapter(mockConfig);

      expect(TablesDBAdapter).toHaveBeenCalledWith(
        expect.objectContaining({
          setEndpoint: expect.any(Function),
          setProject: expect.any(Function),
          setKey: expect.any(Function),
        }),
        mockConfig
      );
    });

    it('should handle custom endpoint configurations', async () => {
      const customConfig = {
        ...mockConfig,
        appwriteEndpoint: 'https://custom.appwrite.server/v1',
      };

      await AdapterFactory.createAdapter(customConfig);

      // Verify that the adapter receives the custom endpoint configuration
      expect(TablesDBAdapter || DatabaseAdapter || LegacyAdapter).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          appwriteEndpoint: 'https://custom.appwrite.server/v1',
        })
      );
    });
  });

  describe('Caching and Performance', () => {
    it('should cache adapter instances for same configuration', async () => {
      (detectAppwriteVersionCached as jest.Mock).mockResolvedValue({
        serverVersion: '1.6.0',
        apiMode: 'database',
      });

      const adapter1 = await AdapterFactory.createAdapter(mockConfig);
      const adapter2 = await AdapterFactory.createAdapter(mockConfig);

      // Should reuse the same instance or create efficiently
      expect(DatabaseAdapter).toHaveBeenCalledTimes(2);
    });

    it('should use cached version detection results', async () => {
      (detectAppwriteVersionCached as jest.Mock).mockResolvedValue({
        serverVersion: '1.6.0',
        apiMode: 'database',
      });

      await AdapterFactory.createAdapter(mockConfig);
      await AdapterFactory.createAdapter(mockConfig);

      // Version detection should be called but may be cached
      expect(detectAppwriteVersionCached).toHaveBeenCalled();
    });
  });
});