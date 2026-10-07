import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: {
      // Catches the undefined sortProducts() bug directly: calling a name
      // that was never declared/imported is a lint error, not a silent
      // click that does nothing.
      'no-undef': 'error',

      // With everything now an ES module instead of a global <script>,
      // redeclaring toggleAppMenu (or any function) in the same module
      // scope is a build-breaking SyntaxError, and importing the same
      // name twice from two modules is a lint error here — this is what
      // "the bundler catches it" means concretely.
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

      // innerHTML-with-interpolation was the actual XSS vector fixed in
      // seller.js/profile.js. This won't catch every case (a real
      // no-unsanitized plugin is stronger — add eslint-plugin-no-unsanitized
      // once this app has a full npm install), but it stops the most
      // common form: passing a template literal straight to innerHTML.
      'no-restricted-properties': [
        'warn',
        {
          property: 'innerHTML',
          message: 'Use textContent or build nodes with createElement — see js/seller.js history for why.',
        },
      ],
    },
  },
  {
    // vite.config.js runs under Node during the build, not in the browser —
    // it needs __dirname etc., which the browser block above correctly
    // does NOT provide (declaring __dirname as a valid global in src/**
    // would silently hide a real bug: code that only works in Node
    // accidentally shipped to the browser).
    files: ['vite.config.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
  },
];
