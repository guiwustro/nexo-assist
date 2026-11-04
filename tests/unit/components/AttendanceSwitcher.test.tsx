// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttendanceSwitcher } from '@/components/chat/AttendanceSwitcher';
import type { AttendanceSummary } from '@/lib/client/api';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/lib/client/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/client/api')>()),
  api,
}));

const current: AttendanceSummary = {
  id: 'attendance-current',
  status: 'ai_handling',
  label: 'Com o Nexo',
  analyst_name: null,
  focus_ticket_code: null,
  ticket_codes: ['INC-20311'],
  started_at: '2026-11-04T12:00:00.000Z',
  last_message_at: '2026-11-04T12:10:00.000Z',
  last_message_preview: 'Minha dúvida',
  closed_reason: null,
};

const other: AttendanceSummary = {
  ...current,
  id: 'attendance-analyst',
  status: 'pending',
  label: 'Aguardando analista',
  ticket_codes: ['INC-20388'],
};

describe('AttendanceSwitcher', () => {
  beforeEach(() => api.mockReset());

  it('busca atendimentos ao abrir e marca o atual', async () => {
    api.mockResolvedValue([other, current]);
    render(<AttendanceSwitcher current={current} />);

    fireEvent.click(screen.getByTestId('attendance-switcher'));

    expect(api).toHaveBeenCalledWith('/api/v1/me/conversations');
    const items = await screen.findAllByTestId('attendance-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute('href', '/atendimento/attendance-analyst');
    expect(items[0]).toHaveTextContent('Aguardando analista');
    expect(items[0]).toHaveTextContent('INC-20388');
    expect(items[1]).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('attendance-switcher')).toHaveTextContent('Atendimentos · 2');
  });

  it('inclui o atendimento atual se ele não vier na lista', async () => {
    api.mockResolvedValue([]);
    render(<AttendanceSwitcher current={current} />);
    fireEvent.click(screen.getByTestId('attendance-switcher'));

    await waitFor(() => expect(screen.getAllByTestId('attendance-item')).toHaveLength(1));
    expect(screen.getByTestId('attendance-item')).toHaveAttribute('aria-current', 'page');
  });
});
