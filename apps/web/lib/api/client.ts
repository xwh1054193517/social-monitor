import { clearToken, getToken } from "@/lib/auth";

export interface ApiEnvelope<T> {
  data: T;
}

export interface ApiPaginated<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
  };
}

// Base path the web app is served under ("" in local dev, "/web3/monitor" in
// production). Used to build correct login redirects for native navigation.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// API root. In production this is a same-origin relative path so the browser
// follows the page protocol (http/https) and avoids mixed-content issues:
//   NEXT_PUBLIC_API_BASE_URL=/web3/monitor  ->  /web3/monitor/api
// In local dev it points at the API port directly:
//   NEXT_PUBLIC_API_BASE_URL=http://localhost:3001  ->  http://localhost:3001/api
export const API_BASE_URL =
  (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001") + "/api";

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeaders()
    },
    ...init
  });

  if (response.status === 401 && typeof window !== "undefined") {
    // Token missing or expired — clear and bounce to the login page.
    clearToken();
    if (window.location.pathname !== `${BASE_PATH}/login`) {
      window.location.replace(`${BASE_PATH}/login`);
    }
    throw new Error("登录已过期，请重新登录");
  }

  if (!response.ok) {
    let message = `API request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { message?: unknown };
      if (body.message) {
        message =
          typeof body.message === "string"
            ? body.message
            : JSON.stringify(body.message);
      }
    } catch {
      // Non-JSON error body — keep the status message.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>(path);
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: "POST",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
  },
  patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: "PATCH",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
  },
  delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: "DELETE" });
  }
};

export function buildQuery(
  params: Record<string, string | number | boolean | undefined>
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}
