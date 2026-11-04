// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EmployeeTickets, type EmployeeTicketsData } from '@/components/console/EmployeeTickets';
import type { Ticket } from '@/lib/contracts/tickets';

const ANA = '00000000-0000-4000-8000-000000000001';

const base: Ticket = {
  code: 'INC-20298',
  type: 'incident',
  title: 'Notebook lento ao abrir o ERP',
  description: 'Demora uns 5 minutos para abrir o ERP desde a atualização.',
  category: 'hardware',
  subcategory: null,
  priority: 'medium',
  affected: 'me',
  status: 'in_progress',
  requester_id: ANA,
  assignee_name: 'Juliana Costa',
  due_at: '2026-11-04T13:00:00.000Z',
  last_update_at: '2026-11-03T12:00:00.000Z',
  resolved_at: null,
  created_at: '2026-11-02T12:00:00.000Z',
};

const data: EmployeeTicketsData = {
  tickets: [{ ...base, overdue: false, overdue_label: null }],
  open: 1,
  closed: 0,
};

function renderPanel() {
  return render(
    <EmployeeTickets
      employeeId={ANA}
      employeeName="Ana Souza"
      data={data}
      error={false}
      conversationId="00000000-0000-4000-8000-000000000010"
      conversationCodes={[]}
      lastEvent={null}
      onRetry={() => {}}
      onClose={() => {}}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('EmployeeTickets (painel do console)', () => {
  it('clicar num chamado abre o detalhe com descrição e histórico; Voltar retorna à lista', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            ticket: { ...base, overdue: false, overdue_label: null },
            events: [
              {
                kind: 'created',
                body: 'Chamado aberto',
                actor: 'Ana Souza',
                created_at: '2026-11-02T12:00:00.000Z',
              },
              {
                kind: 'comment',
                body: 'Continua lento hoje',
                actor: 'funcionário',
                created_at: '2026-11-03T12:00:00.000Z',
              },
            ],
            attendances: [],
          },
        }),
        { status: 200 },
      ),
    );
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Notebook lento ao abrir o ERP/ }));
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(`/api/v1/employees/${ANA}/tickets/INC-20298`);
    expect(await screen.findByText('Continua lento hoje')).toBeTruthy();
    expect(screen.getByText(/Demora uns 5 minutos/)).toBeTruthy();
    expect(screen.getByTestId('ticket-detail').textContent).toContain('Juliana Costa');
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }));
    expect(screen.queryByTestId('ticket-detail')).toBeNull();
    expect(screen.getByTestId('other-tickets')).toBeTruthy();
  });

  it('falha ao carregar o detalhe mostra aviso com Tentar de novo', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'tickets_unavailable', message: 'fora' } }), {
        status: 503,
      }),
    );
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Notebook lento ao abrir o ERP/ }));
    expect(await screen.findByTestId('ticket-detail-error')).toBeTruthy();
  });
});
