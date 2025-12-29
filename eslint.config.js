import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginVue from "eslint-plugin-vue";
import stylistic from "@stylistic/eslint-plugin";
import pluginUnicorn from "eslint-plugin-unicorn";
import globals from "globals";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  {
    ignores: ["dist/**", "node_modules/**", "public/**"],
  },
  {
    files: ["*.ts", "**/*.ts", "*.vue", "**/*.vue"],
    plugins: {
      "@stylistic": stylistic,
      "unicorn": pluginUnicorn,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: [".vue"],
      },
    },
    rules: {
      // Prefer type over interface
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],

      // Use comma as delimiter in types and require trailing comma for multiline
      "@stylistic/member-delimiter-style": [
        "error",
        {
          multiline: {
            delimiter: "comma",
            requireLast: true,
          },
          singleline: {
            delimiter: "comma",
            requireLast: false,
          },
          overrides: {
            interface: {
              multiline: {
                delimiter: "comma",
                requireLast: true,
              },
            },
          },
        },
      ],

      // Prefer for-of over forEach (unicorn)
      "unicorn/no-array-for-each": "error",

      // Prefer trailing comma
      "@stylistic/comma-dangle": ["error", "always-multiline"],

      // Basic stylistic adjustments
      "@stylistic/semi": ["error", "always"],
      "@stylistic/quotes": ["error", "double"],
      "@stylistic/indent": ["error", 2],
      "vue/multi-word-component-names": "off",
      "@typescript-eslint/no-explicit-any": "error",

      // Allow coder to decide attribute line breaks
      "vue/max-attributes-per-line": "off",
      "vue/first-attribute-linebreak": "off",
      "vue/html-closing-bracket-newline": "off",
      "vue/html-indent": ["error", 2],
      "vue/singleline-html-element-content-newline": "off",
      "vue/multiline-html-element-content-newline": "off",
    },
  },
);