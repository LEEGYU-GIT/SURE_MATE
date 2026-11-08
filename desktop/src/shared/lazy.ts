/** 처음 부를 때 한 번만 불러온다. 실패하면 이유를 기억하고 다시 시도하지 않는다. */
export function lazyLoad<T>(load: () => T): { get(): T | null; error(): string | null } {
  let state: { value: T | null; error: string | null } | null = null
  const get = (): T | null => {
    if (!state) {
      try {
        state = { value: load(), error: null }
      } catch (e) {
        state = { value: null, error: e instanceof Error ? e.message : String(e) }
      }
    }
    return state.value
  }
  return { get, error: () => state?.error ?? null }
}
