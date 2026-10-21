// This is an ordinary Jest file. Copy it as the starting point for new
// tests. Any file in tests/ named *.test.js is picked up automatically.

const { isPrime } = require("../src/prime");

// normal case: a typical prime number is identified correctly
test("isPrime returns true for a prime number", () => {
  expect(isPrime(7)).toBe(true);
});

// wrong case: a typical non-prime (composite) number is rejected
test("isPrime returns false for a composite number", () => {
  expect(isPrime(9)).toBe(false);
});

// edge case: boundary values (negative, zero, one, smallest prime)
test("isPrime handles boundary values", () => {
  expect(isPrime(-1)).toBe(false);
  expect(isPrime(0)).toBe(false);
  expect(isPrime(1)).toBe(false);
  expect(isPrime(2)).toBe(true);
});
