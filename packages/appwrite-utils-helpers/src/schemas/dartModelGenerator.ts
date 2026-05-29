import fs from "fs";
import path from "path";
import type { AppwriteConfig, Attribute } from "appwrite-utils";
import { MessageFormatter } from "./messageFormatter.js";

export class DartModelGenerator {
  constructor(private config: AppwriteConfig, private appwriteFolderPath: string) {}

  public generate(options: { baseOutputDirectory: string; verbose?: boolean }): void {
    const { baseOutputDirectory, verbose = false } = options;
    if (!fs.existsSync(baseOutputDirectory)) {
      fs.mkdirSync(baseOutputDirectory, { recursive: true });
    }

    const collections = this.config.collections || [];
    for (const coll of collections) {
      const fileName = `${this.toSnake(coll.name)}.dart`;
      const filePath = path.join(baseOutputDirectory, fileName);
      const code = this.generateModel(coll.name, coll.attributes || []);
      fs.writeFileSync(filePath, code, { encoding: "utf-8" });
      if (verbose) {
        MessageFormatter.success(`Dart model written to ${filePath}`, { prefix: "Schema" });
      }
    }
  }

  private generateModel(name: string, attributes: Attribute[]): string {
    const className = this.toPascal(name);

    interface FieldInfo {
      dartType: string;
      fieldName: string;
      appwriteKey: string;
      required: boolean;
      isDateTime: boolean;
      isStringList: boolean;
      comment?: string;
    }

    const baseFields: FieldInfo[] = [
      { dartType: "String", fieldName: "id", appwriteKey: "$id", required: true, isDateTime: false, isStringList: false },
      { dartType: "String", fieldName: "createdAt", appwriteKey: "$createdAt", required: true, isDateTime: false, isStringList: false },
      { dartType: "String", fieldName: "updatedAt", appwriteKey: "$updatedAt", required: true, isDateTime: false, isStringList: false },
    ];

    const attrFields: FieldInfo[] = [];
    for (const attr of attributes) {
      if (!attr || !(attr as any).key) continue;
      const required = !!(attr as any).required;
      const dartType = this.mapAttributeToDartType(attr);
      const key = String((attr as any).key);
      const t = String((attr as any).type || "").toLowerCase();
      const els = Array.isArray((attr as any).elements) ? (attr as any).elements : [];
      const comment = t === "enum" && els.length > 0 ? `// allowed: ${els.join(", ")}` : undefined;
      attrFields.push({
        dartType,
        fieldName: this.toCamel(key),
        appwriteKey: key,
        required,
        isDateTime: t === "datetime",
        isStringList: this.isStringListType(dartType),
        comment,
      });
    }

    const allFields = [...baseFields, ...attrFields];

    // Field declarations
    const fieldLines: string[] = [];
    for (const f of allFields) {
      if (f.comment) fieldLines.push(`  ${f.comment}`);
      fieldLines.push(`  final ${f.dartType} ${f.fieldName};`);
    }

    // Constructor params: required (non-null) use `required this.x`, nullable use `this.x`
    const ctorParams = allFields
      .map((f) => `    ${f.required ? "required " : ""}this.${f.fieldName},`)
      .join("\n");

    // fromJson mappings
    const fromJsonLines = allFields
      .map((f) => `      ${f.fieldName}: ${this.fromJsonExpression(f)},`)
      .join("\n");

    return (
      `class ${className} {\n` +
      `${fieldLines.join("\n")}\n\n` +
      `  const ${className}({\n` +
      `${ctorParams}\n` +
      `  });\n\n` +
      `  factory ${className}.fromJson(Map<String, dynamic> json) {\n` +
      `    return ${className}(\n` +
      `${fromJsonLines}\n` +
      `    );\n` +
      `  }\n` +
      `}\n`
    );
  }

  private fromJsonExpression(f: {
    dartType: string;
    appwriteKey: string;
    required: boolean;
    isDateTime: boolean;
    isStringList: boolean;
  }): string {
    const accessor = `json['${f.appwriteKey}']`;
    if (f.isDateTime) {
      if (f.required) {
        return `DateTime.parse(${accessor})`;
      }
      return `${accessor} != null ? DateTime.parse(${accessor}) : null`;
    }
    if (f.isStringList) {
      const mapped = `(${accessor} as List?)?.map((e) => e as String).toList()`;
      if (f.required) {
        return `${mapped} ?? <String>[]`;
      }
      return mapped;
    }
    return `${accessor} as ${f.dartType}`;
  }

  private isStringListType(dartType: string): boolean {
    return dartType === "List<String>" || dartType === "List<String>?";
  }

  private mapAttributeToDartType(attr: Attribute): string {
    const t = String((attr as any).type || "").toLowerCase();
    const isArray = !!(attr as any).array;
    let base: string;
    switch (t) {
      case "string":
      case "email":
      case "ip":
      case "url":
        base = "String";
        break;
      case "integer":
        base = "int";
        break;
      case "double":
      case "float":
        base = "double";
        break;
      case "boolean":
        base = "bool";
        break;
      case "datetime":
        base = "DateTime";
        break;
      case "enum":
        base = "String";
        break;
      case "relationship": {
        const relType = (attr as any).relationType || "";
        base = relType === "oneToMany" || relType === "manyToMany" ? "List<String>" : "String";
        break;
      }
      default:
        base = "String";
        break;
    }
    if (isArray && t !== "relationship") {
      base = `List<${base}>`;
    }
    const required = !!(attr as any).required;
    if (!required) {
      base = `${base}?`;
    }
    return base;
  }

  private toSnake(s: string): string {
    return s
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .toLowerCase();
  }

  private toPascal(s: string): string {
    return s
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("");
  }

  private toCamel(s: string): string {
    const pascal = this.toPascal(s);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }
}
