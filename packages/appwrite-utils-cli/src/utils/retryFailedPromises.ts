import type { Models } from "node-appwrite";

export const retryFailedPromises = async (
  batch: Promise<Models.Document>[],
  maxRetries = 3
): Promise<PromiseSettledResult<Models.Document>[]> => {
  const results = await Promise.allSettled(batch);
  const toRetry: Promise<any>[] = [];

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error("Promise rejected with reason:", result.reason);
      if (maxRetries > 0) {
        toRetry.push(batch[index]);
      }
    }
  });

  if (toRetry.length > 0) {
    console.log(`Retrying ${toRetry.length} promises`);
    return retryFailedPromises(toRetry, maxRetries - 1);
  } else {
    return results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result);
  }
};
