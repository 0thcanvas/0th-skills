export function shouldRetry({ attempt, maxAttempts, error }) {
  return error?.retryable === true && attempt <= maxAttempts;
}

export async function runWithRetry(operation, { maxAttempts }) {
  let attempt = 0;
  while (true) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (!shouldRetry({ attempt, maxAttempts, error })) throw error;
      attempt += 1;
    }
  }
}
