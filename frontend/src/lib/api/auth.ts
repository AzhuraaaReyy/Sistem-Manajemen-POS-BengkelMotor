import client, { ensureCsrfCookie } from "./client";
import type { ApiResponse, User } from "@/types";

export interface LoginPayload {
  email: string;
  password: string;
  remember?: boolean;
}

export async function loginApi(payload: LoginPayload): Promise<User> {
  // Sanctum SPA: fetch the XSRF-TOKEN cookie first, then login (backend
  // session cookie). Axios auto-sends X-XSRF-TOKEN from the cookie on every
  // subsequent request, so this only needs to run once before the first
  // mutating call.
  try {
    await ensureCsrfCookie();
  } catch {
    throw {
      message: "Gagal menghubungi server. Pastikan server berjalan dan coba lagi.",
      status: undefined,
    };
  }
  // The POST /api/v1/auth/login sets the session cookie on success.
  const { data } = await client.post<ApiResponse<User>>("/auth/login", payload);
  return data.data;
}

export async function logoutApi(): Promise<void> {
  await client.post("/auth/logout");
}

export async function meApi(): Promise<User> {
  const { data } = await client.get<ApiResponse<User>>("/auth/me");
  return data.data;
}
