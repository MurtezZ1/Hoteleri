'use client';

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
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

export interface SubscriptionSummary {
  status: string;
  lifecycleStatus?: string;
  plan?: string;
  subscriptionPlan?: {
    code: string;
    name: string;
  } | null;
}

export async function apiPost<TResponse, TBody extends Record<string, unknown>>(
  path: string,
  body: TBody,
  token?: string,
  extraHeaders?: Record<string, string>,
): Promise<TResponse> {
  const response = await fetchWithRefresh(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<TResponse>;
}

export async function apiPatch<
  TResponse,
  TBody extends Record<string, unknown>,
>(path: string, body: TBody, token?: string): Promise<TResponse> {
  const response = await fetchWithRefresh(path, {
    method: 'PATCH',
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

export async function apiDelete<TResponse>(
  path: string,
  token?: string,
): Promise<TResponse> {
  const response = await fetchWithRefresh(path, {
    method: 'DELETE',
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

export async function apiGet<TResponse>(
  path: string,
  token?: string,
): Promise<TResponse> {
  const response = await fetchWithRefresh(path, {
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

async function fetchWithRefresh(
  path: string,
  init: RequestInit,
): Promise<Response> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  if (response.status !== 401 || !hasBearer(init)) {
    return response;
  }

  const refreshed = await refreshSession();
  if (!refreshed) {
    clearSession();
    if (
      typeof window !== 'undefined' &&
      !window.location.pathname.startsWith('/login')
    ) {
      window.location.assign(
        `/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
    }
    return response;
  }

  return fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string>),
      authorization: `Bearer ${refreshed.accessToken}`,
    },
  });
}

export function saveSession(payload: AuthPayload): void {
  window.localStorage.setItem(
    `${storagePrefix}.accessToken`,
    payload.accessToken,
  );
  window.localStorage.setItem(
    `${storagePrefix}.refreshToken`,
    payload.refreshToken,
  );
  window.localStorage.setItem(
    `${storagePrefix}.user`,
    JSON.stringify(payload.user),
  );
  setCookie('odeoniflow_session', '1', 7);
}

export function getAccessToken(): string | undefined {
  const token = window.localStorage.getItem(`${storagePrefix}.accessToken`);
  const legacyToken = window.localStorage.getItem(
    `${legacyStoragePrefix}.accessToken`,
  );
  if (!token && legacyToken) {
    window.localStorage.setItem(`${storagePrefix}.accessToken`, legacyToken);
  }
  return token ?? legacyToken ?? undefined;
}

export function getRefreshToken(): string | undefined {
  const token = window.localStorage.getItem(`${storagePrefix}.refreshToken`);
  const legacyToken = window.localStorage.getItem(
    `${legacyStoragePrefix}.refreshToken`,
  );
  if (!token && legacyToken) {
    window.localStorage.setItem(`${storagePrefix}.refreshToken`, legacyToken);
  }
  return token ?? legacyToken ?? undefined;
}

export function clearSession(): void {
  for (const prefix of [storagePrefix, legacyStoragePrefix]) {
    window.localStorage.removeItem(`${prefix}.accessToken`);
    window.localStorage.removeItem(`${prefix}.refreshToken`);
    window.localStorage.removeItem(`${prefix}.user`);
  }
  window.localStorage.removeItem(`${storagePrefix}.previewMode`);
  expireCookie('odeoniflow_session');
  expireCookie('odeoniflow_preview');
}

export async function ensureDemoSession(): Promise<string> {
  const existing = getAccessToken();
  if (existing && isUsableJwt(existing)) {
    return existing;
  }
  const refreshed = await refreshSession();
  if (refreshed) {
    return refreshed.accessToken;
  }

  clearSession();
  throw new Error('Authentication required.');
}

export async function refreshSession(): Promise<AuthPayload | undefined> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return undefined;
  }
  try {
    const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      return undefined;
    }
    const payload = (await response.json()) as AuthPayload;
    saveSession(payload);
    return payload;
  } catch {
    return undefined;
  }
}

export async function logout(): Promise<void> {
  const token = getAccessToken();
  try {
    if (token) {
      await apiPost<{ message: string }, Record<string, unknown>>(
        '/auth/logout',
        {},
        token,
      );
    }
  } finally {
    clearSession();
    window.location.assign('/login');
  }
}

export function enablePreviewMode(): void {
  window.localStorage.setItem(`${storagePrefix}.previewMode`, 'true');
  setCookie('odeoniflow_preview', '1', 7);
}

export function disablePreviewMode(): void {
  window.localStorage.removeItem(`${storagePrefix}.previewMode`);
  expireCookie('odeoniflow_preview');
}

export function isPreviewMode(): boolean {
  return window.localStorage.getItem(`${storagePrefix}.previewMode`) === 'true';
}

export function safeReturnTo(
  value: string | null | undefined,
  fallback = '/dashboard',
): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return fallback;
  }
  if (value.startsWith('/login') || value.startsWith('/register')) {
    return fallback;
  }
  return value;
}

export async function resolvePostAuthRoute(
  returnTo?: string | null,
): Promise<string> {
  const destination = safeReturnTo(returnTo);
  const token = getAccessToken();
  if (!token) {
    return '/login';
  }
  try {
    const companies = await apiGet<CompanySummary[]>('/companies/mine', token);
    const company = companies[0];
    if (!company) {
      return '/onboarding';
    }
    const subscription = await apiGet<SubscriptionSummary>(
      `/billing/subscription/${company.id}`,
      token,
    );
    return isActiveSubscription(subscription)
      ? destination
      : `/choose-plan?returnTo=${encodeURIComponent(destination)}`;
  } catch {
    return `/choose-plan?returnTo=${encodeURIComponent(destination)}`;
  }
}

function isActiveSubscription(subscription: SubscriptionSummary): boolean {
  return (
    ['trialing', 'active'].includes(subscription.status) ||
    ['TRIALING', 'ACTIVE', 'GRACE_PERIOD'].includes(
      subscription.lifecycleStatus ?? '',
    )
  );
}

function setCookie(name: string, value: string, days: number): void {
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`;
}

function expireCookie(name: string): void {
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

function hasBearer(init: RequestInit): boolean {
  const headers = init.headers as Record<string, string> | undefined;
  return Boolean(headers?.authorization);
}

function isUsableJwt(token: string): boolean {
  try {
    const [, payload] = token.split('.');
    if (!payload) {
      return false;
    }
    const normalizedPayload = payload
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const decoded = JSON.parse(window.atob(normalizedPayload)) as {
      exp?: number;
    };
    return (
      typeof decoded.exp === 'number' &&
      decoded.exp > Math.floor(Date.now() / 1000) + 30
    );
  } catch {
    return false;
  }
}
