const { MovieDb } = require('moviedb-promise');
const { createAxiosInstance } = require('./httpClient');

// HTTP status codes that should never be retried
const NON_RETRYABLE_CODES = new Set([400, 403, 404, 422]);

/**
 * Sleep for ms milliseconds
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Custom TMDB client with proxy support and automatic retry on transient failures.
 *
 * Retry behaviour:
 *   - 401               → throw immediately (bad key, no point retrying)
 *   - 400/403/404/422   → throw immediately (non-retryable)
 *   - 429               → wait for Retry-After header value, then retry
 *   - 5xx / network err → exponential backoff (1 s, 2 s), up to 3 attempts total
 */
class TMDBClient extends MovieDb {
  constructor(apiKey) {
    super(apiKey);

    this._request = async (url, options = {}) => {
      const maxAttempts = 3;
      let lastError;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const instance = createAxiosInstance(url);

        try {
          const response = await instance.request({
            url,
            method: options.method || 'GET',
            data: options.data,
            params: options.params,
            headers: options.headers,
            ...options
          });
          return response.data;

        } catch (error) {
          lastError = error;
          const status = error.response?.status;

          // ── 401: invalid key ────────────────────────────────────────────
          if (status === 401) {
            const msg = error.response.data?.status_message || 'Invalid API key';
            const apiError = new Error('TMDB_API_KEY_INVALID');
            apiError.statusCode = 401;
            apiError.userMessage = `TMDB API Key is invalid or expired: ${msg}`;
            apiError.originalError = error;
            console.error(`[TMDB] API key invalid for ${url}:`, msg);
            throw apiError;
          }

          // ── Non-retryable HTTP errors ────────────────────────────────────
          if (NON_RETRYABLE_CODES.has(status)) {
            console.error(`[TMDB] Non-retryable error ${status} for ${url}`);
            throw error;
          }

          // ── 429: rate limited ────────────────────────────────────────────
          if (status === 429) {
            const retryAfter = parseInt(error.response?.headers?.['retry-after'] || '5', 10);
            const wait = retryAfter * 1000 + 200;
            console.warn(`[TMDB] Rate limited (429). Waiting ${wait}ms before attempt ${attempt + 1}/${maxAttempts} for ${url}`);
            await sleep(wait);
            continue;
          }

          // ── 5xx or network/timeout errors ────────────────────────────────
          const isNetworkOrTimeout = !error.response; // no response object = connection-level failure
          const is5xx = status >= 500;

          if ((isNetworkOrTimeout || is5xx) && attempt < maxAttempts) {
            const delay = 1000 * Math.pow(2, attempt - 1); // 1 s, 2 s
            console.warn(`[TMDB] Request failed (${error.message}), retrying in ${delay}ms (attempt ${attempt}/${maxAttempts}) for ${url}`);
            await sleep(delay);
            continue;
          }

          // Out of retries or unknown error — log and throw
          if (error.response) {
            console.error(`[TMDB] API error ${status} for ${url}:`, error.response.data?.status_message || error.message);
          } else {
            console.error(`[TMDB] Request error for ${url}:`, error.message);
          }
          throw error;
        }
      }

      throw lastError;
    };
  }

  async request(url, options = {}) {
    return this._request(url, options);
  }
}

module.exports = { TMDBClient };
