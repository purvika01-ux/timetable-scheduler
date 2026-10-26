import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // All database access goes through src/db and the models (DATABASE_DESIGN.md section 5).
      "no-restricted-imports": ["error", { paths: [{ name: "mongodb", message: "Use the Mongoose models in src/models instead of the raw driver." }] }],
    },
  },
);
