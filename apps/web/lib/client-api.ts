'use client';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
const storagePrefix = 'odeoniflow';
const legacyStoragePrefix = 'stayflow';

export interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
  };
}

export interface CompanySummary {
  id: string;
  name: string;
}

export async function apiPost<TResponse, TBody extends Record<string, unknown>>(
  path: string,
  body: TBody,
  token?: string,
): Promise<TResponse> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<TResponse>;
}

export async function apiGet<TResponse>(path: string, token?: string): Promise<TResponse> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<TResponse>;
}

export function saveSession(payload: AuthPayload): void {
  window.localStorage.setItem(`${storagePrefix}.accessToken`, payload.accessToken);
  window.localStorage.setItem(`${storagePrefix}.refreshToken`, payload.refreshToken);
  window.localStorage.setItem(`${storagePrefix}.user`, JSON.stringify(payload.user));
}

export function getAccessToken(): string | undefined {
  const token = window.localStorage.getItem(`${storagePrefix}.accessToken`);
  const legacyToken = window.localStorage.getItem(`${legacyStoragePrefix}.accessToken`);
  if (!token && legacyToken) {
    window.localStorage.setItem(`${storagePrefix}.accessToken`, legacyToken);
  }
  return token ?? legacyToken ?? undefined;
}

export function clearSession(): void {
  for (const prefix of [storagePrefix, legacyStoragePrefix]) {
    window.localStorage.removeItem(`${prefix}.accessToken`);
    window.localStorage.removeItem(`${prefix}.refreshToken`);
    window.localStorage.removeItem(`${prefix}.user`);
  }
}

export async function ensureDemoSession(): Promise<string> {
  const existing = getAccessToken();
  if (existing && isUsableJwt(existing)) {
    return existing;
  }
  clearSession();
  const payload = await loginDemoUser();
  saveSession(payload);
  return payload.accessToken;
}

async function loginDemoUser(): Promise<AuthPayload> {
  try {
    return await apiPost<AuthPayload, Record<string, string>>('/auth/login', {
      email: 'owner@odeoniflow.test',
      password: 'OdeoniFlow123!',
    });
  } catch {
    return apiPost<AuthPayload, Record<string, string>>('/auth/login', {
      email: 'owner@stayflow.test',
      password: 'StayFlow123!',
    });
  }
}

function isUsableJwt(token: string): boolean {
  try {
    const [, payload] = token.split('.');
    if (!payload) {
      return false;
    }
    const normalizedPayload = payload.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const decoded = JSON.parse(window.atob(normalizedPayload)) as { exp?: number };
    return typeof decoded.exp === 'number' && decoded.exp > Math.floor(Date.now() / 1000) + 30;
  } catch {
    return false;
  }
}
