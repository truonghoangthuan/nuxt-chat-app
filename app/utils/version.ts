import changelogRaw from '../../CHANGELOG.md?raw'

export interface ReleaseHighlightCategory {
  category: string
  items: string[]
}

export interface ReleaseHighlight {
  version: string
  date: string
  title: string
  description?: string
  highlights: ReleaseHighlightCategory[]
}

export interface ParsedChangelog {
  currentVersion: string
  currentRelease: ReleaseHighlight
  releases: ReleaseHighlight[]
}

/**
 * Parses Keep a Changelog formatted markdown into structured release records.
 */
export function parseChangelog(content: string): ParsedChangelog {
  const versionRegex = /^##\s+\[([0-9]+\.[0-9]+\.[0-9]+[^\]]*)\](?:\s+-\s+(\d{4}-\d{2}-\d{2}))?/gm
  const releases: ReleaseHighlight[] = []
  const matches = [...content.matchAll(versionRegex)]

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    const version = match[1]
    const date = match[2] || ''
    const startIndex = match.index + match[0].length
    const endIndex = i + 1 < matches.length ? matches[i + 1].index : content.length
    const body = content.slice(startIndex, endIndex).trim()

    const catRegex = /^###\s+(.+)$/gm
    const catMatches = [...body.matchAll(catRegex)]
    const highlights: ReleaseHighlightCategory[] = []
    let releaseTitle = ''

    for (let c = 0; c < catMatches.length; c++) {
      const catMatch = catMatches[c]
      const category = catMatch[1].trim()
      const catStart = catMatch.index + catMatch[0].length
      const catEnd = c + 1 < catMatches.length ? catMatches[c + 1].index : body.length
      const catBody = body.slice(catStart, catEnd).trim()

      const items: string[] = []
      const lines = catBody.split(/\r?\n/)

      for (const line of lines) {
        if (/^\s*[-*]\s+/.test(line)) {
          const text = line.replace(/^\s*[-*]\s+/, '').trim()
          if (!releaseTitle && text.includes('**')) {
            const boldMatch = text.match(/\*\*([^*]+)\*\*/)
            if (boldMatch) {
              releaseTitle = boldMatch[1].replace(/:$/, '').trim()
            }
          }
          if (text) {
            items.push(text)
          }
        }
      }

      if (items.length > 0) {
        highlights.push({ category, items })
      }
    }

    if (!releaseTitle && highlights.length > 0) {
      const firstItem = highlights[0].items[0] || ''
      const boldMatch = firstItem.match(/\*\*([^*]+)\*\*/)
      releaseTitle = boldMatch ? boldMatch[1].replace(/:$/, '').trim() : highlights[0].category
    }

    releases.push({
      version,
      date,
      title: releaseTitle || `v${version}`,
      highlights,
    })
  }

  const defaultRelease: ReleaseHighlight = {
    version: '0.0.0',
    date: '',
    title: 'Development Build',
    highlights: [],
  }

  return {
    currentVersion: releases[0]?.version || '0.0.0',
    currentRelease: releases[0] || defaultRelease,
    releases,
  }
}

/**
 * Splits an item formatted as "**Title**: Description" into title and body components.
 */
export function splitItemTitle(item: string): { title?: string; body: string } {
  const match = item.match(/^\*\*([^*]+)\*\*:\s*(.*)$/)
  if (match) {
    return { title: match[1], body: match[2] }
  }
  return { body: item.replace(/^\*\*|\*\*$/g, '') }
}

// Dynamically parsed from CHANGELOG.md at build/runtime
const parsed = parseChangelog(changelogRaw || '')

export const APP_VERSION = parsed.currentVersion
export const CURRENT_RELEASE = parsed.currentRelease
export const RELEASE_HISTORY = parsed.releases
