

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}


export function blockingDelay(ms: number): void {
  const start = Date.now();
  while (Date.now() - start < ms) {
    // Just spin in a loop until the time has elapsed
  }
}
