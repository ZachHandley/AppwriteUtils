import yaml from "js-yaml";
import type { Collection, CollectionCreate } from "appwrite-utils";

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
    default?: any;
    description?: string;
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
  indexes?: Array<{
    key: string;
    type: string;
    attributes: string[];
    orders?: string[];
  }>;
  importDefs?: any[];
}

/**
 * Converts a Collection object to YAML format with proper schema reference
 */
export function collectionToYaml(collection: Collection | CollectionCreate, schemaPath = "../.yaml_schemas/collection.schema.json"): string {
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

  // Convert attributes
  if (collection.attributes && collection.attributes.length > 0) {
    yamlData.attributes = collection.attributes.map(attr => {
      const yamlAttr: any = {
        key: attr.key,
        type: attr.type,
      };

      // Add optional properties only if they exist (safely access with 'in' operator)
      if ('size' in attr && attr.size !== undefined) yamlAttr.size = attr.size;
      if (attr.required !== undefined) yamlAttr.required = attr.required;
      if (attr.array !== undefined) yamlAttr.array = attr.array;
      if ('xdefault' in attr && attr.xdefault !== undefined) yamlAttr.default = attr.xdefault;
      if (attr.description !== undefined) yamlAttr.description = attr.description;
      if ('min' in attr && attr.min !== undefined) yamlAttr.min = attr.min;
      if ('max' in attr && attr.max !== undefined) yamlAttr.max = attr.max;
      if ('elements' in attr && attr.elements !== undefined) yamlAttr.elements = attr.elements;
      if ('relatedCollection' in attr && attr.relatedCollection !== undefined) yamlAttr.relatedCollection = attr.relatedCollection;
      if ('relationType' in attr && attr.relationType !== undefined) yamlAttr.relationType = attr.relationType;
      if ('twoWay' in attr && attr.twoWay !== undefined) yamlAttr.twoWay = attr.twoWay;
      if ('twoWayKey' in attr && attr.twoWayKey !== undefined) yamlAttr.twoWayKey = attr.twoWayKey;
      if ('onDelete' in attr && attr.onDelete !== undefined) yamlAttr.onDelete = attr.onDelete;
      if ('side' in attr && attr.side !== undefined) yamlAttr.side = attr.side;

      return yamlAttr;
    });
  }

  // Convert indexes
  if (collection.indexes && collection.indexes.length > 0) {
    yamlData.indexes = collection.indexes.map(idx => ({
      key: idx.key,
      type: idx.type,
      attributes: idx.attributes,
      ...(idx.orders && idx.orders.length > 0 ? { orders: idx.orders } : {})
    }));
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

  return `# yaml-language-server: $schema=${schemaPath}
# Collection Definition: ${collection.name}
${yamlContent}`;
}

/**
 * Sanitizes a collection name for use as a filename
 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Generates the filename for a collection YAML file
 */
export function getCollectionYamlFilename(collection: Collection | CollectionCreate): string {
  return `${sanitizeFilename(collection.name)}.yaml`;
}