import { readFileSync } from 'node:fs'
import { compileStyle, parse } from 'vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

describe('courtyard scoped theme cascade', () => {
  it('sets dark tokens on the dialog itself, not only the ancestor', () => {
    const source = readFileSync('app/components/IncenseCourtyard.vue', 'utf8')
    const { descriptor } = parse(source)
    const compiled = compileStyle({ source: descriptor.styles[0]!.content, filename: 'IncenseCourtyard.vue', id: 'data-v-test', scoped: true })
    expect(compiled.errors).toEqual([])
    expect(compiled.code).toMatch(/\.dark\s+\.incense-courtyard[^{}]*\{\s*--paper:\s*#242b24/)
  })
})
