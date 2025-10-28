import inquirer from "inquirer";
import chalk from "chalk";
import { Storage, Permission, Role, Compression, type Models } from "node-appwrite";
import type { InteractiveCLI } from "../../interactiveCLI.js";
import { MessageFormatter } from "../../shared/messageFormatter.js";
import { listBuckets, createBucket as createBucketApi, deleteBucket as deleteBucketApi } from "../../storage/methods.js";
import { writeYamlConfig } from "../../config/yamlConfig.js";
import { ConfigManager } from "../../config/ConfigManager.js";

export const storageCommands = {
  async createBucket(cli: InteractiveCLI): Promise<void> {
    const storage: Storage = (cli as any).controller!.storage!;
    if (!storage) {
      MessageFormatter.error("Storage client not initialized", undefined, { prefix: "Buckets" });
      return;
    }

    const answers = await inquirer.prompt([
      { type: 'input', name: 'name', message: 'Bucket name:', validate: (v:string)=> v?.trim()?.length>0 || 'Required' },
      { type: 'input', name: 'id', message: 'Bucket ID (optional):' },
      { type: 'confirm', name: 'publicRead', message: 'Public read access?', default: false },
      { type: 'confirm', name: 'fileSecurity', message: 'Enable file-level security?', default: false },
      { type: 'confirm', name: 'enabled', message: 'Enable bucket?', default: true },
      { type: 'number', name: 'maximumFileSize', message: 'Max file size (bytes, optional):', default: undefined },
      { type: 'input', name: 'allowedFileExtensions', message: 'Allowed extensions (comma separated, optional):', default: '' },
      { type: 'list', name: 'compression', message: 'Compression:', choices: ['none','gzip','zstd'], default: 'none' },
      { type: 'confirm', name: 'encryption', message: 'Enable encryption?', default: false },
      { type: 'confirm', name: 'antivirus', message: 'Enable antivirus?', default: false },
    ]);

    const permissions: string[] = [];
    if (answers.publicRead) permissions.push(Permission.read(Role.any()));

    const bucketInput: Omit<Models.Bucket, "$id" | "$createdAt" | "$updatedAt"> = {
      name: answers.name,
      $permissions: permissions,
      fileSecurity: !!answers.fileSecurity,
      enabled: !!answers.enabled,
      maximumFileSize: answers.maximumFileSize || undefined,
      allowedFileExtensions: String(answers.allowedFileExtensions || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      compression: answers.compression as Compression,
      encryption: !!answers.encryption,
      antivirus: !!answers.antivirus,
    } as any;

    try {
      const created = await createBucketApi(storage, bucketInput, answers.id || undefined);
      MessageFormatter.success(`Bucket '${answers.name}' created`, { prefix: 'Buckets' });

      // Update in-memory config and persist to YAML as a global bucket entry
      const controller = (cli as any).controller!;
      controller.config.buckets = controller.config.buckets || [];
      controller.config.buckets.push({
        $id: (created as any).$id || answers.id || bucketInput.name,
        name: bucketInput.name,
        permissions: [],
        fileSecurity: bucketInput.fileSecurity,
        enabled: bucketInput.enabled,
        maximumFileSize: bucketInput.maximumFileSize,
        allowedFileExtensions: bucketInput.allowedFileExtensions,
        compression: bucketInput.compression,
        encryption: bucketInput.encryption,
        antivirus: bucketInput.antivirus,
      });

      const cfgMgr = ConfigManager.getInstance();
      const cfgPath = cfgMgr.getConfigPath();
      if (cfgPath && /\.ya?ml$/i.test(cfgPath)) {
        await writeYamlConfig(cfgPath, controller.config);
        MessageFormatter.info(`Added bucket to config.yaml`, { prefix: 'Buckets' });
      } else {
        MessageFormatter.warning(`Config is not YAML; updated in-memory only. Please update your TypeScript config manually.`, { prefix: 'Buckets' });
      }
    } catch (e) {
      MessageFormatter.error('Failed to create bucket', e instanceof Error ? e : new Error(String(e)), { prefix: 'Buckets' });
    }
  },

  async deleteBuckets(cli: InteractiveCLI): Promise<void> {
    const storage: Storage = (cli as any).controller!.storage!;
    if (!storage) {
      MessageFormatter.error("Storage client not initialized", undefined, { prefix: "Buckets" });
      return;
    }

    try {
      const res = await listBuckets(storage);
      const buckets: Models.Bucket[] = res.buckets || [];
      if (buckets.length === 0) {
        MessageFormatter.info('No buckets found', { prefix: 'Buckets' });
        return;
      }

      const { toDelete } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'toDelete',
          message: chalk.red('Select buckets to delete:'),
          choices: buckets.map((b) => ({ name: `${b.name} (${b.$id})`, value: b.$id })),
          pageSize: 10,
        }
      ]);

      if (!toDelete || toDelete.length === 0) {
        MessageFormatter.info('No buckets selected', { prefix: 'Buckets' });
        return;
      }

      const { confirm } = await inquirer.prompt([
        { type: 'confirm', name: 'confirm', message: `Delete ${toDelete.length} bucket(s)?`, default: false }
      ]);
      if (!confirm) return;

      const controller = (cli as any).controller!;
      for (const id of toDelete) {
        try {
          await deleteBucketApi(storage, id);
          MessageFormatter.success(`Deleted bucket ${id}`, { prefix: 'Buckets' });

          // Remove from in-memory config (global buckets)
          if (Array.isArray(controller.config.buckets)) {
            controller.config.buckets = controller.config.buckets.filter((b: any) => b.$id !== id);
          }
          // Clear database-linked bucket references if matching
          if (Array.isArray(controller.config.databases)) {
            controller.config.databases = controller.config.databases.map((db: any) => ({
              ...db,
              bucket: db.bucket && db.bucket.$id === id ? undefined : db.bucket,
            }));
          }
        } catch (e) {
          MessageFormatter.error(`Failed to delete bucket ${id}`, e instanceof Error ? e : new Error(String(e)), { prefix: 'Buckets' });
        }
      }

      // Persist YAML changes
      const cfgMgr = ConfigManager.getInstance();
      const cfgPath = cfgMgr.getConfigPath();
      if (cfgPath && /\.ya?ml$/i.test(cfgPath)) {
        await writeYamlConfig(cfgPath, controller.config);
        MessageFormatter.info(`Updated config.yaml after deletion`, { prefix: 'Buckets' });
      } else {
        MessageFormatter.warning(`Config is not YAML; updated in-memory only. Please update your TypeScript config manually.`, { prefix: 'Buckets' });
      }
    } catch (e) {
      MessageFormatter.error('Failed to list buckets', e instanceof Error ? e : new Error(String(e)), { prefix: 'Buckets' });
    }
  }
};
