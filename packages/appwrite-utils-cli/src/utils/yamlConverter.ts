import yaml from "js-yaml";
import type { Collection, CollectionCreate } from "appwrite-utils";

// Threshold for treating min/max values as undefined (1 trillion)
const MIN_MAX_THRESHOLD = 1_000_000_000_000;

export interface YamlCollectionData {
  name: string;
  id?: string;
  documentSecurity?: boolean;
  enabled?: boolean;
  permissions?: Array<{
    permission: string;
    target: string;
  }>;
  attributes?: Array<{
    key: string;
    type: string;
    size?: number;
    required?: boolean;
    array?: boolean;
    encrypt?: boolean;
    default?: any;
    min?: number;
    max?: number;
    elements?: string[];
    relatedCollection?: string;
    relationType?: string;
    twoWay?: boolean;
    twoWayKey?: string;
    onDelete?: string;
    side?: string;
  }>;
  // Table terminology support (columns is an alias for attributes)
  columns?: Array<{
    key: string;
    type: string;
    size?: number;
    required?: boolean;
    array?: boolean;
    encrypt?: boolean;
    default?: any;
    min?: number;
    max?: number;
    elements?: string[];
    relatedTable?: string;
    relationType?: string;
    twoWay?: boolean;
    twoWayKey?: string;
    onDelete?: string;
    side?: string;
  }>;
  indexes?: Array<{
    key: string;
    type: string;
    attributes: string[];
    columns?: string[]; // Support both terminologies
    orders?: string[];
  }>;
  importDefs?: any[];
}

/**
 * Configuration for terminology selection
 */
export interface YamlTerminologyConfig {
  useTableTerminology: boolean;
  entityType: 'collection' | 'table';
  schemaPath?: string;
}

/**
 * Converts a Collection object to YAML format with proper schema reference
 * Supports both collection and table terminology based on configuration
 */
export function collectionToYaml(
  collection: Collection | CollectionCreate,
  config: YamlTerminologyConfig = {
    useTableTerminology: false,
    entityType: 'collection',
    schemaPath: "../.yaml_schemas/collection.schema.json"
  }
): string {
  const schemaPath = config.schemaPath || (config.useTableTerminology ? "../.yaml_schemas/table.schema.json" : "../.yaml_schemas/collection.schema.json");
  // Convert Collection to YamlCollectionData format
  const yamlData: YamlCollectionData = {
    name: collection.name,
    id: collection.$id,
    documentSecurity: collection.documentSecurity,
    enabled: collection.enabled,
  };

  // Convert permissions
  if (collection.$permissions && collection.$permissions.length > 0) {
    yamlData.permissions = collection.$permissions.map(p => ({
      permission: p.permission,
      target: p.target
    }));
  }

  // Convert attributes/columns based on terminology
  if (collection.attributes && collection.attributes.length > 0) {
    const attributeArray = collection.attributes.map(attr => {
      const yamlAttr: any = {
        key: attr.key,
        type: attr.type,
      };

      // Add optional properties only if they exist (safely access with 'in' operator)
      if ('size' in attr && attr.size !== undefined) yamlAttr.size = attr.size;
      if (attr.required !== undefined) yamlAttr.required = attr.required;
      if (attr.array !== undefined) yamlAttr.array = attr.array;

      // Always include encrypt field for string attributes (default to false)
      if (attr.type === 'string') {
        yamlAttr.encrypt = ('encrypted' in attr && attr.encrypted === true) ? true : false;
      }

      if ('xdefault' in attr && attr.xdefault !== undefined) yamlAttr.default = attr.xdefault;

      // Normalize min/max values - filter out extreme database values
      if ('min' in attr && attr.min !== undefined) {
        const minValue = Number(attr.min);
        // Only include min if it's within reasonable range (< 1 trillion)
        if (Math.abs(minValue) < MIN_MAX_THRESHOLD) {
          yamlAttr.min = attr.min;
        }
      }

      if ('max' in attr && attr.max !== undefined) {
        const maxValue = Number(attr.max);
        // Only include max if it's within reasonable range (< 1 trillion)
        if (Math.abs(maxValue) < MIN_MAX_THRESHOLD) {
          yamlAttr.max = attr.max;
        }
      }
      if ('elements' in attr && attr.elements !== undefined) yamlAttr.elements = attr.elements;
      if ('relatedCollection' in attr && attr.relatedCollection !== undefined) yamlAttr.relatedCollection = attr.relatedCollection;
      if ('relationType' in attr && attr.relationType !== undefined) yamlAttr.relationType = attr.relationType;
      if ('twoWay' in attr && attr.twoWay !== undefined) yamlAttr.twoWay = attr.twoWay;
      if ('twoWayKey' in attr && attr.twoWayKey !== undefined) yamlAttr.twoWayKey = attr.twoWayKey;
      if ('onDelete' in attr && attr.onDelete !== undefined) yamlAttr.onDelete = attr.onDelete;
      if ('side' in attr && attr.side !== undefined) yamlAttr.side = attr.side;

      return yamlAttr;
    });

    // Use appropriate terminology
    if (config.useTableTerminology) {
      yamlData.columns = attributeArray;
    } else {
      yamlData.attributes = attributeArray;
    }
  }

  // Convert indexes with appropriate field references
  if (collection.indexes && collection.indexes.length > 0) {
    yamlData.indexes = collection.indexes.map(idx => {
      const indexData: any = {
        key: idx.key,
        type: idx.type,
        ...(idx.orders && idx.orders.length > 0 ? { orders: idx.orders } : {})
      };

      // Use appropriate field terminology for index references
      if (config.useTableTerminology) {
        indexData.columns = idx.attributes;
      } else {
        indexData.attributes = idx.attributes;
      }

      return indexData;
    });
  }

  // Add import definitions if they exist
  if (collection.importDefs && collection.importDefs.length > 0) {
    yamlData.importDefs = collection.importDefs;
  } else {
    yamlData.importDefs = [];
  }

  // Generate YAML with schema reference
  const yamlContent = yaml.dump(yamlData, {
    indent: 2,
    lineWidth: 120,
    sortKeys: false,
    quotingType: '"',
    forceQuotes: false,
  });

  // Determine the appropriate schema comment based on configuration
  const entityType = config.useTableTerminology ? 'Table' : 'Collection';

  return `# yaml-language-server: $schema=${schemaPath}
# ${entityType} Definition: ${collection.name}
${yamlContent}`;
}

