// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { DraftCard } from '@/components/chat/DraftCard';
import type { DraftCardPart } from '@/lib/contracts/parts';

const agora = new Date('2026-11-03T13:00:00.000Z');
const part: DraftCardPart = {
  kind: 'draft_card',
  draft_id: '00000000-0000-4000-8000-0000000000d1',
  code: 'D-381',
  draft_kind: 'create',
  target_code: null,
  status: 'pending',
  payload: {
    title: 'VPN não conecta no notebook — erro 809',
    description: 'Windows 11, erro 809',
    type: 'incident',
    category: 'network_vpn',
    affected: 'me',
    blocks_work: true,
    deadline_today: true,
    priority: 'high',
    priority_rule: 'Alta: …',
    due_at: '2026-11-03T16:43:00.000Z',
  },
};

function setup(onConfirm = vi.fn(() => new Promise<void>(() => {}))) {
  render(<DraftCard part={part} now={agora} onConfirm={onConfirm} onCancel={vi.fn()} onSave={vi.fn()} keyboard />);
  return onConfirm;
}

describe('DraftCard', () => {
  it('mostra o rascunho como no protótipo', () => {
    setup();
    expect(screen.getByText('Novo chamado')).toBeInTheDocument();
    expect(screen.getByText('Rascunho D-381')).toBeInTheDocument();
    expect(screen.getByText('Aguardando confirmação')).toBeInTheDocument();
    expect(screen.getByText('Rede e VPN')).toBeInTheDocument();
    expect(screen.getByText('Alta')).toBeInTheDocument();
    expect(screen.getByText('· resposta até 13:43')).toBeInTheDocument();
    expect(screen.getByText('Somente você')).toBeInTheDocument();
  });

  it('Ctrl+Enter confirma uma vez', () => {
    const onConfirm = setup();
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('duplo clique em Confirmar chama uma vez e desabilita o botão', async () => {
    const onConfirm = setup();
    const btn = screen.getByTestId('draft-confirm');
    await act(async () => {
      fireEvent.click(btn);
      fireEvent.click(btn);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(btn).toBeDisabled();
  });

  it('confirmado mostra o código criado e esconde as ações', () => {
    render(
      <DraftCard
        part={{ ...part, status: 'confirmed', result_ticket_code: 'INC-20520' }}
        now={agora}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText('Criado como INC-20520')).toBeInTheDocument();
    expect(screen.queryByTestId('draft-confirm')).toBeNull();
  });

  it('na edição, o tipo tem rótulo próprio e "impede de trabalhar" e "compromisso hoje" podem mudar', async () => {
    const onSave = vi.fn();
    render(<DraftCard part={part} now={agora} onConfirm={vi.fn()} onCancel={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByTestId('draft-edit'));

    expect(screen.getByLabelText('Tipo')).toBe(screen.getByTestId('draft-field-type'));
    const bloqueia = screen.getByLabelText('Impede de trabalhar');
    const hoje = screen.getByLabelText('Compromisso hoje');
    expect(bloqueia).toBeChecked();
    expect(hoje).toBeChecked();

    fireEvent.click(bloqueia);
    fireEvent.click(hoje);
    await act(async () => {
      fireEvent.click(screen.getByTestId('draft-save'));
    });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ blocks_work: false, deadline_today: false }));
  });
});
