// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ConversationSearch, Realce } from '@/components/console/ConversationSearch';

afterEach(cleanup);

function Harness({ total, onClose = () => {} }: { total: number; onClose?: () => void }) {
  const [termo, setTermo] = useState('');
  const [atual, setAtual] = useState(0);
  return (
    <>
      <ConversationSearch termo={termo} onTermo={setTermo} total={total} atual={atual} onAtual={setAtual} onClose={onClose} />
      <span data-testid="atual">{atual}</span>
    </>
  );
}

describe('ConversationSearch', () => {
  it('mostra "n de m", Enter avança e Shift+Enter volta, dando a volta nas pontas', () => {
    render(<Harness total={3} />);
    const input = screen.getByRole('searchbox', { name: 'Buscar na conversa' });
    fireEvent.change(input, { target: { value: 'vpn' } });
    expect(screen.getByTestId('busca-contador').textContent).toBe('1 de 3');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('busca-contador').textContent).toBe('2 de 3');
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(screen.getByTestId('busca-contador').textContent).toBe('3 de 3');
  });

  it('sem resultado avisa e Esc fecha', () => {
    const onClose = vi.fn();
    render(<Harness total={0} onClose={onClose} />);
    const input = screen.getByRole('searchbox', { name: 'Buscar na conversa' });
    fireEvent.change(input, { target: { value: 'impressora' } });
    expect(screen.getByTestId('busca-contador').textContent).toBe('Nada encontrado');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Realce', () => {
  it('marca as ocorrências sem acento/caixa e destaca a ativa', () => {
    const { container } = render(<Realce texto="A VPN caiu. Reiniciei a vpn." termo="vpn" ativa={1} />);
    const marks = container.querySelectorAll('mark');
    expect([...marks].map((m) => m.textContent)).toEqual(['VPN', 'vpn']);
    expect(marks[1]?.hasAttribute('data-busca-ativa')).toBe(true);
    expect(marks[0]?.hasAttribute('data-busca-ativa')).toBe(false);
    expect(container.textContent).toBe('A VPN caiu. Reiniciei a vpn.');
  });

  it('sem termo devolve o texto puro', () => {
    const { container } = render(<Realce texto="Olá" termo="" ativa={null} />);
    expect(container.querySelector('mark')).toBeNull();
    expect(container.textContent).toBe('Olá');
  });
});
