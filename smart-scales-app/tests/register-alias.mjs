import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(appRoot, 'src');

// Ensure DATABASE_URL is set for test runs
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${path.join(appRoot, 'prisma', 'dev.db')}`;
}

function resolveCandidateFile(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.mjs`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
    path.join(basePath, 'index.js'),
  ];
  for (const cand of candidates) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
      return pathToFileURL(cand).href;
    }
  }
  return null;
}

const NEXT_TOP_SUBPATHS = new Set([
  'next/cache',
  'next/navigation',
  'next/server',
  'next/headers',
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (NEXT_TOP_SUBPATHS.has(specifier)) {
      return nextResolve(`${specifier}.js`, context);
    }
    if (specifier.startsWith('@/')) {
      const subPath = specifier.slice(2);
      const targetBase = path.join(srcRoot, subPath);
      const resolvedUrl = resolveCandidateFile(targetBase);
      if (resolvedUrl) {
        return { url: resolvedUrl, shortCircuit: true };
      }
    }
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const targetBase = path.resolve(parentDir, specifier);
      const resolvedUrl = resolveCandidateFile(targetBase);
      if (resolvedUrl) {
        return { url: resolvedUrl, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});
