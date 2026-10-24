import { describe, it, expect, vi, beforeEach } from 'vitest';

// Exercise the real api.js GET cache against a mocked axios instance.
const get = vi.fn();
const handlers = {};
vi.mock('axios', () => ({
  default: {
    create: () => ({
      get,
      interceptors: {
        request: { use: () => {} },
        response: { use: (ok, err) => { handlers.ok = ok; handlers.err = err; } },
      },
    }),
  },
}));

const api = await import('../api');

describe('api GET cache', () => {
  beforeEach(() => { get.mockReset(); api.clearApiCache(); });

  it('shares one request between identical reads and hands out independent copies', async () => {
    get.mockResolvedValue({ data: [{ name: 'Ravi' }] });
    const [a, b] = await Promise.all([api.getPeople(), api.getPeople()]);
    expect(get).toHaveBeenCalledTimes(1);
    a[0].name = 'changed';
    expect(b[0].name).toBe('Ravi');
  });

  it('a successful write clears the cache', async () => {
    get.mockResolvedValue({ data: [] });
    await api.getCards();
    handlers.ok({ config: { method: 'post' } });
    await api.getCards();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('failed reads are not cached', async () => {
    get.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({ data: ['ok'] });
    await expect(api.getVariants()).rejects.toThrow('down');
    expect(await api.getVariants()).toEqual(['ok']);
  });
});
