import type { ApiError } from "@/types";

const JSON_HEADERS = { "Content-Type": "application/json" };

export function jsonError(code: string, message: string, status: number, context?: unknown): Response {
  const body: ApiError = { error: { code, message, context } };
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function jsonOk(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}
