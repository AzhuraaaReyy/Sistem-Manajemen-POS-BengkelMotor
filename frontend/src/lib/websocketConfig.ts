export function buildEchoAuthHeaders(withCredentials: boolean): Record<string, string> {
  return withCredentials
    ? {}
    : { Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}` };
}
