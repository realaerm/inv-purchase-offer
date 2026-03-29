// =============================================================================
// API Queue Unit Tests
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiQueue } from '@/services/apiQueue';

describe('ApiRequestQueue', () => {
  beforeEach(() => {
    apiQueue.clear();
  });

  afterEach(() => {
    apiQueue.clear();
  });

  describe('enqueue', () => {
    it('MUST execute a request and return the result', async () => {
      const executor = vi.fn().mockResolvedValue({ data: 'test' });

      const result = await apiQueue.enqueue('test-1', executor);

      expect(result).toEqual({ data: 'test' });
      expect(executor).toHaveBeenCalledTimes(1);
    });

    it('MUST deduplicate identical requests', async () => {
      const executor = vi.fn().mockResolvedValue({ data: 'shared' });

      // Make two identical requests
      const promise1 = apiQueue.enqueue('dup-1', executor);
      const promise2 = apiQueue.enqueue('dup-1', executor);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Both should get the same result
      expect(result1).toEqual({ data: 'shared' });
      expect(result2).toEqual({ data: 'shared' });

      // But executor should only be called once
      expect(executor).toHaveBeenCalledTimes(1);
    });

    it('MUST not deduplicate different requests', async () => {
      const executor1 = vi.fn().mockResolvedValue({ data: 'first' });
      const executor2 = vi.fn().mockResolvedValue({ data: 'second' });

      const promise1 = apiQueue.enqueue('diff-1', executor1);
      const promise2 = apiQueue.enqueue('diff-2', executor2);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toEqual({ data: 'first' });
      expect(result2).toEqual({ data: 'second' });

      expect(executor1).toHaveBeenCalledTimes(1);
      expect(executor2).toHaveBeenCalledTimes(1);
    });

    it('MUST reject on non-rate-limit errors', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(apiQueue.enqueue('error-1', executor)).rejects.toThrow('Network error');
      expect(executor).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStats', () => {
    it('MUST return queue statistics', async () => {
      const executor = vi.fn().mockResolvedValue({ data: 'test' });

      apiQueue.enqueue('stats-1', executor);

      const statsBefore = apiQueue.getStats();
      expect(statsBefore.pending).toBeGreaterThanOrEqual(0);
      expect(statsBefore.completed).toBeGreaterThanOrEqual(0);

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 100));

      const statsAfter = apiQueue.getStats();
      expect(statsAfter.completed).toBeGreaterThanOrEqual(1);
    });
  });

  describe('clear', () => {
    it('MUST track failed requests', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('Test error'));

      try {
        await apiQueue.enqueue('fail-1', executor);
      } catch {
        // Expected
      }

      const stats = apiQueue.getStats();
      expect(stats.failed).toBeGreaterThanOrEqual(1);
    });
  });

  describe('concurrency', () => {
    it('MUST handle multiple concurrent requests', async () => {
      const executors = Array(5).fill(null).map((_, i) =>
        vi.fn().mockResolvedValue({ id: i })
      );

      const promises = executors.map((exec, i) =>
        apiQueue.enqueue(`concurrent-${i}`, exec)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach((r, i) => {
        expect(r).toEqual({ id: i });
      });
    });
  });
});
