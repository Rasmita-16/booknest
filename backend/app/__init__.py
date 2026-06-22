from flask import Flask, jsonify

from app.config import Config
from app.extensions import db, migrate, bcrypt, jwt, socketio, cors


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    migrate.init_app(app, db)
    bcrypt.init_app(app)
    jwt.init_app(app)
    cors.init_app(app, supports_credentials=True, origins=app.config["CORS_ORIGINS"])
    socketio.init_app(app)

    from app.auth.routes import auth_bp
    app.register_blueprint(auth_bp, url_prefix="/api/auth")

    from app.books.routes import books_bp
    app.register_blueprint(books_bp, url_prefix="/api/books")

    from app.shelves.routes import shelves_bp
    app.register_blueprint(shelves_bp, url_prefix="/api/shelves")

    from app.lendings.routes import lendings_bp
    app.register_blueprint(lendings_bp, url_prefix="/api/lendings")

    from app.dashboard.routes import dashboard_bp
    app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")

    # Importing this registers the @socketio.on(...) connect/disconnect
    # handlers against the shared socketio instance — it has no routes
    # of its own, so there's no register_blueprint call for it.
    from app import sockets  # noqa: F401

    @app.errorhandler(404)
    def not_found(e):
        return jsonify(error="Not found"), 404

    @jwt.unauthorized_loader
    def unauthorized(reason):
        return jsonify(error="Unauthorized", detail=str(reason)), 401

    @jwt.expired_token_loader
    def expired(jwt_header, jwt_payload):
        return jsonify(error="Token expired"), 401

    @jwt.invalid_token_loader
    def invalid(reason):
        return jsonify(error="Invalid token", detail=str(reason)), 401

    return app