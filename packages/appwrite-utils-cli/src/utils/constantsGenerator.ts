import fs from "fs/promises";
import path from "path";
import { type AppwriteConfig } from "appwrite-utils";
import { MessageFormatter } from "../shared/messageFormatter.js";

export type SupportedLanguage = 
  | "typescript" 
  | "javascript" 
  | "python" 
  | "php" 
  | "dart" 
  | "json" 
  | "env";

interface Constants {
  databases: Record<string, string>;
  collections: Record<string, string>;
  buckets: Record<string, string>;
  functions: Record<string, string>;
}

export class ConstantsGenerator {
  private config: AppwriteConfig;
  private constants: Constants;

  constructor(config: AppwriteConfig) {
    this.config = config;
    this.constants = this.extractConstants();
  }

  private extractConstants(): Constants {
    const constants: Constants = {
      databases: {},
      collections: {},
      buckets: {},
      functions: {}
    };

    // Extract database IDs
    this.config.databases?.forEach(db => {
      if (db.$id) {
        const key = this.toConstantName(db.name || db.$id);
        constants.databases[key] = db.$id;
      }
    });

    // Extract collection IDs
    this.config.collections?.forEach(collection => {
      if (collection.$id) {
        const key = this.toConstantName(collection.name || collection.$id);
        constants.collections[key] = collection.$id;
      }
    });

    // Extract bucket IDs
    this.config.buckets?.forEach(bucket => {
      if (bucket.$id) {
        const key = this.toConstantName(bucket.name || bucket.$id);
        constants.buckets[key] = bucket.$id;
      }
    });

    // Extract function IDs
    this.config.functions?.forEach(func => {
      if (func.$id) {
        const key = this.toConstantName(func.name || func.$id);
        constants.functions[key] = func.$id;
      }
    });

    return constants;
  }

