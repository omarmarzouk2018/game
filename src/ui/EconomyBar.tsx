import { useEffect, useState } from 'react'
import { EconomyManager } from '../game/economy/EconomyManager'

export interface EconomyBarProps {
  readonly economy: EconomyManager | null
}

/**
 * EconomyBar displays current player treasury balance in gold coins.
 */
export function EconomyBar({ economy }: EconomyBarProps) {
  const [balance, setBalance] = useState<number>(economy ? economy.getBalance() : 500)

  useEffect(() => {
    if (!economy) return
    setBalance(economy.getBalance())
    const unsubscribe = economy.subscribe((newBalance) => {
      setBalance(newBalance)
    })
    return () => unsubscribe()
  }, [economy])

  return (
    <div className="economy-bar" role="region" aria-label="رصيد الخزانة">
      <div className="economy-coin-icon" aria-hidden="true">🪙</div>
      <div className="economy-details">
        <span className="economy-label">الذهب:</span>
        <span className="economy-value" data-testid="gold-balance">{balance}</span>
      </div>
    </div>
  )
}
