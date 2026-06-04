import esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

// Stub tiktoken with a lightweight character-based approximation.
// The root tokens.ts try/catch already falls back to this, but esbuild
// may fail to bundle tiktoken's WASM binary. The stub avoids the
// native-module dependency entirely for the extension context.
const tiktokenStubPlugin = {
  name: 'tiktoken-stub',
  setup(build) {
    build.onResolve({ filter: /^tiktoken$/ }, () => ({
      path: 'tiktoken-stub',
      namespace: 'tiktoken-stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'tiktoken-stub' }, () => ({
      contents: `
        export function get_encoding() {
          return { encode: (text) => new Uint32Array(Math.ceil(text.length / 4)) };
        }
        export function encoding_for_model() {
          return { encode: (text) => new Uint32Array(Math.ceil(text.length / 4)), free: () => {} };
        }
      `,
      loader: 'js',
    }));
  },
};

const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  // vscode is provided by the VS Code runtime — never bundle it
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  plugins: [tiktokenStubPlugin],
  // Log errors clearly
  logLevel: 'info',
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('[agent-doctor] watching for changes…');
} else {
  await esbuild.build(buildOptions);
  console.log('[agent-doctor] built dist/extension.js');
}
