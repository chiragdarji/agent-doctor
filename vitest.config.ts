import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use child process forks instead of worker threads.
    // tiktoken uses WASM which crashes in Node.js worker threads
    // (v8::ToLocalChecked Empty MaybeLocal). Forks mode avoids this.
    pool: 'forks',
  },
});
