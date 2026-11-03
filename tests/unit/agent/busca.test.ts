import { describe, expect, it } from 'vitest';
import { buscarArtigos, type Article } from '@/lib/agent-engine/conhecimento/busca';

const artigos: Article[] = [
  {
    slug: 'vpn-erro-809',
    title: 'Erro 809 ao conectar na VPN',
    body: 'No Windows 10, o erro 809 acontece quando a rede bloqueia o protocolo. Desative e ative o adaptador.',
    tags: ['vpn', '809', 'rede'],
    applies_to: 'Windows 10',
  },
  {
    slug: 'horario-service-desk',
    title: 'Horário de atendimento do service desk',
    body: 'O service desk atende de segunda a sexta, das 8h às 18h. Críticos têm plantão 24h.',
    tags: ['horario', 'atendimento', 'plantao'],
    applies_to: null,
  },
  {
    slug: 'redefinir-senha',
    title: 'Como redefinir sua senha da rede',
    body: 'Acesse o portal de senhas e siga as instruções. A rede pede troca a cada 90 dias.',
    tags: ['senha', 'rede', 'acesso'],
    applies_to: null,
  },
];

describe('buscarArtigos', () => {
  it('"erro 809 na vpn" → vpn-erro-809 primeiro', () => {
    expect(buscarArtigos('erro 809 na vpn', artigos)[0]?.slug).toBe('vpn-erro-809');
  });
  it('acento e maiúscula não mudam o resultado', () => {
    expect(buscarArtigos('VPN', artigos)[0]?.slug).toBe('vpn-erro-809');
    expect(buscarArtigos('HORÁRIO', artigos)[0]?.slug).toBe('horario-service-desk');
  });
  it('"qual o horário de atendimento" → horario-service-desk', () => {
    expect(buscarArtigos('qual o horário de atendimento', artigos)[0]?.slug).toBe('horario-service-desk');
  });
  it('sem relação → lista vazia', () => {
    expect(buscarArtigos('receita de bolo', artigos)).toEqual([]);
  });
  it('respeita o limite e ordena por score', () => {
    const r = buscarArtigos('rede', artigos, 1);
    expect(r).toHaveLength(1);
    const todos = buscarArtigos('rede senha', artigos);
    expect(todos[0]?.slug).toBe('redefinir-senha');
    for (let i = 1; i < todos.length; i++) expect(todos[i - 1]!.score).toBeGreaterThanOrEqual(todos[i]!.score);
  });
});

import { SEED_ARTICLES } from '@/lib/db/seed-data';

describe('buscarArtigos com a central de ajuda real', () => {
  it('palavra genérica ("erro") não puxa artigo sem relação', () => {
    expect(buscarArtigos('vpn erro 809', SEED_ARTICLES).map((a) => a.slug)).toEqual(['vpn-erro-809']);
  });
  it('horário do service desk acha só o artigo do horário', () => {
    expect(buscarArtigos('horário do service desk', SEED_ARTICLES)[0]?.slug).toBe('horario-service-desk');
  });
});
