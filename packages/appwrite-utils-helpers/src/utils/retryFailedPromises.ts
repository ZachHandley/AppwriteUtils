import type { Models } from "node-appwrite";
import { MessageFormatter } from "../shared/messageFormatter.js";
import { logger } from "../shared/logging.js";

export const retryFailedPromises = async (
  batch: Promise<Models.Document>[],
  maxRetries = 3
): Promise<PromiseSettledResult<Models.Document>[]> => {
  const results = await Promise.allSettled(batch);
  const toRetry: Promise<any>[] = [];

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      logger.error("Promise rejected with reason:", { reason: result.reason });
      if (maxRetries > 0) {
        toRetry.push(batch[index]);
      }
    }
  });

  if (toRetry.length > 0) {
    MessageFormatter.info(`Retrying ${toRetry.length} promises`, { prefix: "Retry" });
    return retryFailedPromises(toRetry, maxRetries - 1);
  } else {
    return results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result);
  }
};
