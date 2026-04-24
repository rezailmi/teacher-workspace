/**
 * PG error hierarchy. Callers should prefer `instanceof` checks over inspecting
 * `resultCode` directly — the subclass already encodes the meaningful category.
 *
 * The fetch helpers in `client.ts` translate pgw's JSON envelope
 * `{ resultCode, error: { errorReason } }` into one of these, then apply
 * side-effects (redirect for session, toast for generic) before rethrowing.
 * Callers can catch specific subclasses for domain handling (e.g. validation
 * errors render inline instead of as toasts).
 */

export class PGError extends Error {
  readonly resultCode: number;
  readonly httpStatus: number;

  constructor(message: string, resultCode: number, httpStatus: number) {
    super(message);
    this.name = 'PGError';
    this.resultCode = resultCode;
    this.httpStatus = httpStatus;
  }
}

/** -401 / -4012 — session expired or wrong session type. */
export class PGSessionExpiredError extends PGError {
  constructor(message: string, resultCode: number, httpStatus: number) {
    super(message, resultCode, httpStatus);
    this.name = 'PGSessionExpiredError';
  }
}

/** -404 — resource not found. */
export class PGNotFoundError extends PGError {
  constructor(message: string, resultCode: number, httpStatus: number) {
    super(message, resultCode, httpStatus);
    this.name = 'PGNotFoundError';
  }
}

/**
 * Client-side timeout (U8). `resultCode` is synthetic (`-999`) and
 * `httpStatus` is `0` because the server never replied. Callers that need to
 * distinguish a hung request from an in-flight caller-initiated abort should
 * use `instanceof PGTimeoutError`.
 */
export class PGTimeoutError extends PGError {
  constructor(message = 'Request timed out.') {
    super(message, -999, 0);
    this.name = 'PGTimeoutError';
  }
}

/**
 * -4013 — invalid CSRF token. The fetch helpers (`mutateApi`,
 * `postMultipart`) catch this *once*, refresh the token via
 * `refreshCsrfToken`, and replay the request. A second consecutive
 * `PGCsrfError` means the refresh didn't work; callers should surface a
 * terminal "please refresh" banner rather than a silent failure.
 */
export class PGCsrfError extends PGError {
  constructor(message: string, resultCode: number, httpStatus: number) {
    super(message, resultCode, httpStatus);
    this.name = 'PGCsrfError';
  }
}

/**
 * -400 / -4001 / -4003 / -4004 — client-side validation failure.
 * Container code should catch this and render as inline field errors; do not
 * toast from the global handler. Optional `fieldPath` / `subCode` are reserved
 * for richer PG error payloads that identify the offending field explicitly;
 * callers should continue to infer via `fieldForValidationError` when
 * `fieldPath` is absent.
 */
export class PGValidationError extends PGError {
  readonly fieldPath?: string;
  readonly subCode?: string;

  constructor(
    message: string,
    resultCode: number,
    httpStatus: number,
    extras?: { fieldPath?: string; subCode?: string },
  ) {
    super(message, resultCode, httpStatus);
    this.name = 'PGValidationError';
    this.fieldPath = extras?.fieldPath;
    this.subCode = extras?.subCode;
  }
}
