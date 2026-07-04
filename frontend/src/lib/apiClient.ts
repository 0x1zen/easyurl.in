const BASE_URL = import.meta.env.VITE_API_BASE_URL;

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
  apiKey?: string;
}

export async function apiRequest<T>(path: string, options?: RequestOptions): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options?.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  if (options?.apiKey) {
    headers["x-api-key"] = options.apiKey;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options?.method ?? "GET",
    headers,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const data = await response.json() as { error?: string };
    throw new Error(data.error ?? `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}
