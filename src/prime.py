# This is an EXAMPLE model function showing the project's test/CI setup
# working end to end. Delete this file (and tests/test_prime.py) once you
# have your own model classes and functions.


def is_prime(number):
    """Return True if number is a prime number, False otherwise."""
    if number < 2:
        return False
    divisor = 2
    while divisor * divisor <= number:
        if number % divisor == 0:
            return False
        divisor += 1
    return True
