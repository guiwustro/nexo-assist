/**
 * Junta páginas de mensagens no cliente. O servidor devolve as últimas N; o que estiver no estado e não vier
 * na janela nova é mais antigo (mensagens não são apagadas), então fica antes dela.
 */
export function mergeLatest<T extends { id: string }>(shown: T[], fresh: T[]): T[] {
  const ids = new Set(fresh.map((x) => x.id));
  return [...shown.filter((x) => !ids.has(x.id)), ...fresh];
}

/** Página anterior (mais antiga) antes do que já está na tela. */
export function prependOlder<T extends { id: string }>(shown: T[], older: T[]): T[] {
  const ids = new Set(shown.map((x) => x.id));
  return [...older.filter((x) => !ids.has(x.id)), ...shown];
}
