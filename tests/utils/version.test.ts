import { describe, it, expect } from 'vitest'
import { APP_VERSION, CURRENT_RELEASE, RELEASE_HISTORY, parseChangelog } from '~/utils/version'

describe('Dynamic Version & Changelog Parser (version.ts)', () => {
  it('dynamically parses the current version from CHANGELOG.md', () => {
    expect(APP_VERSION).toBe('0.17.1')
    expect(CURRENT_RELEASE.version).toBe('0.17.1')
    expect(CURRENT_RELEASE.date).toBe('2026-11-18')
    expect(CURRENT_RELEASE.highlights.length).toBeGreaterThan(0)
    expect(RELEASE_HISTORY.length).toBeGreaterThanOrEqual(10)
  })

  it('correctly categorizes the current fix release and previous feature release', () => {
    const fixedCategory = CURRENT_RELEASE.highlights.find(h => h.category === 'Fixed')
    expect(fixedCategory).toBeDefined()
    expect(fixedCategory!.items.length).toBeGreaterThan(0)

    const featureRelease = RELEASE_HISTORY.find(release => release.version === '0.17.0')!
    expect(featureRelease.highlights.find(h => h.category === 'Added')?.items.length).toBeGreaterThan(0)
    expect(featureRelease.highlights.find(h => h.category === 'Changed')?.items.length).toBeGreaterThan(0)
  })

  it('parses custom markdown strings cleanly through parseChangelog', () => {
    const sample = `
# Changelog

## [Unreleased]

## [1.2.0] - 2026-12-01

### Added
- **Awesome Feature**: Added something cool.
  - Sub-detail 1
- Minor tweak

### Fixed
- Fixed critical glitch

---

## [1.1.0] - 2026-11-15

### Added
- Previous feature
    `

    const result = parseChangelog(sample)
    expect(result.currentVersion).toBe('1.2.0')
    expect(result.currentRelease.title).toBe('Awesome Feature')
    expect(result.currentRelease.date).toBe('2026-12-01')
    expect(result.currentRelease.highlights).toHaveLength(2)
    expect(result.currentRelease.highlights[0].category).toBe('Added')
    expect(result.currentRelease.highlights[0].items).toEqual([
      '**Awesome Feature**: Added something cool.',
      'Sub-detail 1',
      'Minor tweak',
    ])
    expect(result.releases).toHaveLength(2)
    expect(result.releases[1].version).toBe('1.1.0')
  })

  it('handles empty or malformed markdown gracefully with default values', () => {
    const result = parseChangelog('')
    expect(result.currentVersion).toBe('0.0.0')
    expect(result.currentRelease.version).toBe('0.0.0')
    expect(result.currentRelease.title).toBe('Development Build')
    expect(result.releases).toEqual([])
  })
})
