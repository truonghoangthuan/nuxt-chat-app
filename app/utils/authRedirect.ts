export function safeAuthRedirectPath(path: unknown): string {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    return '/'
  }

  try {
    const target = new URL(path, 'https://nuxt.local')
    if (target.origin !== 'https://nuxt.local') return '/'
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return '/'
  }
}
