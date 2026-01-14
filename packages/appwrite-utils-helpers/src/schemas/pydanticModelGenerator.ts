import fs from 'fs';
import path from 'path';
import { MessageFormatter } from './messageFormatter.js';
import type { AppwriteConfig, Attribute } from 'appwrite-utils';

// Embedded template for base Pydantic model (always written as base.py)
const BASE_PYDANTIC_TEMPLATE = `"""
Appwrite-compatible Pydantic base models for SmartScraper.

Provides clean base classes for all Appwrite document models without SQLAlchemy dependencies.
"""

import json
from datetime import datetime
from typing import Any, ClassVar

from pydantic import BaseModel, Field, field_validator


class BaseAppwriteModel(BaseModel):
    """
    Base Appwrite-compatible Pydantic model with field aliases for Appwrite's $ prefixed fields.

    Handles the mapping between Python-compatible field names and Appwrite's $ prefixed fields:
    - rid -> $id
    - created_at -> $createdAt
    - updated_at -> $updatedAt
    - permissions -> $permissions
    - database_id -> $databaseId
    - collection_id -> $collectionId
    - sequence -> $sequence
    """

    # Optional class-level defaults for database/collection identifiers
    databaseId: ClassVar[str | None] = None
    collectionId: ClassVar[str | None] = None

    rid: str = Field(..., alias="$id", description="Appwrite document ID")
    created_at: datetime = Field(..., alias="$createdAt", description="Document creation timestamp")
    updated_at: datetime = Field(
        ..., alias="$updatedAt", description="Document last update timestamp"
    )
    permissions: list[str] = Field(
        default_factory=list, alias="$permissions", description="Document permissions"
    )
    database_id: str = Field(..., alias="$databaseId", description="Appwrite database ID")
    collection_id: str = Field(..., alias="$collectionId", description="Appwrite collection ID")
    sequence: int | None = Field(None, alias="$sequence", description="Document sequence number")

    class Config:
        """Pydantic configuration for Appwrite compatibility"""

        from_attributes = True
        populate_by_name = True  # Allow both field name and alias
        extra = "allow"  # Allow additional fields from Appwrite
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def parse_datetime(cls, v: str | datetime) -> datetime:
        """Parse datetime from string or return datetime object"""
        if isinstance(v, str):
            # Handle ISO format with or without microseconds
            try:
                return datetime.fromisoformat(v.replace("Z", "+00:00"))
            except ValueError:
                # Fallback for other formats
                return datetime.fromisoformat(v)
        return v

    def to_appwrite_dict(self) -> dict[str, Any]:
        """Convert model to dictionary with Appwrite field names ($ prefixed)"""
        return self.model_dump(by_alias=True, exclude_unset=True)

    def to_python_dict(self) -> dict[str, Any]:
        """Convert model to dictionary with Python field names (no $ prefix)"""
        return self.model_dump(by_alias=False, exclude_unset=True)

    @classmethod
    def from_appwrite_document(cls, document: dict[str, Any]):
        """Create model instance from Appwrite document with $ prefixed fields"""
        return cls.model_validate(document)

    def to_update_payload(self, exclude_unset: bool = True) -> dict[str, Any]:
        """Convert model to update payload excluding system fields and None values"""
        data = self.model_dump(by_alias=False, exclude_unset=exclude_unset)
        return strip_appwrite_keys(data)


class CreateBase(BaseModel):
    """
    Base model for creating documents in Appwrite.
    Makes all Appwrite system fields optional since they're auto-generated.
    """

    rid: str | None = Field(None, alias="$id", description="Optional custom document ID")
    created_at: datetime | None = Field(
        None, alias="$createdAt", description="Auto-generated creation timestamp"
    )
    updated_at: datetime | None = Field(
        None, alias="$updatedAt", description="Auto-generated update timestamp"
    )
    permissions: list[str] | None = Field(
        None, alias="$permissions", description="Optional document permissions"
    )
    database_id: str | None = Field(
        None, alias="$databaseId", description="Auto-set database ID"
    )
    collection_id: str | None = Field(
        None, alias="$collectionId", description="Auto-set collection ID"
    )
    sequence: int | None = Field(
        None, alias="$sequence", description="Auto-generated sequence number"
    )

    class Config:
        """Pydantic configuration for creation payloads"""

        from_attributes = True
        populate_by_name = True
        extra = "allow"
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def parse_datetime(cls, v: str | datetime | None) -> datetime | None:
        """Parse datetime from string or return datetime object"""
        if v is None:
            return None
        if isinstance(v, str):
            try:
                return datetime.fromisoformat(v.replace("Z", "+00:00"))
            except ValueError:
                return datetime.fromisoformat(v)
        return v

    def strip_appwrite_fields(self) -> dict[str, Any]:
        """
        Remove Appwrite system fields and return clean data for creation.
        Useful when preparing data for Appwrite document creation.
        """
        excluded_fields = {
            "rid",
            "$id",
            "created_at",
            "$createdAt",
            "updated_at",
            "$updatedAt",
            "permissions",
            "$permissions",
            "database_id",
            "$databaseId",
            "collection_id",
            "$collectionId",
            "sequence",
            "$sequence",
        }

        data = self.model_dump(by_alias=False, exclude_unset=True)
        return {k: v for k, v in data.items() if k not in excluded_fields}


class UpdateBase(BaseModel):
    """
    Generic base model for partial updates.
    Makes all fields optional for PATCH operations.
    """

    class Config:
        """Pydantic configuration for update payloads"""

        from_attributes = True
        extra = "allow"
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}

    def get_update_data(self, exclude_unset: bool = True) -> dict[str, Any]:
        """
        Get update data excluding None values and optionally unset fields.
        Perfect for PATCH operations where only changed fields should be sent.
        """
        data = self.model_dump(exclude_unset=exclude_unset)
        return {k: v for k, v in data.items() if v is not None}

    def get_creation_data(self) -> dict[str, Any]:
        """Get clean data for Appwrite document creation"""
        return convert_to_create_payload(self)


# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================


def strip_appwrite_keys(data: dict[str, Any]) -> dict[str, Any]:
    """
    Remove Appwrite system fields ($ prefixed) from a dictionary.

    Args:
        data: Dictionary that may contain Appwrite system fields

    Returns:
        Dictionary with Appwrite system fields removed

    Example:
        >>> data = {"name": "John", "$id": "123", "$createdAt": "2023-01-01"}
        >>> strip_appwrite_keys(data)
        {"name": "John"}
    """
    excluded_keys = {
        "$id",
        "$createdAt",
        "$updatedAt",
        "$permissions",
        "$databaseId",
        "$collectionId",
        "$sequence",
    }
    return {k: v for k, v in data.items() if k not in excluded_keys}


def convert_to_create_payload(model_instance: BaseModel) -> dict[str, Any]:
    """
    Convert any Pydantic model instance to a clean creation payload.
    Removes Appwrite system fields and None values.

    Args:
        model_instance: Pydantic model instance

    Returns:
        Dictionary suitable for Appwrite document creation

    Example:
        >>> user = UserModel(name="John", rid="123", created_at=datetime.now())
        >>> convert_to_create_payload(user)
        {"name": "John"}
    """
    data = model_instance.model_dump(exclude_unset=True)
    # Remove Appwrite system fields and None values
    clean_data = strip_appwrite_keys(data)
    return {k: v for k, v in clean_data.items() if v is not None}


def convert_to_update_payload(
    model_instance: BaseModel, exclude_unset: bool = True
) -> dict[str, Any]:
    """
    Convert any Pydantic model instance to a clean update payload.
    Removes None values and optionally unset fields.

    Args:
        model_instance: Pydantic model instance
        exclude_unset: Whether to exclude fields that weren't explicitly set

    Returns:
        Dictionary suitable for Appwrite document updates

    Example:
        >>> user_update = UserUpdateModel(name="Jane")
        >>> convert_to_update_payload(user_update)
        {"name": "Jane"}
    """
    data = model_instance.model_dump(exclude_unset=exclude_unset)
    return {k: v for k, v in data.items() if v is not None}


# ============================================================================
# JSON FIELD HELPER MIXINS
# ============================================================================


class JSONFieldMixin:
    """
    Mixin providing standardized JSON field helper methods.
    Use this to add consistent JSON encode/decode patterns to models.
    """

    def _encode_json_field(self, data: Any) -> str | None:
        """Safely encode data to JSON string"""
        if data is None:
            return None
        try:
            return json.dumps(data)
        except (TypeError, ValueError):
            return None

    def _decode_json_field(self, json_str: str | None, default: Any = None) -> Any:
        """Safely decode JSON string to data"""
        if not json_str:
            return default
        try:
            return json.loads(json_str)
        except (json.JSONDecodeError, TypeError):
            return default

    def _decode_json_list(self, json_str: str | None) -> list[Any]:
        """Safely decode JSON string to list"""
        return self._decode_json_field(json_str, [])

    def _decode_json_dict(self, json_str: str | None) -> dict[str, Any]:
        """Safely decode JSON string to dictionary"""
        return self._decode_json_field(json_str, {})


class TimestampMixin:
    """
    Mixin providing standardized timestamp handling for business timestamps.
    Use this for models that need to handle ISO timestamp strings.
    """

    def _set_timestamp(self, date: datetime | None) -> str | None:
        """Convert datetime to ISO string"""
        return date.isoformat() if date else None

    def _get_timestamp(self, timestamp_str: str | None) -> datetime | None:
        """Convert ISO string to datetime"""
        if not timestamp_str:
            return None
        try:
            return datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
        except ValueError:
            return None


class StringArrayMixin:
    """
    Mixin providing standardized string array handling for many-to-many relationships.
    Use this for models that manage arrays of IDs for relationships.
    """

    def _add_to_array(self, array: list[str], item: str) -> None:
        """Add item to array if not already present"""
        if item not in array:
            array.append(item)

    def _remove_from_array(self, array: list[str], item: str) -> None:
        """Remove item from array if present"""
        if item in array:
            array.remove(item)

    def _ensure_array_field(self, field_value: list[str] | None) -> list[str]:
        """Ensure field is a list, return empty list if None"""
        return field_value or []


# ============================================================================
# ENHANCED UTILITY FUNCTIONS
# ============================================================================


def safe_json_encode(data: Any) -> str | None:
    """
    Safely encode any data to JSON string.

    Args:
        data: Data to encode

    Returns:
        JSON string or None if encoding fails

    Example:
        >>> safe_json_encode({"key": "value"})
        '{"key": "value"}'
        >>> safe_json_encode(None)
        None
    """
    if data is None:
        return None
    try:
        return json.dumps(data)
    except (TypeError, ValueError):
        return None


def safe_json_decode(json_str: str | None, default: Any = None) -> Any:
    """
    Safely decode JSON string to data.

    Args:
        json_str: JSON string to decode
        default: Default value if decoding fails

    Returns:
        Decoded data or default value

    Example:
        >>> safe_json_decode('{"key": "value"}')
        {'key': 'value'}
        >>> safe_json_decode('invalid', {})
        {}
    """
    if not json_str:
        return default
    try:
        return json.loads(json_str)
    except (json.JSONDecodeError, TypeError):
        return default


def create_json_field_helpers(field_name: str, default_type: type[Any] = dict):
    """
    Create getter/setter methods for JSON fields.
    Useful for dynamically adding JSON field helpers to models.

    Args:
        field_name: Name of the JSON field
        default_type: Default type for the field (dict or list)

    Returns:
        Tuple of (getter, setter) functions

    Example:
        >>> get_metadata, set_metadata = create_json_field_helpers('metadata')
        >>> # Then add to model class
    """
    def getter(self) -> Any:
        json_str = getattr(self, field_name, None)
        default = default_type() if callable(default_type) else default_type
        return safe_json_decode(json_str, default)

    def setter(self, value: Any) -> None:
        setattr(self, field_name, safe_json_encode(value))

    return getter, setter


def validate_appwrite_document(document: dict[str, Any]) -> bool:
    """
    Validate that a dictionary contains required Appwrite document fields.

    Args:
        document: Dictionary to validate

    Returns:
        True if valid Appwrite document format

    Example:
        >>> doc = {"$id": "123", "$createdAt": "2023-01-01T00:00:00Z", "name": "test"}
        >>> validate_appwrite_document(doc)
        True
    """
    required_fields = {"$id", "$createdAt", "$updatedAt"}
    return all(field in document for field in required_fields)


def batch_prepare_documents(
    models: list[BaseModel], batch_size: int = 100
) -> list[list[dict[str, Any]]]:
    """
    Prepare model instances for batch creation in Appwrite.
    Splits into batches and removes system fields.

    Args:
        models: List of Pydantic model instances
        batch_size: Maximum documents per batch

    Returns:
        List of batches, each containing clean document data

    Example:
        >>> users = [CreateUser(name="John"), CreateUser(name="Jane")]
        >>> batches = batch_prepare_documents(users, batch_size=1)
        >>> len(batches)
        2
    """
    clean_docs = [convert_to_create_payload(model) for model in models]

    batches = []
    for i in range(0, len(clean_docs), batch_size):
        batch = clean_docs[i:i + batch_size]
        batches.append(batch)

    return batches
`;

