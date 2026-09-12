import { beforeAll, afterEach, afterAll, vi } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// MSW handlers are defined per test file, but the server is global
export const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "warn" });
});

afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});

afterAll(() => {
  server.close();
});

export { http, HttpResponse };
