/** Allows `perSecond` actions on average, and bursts of up to `burst`. */
export class TokenBucket {
  private tokens: number;
  private refilledAt = Date.now();

  constructor(
    private perSecond: number,
    private burst: number,
  ) {
    this.tokens = burst;
  }

  take() {
    const now = Date.now();
    this.tokens = Math.min(
      this.burst,
      this.tokens + ((now - this.refilledAt) / 1000) * this.perSecond,
    );
    this.refilledAt = now;
    if (this.tokens < 1) return false;
    this.tokens--;
    return true;
  }
}
