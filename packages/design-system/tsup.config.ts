import { defineConfig } from 'tsup';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'esbuild';

// tsup's built-in CSS plugin intercepts every `*.css` import and always uses
// the plain "css" (global) esbuild loader, so `import styles from
// './X.module.css'` resolves to `{}` at runtime — esbuild only synthesizes a
// class-name map when a file is loaded with the "local-css" loader. This
// plugin resolves `*.module.css` imports to a path that no longer matches
// tsup's `/\.css$/` filter (by appending a marker suffix), so tsup's own
// loader never claims it, then loads the real file content itself with the
// "local-css" loader. Plain `.css` imports (tokens/fonts/reset) are
// untouched and keep going through tsup's normal handling, so global class
// names like `.dot-root` are never renamed.
function cssModulesPlugin(): Plugin {
  const marker = '?css-module';
  return {
    name: 'dot-css-modules',
    setup(build) {
      build.onResolve({ filter: /\.module\.css$/ }, (args) => {
        const absPath = path.isAbsolute(args.path)
          ? args.path
          : path.resolve(args.resolveDir, args.path);
        return { path: absPath + marker, namespace: 'dot-css-module' };
      });
      build.onLoad(
        { filter: /\.module\.css\?css-module$/, namespace: 'dot-css-module' },
        async (args) => {
          const realPath = args.path.slice(0, -marker.length);
          const contents = readFileSync(realPath, 'utf8');
          return { contents, loader: 'local-css', resolveDir: path.dirname(realPath) };
        }
      );
    },
  };
}

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  esbuildPlugins: [cssModulesPlugin()],
  // esbuild compiles imported *.module.css and emits dist/index.css
});
