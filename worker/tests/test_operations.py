"""Unit tests for worker string operations."""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from worker import OPERATIONS


def test_uppercase():
    assert OPERATIONS["uppercase"]("hello") == "HELLO"
    assert OPERATIONS["uppercase"]("Hello World") == "HELLO WORLD"
    assert OPERATIONS["uppercase"]("123 abc") == "123 ABC"


def test_lowercase():
    assert OPERATIONS["lowercase"]("HELLO") == "hello"
    assert OPERATIONS["lowercase"]("Hello World") == "hello world"
    assert OPERATIONS["lowercase"]("123 ABC") == "123 abc"


def test_reverse():
    assert OPERATIONS["reverse"]("abc") == "cba"
    assert OPERATIONS["reverse"]("hello") == "olleh"
    assert OPERATIONS["reverse"]("") == ""
    assert OPERATIONS["reverse"]("a") == "a"


def test_word_count():
    assert OPERATIONS["word_count"]("hello world") == "2"
    assert OPERATIONS["word_count"]("") == "0"
    assert OPERATIONS["word_count"]("one") == "1"
    assert OPERATIONS["word_count"]("a b c d e") == "5"


def test_unicode():
    assert OPERATIONS["uppercase"]("héllo") == "HÉLLO"
    assert OPERATIONS["lowercase"]("HELLO") == "hello"
    assert OPERATIONS["reverse"]("héllo") == "olléh"
