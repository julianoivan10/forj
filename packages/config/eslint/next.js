import base from './base.js';

/** @type {import("eslint").Linter.Config} */
export default {
  ...base,
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'next/core-web-vitals',
    'next/typescript',
    'prettier',
  ],
  rules: {
    ...base.rules,
    '@next/next/no-html-link-for-pages': 'off',
    'react/jsx-key': 'error',
    'react/no-unescaped-entities': 'off',
  },
};
