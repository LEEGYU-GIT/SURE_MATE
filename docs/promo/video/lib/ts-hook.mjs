// Node 22 resolve hook: lets scripts import the app's TypeScript sources (extensionless relative imports, JSON).
// Node strips TypeScript types itself (22.18+); this only fills in the missing file extensions.
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context)
  } catch (error) {
    const relative = specifier.startsWith('./') || specifier.startsWith('../')
    if (!relative || /\.[cm]?[jt]s$|\.json$/.test(specifier)) throw error
    for (const suffix of ['.ts', '.tsx', '/index.ts']) {
      try {
        return await next(specifier + suffix, context)
      } catch {
        // try the next suffix
      }
    }
    throw error
  }
}

export async function load(url, context, next) {
  // JSON imported without `with { type: 'json' }` (the app's TS sources rely on the bundler for this)
  if (url.endsWith('.json')) return next(url, { ...context, importAttributes: { type: 'json' } })
  return next(url, context)
}