export class PydanticModelGenerator {
  constructor(private config: AppwriteConfig, private appwriteFolderPath: string) {}

  generatePydanticModels(options: { baseOutputDirectory: string; verbose?: boolean }) {
    const { baseOutputDirectory, verbose = false } = options;
    const pyDir = baseOutputDirectory;
    if (!fs.existsSync(pyDir)) fs.mkdirSync(pyDir, { recursive: true });

    this.writeBase(pyDir, verbose);

    const collections = this.config.collections || [];
    for (const coll of collections) {
      const fileName = `${this.toSnake(coll.name)}.py`;
      const filePath = path.join(pyDir, fileName);
      const code = this.generateModel(coll.name, coll.attributes || []);
      fs.writeFileSync(filePath, code, { encoding: 'utf-8' });
      if (verbose) MessageFormatter.success(`Pydantic model written to ${filePath}`, { prefix: 'Schema' });
    }

    // __init__.py to ease imports
    const initPath = path.join(pyDir, '__init__.py');
    try {
      const exports = (this.config.collections || []).map(c => `from .${this.toSnake(c.name)} import ${this.toPascal(c.name)}`).join('\n');
      fs.writeFileSync(initPath, `${exports}\n`, { encoding: 'utf-8' });
    } catch {}
  }

  private writeBase(pyDir: string, verbose: boolean) {
    const basePath = path.join(pyDir, 'base.py');
    // Always write embedded template content
    fs.writeFileSync(basePath, BASE_PYDANTIC_TEMPLATE, { encoding: 'utf-8' });
    if (verbose) MessageFormatter.success(`Base Pydantic model written to ${basePath}`, { prefix: 'Schema' });
  }

