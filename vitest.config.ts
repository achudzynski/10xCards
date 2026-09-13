import { defineConfig, configDefaults } from "vitest/config";
import { getViteConfig } from "astro/config";

export default defineConfig(
  getViteConfig({
    test: {
      globals: true,
      environment: "node",
      setupFiles: ["./src/__tests__/setup.ts"],
      include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
      exclude: [...configDefaults.exclude, "tests/e2e/**"],
      coverage: {
        provider: "v8",
        reporter: ["text", "json", "html"],
        exclude: ["node_modules/", "src/__tests__/", "**/*.test.ts", "**/*.spec.ts"],
      },
    },
  }),
);
