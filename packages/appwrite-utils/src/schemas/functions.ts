import { z } from "zod";
import { RuntimeSchema } from "./runtime.js";
import { ulid } from "ulidx";
import { FunctionScopes } from "./functionScopes.js";
import { FunctionSpecifications } from "./functionSpecifications.js";

/**
 * THIS IS SERVER-SIDE SCHEMA, DO NOT EXPECT THIS TO BE COMPATIBLE WITH CLIENT-SIDE SCHEMA
 *
 * dirPath?: string, -- The directory path to the function, if not provided, the function will be created in the appwriteConfig/functions directory
 * functionId: string,
 * name: string,
 * runtime?: Runtime,
 * execute?: string[],
 * events?: string[],
 * schedule?: string,
 * timeout?: number,
 * enabled?: boolean,
 * logging?: boolean,
 * entrypoint?: string,
 * predeployCommands?: string[], -- These are custom and ours, and they will be evaluated on the host machine before the function is deployed
 * deployDir?: string, -- The directory to deploy the function from, if not provided, the function will be deployed from the function's directory
 * commands?: string,
 * scopes?: string[],
 * installationId?: string,
 * providerRepositoryId?: string,
 * providerBranch?: string,
 * providerSilentMode?: boolean,
 * providerRootDirectory?: string,
 * specification?: string
 */
export const AppwriteFunctionSchema = z.object({
  dirPath: z.string().optional(),
  $id: z.string().default(ulid()),
  name: z.string(),
  runtime: RuntimeSchema,
  execute: z.array(z.string()),
  events: z.array(z.string()),
  schedule: z.string().optional(),
  timeout: z.number().optional(),
  enabled: z.boolean().optional(),
  logging: z.boolean().optional(),
  ignore: z.array(z.string()).optional(),
  entrypoint: z.string().optional(),
  predeployCommands: z.array(z.string()).optional(),
  deployDir: z.string().optional(),
  commands: z.string().optional(),
  scopes: z.array(FunctionScopes).optional(),
  installationId: z.string().optional(),
  providerRepositoryId: z.string().optional(),
  providerBranch: z.string().optional(),
  providerSilentMode: z.boolean().optional(),
  providerRootDirectory: z.string().optional(),
  templateRepository: z.string().optional(),
  templateOwner: z.string().optional(),
  templateRootDirectory: z.string().optional(),
  templateVersion: z.string().optional(),
  specification: FunctionSpecifications.optional(),
});

export type AppwriteFunction = z.infer<typeof AppwriteFunctionSchema>;
