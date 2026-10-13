import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { useCollapsingHeader, useKeyboardInset, usePhone, useSwipe } from './hooks'

let scrollY = 0
beforeEach(() => {
  scrollY = 0
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
})
afterEach(() => vi.unstubAllGlobals())

function scrollTo(y: number) {
  scrollY = y
  act(() => { window.dispatchEvent(new Event('scroll')) })
}

describe('useCollapsingHeader', () => {
  it('collapses past 120px and expands only under 40px', () => {
    const { result } = renderHook(() => useCollapsingHeader())
    expect(result.current).toBe(false)
    scrollTo(130)
    expect(result.current).toBe(true)
    scrollTo(60)
    expect(result.current).toBe(true)
    scrollTo(30)
    expect(result.current).toBe(false)
  })
})

describe('useKeyboardInset', () => {
  it('measures how much of the layout viewport the keyboard covers', () => {
    const listeners: Record<string, () => void> = {}
    const viewport = { height: 800, offsetTop: 0, addEventListener: (type: string, fn: () => void) => { listeners[type] = fn }, removeEventListener: vi.fn() }
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    const { result } = renderHook(() => useKeyboardInset())
    expect(result.current).toBe(0)
    viewport.height = 500
    act(() => listeners.resize())
    expect(result.current).toBe(300)
  })
})

describe('usePhone', () => {
  it('follows the 767px media query', () => {
    let matches = true
    const listeners: Array<() => void> = []
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() { return matches }, media: query,
      addEventListener: (_: string, fn: () => void) => listeners.push(fn), removeEventListener: vi.fn(),
    }))
    const { result } = renderHook(() => usePhone())
    expect(result.current).toBe(true)
    matches = false
    act(() => listeners.forEach((fn) => fn()))
    expect(result.current).toBe(false)
  })
})

describe('useSwipe', () => {
  function Probe({ onLeft, onRight }: { onLeft: () => void; onRight: () => void }) {
    return <div data-testid="area" {...useSwipe(onLeft, onRight)} />
  }

  it('calls left on a leftward swipe and ignores mostly vertical moves', () => {
    const onLeft = vi.fn()
    const onRight = vi.fn()
    render(<Probe onLeft={onLeft} onRight={onRight} />)
    const area = screen.getByTestId('area')
    fireEvent.pointerDown(area, { pointerType: 'touch', clientX: 300, clientY: 100 })
    fireEvent.pointerUp(area, { pointerType: 'touch', clientX: 200, clientY: 110 })
    fireEvent.pointerDown(area, { pointerType: 'touch', clientX: 300, clientY: 100 })
    fireEvent.pointerUp(area, { pointerType: 'touch', clientX: 230, clientY: 260 })
    expect(onLeft).toHaveBeenCalledTimes(1)
    expect(onRight).not.toHaveBeenCalled()
  })
})
