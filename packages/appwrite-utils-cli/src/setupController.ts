import { setupDirsFiles } from "./utils/setupFiles.js";
import { loadConfig } from "./utils/loadConfigs.js";
import path from "path";
import fs from "fs";
import type { AppwriteConfig } from "appwrite-utils";
import { MessageFormatter } from "./shared/messageFormatter.js";

export class SetupController {
  private currentDir: string;
  private config: AppwriteConfig | null = null;

  constructor(currentDir: string) {
    this.currentDir = currentDir;
  }

  async runSetup(withExampleData: boolean = false): Promise<void> {
    await setupDirsFiles(withExampleData, this.currentDir);
    MessageFormatter.success("Setup completed successfully", { prefix: "Setup" });
  }

  async loadConfig(): Promise<AppwriteConfig | null> {
    if (this.hasExistingConfig()) {
      try {
        const appwriteDir = path.join(this.currentDir, "appwrite");
        this.config = await loadConfig(appwriteDir);
        return this.config;
      } catch (error) {
        MessageFormatter.error("Error loading config", error as Error, { prefix: "Setup" });
        return null;
      }
    }
    return null;
  }

  hasExistingConfig(): boolean {
    const configPath = path.join(
      this.currentDir,
      "appwrite",
      "appwriteConfig.ts"
    );
    return fs.existsSync(configPath);
  }
}