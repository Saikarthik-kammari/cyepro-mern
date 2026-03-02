const circuitBreaker = {
  state: 'CLOSED',
  failures: 0,
  threshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD) || 5,
  timeoutMs: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT) || 60000,
  lastFailureTime: null,

  isOpen() {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime > this.timeoutMs) {
        this.state = 'HALF_OPEN';
        console.log('Circuit breaker → HALF_OPEN, testing AI...');
        return false;
      }
      return true;
    }
    return false;
  },

  recordSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
    console.log('Circuit breaker → CLOSED, AI is healthy');
  },

  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      console.log(`Circuit breaker → OPEN after ${this.failures} failures`);
    }
  },

  getStatus() {
    return {
      state: this.state,
      failures: this.failures,
      threshold: this.threshold,
      lastFailureTime: this.lastFailureTime,
      willRetryAt: this.state === 'OPEN'
        ? new Date(this.lastFailureTime + this.timeoutMs).toISOString()
        : null
    };
  }
};

module.exports = circuitBreaker;