  private generateModel(name: string, attributes: Attribute[]): string {
    const pascal = this.toPascal(name);
    const imports = new Set<string>();
    imports.add("from .base import BaseAppwriteModel");
    const typeImports = new Set<string>();
    typeImports.add('from pydantic import Field');
    const typingImports = new Set<string>();

    const fields: string[] = [];
    for (const attr of attributes) {
      if (!attr || !attr.key) continue;
      const ann = this.mapAttributeToPythonType(attr, typingImports);
      const required = !!(attr as any).required;
      const isArray = !!(attr as any).array;
      const defaultInitializer = this.defaultInitializer(attr, required, isArray);
      fields.push(`    ${attr.key}: ${ann}${defaultInitializer}`);
    }

    const header = this.composeHeader(imports, typeImports, typingImports);
    return `${header}\n\nclass ${pascal}(BaseAppwriteModel):\n${fields.join('\n')}\n`;
  }

  private composeHeader(imports: Set<string>, typeImports: Set<string>, typingImports: Set<string>): string {
    const lines: string[] = ["from __future__ import annotations"];
    lines.push(...Array.from(typeImports));
    if (typingImports.size > 0) {
      lines.push(`from typing import ${Array.from(typingImports).sort().join(', ')}`);
    }
    // datetime import if referenced; include by default as safe
    lines.push('from datetime import datetime');
    lines.push(...Array.from(imports));
    return lines.join('\n');
  }

