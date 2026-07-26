`npm test` shows that the retry runner makes too many attempts. Diagnose the root cause and fix it
without weakening tests.

Contract:
- `maxAttempts` is the total number of calls including the initial call;
- `attempt` is zero-based and counts the call that just failed;
- retry only retryable errors;
- invalid `maxAttempts` values throw `TypeError`;
- return immediately on success and rethrow the final error when exhausted.

Run `npm test` and report the diagnosed root cause in `root_cause`.
