// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QuickReplies } from '@/components/chat/QuickReplies';

const options = ['Só eu', 'Minha equipe', 'Toda a empresa', 'Não sei'];

describe('QuickReplies', () => {
  it('tecla 2 escolhe a segunda opção', () => {
    const onSelect = vi.fn();
    render(<QuickReplies question="Quem está sendo afetado?" options={options} onSelect={onSelect} keyboard />);
    fireEvent.keyDown(window, { key: '2' });
    expect(onSelect).toHaveBeenCalledWith('Minha equipe');
  });

  it('com foco num campo de texto a tecla não dispara', () => {
    const onSelect = vi.fn();
    render(
      <>
        <textarea data-testid="t" />
        <QuickReplies question="Quem?" options={options} onSelect={onSelect} keyboard />
      </>,
    );
    const t = screen.getByTestId('t');
    t.focus();
    fireEvent.keyDown(t, { key: '2' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('digitar um número no composer vazio não escolhe opção ("11" não vira "Windows 10")', () => {
    const onSelect = vi.fn();
    render(
      <>
        <textarea data-testid="composer" defaultValue="" />
        <QuickReplies question="Qual é o sistema?" options={['Windows 10', 'Windows 11']} onSelect={onSelect} keyboard />
      </>,
    );
    const c = screen.getByTestId('composer');
    c.focus();
    fireEvent.keyDown(c, { key: '1' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('clique envia o texto da opção', () => {
    const onSelect = vi.fn();
    render(<QuickReplies question="Quem?" options={options} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Toda a empresa'));
    expect(onSelect).toHaveBeenCalledWith('Toda a empresa');
  });

  it('sem teclado habilitado (mensagem antiga) não reage a teclas', () => {
    const onSelect = vi.fn();
    render(<QuickReplies question="Quem?" options={options} onSelect={onSelect} keyboard={false} />);
    fireEvent.keyDown(window, { key: '1' });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
