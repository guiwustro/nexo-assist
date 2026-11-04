import { describe, expect, it } from 'vitest';
import { acharTrechos, contem, dobrar } from '@/lib/text/trechos';

describe('acharTrechos', () => {
  it('ignora acento e caixa e devolve os índices do texto original', () => {
    const texto = 'Não consigo acessar a VPN. A vpn caiu de novo.';
    expect(acharTrechos(texto, 'vpn')).toEqual([
      [22, 25],
      [29, 32],
    ]);
    expect(acharTrechos('Fábio Nunes', 'fabio')).toEqual([[0, 5]]);
    expect(acharTrechos('Fabio Nunes', 'FÁBIO')).toEqual([[0, 5]]);
  });

  it('acento decomposto (NFD) no texto não desloca os índices', () => {
    const texto = 'Fábio aqui';
    const [[a, b]] = acharTrechos(texto, 'fabio') as [[number, number]];
    expect(texto.slice(a, b)).toBe('Fábio');
  });

  it('termo vazio ou só espaços não acha nada', () => {
    expect(acharTrechos('qualquer coisa', '')).toEqual([]);
    expect(acharTrechos('qualquer coisa', '   ')).toEqual([]);
  });

  it('ocorrências não se sobrepõem', () => {
    expect(acharTrechos('aaaa', 'aa')).toEqual([
      [0, 2],
      [2, 4],
    ]);
  });
});

describe('contem e dobrar', () => {
  it('contem é o atalho booleano', () => {
    expect(contem('Erro 809 na VPN', 'vpn')).toBe(true);
    expect(contem('Erro 809 na VPN', 'wifi')).toBe(false);
  });

  it('dobrar tira acento e caixa', () => {
    expect(dobrar('Ação Rápida')).toBe('acao rapida');
  });
});
