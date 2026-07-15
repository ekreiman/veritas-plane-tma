// Typed errors for the Plane-proxy API client (TLV-2681). Callers switch
// on these classes rather than raw HTTP status codes — matches the error
// handling contract from the TLV-2680 backend (dispatch/README):
//   401 -> session expired/missing/tampered -> re-auth
//   403 -> no Plane identity mapped -> friendly error, do NOT retry
//   400 (PATCH only) -> disallowed field -> dev bug, log + surface
//   502 -> Plane upstream flaky -> retry once, then surface

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(status: number, detail: unknown, message?: string) {
    super(message ?? `API error ${status}`);
    this.status = status;
    this.detail = detail;
    this.name = 'ApiError';
  }
}

export class AuthInvalidError extends ApiError {
  constructor(detail: unknown) {
    super(401, detail, 'session expired or invalid — re-authenticating');
    this.name = 'AuthInvalidError';
  }
}

export class NoIdentityError extends ApiError {
  constructor(detail: unknown) {
    super(403, detail, 'no Plane identity mapped for this Telegram user');
    this.name = 'NoIdentityError';
  }
}

export class BadRequestError extends ApiError {
  constructor(detail: unknown) {
    super(400, detail, 'request rejected by backend (bad field)');
    this.name = 'BadRequestError';
  }
}

export class UpstreamError extends ApiError {
  constructor(detail: unknown) {
    super(502, detail, 'Plane upstream is unavailable');
    this.name = 'UpstreamError';
  }
}
