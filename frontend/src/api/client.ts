const defaultBaseUrl = '/api';

const buildHeaders = (init?: RequestInit) => {
  const headers = new Headers(init?.headers || {});
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
};

export const apiRequest = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const url = `${import.meta.env.VITE_API_BASE_URL?.trim() || defaultBaseUrl}${path}`;
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: buildHeaders(init)
  });

  // Short-circuit for no-content responses
  if (response.status === 204 || response.status === 205) {
    if (!response.ok) {
      throw new Error('Request failed');
    }
    return undefined as T;
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'string' ? payload : payload?.error || 'Request failed';
    throw new Error(message);
  }

  return payload as T;
};
