// This is an EXAMPLE model function showing the project's test/CI setup
// working end to end. Delete this file (and tests/prime.test.js) once you
// have your own model classes and functions.

/** Return true if number is a prime number, false otherwise. */
function isPrime(number) {
  if (number < 2) {
    return false;
  }
  let divisor = 2;
  while (divisor * divisor <= number) {
    if (number % divisor === 0) {
      return false;
    }
    divisor += 1;
  }
  return true;
}

module.exports = { isPrime };
