// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useEvents } from '@/lib/client/use-events';

class FakeEventSource {
  static last: FakeEventSource | null = null;
  listeners = new Map<string, Array<(e: MessageEvent) => void>>();
  closed = false;
  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener() {}
  close() {
    this.closed = true;
  }
  emit(type: string, data?: unknown) {
    for (const fn of this.listeners.get(type) ?? []) fn(new MessageEvent(type, { data: JSON.stringify(data ?? {}) }));
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useEvents', () => {
  it('repassa eventos do SSE', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const onEvent = vi.fn();
    const { result } = renderHook(() => useEvents(onEvent));
    expect(result.current.mode).toBe('sse');
    act(() => FakeEventSource.last!.emit('conversation.claimed', { id: 7, type: 'conversation.claimed', conversation_id: 'c1' }));
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'conversation.claimed', conversation_id: 'c1' }));
  });

  it('erro no SSE cai para polling a cada 3 s', () => {
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', FakeEventSource);
    const onEvent = vi.fn();
    const { result } = renderHook(() => useEvents(onEvent));
    act(() => FakeEventSource.last!.emit('error'));
    expect(result.current.mode).toBe('polling');
    expect(FakeEventSource.last!.closed).toBe(true);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onEvent).toHaveBeenCalledWith({ type: 'poll' });
  });
});
