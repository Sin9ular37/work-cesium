const { randomBytes, webcrypto } = require('crypto')

const CryptoQuotaError =
  typeof global.DOMException === 'function'
    ? global.DOMException
    : class extends Error {
        constructor(message, name) {
          super(message)
          this.name = name
        }
      }

const polyfill = webcrypto || {
    getRandomValues(array) {
      if (!ArrayBuffer.isView(array) || !array.buffer) {
        throw new TypeError('Expected a typed array')
      }
    if (array.byteLength > 65536) {
      throw new CryptoQuotaError('Quota exceeded', 'QuotaExceededError')
    }
    const bytes = randomBytes(array.byteLength)
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(bytes)
    return array
  }
}

const target = typeof crypto !== 'undefined' ? crypto : globalThis.crypto

if (!target) {
  globalThis.crypto = polyfill
} else if (typeof target.getRandomValues !== 'function') {
  target.getRandomValues = polyfill.getRandomValues.bind(polyfill)
}
