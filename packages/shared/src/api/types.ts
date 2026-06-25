// packages/shared/src/api/types.ts
// Types will be generated from OpenAPI schema
// This file is a placeholder for generated types

export interface ApiResponse<T> {
  data: T;
}

export interface ApiErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}
