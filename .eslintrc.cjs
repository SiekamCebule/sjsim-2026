module.exports = {
  root: true,
  env: {
    browser: false,
    es2021: true,
    node: true
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  plugins: ["@typescript-eslint", "react", "react-hooks"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/jsx-runtime",
    "plugin:react-hooks/recommended",
    "prettier"
  ],
  settings: {
    react: {
      version: "detect"
    }
  },
  overrides: [
    {
      files: ["packages/ui/**/*.{ts,tsx}"],
      env: {
        browser: true,
        node: false
      }
    },
    {
      files: ["packages/app/**/*.ts"],
      env: {
        browser: false,
        node: true
      }
    }
  ]
};