  private defaultInitializer(attr: Attribute, required: boolean, isArray: boolean): string {
    if (required) return '';
    // Optional fields default to None; arrays can be None to distinguish missing vs empty
    return ' = None';
  }

  private mapAttributeToPythonType(attr: Attribute, typingImports: Set<string>): string {
    const t = String((attr as any).type || '').toLowerCase();
    const isArray = !!(attr as any).array;
    let base: string;
    switch (t) {
      case 'string':
      case 'email':
      case 'ip':
      case 'url':
        base = 'str';
        break;
      case 'integer':
        base = 'int';
        break;
      case 'double':
      case 'float':
        base = 'float';
        break;
      case 'boolean':
        base = 'bool';
        break;
      case 'datetime':
        base = 'datetime';
        break;
      case 'enum': {
        const els = Array.isArray((attr as any).elements) ? (attr as any).elements : [];
        if (els.length > 0) {
          typingImports.add('Literal');
          base = `Literal[${els.map((e: string) => `'${e.replace(/'/g, "\\'")}'`).join(', ')}]`;
        } else {
          base = 'str';
        }
        break;
      }
      case 'relationship': {
        const relType = (attr as any).relationType || '';
        base = (relType === 'oneToMany' || relType === 'manyToMany') ? 'list[str]' : 'str';
        break;
      }
      default:
        base = 'str';
        break;
    }
    if (isArray && t !== 'relationship') {
      base = `list[${base}]`;
    }
    const required = !!(attr as any).required;
    if (!required) {
      base = `${base} | None`;
    }
    return base;
  }

  private toSnake(s: string): string {
    return s
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase();
  }
  private toPascal(s: string): string {
    return s
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join('');
  }
}
