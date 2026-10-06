import fs from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)
export function loadComponent(file, globals = {}, cache = new Map()) {
  file = path.resolve(file)
  if (cache.has(file)) return cache.get(file)
  const module = { exports: {} }
  cache.set(file, module.exports)
  const source = fs.readFileSync(file, 'utf8')
  const result = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } })
  const localRequire = name => {
    if (name.endsWith('.css')) return {}
    if (!name.startsWith('.')) return require(name)
    const base = path.resolve(path.dirname(file), name)
    const child = [base, `${base}.ts`, `${base}.tsx`].find(p => fs.existsSync(p))
    return loadComponent(child, globals, cache)
  }
  vm.runInNewContext(result.outputText, { exports: module.exports, module, require: localRequire, console, ...globals }, { filename: file })
  return module.exports
}
