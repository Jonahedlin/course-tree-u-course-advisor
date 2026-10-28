import { useAuth0 } from "@auth0/auth0-react";
import { useCallback } from "react";

const API_BASE = "/api/v1";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Returns an `apiFetch` function that attaches the Auth0 access token to
 * every request and parses JSON. Use it from any component:
 *
 *   const api = useApi();
 *   const profile = await api("/profile");
 *   await api("/profile", { method: "POST", body: { ... } });
 */
export function useApi() {
  const { getAccessTokenSilently } = useAuth0();

  return useCallback(
    async <T = unknown>(
      path: string,
      options: {
        method?: string;
        body?: unknown;
        query?: Record<string, string>;
        // When true, use `path` verbatim (don't prepend /api/v1) — e.g. to hit
        // a different proxy prefix like /railway/... for the chat backend.
        raw?: boolean;
      } = {},
    ): Promise<T> => {
      const token = await getAccessTokenSilently({ authorizationParams: { audience: "https://unbc-advisor-api" } });

      let url = options.raw || path.startsWith("/api") ? path : `${API_BASE}${path}`;
      if (options.query) {
        const qs = new URLSearchParams(options.query).toString();
        url += (url.includes("?") ? "&" : "?") + qs;
      }

      const isFormData = options.body instanceof FormData;

      const res = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          // Let the browser set the multipart boundary itself for FormData.
          ...(options.body && !isFormData ? { "Content-Type": "application/json" } : {}),
        },
        body: isFormData ? (options.body as FormData) : options.body ? JSON.stringify(options.body) : undefined,
      });

      if (!res.ok) {
        let detail = res.statusText;
        try {
          const data = await res.json();
          const d = data?.detail;
          if (typeof d === "string") {
            detail = d;
          } else if (Array.isArray(d)) {
            // FastAPI validation errors arrive as [{ loc, msg, ... }, ...];
            // join the messages so we never render "[object Object]".
            detail = d.map((it) => it?.msg ?? String(it)).join(", ");
          } else if (d != null) {
            detail = typeof d === "object" ? JSON.stringify(d) : String(d);
          }
        } catch {
          /* non-JSON error body */
        }
        throw new ApiError(res.status, detail);
      }

      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    },
    [getAccessTokenSilently],
  );
}
