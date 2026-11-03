/** Falha transitória (rede, timeout, 5xx, disjuntor aberto): vale tentar de novo depois. */
export class TicketsTransportError extends Error {
  readonly retryable = true;
  constructor(
    message: string,
    readonly reason: 'network' | 'timeout' | 'unavailable' | 'breaker_open' = 'unavailable',
  ) {
    super(message);
    this.name = 'TicketsTransportError';
  }
}

/** Chamado inexistente ou de outra pessoa (indistinguíveis de propósito). */
export class TicketsNotFoundError extends Error {
  constructor(readonly ticketCode?: string) {
    super('Chamado não encontrado');
    this.name = 'TicketsNotFoundError';
  }
}

/** O serviço recusou a operação (4xx de regra de negócio ou de entrada). */
export class TicketsRejectedError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'TicketsRejectedError';
  }
}
