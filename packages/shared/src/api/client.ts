// packages/shared/src/api/client.ts
import { getPlatformBridge } from '../lib/bridge';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: any;
  headers?: Record<string, string>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body?: any
  ) {
    super(`API Error ${status}: ${statusText}`);
    this.name = 'ApiError';
  }
}

export class ApiClient {
  private authToken?: string;

  constructor(authToken?: string) {
    this.authToken = authToken;
  }

  private getBaseUrl(): string {
    return getPlatformBridge().getApiBaseUrl();
  }

  private getDefaultHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}${path}`;

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        ...this.getDefaultHeaders(),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => undefined);
      throw new ApiError(response.status, response.statusText, body);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  async get<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(path, { method: 'GET', headers });
  }

  async post<T>(path: string, body: any, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(path, { method: 'POST', body, headers });
  }

  async put<T>(path: string, body: any, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body, headers });
  }

  async delete<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(path, { method: 'DELETE', headers });
  }

  async patch<T>(path: string, body: any, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body, headers });
  }

  setAuthToken(token: string): void {
    this.authToken = token;
  }

  clearAuthToken(): void {
    this.authToken = undefined;
  }
}
