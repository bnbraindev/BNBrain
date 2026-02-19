export type ApiErrorCode =
  | 'INVALID_JSON'
  | 'INVALID_REQUEST_BODY'
  | 'INVALID_OWNER_CONTEXT'
  | 'EMPTY_MESSAGES'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'MISSING_API_KEY'
  | 'RATE_LIMITED'
  | 'RUN_CANCELLING'
  | 'UPSTREAM_MODEL_ERROR'
  | 'INTERNAL_SERVER_ERROR';

export interface ApiErrorPayload {
  code: ApiErrorCode;
  message: string;
  retryable: boolean;
  details?: string;
}

export function apiErrorResponse(
  payload: ApiErrorPayload,
  status: number
): Response {
  return Response.json(
    {
      error: payload,
    },
    { status }
  );
}

