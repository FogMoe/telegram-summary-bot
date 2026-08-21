const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/', 'coverage/', 'docs/', 'logs/', 'storage/'],
  },
  js.configs.recommended,
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      // 本项目大量使用字符串转义与控制字符正则做 Telegram Markdown 清洗，这些转义在字符串字面量中无害
      'no-useless-escape': 'off',
      'no-control-regex': 'off',
      'preserve-caught-error': 'off',
    },
  },
];
