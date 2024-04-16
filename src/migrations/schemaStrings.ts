import { toCamelCase, toPascalCase } from "../utils/index.js";
import type { Attribute, RelationshipAttribute } from "./schema.js";

export const createSchemaString = (
  name: string,
  attributes: Attribute[]
): string => {
  // So the name is camelCase, but the schema is PascalCase (capitalized)
  // What if there's more than just the first letter?
  // What if the name is already PascalCase?
  const pascalName = toPascalCase(name);

  let imports = `import { z } from "zod";\n`;
  // Commented out for now, we don't need this atm
  // let mockIncludedString = `import { generateMock } from "@anatine/zod-mock";\n`;

  // Collect unique related collections for relationship attributes
  const relatedCollections = attributes
    .filter((attr) => attr.type === "relationship" && attr.relatedCollection)
    .map((attr) => [
      (attr as RelationshipAttribute).relatedCollection,
      attr.key,
      attr.array ? "array" : "",
    ])
    .filter((value, index, self) => self.indexOf(value) === index);

  // Generate import statements for each unique related collection
  let relatedTypes = "";
  let relatedTypesLazy = "";
  let curNum = 0;
  let maxNum = relatedCollections.length;
  relatedCollections.forEach((relatedCollection) => {
    const relatedPascalName = toPascalCase(relatedCollection[0]);
    const relatedCamelName = toCamelCase(relatedCollection[0]);
    curNum++;
    let endNameTypes = relatedPascalName;
    let endNameLazy = `${relatedPascalName}Schema`;
    if (relatedCollection[2] === "array") {
      endNameTypes += "[]";
      endNameLazy += ".array()";
    }
    endNameLazy += ".optional()";
    imports += `import { ${relatedPascalName}Schema, type ${relatedPascalName} } from "./${relatedCamelName}";\n`;
    relatedTypes += `${relatedCollection[1]}?: ${endNameTypes};\n`;
    if (relatedTypes.length > 0 && curNum !== maxNum) {
      relatedTypes += "  ";
    }
    relatedTypesLazy += `${relatedCollection[1]}: z.lazy(() => ${endNameLazy}),\n`;
    if (relatedTypesLazy.length > 0 && curNum !== maxNum) {
      relatedTypesLazy += "  ";
    }
  });

  let schemaString = `${imports}\n\n`;
  schemaString += `export const ${pascalName}SchemaBase = z.object({\n`;
  schemaString += `  $id: z.string().optional(),\n`;
  schemaString += `  $createdAt: z.date().or(z.string()).optional(),\n`;
  schemaString += `  $updatedAt: z.date().or(z.string()).optional(),\n`;
  for (const attribute of attributes) {
    if (attribute.type === "relationship") {
      continue;
    }
    schemaString += `  ${attribute.key}: ${typeToZod(attribute)},\n`;
  }
  schemaString += `});\n\n`;
  schemaString += `export type ${pascalName}Base = z.infer<typeof ${pascalName}SchemaBase>`;
  if (relatedTypes.length > 0) {
    schemaString += ` & {\n  ${relatedTypes}};\n\n`;
  } else {
    schemaString += `;\n\n`;
  }
  schemaString += `export const ${pascalName}Schema: z.ZodType<${pascalName}Base> = ${pascalName}SchemaBase`;
  if (relatedTypes.length > 0) {
    schemaString += `.extend({\n  ${relatedTypesLazy}});\n\n`;
  } else {
    schemaString += `;\n`;
  }
  schemaString += `export type ${pascalName} = z.infer<typeof ${pascalName}Schema>;\n\n`;
  schemaString += `export const get${pascalName}MockData = (numMocks: number = 1) => {\n`;
  schemaString += `  const mocksGenerated: ${pascalName}[] = [];\n`;
  schemaString += `  for (let i = 0; i < numMocks; i++) {\n`;
  schemaString += `    mocksGenerated.push(generateMock(${pascalName}Schema, { seed: i }));\n`;
  schemaString += `  }\n`;
  schemaString += `  return mocksGenerated;\n`;
  schemaString += `};\n\n`;
  return schemaString;
};

