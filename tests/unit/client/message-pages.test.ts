import { describe, expect, it } from 'vitest';
import { mergeLatest, prependOlder } from '@/lib/client/message-pages';

const m = (id: string, body = id) => ({ id, body });

describe('páginas de mensagens no cliente', () => {
  it('mergeLatest mantém as antigas que saíram da janela e troca as que mudaram', () => {
    const shown = [m('1'), m('2'), m('3'), m('4')];
    // Janela nova (últimas 3): 3 e 4 continuam (4 mudou), 5 chegou; 1 e 2 já tinham sido carregadas.
    const fresh = [m('3'), m('4', '4 editada'), m('5')];
    expect(mergeLatest(shown, fresh)).toEqual([m('1'), m('2'), m('3'), m('4', '4 editada'), m('5')]);
  });

  it('mergeLatest sem nada carregado é a janela nova', () => {
    expect(mergeLatest([], [m('1')])).toEqual([m('1')]);
  });

  it('prependOlder põe a página antiga antes, sem repetir', () => {
    expect(prependOlder([m('3'), m('4')], [m('1'), m('2'), m('3')])).toEqual([m('1'), m('2'), m('3'), m('4')]);
  });
});
