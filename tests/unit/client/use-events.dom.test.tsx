// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useEvents } from '@/lib/client/use-events';

class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static last: FakeEventSource | null = null;
  static created = 0;
  listeners = new Map<string, Array<(e: MessageEvent) => void>>();
  closed = false;
  readyState = FakeEventSource.CONNECTING;
  constructor(readonly url: string) {
    FakeEventSource.last = this;
    FakeEventSource.created += 1;
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener() {}
  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
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
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onEvent).toHaveBeenCalledWith({ type: 'poll' });
  });

  it('quando o navegador reconecta o SSE, o polling para e a tela recarrega uma vez', () => {
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', FakeEventSource);
    const onEvent = vi.fn();
    const { result } = renderHook(() => useEvents(onEvent));
    const es = FakeEventSource.last!;
    act(() => es.emit('error')); // queda de rede: readyState segue CONNECTING, o navegador tenta de novo
    expect(es.closed).toBe(false);
    act(() => {
      es.readyState = FakeEventSource.OPEN;
      es.emit('open');
    });
    expect(result.current.mode).toBe('sse');
    expect(onEvent).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('se o navegador desiste do SSE, tenta conectar de novo mais tarde', () => {
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', FakeEventSource);
    const { result } = renderHook(() => useEvents(vi.fn()));
    const primeiro = FakeEventSource.last!;
    const antes = FakeEventSource.created;
    act(() => {
      primeiro.readyState = FakeEventSource.CLOSED;
      primeiro.emit('error');
    });
    expect(result.current.mode).toBe('polling');
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(FakeEventSource.created).toBe(antes + 1);
    const segundo = FakeEventSource.last!;
    act(() => {
      segundo.readyState = FakeEventSource.OPEN;
      segundo.emit('open');
    });
    expect(result.current.mode).toBe('sse');
  });
});