/**
 * Sanitizes a collection name for use as a filename
 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Generates the filename for a collection/table YAML file
 */
export function getCollectionYamlFilename(
  collection: Collection | CollectionCreate,
  useTableTerminology = false
): string {
  return `${sanitizeFilename(collection.name)}.yaml`;
}

/**
 * Converts column terminology back to attribute terminology for loading
 */
export function normalizeYamlData(yamlData: YamlCollectionData): YamlCollectionData {
  const normalized = { ...yamlData };

  // Convert columns to attributes if present
  if (yamlData.columns && !yamlData.attributes) {
    normalized.attributes = yamlData.columns.map(col => ({
      ...col,
      // Convert table-specific fields back to collection terminology
      relatedCollection: (col as any).relatedTable || (col as any).relatedCollection,
    }));
    delete normalized.columns;
  }

  // Normalize index field references
  if (normalized.indexes) {
    normalized.indexes = normalized.indexes.map(idx => ({
      ...idx,
      attributes: idx.columns || idx.attributes,
      // Remove columns field after normalization
      columns: undefined
    }));
  }

  return normalized;
}

/**
 * Determines if YAML data uses table terminology
 */
export function usesTableTerminology(yamlData: YamlCollectionData): boolean {
  return !!(yamlData.columns && yamlData.columns.length > 0) ||
         !!(yamlData.indexes?.some(idx => !!(idx as any).columns));
}

/**
 * Converts between attribute and column terminology
 */
export function convertTerminology(
  yamlData: YamlCollectionData,
  toTableTerminology: boolean
): YamlCollectionData {
  if (toTableTerminology) {
    // Convert attributes to columns
    const converted = { ...yamlData };
    if (yamlData.attributes) {
      converted.columns = yamlData.attributes.map(attr => ({
        ...attr,
        relatedTable: attr.relatedCollection,
        relatedCollection: undefined
      }));
      delete converted.attributes;
    }

    // Convert index references
    if (converted.indexes) {
      converted.indexes = converted.indexes.map(idx => ({
        ...idx,
        columns: idx.attributes,
        attributes: idx.attributes // Keep both for compatibility
      }));
    }

    return converted;
  } else {
    // Convert columns to attributes (normalize)
    return normalizeYamlData(yamlData);
  }
}

