import { defineConfig } from 'eslint/config';

// import globals from 'globals';
// import js from '@eslint/js';

import bpmnIoPlugin from 'eslint-plugin-bpmn-io';

export default defineConfig([

  ...bpmnIoPlugin.configs.browser,
  ...bpmnIoPlugin.configs.mocha.map(config => {
    return {
      ...config,
      files: [
        '**/*.spec.js'
      ]
    };
  })
]);