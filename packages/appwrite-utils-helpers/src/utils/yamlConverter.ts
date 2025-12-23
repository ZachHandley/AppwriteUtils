import yaml from "js-yaml";
import type { Collection, CollectionCreate } from "appwrite-utils";
import { Decimal } from "decimal.js";

// Extreme values that Appwrite may return, which should be treated as undefined
const EXTREME_MIN_INTEGER = -9223372036854776000;
const EXTREME_MAX_INTEGER = 9223372036854776000;
const EXTREME_MIN_FLOAT = -1.7976931348623157e+308;
const EXTREME_MAX_FLOAT = 1.7976931348623157e+308;

/**
 * Type guard to check if an attribute has min/max properties
 */
const hasMinMaxProperties = (yamlAttr: any): boolean => {
  return yamlAttr.type === 'integer' || yamlAttr.type === 'double' || yamlAttr.type === 'float';
};

/**
 * Normalizes min/max values for integer and float attributes using Decimal.js for precision
 * Validates that min < max and handles extreme database values
 */
const normalizeMinMaxValues = (yamlAttr: any): { min?: number; max?: number } => {
  if (!hasMinMaxProperties(yamlAttr)) {
    return {};
  }

  const { type, min, max, key } = yamlAttr;
  let normalizedMin = min;
  let normalizedMax = max;

  // Handle min value - only filter out extreme database values
  if (normalizedMin !== undefined && normalizedMin !== null) {
    const minValue = Number(normalizedMin);
    const originalMin = normalizedMin;

    // Check if it's an extreme database value (but don't filter out large numbers)
    if (type === 'integer') {
      if (minValue === EXTREME_MIN_INTEGER) {
        console.debug(`Min value normalized to undefined for attribute '${yamlAttr.key}': extreme database value`);
        normalizedMin = undefined;
      }
    } else { // float/double
      if (minValue === EXTREME_MIN_FLOAT) {
        console.debug(`Min value normalized to undefined for attribute '${yamlAttr.key}': extreme database value`);
        normalizedMin = undefined;
      }
    }
  }

  // Handle max value - only filter out extreme database values
  if (normalizedMax !== undefined && normalizedMax !== null) {
    const maxValue = Number(normalizedMax);
    const originalMax = normalizedMax;

    // Check if it's an extreme database value (but don't filter out large numbers)
    if (type === 'integer') {
      if (maxValue === EXTREME_MAX_INTEGER) {
        console.debug(`Max value normalized to undefined for attribute '${yamlAttr.key}': extreme database value`);
        normalizedMax = undefined;
      }
    } else { // float/double
      if (maxValue === EXTREME_MAX_FLOAT) {
        console.debug(`Max value normalized to undefined for attribute '${yamlAttr.key}': extreme database value`);
        normalizedMax = undefined;
      }
    }
  }

  // Validate that min < max using Decimal.js for safe comparison
  if (normalizedMin !== undefined && normalizedMax !== undefined &&
      normalizedMin !== null && normalizedMax !== null) {
    try {
      const minDecimal = new Decimal(normalizedMin.toString());
      const maxDecimal = new Decimal(normalizedMax.toString());

      if (minDecimal.greaterThanOrEqualTo(maxDecimal)) {
        // Swap values to ensure min < max (graceful handling)
        console.warn(`Swapping min/max values for attribute '${yamlAttr.key}' to fix validation: min (${normalizedMin}) must be less than max (${normalizedMax})`);
        const temp = normalizedMin;
        normalizedMin = normalizedMax;
        normalizedMax = temp;
      }
    } catch (error) {
      console.error(`Error comparing min/max values for attribute '${yamlAttr.key}':`, error);
      // If Decimal comparison fails, set both to undefined to avoid API errors
      normalizedMin = undefined;
      normalizedMax = undefined;
    }
  }

  return { min: normalizedMin, max: normalizedMax };
};

export interface YamlCollectionData {
  name: string;
  id?: string;
  documentSecurity?: boolean;
  rowSecurity?: boolean;
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
    enabled: collection.enabled,
  };

  // Use appropriate security field based on terminology
  if (config.useTableTerminology) {
    yamlData.rowSecurity = collection.documentSecurity;
  } else {
    yamlData.documentSecurity = collection.documentSecurity;
  }

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
        yamlAttr.encrypt = ('encrypt' in attr && (attr as any).encrypt === true) ? true : false;
      }

      if ('xdefault' in attr && attr.xdefault !== undefined) yamlAttr.default = attr.xdefault;

      // Normalize min/max values using Decimal.js precision
      if ('min' in attr || 'max' in attr) {
        const { min, max } = normalizeMinMaxValues(attr);
        if (min !== undefined) yamlAttr.min = min;
        if (max !== undefined) yamlAttr.max = max;
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

  // Normalize security fields - prefer documentSecurity for consistency
  if (yamlData.rowSecurity !== undefined && yamlData.documentSecurity === undefined) {
    normalized.documentSecurity = yamlData.rowSecurity;
    delete normalized.rowSecurity;
  }

  return normalized;
}

/**
 * Determines if YAML data uses table terminology
 */
export function usesTableTerminology(yamlData: YamlCollectionData): boolean {
  return !!(yamlData.columns && yamlData.columns.length > 0) ||
         !!(yamlData.indexes?.some(idx => !!(idx as any).columns)) ||
         yamlData.rowSecurity !== undefined;
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

    // Convert security field
    if (yamlData.documentSecurity !== undefined && yamlData.rowSecurity === undefined) {
      converted.rowSecurity = yamlData.documentSecurity;
      delete converted.documentSecurity;
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

  // Use appropriate security field based on terminology
  if (config.useTableTerminology) {
    template.rowSecurity = false;
  } else {
    template.documentSecurity = false;
  }

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
