/**
 * EconomyManager manages the player's treasury balance and transactions.
 * Decoupled from UI and scene presentation according to Separation of Concerns.
 */

export interface TransactionRecord {
  readonly id: string
  readonly amount: number
  readonly timestamp: number
  readonly reason: string
  readonly balanceAfter: number
}

export type BalanceChangeListener = (newBalance: number) => void

export class EconomyManager {
  private balance: number
  private readonly initialBalance: number
  private readonly listeners = new Set<BalanceChangeListener>()
  private readonly transactions: TransactionRecord[] = []

  constructor(initialBalance = 500) {
    if (initialBalance < 0) {
      throw new Error(`Initial balance cannot be negative: ${initialBalance}`)
    }
    this.initialBalance = initialBalance
    this.balance = initialBalance
  }

  /**
   * Retrieves the current treasury balance.
   */
  public getBalance(): number {
    return this.balance
  }

  /**
   * Checks whether the player can afford a given cost.
   */
  public canAfford(amount: number): boolean {
    if (amount < 0) {
      throw new Error(`Cost cannot be negative: ${amount}`)
    }
    return this.balance >= amount
  }

  /**
   * Deducts funds from the treasury if sufficient funds exist.
   * Returns true if transaction succeeded, false otherwise.
   */
  public spend(amount: number, reason = 'expense'): boolean {
    if (amount < 0) {
      throw new Error(`Cannot spend negative amount: ${amount}`)
    }
    if (amount === 0) {
      return true
    }
    if (!this.canAfford(amount)) {
      return false
    }

    this.balance -= amount
    this.recordTransaction(-amount, reason)
    this.notifyListeners()
    return true
  }

  /**
   * Deposits funds into the treasury.
   */
  public deposit(amount: number, reason = 'income'): void {
    if (amount < 0) {
      throw new Error(`Cannot deposit negative amount: ${amount}`)
    }
    if (amount === 0) {
      return
    }

    this.balance += amount
    this.recordTransaction(amount, reason)
    this.notifyListeners()
  }

  /**
   * Resets the treasury back to initial balance.
   */
  public reset(customBalance?: number): void {
    const target = customBalance !== undefined ? customBalance : this.initialBalance
    if (target < 0) {
      throw new Error(`Balance cannot be negative: ${target}`)
    }
    this.balance = target
    this.transactions.length = 0
    this.notifyListeners()
  }

  /**
   * Subscribes to treasury balance updates.
   */
  public subscribe(listener: BalanceChangeListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Returns transaction audit history.
   */
  public getTransactions(): readonly TransactionRecord[] {
    return this.transactions
  }

  private recordTransaction(amount: number, reason: string): void {
    const record: TransactionRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      amount,
      timestamp: Date.now(),
      reason,
      balanceAfter: this.balance,
    }
    this.transactions.push(record)
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.balance)
      } catch (err) {
        console.error('Error in balance change listener:', err)
      }
    }
  }
}
