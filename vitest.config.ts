import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirrors tsconfig paths so render-level tests can import components,
  // and the automatic JSX runtime (as in Next.js) for .tsx under test.
  resolve: { alias: { "@": path.resolve(process.cwd(), "src") } },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
