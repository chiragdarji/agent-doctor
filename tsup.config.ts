import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

export default defineConfig([
  // CLI entry — gets the shebang banner and executable permissions
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    dts: true,
    clean: false,
    sourcemap: true,
    banner: { js: '#!/usr/bin/env node' },
    define: { __CLI_VERSION__: JSON.stringify(version) },
  },
  // Library + MCP entries — no shebang
  {
    entry: {
      index: 'src/index.ts',
      'mcp-server': 'src/mcp-server.ts',
    },
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    define: { __CLI_VERSION__: JSON.stringify(version) },
  },
]);