export const typeToZod = (attribute: Attribute) => {
  let baseSchemaCode = "";

  switch (attribute.type) {
    case "string":
      baseSchemaCode = "z.string()";
      if (attribute.size) {
        baseSchemaCode += `.max(${attribute.size}, "Maximum length of ${attribute.size} characters exceeded")`;
      }
      if (attribute.xdefault !== undefined) {
        baseSchemaCode += `.default("${attribute.xdefault}")`;
      }
      if (!attribute.required && !attribute.array) {
        baseSchemaCode += ".nullish()";
      }
      break;
    case "integer":
      baseSchemaCode = "z.number().int()";
      if (attribute.min !== undefined) {
        baseSchemaCode += `.min(${attribute.min}, "Minimum value of ${attribute.min} not met")`;
      }
      if (attribute.max !== undefined) {
        baseSchemaCode += `.max(${attribute.max}, "Maximum value of ${attribute.max} exceeded")`;
      }
      if (attribute.xdefault !== undefined) {
        baseSchemaCode += `.default(${attribute.xdefault})`;
      }
      if (!attribute.required && !attribute.array) {
        baseSchemaCode += ".nullish()";
      }
      break;
    case "float":
      baseSchemaCode = "z.number()";
      if (attribute.min !== undefined) {
        baseSchemaCode += `.min(${attribute.min}, "Minimum value of ${attribute.min} not met")`;
      }
      if (attribute.max !== undefined) {
        baseSchemaCode += `.max(${attribute.max}, "Maximum value of ${attribute.max} exceeded")`;
      }
      if (attribute.xdefault !== undefined) {
        baseSchemaCode += `.default(${attribute.xdefault})`;
      }
      if (!attribute.required && !attribute.array) {
        baseSchemaCode += ".nullish()";
      }
      break;
    case "boolean":
      baseSchemaCode = "z.boolean()";
      if (attribute.xdefault !== undefined) {
        baseSchemaCode += `.default(${attribute.xdefault})`;
      }
      if (!attribute.required && !attribute.array) {
        baseSchemaCode += ".nullish()";
      }
      break;
    case "datetime":
      baseSchemaCode = "z.date()";
      if (attribute.xdefault !== undefined) {
        baseSchemaCode += `.default(new Date("${attribute.xdefault}"))`;
      }
      if (!attribute.required && !attribute.array) {
        baseSchemaCode += ".nullish()";
      }
      break;
    case "email":
      baseSchemaCode = "z.string().email()";
      if (attribute.xdefault !== undefined) {
        baseSchemaCode += `.default("${attribute.xdefault}")`;
      }
      if (!attribute.required && !attribute.array) {
        baseSchemaCode += ".nullish()";
      }
      break;
    case "ip":
      baseSchemaCode = "z.string()"; // Add custom validation as needed
      if (attribute.xdefault !== undefined) {
        baseSchemaCode += `.default("${attribute.xdefault}")`;
      }
      if (!attribute.required && !attribute.array) {
        baseSchemaCode += ".nullish()";
      }
      break;
    case "url":
      baseSchemaCode = "z.string().url()";
      if (attribute.xdefault !== undefined) {
        baseSchemaCode += `.default("${attribute.xdefault}")`;
      }
      if (!attribute.required && !attribute.array) {
        baseSchemaCode += ".nullish()";
      }
      break;
    case "enum":
      baseSchemaCode = `z.enum([${attribute.elements
        .map((element) => `"${element}"`)
        .join(", ")}])`;
      if (attribute.xdefault !== undefined) {
        baseSchemaCode += `.default("${attribute.xdefault}")`;
      }
      if (!attribute.required && !attribute.array) {
        baseSchemaCode += ".nullish()";
      }
      break;
    case "relationship":
      break;
    default:
      baseSchemaCode = "z.any()";
  }

  // Handle arrays
  if (attribute.array) {
    baseSchemaCode = `z.array(${baseSchemaCode})`;
  }
  if (attribute.array && !attribute.required) {
    baseSchemaCode += ".nullish()";
  }

  return baseSchemaCode;
};
