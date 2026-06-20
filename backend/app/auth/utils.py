import re

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Password rule (documented for the README): at least 8 characters and at
# least one letter and one number. Length + mixed character classes beats
# forcing brittle "P@ssw0rd!" symbol requirements.
PASSWORD_RE = re.compile(r"^(?=.*[A-Za-z])(?=.*\d).{8,}$")


def is_valid_email(email: str) -> bool:
    return bool(email) and bool(EMAIL_RE.match(email))


def is_valid_password(password: str) -> bool:
    return bool(password) and bool(PASSWORD_RE.match(password))