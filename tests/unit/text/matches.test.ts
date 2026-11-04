import { describe, expect, it } from 'vitest';
import { findMatches, containsTerm, fold } from '@/lib/text/matches';

describe('acharTrechos', () => {
  it('ignora acento e caixa e devolve os índices do texto original', () => {
    const text = 'Não consigo acessar a VPN. A vpn caiu de novo.';
    expect(findMatches(text, 'vpn')).toEqual([
      [22, 25],
      [29, 32],
    ]);
    expect(findMatches('Fábio Nunes', 'fabio')).toEqual([[0, 5]]);
    expect(findMatches('Fabio Nunes', 'FÁBIO')).toEqual([[0, 5]]);
  });

  it('acento decomposto (NFD) no texto não desloca os índices', () => {
    const text = 'Fábio aqui';
    const [[a, b]] = findMatches(text, 'fabio') as [[number, number]];
    expect(text.slice(a, b)).toBe('Fábio');
  });

  it('termo vazio ou só espaços não acha nada', () => {
    expect(findMatches('qualquer coisa', '')).toEqual([]);
    expect(findMatches('qualquer coisa', '   ')).toEqual([]);
  });

  it('ocorrências não se sobrepõem', () => {
    expect(findMatches('aaaa', 'aa')).toEqual([
      [0, 2],
      [2, 4],
    ]);
  });
});

describe('contem e dobrar', () => {
  it('contem é o atalho booleano', () => {
    expect(containsTerm('Erro 809 na VPN', 'vpn')).toBe(true);
    expect(containsTerm('Erro 809 na VPN', 'wifi')).toBe(false);
  });

  it('dobrar tira acento e caixa', () => {
    expect(fold('Ação Rápida')).toBe('acao rapida');
  });
});
