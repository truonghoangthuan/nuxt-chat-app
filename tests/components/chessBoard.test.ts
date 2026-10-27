import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { Chess } from 'chess.js'
import ChessBoard from '~/components/ChessBoard.vue'

describe('accessible chess board', () => {
  it('renders standard orientation, named squares and a single keyboard entry', async () => {
    const wrapper = mount(ChessBoard, { props: { fen: new Chess().fen(), canMove: true } })
    const cells = wrapper.findAll('[data-square]')
    expect(cells).toHaveLength(64)
    expect(cells[0].attributes('aria-label')).toBe('a8, Black rook')
    expect(cells[63].attributes('aria-label')).toBe('h1, White rook')
    expect(wrapper.get('[data-square="d1"]').attributes('aria-label')).toContain('White queen')
    expect(wrapper.findAll('[tabindex="0"]')).toHaveLength(1)
    await wrapper.get('[data-square="a8"]').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.get('[data-square="b8"]').attributes('tabindex')).toBe('0')
    wrapper.unmount()
  })
  it('selects legal moves, rejects illegal destinations, and emits intent only', async () => {
    const wrapper = mount(ChessBoard, { props: { fen: new Chess().fen(), canMove: true } })
    await wrapper.get('[data-square="e2"]').trigger('click')
    expect(wrapper.get('[data-square="e2"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-square="e4"]').attributes('aria-label')).toContain('legal destination')
    await wrapper.get('[data-square="e5"]').trigger('click')
    expect(wrapper.emitted('move')).toBeUndefined()
    await wrapper.get('[data-square="e2"]').trigger('click')
    await wrapper.get('[data-square="e4"]').trigger('click')
    expect(wrapper.emitted('move')).toEqual([[{ from: 'e2', to: 'e4' }]])
    wrapper.unmount()
  })
  it('offers all promotions and supports underpromotion', async () => {
    const wrapper = mount(ChessBoard, { props: { fen: '7k/P7/8/8/8/8/8/7K w - - 0 1', canMove: true } })
    await wrapper.get('[data-square="a7"]').trigger('click')
    await wrapper.get('[data-square="a8"]').trigger('click')
    expect(wrapper.emitted('move')).toBeUndefined()
    expect(wrapper.findAll('option')).toHaveLength(4)
    await wrapper.get('select').setValue('n')
    await wrapper.get('[data-test="confirm-promotion"]').trigger('click')
    expect(wrapper.emitted('move')).toEqual([[{ from: 'a7', to: 'a8', promotion: 'n' }]])
    wrapper.unmount()
  })
  it('keeps read-only boards inspectable but never moves; clears selection on updates', async () => {
    const wrapper = mount(ChessBoard, { props: { fen: new Chess().fen(), canMove: true } })
    await wrapper.get('[data-square="e2"]').trigger('click')
    await wrapper.setProps({ canMove: false })
    await wrapper.get('[data-square="e4"]').trigger('click')
    expect(wrapper.emitted('move')).toBeUndefined()
    expect(wrapper.find('[aria-pressed="true"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
