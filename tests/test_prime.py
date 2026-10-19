# This is an ordinary pytest file. Copy it as the starting point for new
# tests. Any file in tests/ named test_*.py is picked up automatically.

from prime import is_prime


# normal case: a typical prime number is identified correctly
def test_is_prime_returns_true_for_a_prime_number():
    assert is_prime(7) is True


# wrong case: a typical non-prime (composite) number is rejected
def test_is_prime_returns_false_for_a_composite_number():
    assert is_prime(9) is False


# edge case: boundary values (negative, zero, one, smallest prime)
def test_is_prime_handles_boundary_values():
    assert is_prime(-1) is False
    assert is_prime(0) is False
    assert is_prime(1) is False
    assert is_prime(2) is True
