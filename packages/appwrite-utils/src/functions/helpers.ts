import { AppwriteException } from "appwrite";

/**
 * Tries to execute the given createFunction and retries up to 5 times if it fails.
 *
 * @param {() => Promise<any>} createFunction - The function to be executed.
 * @param {number} [attemptNum=0] - The number of attempts made so far (default: 0).
 * @return {Promise<any>} - A promise that resolves to the result of the createFunction or rejects with an error if it fails after 5 attempts.
 */
export const tryAwaitWithRetry = async <T>(
  createFunction: () => Promise<T>,
  attemptNum: number = 0
): Promise<T> => {
  try {
    return await createFunction();
  } catch (error) {
    if (
      error instanceof AppwriteException &&
      (error.message.toLowerCase().includes("fetch failed") ||
        error.message.toLowerCase().includes("server error"))
    ) {
      console.log(`Fetch failed on attempt ${attemptNum}. Retrying...`);
      if (attemptNum > 5) {
        throw error;
      }
      return tryAwaitWithRetry(createFunction, attemptNum + 1);
    }
    throw error;
  }
};
