import { z } from "zod";
import { FrameworkSchema } from "./framework.js";
import { AdapterSchema } from "./adapter.js";
import { BuildRuntimeSchema } from "./buildRuntime.js";
import { FunctionSpecifications } from "./functionSpecifications.js";

/**
 * THIS IS SERVER-SIDE SCHEMA, DO NOT EXPECT THIS TO BE COMPATIBLE WITH CLIENT-SIDE SCHEMA
 *
 * dirPath?: string, -- The directory path to the site, if not provided, the site will be created in the appwriteConfig/sites directory
 * $id: string,
 * name: string,
 * framework: Framework,
 * buildRuntime: BuildRuntime,
 * enabled?: boolean,
 * logging?: boolean,
 * timeout?: number,
 * installCommand?: string,
 * buildCommand?: string,
 * outputDirectory?: string,
 * adapter?: Adapter,
 * fallbackFile?: string,
 * installationId?: string,
 * providerRepositoryId?: string,
 * providerBranch?: string,
 * providerSilentMode?: boolean,
 * providerRootDirectory?: string,
 * buildSpecification?: string,
 * runtimeSpecification?: string,
 * predeployCommands?: string[], -- These are custom and ours, and they will be evaluated on the host machine before the site is deployed
 * deployDir?: string, -- The directory to deploy the site from, if not provided, the site will be deployed from the site's directory
 * ignore?: string[], -- Files/directories to ignore when deploying
 */
export const AppwriteSiteSchema = z.object({
  dirPath: z.string().optional(),
  $id: z.string(),
  name: z.string(),
  framework: FrameworkSchema,
  buildRuntime: BuildRuntimeSchema,
  enabled: z.boolean().optional(),
  logging: z.boolean().optional(),
  timeout: z.number().optional(),
  installCommand: z.string().optional(),
  buildCommand: z.string().optional(),
  outputDirectory: z.string().optional(),
  adapter: AdapterSchema.optional(),
  fallbackFile: z.string().optional(),
  installationId: z.string().optional(),
  providerRepositoryId: z.string().optional(),
  providerBranch: z.string().optional(),
  providerSilentMode: z.boolean().optional(),
  providerRootDirectory: z.string().optional(),
  buildSpecification: FunctionSpecifications.optional(),
  runtimeSpecification: FunctionSpecifications.optional(),
  // Custom fields (not in SDK, but used by our tooling)
  predeployCommands: z.array(z.string()).optional(),
  deployDir: z.string().optional(),
  ignore: z.array(z.string()).optional(),
  /**
   * Custom domains to attach as Appwrite Proxy Rules during site deploys.
   * Missing rules are created; existing matching rules are left alone
   * (idempotent). Use --pruneDomains on the CLI to also delete extras.
   */
  domains: z.array(z.string()).optional(),
});

export type AppwriteSite = z.infer<typeof AppwriteSiteSchema>;