  private toConstantName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toUpperCase();
  }

  private toCamelCase(name: string): string {
    return name
      .toLowerCase()
      .replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  private toSnakeCase(name: string): string {
    return name.toLowerCase();
  }

  generateTypeScript(): string {
    const { databases, collections, buckets, functions } = this.constants;

    return `// Auto-generated Appwrite constants
// Generated on ${new Date().toISOString()}

export const DATABASE_IDS = {
${Object.entries(databases).map(([key, value]) => `  ${key}: "${value}"`).join(',\n')}
} as const;

export const COLLECTION_IDS = {
${Object.entries(collections).map(([key, value]) => `  ${key}: "${value}"`).join(',\n')}
} as const;

export const BUCKET_IDS = {
${Object.entries(buckets).map(([key, value]) => `  ${key}: "${value}"`).join(',\n')}
} as const;

export const FUNCTION_IDS = {
${Object.entries(functions).map(([key, value]) => `  ${key}: "${value}"`).join(',\n')}
} as const;

// Type helpers
export type DatabaseId = typeof DATABASE_IDS[keyof typeof DATABASE_IDS];
export type CollectionId = typeof COLLECTION_IDS[keyof typeof COLLECTION_IDS];
export type BucketId = typeof BUCKET_IDS[keyof typeof BUCKET_IDS];
export type FunctionId = typeof FUNCTION_IDS[keyof typeof FUNCTION_IDS];

// Helper objects for runtime use
export const ALL_DATABASE_IDS = Object.values(DATABASE_IDS);
export const ALL_COLLECTION_IDS = Object.values(COLLECTION_IDS);
export const ALL_BUCKET_IDS = Object.values(BUCKET_IDS);
export const ALL_FUNCTION_IDS = Object.values(FUNCTION_IDS);
`;
  }

  generateJavaScript(): string {
    const { databases, collections, buckets, functions } = this.constants;

    return `// Auto-generated Appwrite constants
// Generated on ${new Date().toISOString()}

export const DATABASE_IDS = {
${Object.entries(databases).map(([key, value]) => `  ${key}: "${value}"`).join(',\n')}
};

export const COLLECTION_IDS = {
${Object.entries(collections).map(([key, value]) => `  ${key}: "${value}"`).join(',\n')}
};

export const BUCKET_IDS = {
${Object.entries(buckets).map(([key, value]) => `  ${key}: "${value}"`).join(',\n')}
};

export const FUNCTION_IDS = {
${Object.entries(functions).map(([key, value]) => `  ${key}: "${value}"`).join(',\n')}
};

// Helper arrays for runtime use
export const ALL_DATABASE_IDS = Object.values(DATABASE_IDS);
export const ALL_COLLECTION_IDS = Object.values(COLLECTION_IDS);
export const ALL_BUCKET_IDS = Object.values(BUCKET_IDS);
export const ALL_FUNCTION_IDS = Object.values(FUNCTION_IDS);
`;
  }

  generatePython(): string {
    const { databases, collections, buckets, functions } = this.constants;

    return `# Auto-generated Appwrite constants
# Generated on ${new Date().toISOString()}

class DatabaseIds:
    """Database ID constants"""
${Object.entries(databases).map(([key, value]) => `    ${key} = "${value}"`).join('\n')}

class CollectionIds:
    """Collection ID constants"""
${Object.entries(collections).map(([key, value]) => `    ${key} = "${value}"`).join('\n')}

class BucketIds:
    """Bucket ID constants"""
${Object.entries(buckets).map(([key, value]) => `    ${key} = "${value}"`).join('\n')}

class FunctionIds:
    """Function ID constants"""
${Object.entries(functions).map(([key, value]) => `    ${key} = "${value}"`).join('\n')}

# Helper dictionaries for runtime use
DATABASE_ID_MAP = {
${Object.entries(databases).map(([key, value]) => `    "${this.toSnakeCase(key)}": "${value}"`).join(',\n')}
}

COLLECTION_ID_MAP = {
${Object.entries(collections).map(([key, value]) => `    "${this.toSnakeCase(key)}": "${value}"`).join(',\n')}
}

BUCKET_ID_MAP = {
${Object.entries(buckets).map(([key, value]) => `    "${this.toSnakeCase(key)}": "${value}"`).join(',\n')}
}

FUNCTION_ID_MAP = {
${Object.entries(functions).map(([key, value]) => `    "${this.toSnakeCase(key)}": "${value}"`).join(',\n')}
}
`;
  }

  generatePHP(): string {
    const { databases, collections, buckets, functions } = this.constants;

    return `<?php
// Auto-generated Appwrite constants
// Generated on ${new Date().toISOString()}

class AppwriteConstants {
    
    const DATABASE_IDS = [
${Object.entries(databases).map(([key, value]) => `        '${key}' => '${value}'`).join(',\n')}
    ];
    
    const COLLECTION_IDS = [
${Object.entries(collections).map(([key, value]) => `        '${key}' => '${value}'`).join(',\n')}
    ];
    
    const BUCKET_IDS = [
${Object.entries(buckets).map(([key, value]) => `        '${key}' => '${value}'`).join(',\n')}
    ];
    
    const FUNCTION_IDS = [
${Object.entries(functions).map(([key, value]) => `        '${key}' => '${value}'`).join(',\n')}
    ];
    
    /**
     * Get all database IDs as array
     */
    public static function getAllDatabaseIds(): array {
        return array_values(self::DATABASE_IDS);
    }
    
    /**
     * Get all collection IDs as array
     */
    public static function getAllCollectionIds(): array {
        return array_values(self::COLLECTION_IDS);
    }
    
    /**
     * Get all bucket IDs as array
     */
    public static function getAllBucketIds(): array {
        return array_values(self::BUCKET_IDS);
    }
    
    /**
     * Get all function IDs as array
     */
    public static function getAllFunctionIds(): array {
        return array_values(self::FUNCTION_IDS);
    }
}
`;
  }

  generateDart(): string {
    const { databases, collections, buckets, functions } = this.constants;

    return `// Auto-generated Appwrite constants
// Generated on ${new Date().toISOString()}

class AppwriteConstants {
  
  static const Map<String, String> databaseIds = {
${Object.entries(databases).map(([key, value]) => `    '${this.toCamelCase(key)}': '${value}'`).join(',\n')}
  };
  
  static const Map<String, String> collectionIds = {
${Object.entries(collections).map(([key, value]) => `    '${this.toCamelCase(key)}': '${value}'`).join(',\n')}
  };
  
  static const Map<String, String> bucketIds = {
${Object.entries(buckets).map(([key, value]) => `    '${this.toCamelCase(key)}': '${value}'`).join(',\n')}
  };
  
  static const Map<String, String> functionIds = {
${Object.entries(functions).map(([key, value]) => `    '${this.toCamelCase(key)}': '${value}'`).join(',\n')}
  };
  
  // Helper getters for individual IDs
${Object.entries(databases).map(([key, value]) => `  static String get ${this.toCamelCase(key)}DatabaseId => '${value}';`).join('\n')}
  
${Object.entries(collections).map(([key, value]) => `  static String get ${this.toCamelCase(key)}CollectionId => '${value}';`).join('\n')}
  
${Object.entries(buckets).map(([key, value]) => `  static String get ${this.toCamelCase(key)}BucketId => '${value}';`).join('\n')}
  
${Object.entries(functions).map(([key, value]) => `  static String get ${this.toCamelCase(key)}FunctionId => '${value}';`).join('\n')}
}
`;
  }

  generateJSON(): string {
    return JSON.stringify({
      meta: {
        generated: new Date().toISOString(),
        generator: "appwrite-utils-cli"
      },
      databases: this.constants.databases,
      collections: this.constants.collections,
      buckets: this.constants.buckets,
      functions: this.constants.functions
    }, null, 2);
  }

  generateEnv(): string {
    const { databases, collections, buckets, functions } = this.constants;
    
    const lines = [
      "# Auto-generated Appwrite constants",
      `# Generated on ${new Date().toISOString()}`,
      "",
      "# Database IDs",
      ...Object.entries(databases).map(([key, value]) => `DATABASE_${key}=${value}`),
      "",
      "# Collection IDs", 
      ...Object.entries(collections).map(([key, value]) => `COLLECTION_${key}=${value}`),
      "",
      "# Bucket IDs",
      ...Object.entries(buckets).map(([key, value]) => `BUCKET_${key}=${value}`),
      "",
      "# Function IDs",
      ...Object.entries(functions).map(([key, value]) => `FUNCTION_${key}=${value}`)
    ];
    
    return lines.join('\n');
  }

  async generateFiles(languages: SupportedLanguage[], outputDir: string): Promise<void> {
    await fs.mkdir(outputDir, { recursive: true });

    const generators = {
      typescript: () => ({ content: this.generateTypeScript(), filename: "appwrite-constants.ts" }),
      javascript: () => ({ content: this.generateJavaScript(), filename: "appwrite-constants.js" }),
      python: () => ({ content: this.generatePython(), filename: "appwrite_constants.py" }),
      php: () => ({ content: this.generatePHP(), filename: "AppwriteConstants.php" }),
      dart: () => ({ content: this.generateDart(), filename: "appwrite_constants.dart" }),
      json: () => ({ content: this.generateJSON(), filename: "appwrite-constants.json" }),
      env: () => ({ content: this.generateEnv(), filename: ".env.appwrite" })
    };

    for (const language of languages) {
      const generator = generators[language];
      if (generator) {
        const { content, filename } = generator();
        const filePath = path.join(outputDir, filename);
        await fs.writeFile(filePath, content, 'utf-8');
        MessageFormatter.success(`Generated ${language} constants: ${filePath}`, { prefix: "Constants" });
      } else {
        MessageFormatter.error(`Unsupported language: ${language}`, undefined, { prefix: "Constants" });
      }
    }
  }
}