/**
 * Generates a template YAML file for collections or tables
 */
export function generateYamlTemplate(
  entityName: string,
  config: YamlTerminologyConfig
): string {
  const entityType = config.useTableTerminology ? 'table' : 'collection';
  const fieldsKey = config.useTableTerminology ? 'columns' : 'attributes';
  const relationKey = config.useTableTerminology ? 'relatedTable' : 'relatedCollection';
  const indexFieldsKey = config.useTableTerminology ? 'columns' : 'attributes';

  // Build template dynamically to handle computed property names
  const fieldsArray = [
    {
      key: "id",
      type: "string",
      required: true,
      size: 36
    },
    {
      key: "name",
      type: "string",
      required: true,
      size: 255
    },
    {
      key: "description",
      type: "string",
      required: false,
      size: 1000
    },
    {
      key: "isActive",
      type: "boolean",
      required: true,
      default: true
    },
    {
      key: "createdAt",
      type: "datetime",
      required: true
    },
    {
      key: "tags",
      type: "string",
      array: true,
      required: false
    },
    {
      key: "categoryId",
      type: "relationship",
      relationType: "manyToOne",
      [relationKey]: "Categories",
      required: false,
      onDelete: "setNull"
    }
  ];

  const indexesArray = [
    {
      key: "name_index",
      type: "key",
      [indexFieldsKey]: ["name"]
    },
    {
      key: "active_created_index",
      type: "key",
      [indexFieldsKey]: ["isActive", "createdAt"],
      orders: ["asc", "desc"]
    },
    {
      key: "name_fulltext",
      type: "fulltext",
      [indexFieldsKey]: ["name", "description"]
    }
  ];

  const template: YamlCollectionData = {
    name: entityName,
    id: entityName.toLowerCase().replace(/\s+/g, '_'),
    documentSecurity: false,
    enabled: true,
    permissions: [
      {
        permission: "read",
        target: "users"
      },
      {
        permission: "create",
        target: "users"
      },
      {
        permission: "update",
        target: "users"
      },
      {
        permission: "delete",
        target: "users"
      }
    ],
    importDefs: []
  };

  // Assign fields with correct property name
  (template as any)[fieldsKey] = fieldsArray;
  template.indexes = indexesArray as any;

  // Generate YAML content
  const yamlContent = yaml.dump(template, {
    indent: 2,
    lineWidth: 120,
    sortKeys: false,
    quotingType: '"',
    forceQuotes: false,
  });

  // Add schema reference and documentation
  const schemaPath = config.schemaPath ||
    (config.useTableTerminology ? "../.yaml_schemas/table.schema.json" : "../.yaml_schemas/collection.schema.json");

  const documentation = config.useTableTerminology
    ? `# Table Definition: ${entityName}\n# This file defines a table for the new TablesDB API\n#\n# Key differences from Collections:\n# - Uses 'columns' instead of 'attributes'\n# - Uses 'relatedTable' instead of 'relatedCollection'\n# - Indexes reference 'columns' instead of 'attributes'\n#\n`
    : `# Collection Definition: ${entityName}\n# This file defines a collection for the legacy Databases API\n#\n# Note: For new projects, consider using TablesDB API with table definitions\n#\n`;

  return `# yaml-language-server: $schema=${schemaPath}\n${documentation}${yamlContent}`;
}

/**
 * Generates example YAML files for both collection and table formats
 */
export function generateExampleYamls(entityName: string): {
  collection: string;
  table: string;
} {
  const collectionYaml = generateYamlTemplate(entityName, {
    useTableTerminology: false,
    entityType: 'collection'
  });

  const tableYaml = generateYamlTemplate(entityName, {
    useTableTerminology: true,
    entityType: 'table'
  });

  return {
    collection: collectionYaml,
    table: tableYaml
  };
}

