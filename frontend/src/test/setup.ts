import '@testing-library/jest-dom'

// jsdom's localStorage/sessionStorage don't implement .clear() reliably.
// Replace them with a full in-memory mock that resets between tests.
class StorageMock implements Storage {
  private store: Record<string, string> = {}
  get length() { return Object.keys(this.store).length }
  clear() { this.store = {} }
  getItem(key: string) { return this.store[key] ?? null }
  setItem(key: string, value: string) { this.store[key] = String(value) }
  removeItem(key: string) { delete this.store[key] }
  key(i: number) { return Object.keys(this.store)[i] ?? null }
}

Object.defineProperty(window, 'localStorage', { value: new StorageMock(), writable: true })
Object.defineProperty(window, 'sessionStorage', { value: new StorageMock(), writable: true })
