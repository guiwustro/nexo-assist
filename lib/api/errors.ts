export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFound extends AppError {
  constructor(code = 'not_found', message = 'Não encontrado', details?: unknown) {
    super(code, message, 404, details);
  }
}

export class Conflict extends AppError {
  constructor(code: string, message = 'Conflito', details?: unknown) {
    super(code, message, 409, details);
  }
}

export class Forbidden extends AppError {
  constructor(code = 'forbidden', message = 'Sem permissão', details?: unknown) {
    super(code, message, 403, details);
  }
}

export class Unprocessable extends AppError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, 422, details);
  }
}

export class ServiceUnavailable extends AppError {
  constructor(code = 'service_unavailable', message = 'Serviço indisponível', details?: unknown) {
    super(code, message, 503, details);
  }
}
