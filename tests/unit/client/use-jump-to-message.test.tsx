// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useJumpToMessage } from '@/lib/client/use-jump-to-message';

describe('useJumpToMessage', () => {
  it('carrega páginas até achar a mensagem e a centraliza', async () => {
    let loadedPages = 0;
    const loadOlder = vi.fn(async () => {
      loadedPages += 1;
      return true;
    });
    const has = vi.fn(() => loadedPages >= 2);
    const { result } = renderHook(() => useJumpToMessage('message-old', { has, loadOlder }));
    const element = document.createElement('div');
    element.dataset.messageId = 'message-old';
    element.scrollIntoView = vi.fn();
    document.body.append(element);

    await waitFor(() => expect(result.current.highlighted).toBe('message-old'));
    expect(loadOlder).toHaveBeenCalledTimes(2);
    expect(element.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    element.remove();
  });

  it('desiste quando não há mais páginas', async () => {
    const loadOlder = vi.fn().mockResolvedValue(false);
    const { result } = renderHook(() => useJumpToMessage('missing', { has: () => false, loadOlder }));

    await waitFor(() => expect(loadOlder).toHaveBeenCalledTimes(1));
    expect(result.current.highlighted).toBeNull();
  });

  it('respeita maxPages', async () => {
    const loadOlder = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() =>
      useJumpToMessage('missing', { has: () => false, loadOlder, maxPages: 2 }),
    );

    await waitFor(() => expect(loadOlder).toHaveBeenCalledTimes(2));
    expect(result.current.highlighted).toBeNull();
  });

  it('não carrega páginas sem target', async () => {
    const loadOlder = vi.fn();
    renderHook(() => useJumpToMessage(null, { has: () => false, loadOlder }));

    await act(async () => Promise.resolve());
    expect(loadOlder).not.toHaveBeenCalled();
  });
});
