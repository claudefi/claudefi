import ts from 'typescript';
import { readFile, access } from 'fs/promises';
import { pathToFileURL, fileURLToPath } from 'url';
import { extname } from 'path';

const compilerOptions = {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
  jsx: ts.JsxEmit.ReactJSX,
  esModuleInterop: true,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  resolveJsonModule: true,
  skipLibCheck: true,
};

const EXTENSION_MAP = new Map([
  ['.js', ['.ts', '.tsx']],
  ['.jsx', ['.tsx', '.ts']],
]);

async function tryResolveAlternate(specifier, parentURL) {
  const ext = extname(specifier);
  const alternates = EXTENSION_MAP.get(ext);
  if (!alternates) return null;

  for (const alt of alternates) {
    const candidate = new URL(specifier.slice(0, -ext.length) + alt, parentURL);
    try {
      await access(candidate);
      return candidate.href;
    } catch {
      continue;
    }
  }
  return null;
}

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith('data:') || specifier.startsWith('node:') || specifier.startsWith('file:') || specifier.startsWith('http')) {
    return defaultResolve(specifier, context, defaultResolve);
  }

  if (specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/')) {
    const parentURL = context.parentURL ?? pathToFileURL(process.cwd() + '/').href;
    const alt = await tryResolveAlternate(specifier, parentURL);
    if (alt) {
      return { url: alt, shortCircuit: true };
    }
  }

  return defaultResolve(specifier, context, defaultResolve);
}

export async function load(url, context, defaultLoad) {
  if (url.endsWith('.ts') || url.endsWith('.tsx')) {
    const source = await readFile(new URL(url), 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions,
      fileName: fileURLToPath(url),
      reportDiagnostics: false,
    });
    return {
      format: 'module',
      source: transpiled.outputText,
      shortCircuit: true,
    };
  }

  return defaultLoad(url, context, defaultLoad);
}
