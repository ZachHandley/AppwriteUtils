import fs from "fs";
import path from "path";
import type { AppwriteConfig, Attribute } from "appwrite-utils";
import { MessageFormatter } from "./messageFormatter.js";

export class RustModelGenerator {
  constructor(private config: AppwriteConfig, private appwriteFolderPath: string) {}

  public generate(options: { baseOutputDirectory: string; verbose?: boolean }): void {
    const { baseOutputDirectory, verbose = false } = options;
    const rsDir = baseOutputDirectory;
    if (!fs.existsSync(rsDir)) fs.mkdirSync(rsDir, { recursive: true });

    const collections = this.config.collections || [];
    for (const coll of collections) {
      const fileName = `${this.toSnake(coll.name)}.rs`;
      const filePath = path.join(rsDir, fileName);
      const code = this.generateStruct(coll.name, coll.attributes || []);
      fs.writeFileSync(filePath, code, { encoding: "utf-8" });
      if (verbose) MessageFormatter.success(`Rust struct written to ${filePath}`, { prefix: "Schema" });
    }
  }

  private generateStruct(name: string, attributes: Attribute[]): string {
    const pascal = this.toPascal(name);

    const lines: string[] = [];
    lines.push("use serde::{Deserialize, Serialize};");
    lines.push("");
    lines.push("#[derive(Debug, Clone, Serialize, Deserialize)]");
    lines.push(`pub struct ${pascal} {`);

    // Base fields first (Appwrite's $-prefixed system fields).
    lines.push(`    #[serde(rename = "$id")]`);
    lines.push(`    pub id: String,`);
    lines.push(`    #[serde(rename = "$createdAt")]`);
    lines.push(`    pub created_at: String,`);
    lines.push(`    #[serde(rename = "$updatedAt")]`);
    lines.push(`    pub updated_at: String,`);

    for (const attr of attributes) {
      if (!attr || !(attr as any).key) continue;
      const key = String((attr as any).key);
      const fieldName = this.toSnake(key);
      const rustType = this.mapAttributeToRustType(attr);
      const required = !!(attr as any).required;
      const t = String((attr as any).type || "").toLowerCase();

      // Documentation / annotation comments above the field.
      if (t === "datetime") {
        lines.push(`    /// ISO 8601 datetime string`);
      }
      if (t === "enum") {
        const els = Array.isArray((attr as any).elements) ? (attr as any).elements : [];
        if (els.length > 0) {
          lines.push(`    // allowed: ${els.join(", ")}`);
        }
      }

      // serde attributes.
      if (!required) {
        lines.push(`    #[serde(skip_serializing_if = "Option::is_none")]`);
      }
      if (fieldName !== key) {
        lines.push(`    #[serde(rename = "${key}")]`);
      }
      lines.push(`    pub ${fieldName}: ${rustType},`);
    }

    lines.push(`}`);
    lines.push("");
    return lines.join("\n");
  }

  private mapAttributeToRustType(attr: Attribute): string {
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
        base = "i64";
        break;
      case "double":
      case "float":
        base = "f64";
        break;
      case "boolean":
        base = "bool";
        break;
      case "datetime":
        base = "String";
        break;
      case "enum":
        base = "String";
        break;
      case "relationship": {
        const relType = (attr as any).relationType || "";
        base = relType === "oneToMany" || relType === "manyToMany" ? "Vec<String>" : "String";
        break;
      }
      default:
        base = "String";
        break;
    }
    if (isArray && t !== "relationship") {
      base = `Vec<${base}>`;
    }
    const required = !!(attr as any).required;
    if (!required) {
      base = `Option<${base}>`;
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
}
