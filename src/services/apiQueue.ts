// =============================================================================
// BMS Session KPI Dashboard - API Request Queue
// Manages concurrent API calls with rate limiting, deduplication, and retry
// =============================================================================

/** Maximum concurrent API calls */
const MAX_CONCURRENT_CALLS = 3;

/** Maximum retry attempts for rate-limited requests */
const MAX_RETRY_ATTEMPTS = 3;

/** Base delay for exponential backoff (ms) */
const BASE_RETRY_DELAY_MS = 1000;

/** Maximum backoff delay (ms) */
const MAX_RETRY_DELAY_MS = 30000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QueuedRequest<T> {
  id: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  retryCount: number;
}

interface ApiQueueStats {
  pending: number;
  active: number;
  completed: number;
  failed: number;
}

// ---------------------------------------------------------------------------
// API Queue Implementation
// ---------------------------------------------------------------------------

class ApiRequestQueue {
  private queue: QueuedRequest<unknown>[] = [];
  private active = 0;
  private completed = 0;
  private failed = 0;
  private pendingRequests = new Map<string, Promise<unknown>>();

  /**
   * Calculate backoff delay with exponential increase and jitter
   */
  private calculateBackoffDelay(retryCount: number, retryAfter?: string | null): number {
    // If server provided Retry-After header, use it
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) {
        return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
      }
    }

    // Exponential backoff with jitter: base * 2^retry + random(0, 1000)
    const exponentialDelay = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount);
    const jitter = Math.random() * 1000;
    return Math.min(exponentialDelay + jitter, MAX_RETRY_DELAY_MS);
  }

  /**
   * Process the next request in the queue
   */
  private processQueue(): void {
    if (this.active >= MAX_CONCURRENT_CALLS || this.queue.length === 0) {
      return;
    }

    const request = this.queue.shift();
    if (!request) return;

    this.active++;
    this.executeRequest(request);
  }

  /**
   * Execute a single request with retry support
   */
  private async executeRequest<T>(request: QueuedRequest<T>): Promise<void> {
    try {
      const result = await request.execute();
      this.completed++;
      request.resolve(result);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Check if this is a rate limit error and we should retry
      if (this.isRateLimitError(err) && request.retryCount < MAX_RETRY_ATTEMPTS) {
        const retryAfter = this.extractRetryAfter(err);
        const delay = this.calculateBackoffDelay(request.retryCount, retryAfter);

        console.warn(`[ApiQueue] Rate limited, retrying in ${delay}ms (attempt ${request.retryCount + 1}/${MAX_RETRY_ATTEMPTS})`);

        // Schedule retry — decrement active here, skip finally decrement
        this.active--;
        setTimeout(() => {
          request.retryCount++;
          this.queue.unshift(request as QueuedRequest<unknown>); // Add to front of queue
          this.processQueue();
        }, delay);
        return;
      }

      // Non-retryable error or max retries exceeded
      this.failed++;
      request.reject(err);
    }
    // Decrement active count and process next — only for non-retry paths
    this.active--;
    this.processQueue();
  }

  /**
   * Check if error indicates rate limiting
   */
  private isRateLimitError(error: Error): boolean {
    return error.message.includes('429') || error.message.includes('\u0e23\u0e49\u0e2d\u0e07\u0e02\u0e2d\u0e1a\u0e48\u0e2d\u0e22\u0e40\u0e01\u0e34\u0e19\u0e44\u0e1b');
  }

  /**
   * Extract Retry-After value from error message if present
   */
  private extractRetryAfter(error: Error): string | null {
    const match = error.message.match(/\u0e23\u0e2d (\d+) \u0e27\u0e34\u0e19\u0e32\u0e17\u0e35/);
    return match ? match[1] : null;
  }

  /**
   * Enqueue an API request with deduplication
   *
   * @param requestId - Unique identifier for deduplication
   * @param executor - Function that performs the actual API call
   * @returns Promise that resolves with the API response
   */
  async enqueue<T>(requestId: string, executor: () => Promise<T>): Promise<T> {
    // Check for duplicate pending request
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      console.debug(`[ApiQueue] Deduplicating request: ${requestId}`);
      return pending as Promise<T>;
    }

    // Create the promise that will be resolved when the request completes
    const promise = new Promise<T>((resolve, reject) => {
      const request: QueuedRequest<T> = {
        id: requestId,
        execute: executor,
        resolve,
        reject,
        retryCount: 0,
      };

      this.queue.push(request as QueuedRequest<unknown>);

      // Try to process immediately
      this.processQueue();
    });

    // Track pending request for deduplication
    this.pendingRequests.set(requestId, promise);

    // Clean up after completion
    promise
      .finally(() => {
        this.pendingRequests.delete(requestId);
      })
      .catch(() => {
        // Prevent unhandled rejection
      });

    return promise;
  }

  /**
   * Get current queue statistics
   */
  getStats(): ApiQueueStats {
    return {
      pending: this.queue.length,
      active: this.active,
      completed: this.completed,
      failed: this.failed,
    };
  }

  /**
   * Clear the queue (useful for cleanup on disconnect)
   */
  clear(): void {
    this.queue.forEach((request) => {
      request.reject(new Error('Request cancelled - session disconnected'));
    });
    this.queue = [];
    this.pendingRequests.clear();
  }
}

// Singleton instance
export const apiQueue = new ApiRequestQueue();

// Re-export for testing
export type { ApiQueueStats };
