import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'

// Inline the local import at its real position, before main.css's defaults.
// Font/Tailwind imports and the Tailwind-only variant directive are not browser CSS.
const stylesheet = readFileSync(resolve('app/assets/css/main.css'), 'utf8')
  .replace('@import "./telegram.css";', () => readFileSync(resolve('app/assets/css/telegram.css'), 'utf8'))
  .replace(/^@(?:import|custom-variant) .*;$/gm, '')

const semanticTokens = {
  '--background': '--ap-canvas',
  '--foreground': '--ap-text-primary',
  '--card': '--ap-stage',
  '--card-foreground': '--ap-text-primary',
  '--popover': '--ap-stage',
  '--popover-foreground': '--ap-text-primary',
  '--primary': '--ap-blue',
  '--secondary': '--ap-glass',
  '--secondary-foreground': '--ap-text-primary',
  '--muted': '--ap-glass',
  '--muted-foreground': '--ap-text-secondary',
  '--accent': '--ap-glass-hover',
  '--accent-foreground': '--ap-blue',
  '--border': '--ap-glass-border',
  '--input': '--ap-glass-border',
  '--ring': '--ap-blue',
  '--sidebar': '--ap-sidebar',
  '--sidebar-foreground': '--ap-text-primary',
  '--sidebar-primary': '--ap-blue',
  '--sidebar-accent': '--ap-glass-hover',
  '--sidebar-accent-foreground': '--ap-blue',
  '--sidebar-border': '--ap-glass-border',
  '--sidebar-ring': '--ap-blue',
}

describe('Telegram stylesheet semantic cascade', () => {
  it.each([
    { mode: 'light', dark: false, canvas: '#edf0f4', stage: '#ffffff', blue: '#287fb7' },
    { mode: 'dark', dark: true, canvas: '#0e1621', stage: '#17212b', blue: '#70b4e0' },
  ])('resolves Telegram $mode semantic tokens to its own palette', ({ dark, canvas, stage, blue }) => {
    const window = new Window()
    try {
      const root = window.document.documentElement
      root.dataset.theme = 'telegram'
      root.classList.toggle('dark', dark)
      const style = window.document.createElement('style')
      style.textContent = stylesheet
      window.document.head.append(style)
      const computed = window.getComputedStyle(root)
      expect(computed.getPropertyValue('--ap-canvas').trim()).toBe(canvas)
      expect(computed.getPropertyValue('--ap-stage').trim()).toBe(stage)
      expect(computed.getPropertyValue('--ap-blue').trim()).toBe(blue)
      for (const [semantic, palette] of Object.entries(semanticTokens)) {
        expect(computed.getPropertyValue(semantic).trim(), semantic)
          .toBe(computed.getPropertyValue(palette).trim())
      }
    } finally { window.close() }
  })

  it.each([
    { mode: 'light', dark: false, background: '#f8f7fc', card: '#ffffff', primary: '#7c3aed' },
    { mode: 'dark', dark: true, background: '#09090b', card: '#141720', primary: '#007aff' },
  ])('leaves default $mode semantic tokens unchanged', ({ dark, background, card, primary }) => {
    const window = new Window()
    try {
      const root = window.document.documentElement
      root.dataset.theme = 'default'
      root.classList.toggle('dark', dark)
      const style = window.document.createElement('style')
      style.textContent = stylesheet
      window.document.head.append(style)
      const computed = window.getComputedStyle(root)
      expect(computed.getPropertyValue('--background').trim()).toBe(background)
      expect(computed.getPropertyValue('--card').trim()).toBe(card)
      expect(computed.getPropertyValue('--primary').trim()).toBe(primary)
    } finally { window.close() }
  })
})
