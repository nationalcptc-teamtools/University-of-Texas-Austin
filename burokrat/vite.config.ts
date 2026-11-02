import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: ["**/routeTree.gen.ts", "apps/web/drizzle/**", ".claude/skills/**"],
  },
  lint: {
    ignorePatterns: ["**/routeTree.gen.ts", "apps/web/drizzle/**"],
    plugins: ["react", "typescript"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      "typescript/consistent-type-imports": "error",
      "typescript/no-deprecated": "error",
    },
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    cache: true,
  },
});
