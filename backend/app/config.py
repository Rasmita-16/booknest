import os
from datetime import timedelta


class Config:
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", "postgresql://booknest:booknest@localhost:5432/booknest"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "dev-secret-change-me")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=15)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)

    # Access token: returned in the JSON body, kept in memory on the
    # frontend (a JS variable / React context). Never written to
    # localStorage or a cookie. Short life limits the damage if it leaks.
    JWT_TOKEN_LOCATION = ["headers", "cookies"]
    JWT_HEADER_NAME = "Authorization"
    JWT_HEADER_TYPE = "Bearer"

    # Refresh token: httpOnly + Secure cookie. Client-side JS (and so an
    # XSS payload) can never read it. Because browsers auto-attach
    # cookies, CSRF protection is required for any cookie-carried token.
    JWT_REFRESH_COOKIE_NAME = "booknest_refresh"
    JWT_COOKIE_SECURE = os.environ.get("FLASK_ENV") == "production"
    JWT_COOKIE_SAMESITE = "Lax"
    JWT_COOKIE_CSRF_PROTECT = True
    JWT_REFRESH_CSRF_HEADER_NAME = "X-CSRF-TOKEN"

    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:3000")