import '@testing-library/jest-dom/vitest'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { EconomyManager } from '../game/economy/EconomyManager'
import { EconomyBar } from './EconomyBar'

afterEach(() => {
  cleanup()
})

describe('EconomyBar Component', () => {
  it('renders initial gold balance', () => {
    const economy = new EconomyManager(500)
    render(<EconomyBar economy={economy} />)

    const value = screen.getByTestId('gold-balance')
    expect(value.textContent).toBe('500')
  })

  it('updates balance when economy balance changes', () => {
    const economy = new EconomyManager(500)
    render(<EconomyBar economy={economy} />)

    act(() => {
      economy.spend(50)
    })
    expect(screen.getByTestId('gold-balance').textContent).toBe('450')

    act(() => {
      economy.deposit(100)
    })
    expect(screen.getByTestId('gold-balance').textContent).toBe('550')
  })
})
