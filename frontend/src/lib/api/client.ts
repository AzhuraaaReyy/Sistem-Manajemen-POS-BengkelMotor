import axios, { type AxiosRequestConfig } from "axios";
import type { ApiError } from "@/types";

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1";
// Backend app root (without the /api/v1 suffix), used to reach Sanctum's
// non-API csrf-cookie route regardless of same-origin or split-domain setup.
const APP_BASE = API_BASE.replace(/\/api\/v1\/?$/, "");

const RATE_LIMIT_MESSAGE =
  "Terlalu banyak permintaan. Mohon tunggu beberapa saat sebelum mencoba lagi.";

const NETWORK_ERROR_MESSAGE =
  "Tidak dapat terhubung ke server. Periksa koneksi internet Anda dan pastikan server sedang berjalan.";

// Axios instance with withCredentials for Sanctum SPA cookie session.
const client = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

// ---- Short-lived in-memory GET cache -------------------------------------
// Rapidly switching between pages re-fetches the same master data over and
// over, which can trip the backend rate limiter. Cache successful GET
// responses briefly (TTL) and clear the whole cache on any mutation so stale
// data (stock, prices, statuses) never survives a write.
const GET_CACHE_TTL_MS = 15_000;
const getCache = new Map<string, { expiresAt: number; data: unknown; headers: unknown }>();

function getCacheKey(config: AxiosRequestConfig): string {
  const method = (config.method ?? "get").toUpperCase();
  const url = config.url ?? "";
  const params = config.params
    ? "?" + new URLSearchParams(config.params as Record<string, string>).toString()
    : "";
  return `${method} ${url}${params}`;
}

client.interceptors.request.use((config) => {
  const method = (config.method ?? "get").toUpperCase();

  // Any mutation invalidates cached reads immediately.
  if (method !== "GET") {
    getCache.clear();
    return config;
  }

  const key = getCacheKey(config);
  const hit = getCache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    // Serve from cache without touching the network.
    config.adapter = async (cfg) => ({
      data: hit.data,
      status: 200,
      statusText: "OK",
      headers: hit.headers as never,
      config: cfg,
    });
  }

  return config;
});

// Laravel Sanctum ships the XSRF-TOKEN as a readable cookie; axios auto-sends
// it as X-XSRF-TOKEN header when withCredentials is true — but only once the
// cookie actually exists. This must be called (once, before the first
// mutating request such as login) to obtain it, otherwise every POST/PUT
// fails with "CSRF token mismatch."
export async function ensureCsrfCookie(): Promise<void> {
  await axios.get(`${APP_BASE}/sanctum/csrf-cookie`, { withCredentials: true });
}

client.interceptors.response.use(
  (response) => {
    if (
      (response.config.method ?? "get").toUpperCase() === "GET" &&
      response.status >= 200 &&
      response.status < 300
    ) {
      getCache.set(getCacheKey(response.config), {
        expiresAt: Date.now() + GET_CACHE_TTL_MS,
        data: response.data,
        headers: response.headers,
      });
    }
    return response;
  },
  (error) => {
    const status = error.response?.status;
    const retryAfterRaw = error.response?.headers?.["retry-after"];
    const retryAfter =
      retryAfterRaw !== undefined ? Number(retryAfterRaw) : undefined;

    // Network error: no response at all (server down, CORS blocked, DNS fail, etc.)
    const isNetworkError = !error.response && error.request;

    const apiError: ApiError = {
      message:
        isNetworkError
          ? NETWORK_ERROR_MESSAGE
          : status === 429
            ? RATE_LIMIT_MESSAGE
            : error.response?.data?.message ||
              error.message ||
              "Terjadi kesalahan pada server.",
      code: error.response?.data?.code,
      status,
      retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined,
      errors: error.response?.data?.errors,
    };
    return Promise.reject(apiError);
  },
);

export default client;
