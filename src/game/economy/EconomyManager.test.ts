import { describe, it, expect, vi } from 'vitest'
import { EconomyManager } from './EconomyManager'

describe('EconomyManager', () => {
  it('initializes with default balance of 500 gold', () => {
    const economy = new EconomyManager()
    expect(economy.getBalance()).toBe(500)
    expect(economy.canAfford(500)).toBe(true)
    expect(economy.canAfford(501)).toBe(false)
  })

  it('allows custom initial balance and rejects negative values', () => {
    const economy = new EconomyManager(1000)
    expect(economy.getBalance()).toBe(1000)
    expect(() => new EconomyManager(-50)).toThrow('Initial balance cannot be negative')
  })

  it('spends money when sufficient funds are available', () => {
    const economy = new EconomyManager(100)
    const success = economy.spend(40, 'dirt_road')

    expect(success).toBe(true)
    expect(economy.getBalance()).toBe(60)
    expect(economy.getTransactions()).toHaveLength(1)
    expect(economy.getTransactions()[0].amount).toBe(-40)
  })

  it('rejects spending when funds are insufficient', () => {
    const economy = new EconomyManager(25)
    const success = economy.spend(30, 'expensive_road')

    expect(success).toBe(false)
    expect(economy.getBalance()).toBe(25)
    expect(economy.getTransactions()).toHaveLength(0)
  })

  it('deposits funds and records transaction', () => {
    const economy = new EconomyManager(50)
    economy.deposit(75, 'tax_income')

    expect(economy.getBalance()).toBe(125)
    expect(economy.getTransactions()).toHaveLength(1)
    expect(economy.getTransactions()[0].amount).toBe(75)
  })

  it('notifies listeners on balance changes', () => {
    const economy = new EconomyManager(100)
    const listener = vi.fn()
    const unsubscribe = economy.subscribe(listener)

    economy.spend(20)
    expect(listener).toHaveBeenCalledWith(80)

    economy.deposit(50)
    expect(listener).toHaveBeenCalledWith(130)

    unsubscribe()
    economy.spend(10)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('resets balance correctly', () => {
    const economy = new EconomyManager(200)
    economy.spend(50)
    expect(economy.getBalance()).toBe(150)

    economy.reset()
    expect(economy.getBalance()).toBe(200)
    expect(economy.getTransactions()).toHaveLength(0)
  })
})
