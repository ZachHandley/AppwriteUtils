import cliProgress from "cli-progress";
import chalk from "chalk";
import { MessageFormatter } from 'appwrite-utils-helpers';

export interface ProgressOptions {
  title?: string;
  showETA?: boolean;
  showSpeed?: boolean;
  showPercentage?: boolean;
  width?: number;
  format?: string;
}

export class ProgressManager {
  private static instances = new Map<string, ProgressManager>();
  private bar: cliProgress.SingleBar;
  private startTime: number;
  private totalItems: number;
  private completed: number = 0;
  private id: string;
  private title: string;

  private constructor(id: string, total: number, options: ProgressOptions = {}) {
    this.id = id;
    this.totalItems = total;
    this.startTime = Date.now();
    this.title = options.title || "Processing";

    const format = options.format || 
      `${chalk.cyan(this.title)} ${chalk.yellow("[{bar}]")} {percentage}% | {value}/{total} | ETA: {eta}s | Speed: {speed}/s`;

    this.bar = new cliProgress.SingleBar({
      format,
      barCompleteChar: '█',
      barIncompleteChar: '░',
      hideCursor: true,
      clearOnComplete: false,
      stopOnComplete: true,
      ...options,
    }, cliProgress.Presets.shades_classic);

    this.bar.start(total, 0);
  }

  static create(id: string, total: number, options: ProgressOptions = {}): ProgressManager {
    if (ProgressManager.instances.has(id)) {
      const existing = ProgressManager.instances.get(id)!;
      existing.stop();
    }

    const instance = new ProgressManager(id, total, options);
    ProgressManager.instances.set(id, instance);
    return instance;
  }

  static get(id: string): ProgressManager | undefined {
    return ProgressManager.instances.get(id);
  }

  update(current: number, detail?: string) {
    this.completed = current;
    
    // Calculate speed
    const elapsed = (Date.now() - this.startTime) / 1000;
    const speed = elapsed > 0 ? Math.round(current / elapsed) : 0;

    this.bar.update(current, {
      speed,
      detail: detail || '',
    });

    if (detail) {
      // Update the payload for custom formatting
      this.bar.update(current, { detail });
    }
  }

  increment(amount: number = 1, detail?: string) {
    this.update(this.completed + amount, detail);
  }

  setTotal(total: number) {
    this.totalItems = total;
    this.bar.setTotal(total);
  }

  stop(showSummary: boolean = true) {
    this.bar.stop();
    
    if (showSummary) {
      const duration = Date.now() - this.startTime;
      const rate = this.completed / (duration / 1000);
      
      MessageFormatter.success(
        `${this.title} completed`,
        { 
          prefix: `${this.completed}/${this.totalItems} items in ${MessageFormatter.formatDuration(duration)} (${rate.toFixed(1)}/s)` 
        }
      );
    }

    ProgressManager.instances.delete(this.id);
  }

  fail(error: string) {
    this.bar.stop();
    MessageFormatter.error(`${this.title} failed: ${error}`);
    ProgressManager.instances.delete(this.id);
  }

  getStats() {
    const duration = Date.now() - this.startTime;
    const rate = this.completed / (duration / 1000);
    
    return {
      completed: this.completed,
      total: this.totalItems,
      percentage: (this.completed / this.totalItems) * 100,
      duration,
      rate,
      remaining: this.totalItems - this.completed,
      eta: this.completed > 0 ? ((this.totalItems - this.completed) / rate) * 1000 : 0,
    };
  }

  static stopAll() {
    for (const [id, instance] of ProgressManager.instances) {
      instance.stop(false);
    }
    ProgressManager.instances.clear();
  }
}

export class MultiProgressManager {
  private multiBar: cliProgress.MultiBar;
  private bars = new Map<string, cliProgress.SingleBar>();
  private startTime: number;

  constructor(options: ProgressOptions = {}) {
    this.startTime = Date.now();
    
    this.multiBar = new cliProgress.MultiBar({
      clearOnComplete: false,
      hideCursor: true,
      format: options.format || `${chalk.cyan("{title}")} ${chalk.yellow("[{bar}]")} {percentage}% | {value}/{total} | {detail}`,
      barCompleteChar: '█',
      barIncompleteChar: '░',
    }, cliProgress.Presets.shades_classic);
  }

  addTask(id: string, total: number, title: string): void {
    const bar = this.multiBar.create(total, 0, {
      title: title.padEnd(20),
      detail: '',
    });
    this.bars.set(id, bar);
  }

  updateTask(id: string, current: number, detail?: string): void {
    const bar = this.bars.get(id);
    if (bar) {
      bar.update(current, {
        detail: detail || '',
      });
    }
  }

  incrementTask(id: string, amount: number = 1, detail?: string): void {
    const bar = this.bars.get(id);
    if (bar) {
      const currentValue = bar.getProgress() * bar.getTotal();
      this.updateTask(id, currentValue + amount, detail);
    }
  }

  completeTask(id: string): void {
    const bar = this.bars.get(id);
    if (bar) {
      bar.update(bar.getTotal());
    }
  }

  failTask(id: string, error: string): void {
    const bar = this.bars.get(id);
    if (bar) {
      bar.update(bar.getProgress() * bar.getTotal(), {
        detail: chalk.red(`Failed: ${error}`),
      });
    }
  }

  stop(showSummary: boolean = true): void {
    this.multiBar.stop();
    
    if (showSummary) {
      const duration = Date.now() - this.startTime;
      MessageFormatter.success(
        `All tasks completed in ${MessageFormatter.formatDuration(duration)}`
      );
    }
  }

  getTaskStats(id: string) {
    const bar = this.bars.get(id);
    if (!bar) return null;

    const progress = bar.getProgress();
    const total = bar.getTotal();
    const completed = Math.floor(progress * total);

    return {
      completed,
      total,
      percentage: progress * 100,
      remaining: total - completed,
    };
  }

  getAllStats() {
    const stats = new Map<string, any>();
    for (const [id, bar] of this.bars) {
      stats.set(id, this.getTaskStats(id));
    }
    return stats;
  }
}

// Utility functions for common progress scenarios
export const ProgressUtils = {
  async withProgress<T>(
    id: string,
    total: number,
    title: string,
    operation: (progress: ProgressManager) => Promise<T>
  ): Promise<T> {
    const progress = ProgressManager.create(id, total, { title });
    try {
      const result = await operation(progress);
      progress.stop();
      return result;
    } catch (error) {
      progress.fail(error instanceof Error ? error.message : String(error));
      throw error;
    }
  },

  async processArrayWithProgress<T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>,
    options: { title?: string; batchSize?: number; showDetail?: boolean } = {}
  ): Promise<R[]> {
    const { title = "Processing items", batchSize = 1, showDetail = true } = options;
    const progress = ProgressManager.create(`process-${Date.now()}`, items.length, { title });
    
    const results: R[] = [];
    
    try {
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (item, batchIndex) => {
            const result = await processor(item, i + batchIndex);
            const detail = showDetail ? `Item ${i + batchIndex + 1}: ${String(item).slice(0, 30)}...` : undefined;
            progress.update(i + batchIndex + 1, detail);
            return result;
          })
        );
        results.push(...batchResults);
      }
      
      progress.stop();
      return results;
    } catch (error) {
      progress.fail(error instanceof Error ? error.message : String(error));
      throw error;
    }
  },
};