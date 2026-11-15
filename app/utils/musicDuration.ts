/** Parse the m:ss / h:mm:ss metadata used by YouTube search; zero denotes unknown/live. */
export function parseMusicDuration(value?: string): number | null {
  if (typeof value !== 'string' || !/^\d+:[0-5]\d(?::[0-5]\d)?$/.test(value)) return null
  const seconds = value.split(':').reduce((total, part) => total * 60 + Number(part), 0)
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null
}
