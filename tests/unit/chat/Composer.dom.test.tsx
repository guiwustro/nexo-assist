// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Composer } from '@/components/chat/Composer';

describe('Composer', () => {
  it('no limite mostra 30/30 em vermelho', () => {
    render(<Composer count={30} limit={30} onSend={vi.fn()} mode="agent" />);
    const c = screen.getByTestId('session-counter');
    expect(c).toHaveTextContent('30/30 mensagens nesta sessão');
    expect(c.className).toMatch(/danger/);
  });

  it('Enter envia e limpa', () => {
    const onSend = vi.fn();
    render(<Composer count={3} limit={30} onSend={onSend} mode="agent" />);
    const input = screen.getByTestId('composer-input');
    fireEvent.change(input, { target: { value: 'oi' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('oi');
    expect(input).toHaveValue('');
  });

  it('com analista o placeholder muda', () => {
    render(<Composer count={3} limit={30} onSend={vi.fn()} mode="analyst" />);
    expect(screen.getByTestId('composer-input')).toHaveAttribute('placeholder', 'Conversa com analista');
  });

  it('desabilitado não envia', () => {
    const onSend = vi.fn();
    render(<Composer count={3} limit={30} onSend={onSend} mode="agent" disabled />);
    const input = screen.getByTestId('composer-input');
    fireEvent.change(input, { target: { value: 'oi' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });
});
