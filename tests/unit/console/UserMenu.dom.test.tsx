// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const replace = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
  usePathname: () => '/console',
}));

import { UserMenu } from '@/components/console/UserMenu';

const rafael = { name: 'Rafael Lima', email: 'rafael.lima@nexo.com.br', support_level: 'N1' as const };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  replace.mockReset();
  refresh.mockReset();
});

describe('UserMenu (avatar do console)', () => {
  it('o avatar é um botão que abre o menu com nome, e-mail e nível', () => {
    render(<UserMenu me={rafael} />);
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Rafael Lima/ }));
    const menu = screen.getByRole('menu');
    expect(menu.textContent).toContain('Rafael Lima');
    expect(menu.textContent).toContain('rafael.lima@nexo.com.br');
    expect(menu.textContent).toContain('Analista N1');
    expect(screen.getByRole('menuitem', { name: 'Meu perfil' }).getAttribute('href')).toBe('/console/perfil');
  });

  it('Sair chama o logout e volta para o login', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    render(<UserMenu me={rafael} />);
    fireEvent.click(screen.getByRole('button', { name: /Rafael Lima/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sair' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/auth/logout', { method: 'POST' });
    expect(refresh).toHaveBeenCalled();
  });

  it('Esc e clique fora fecham o menu', () => {
    render(<UserMenu me={rafael} />);
    const botao = screen.getByRole('button', { name: /Rafael Lima/ });
    fireEvent.click(botao);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(botao);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
