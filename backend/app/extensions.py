from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager
from flask_socketio import SocketIO
from flask_cors import CORS

db = SQLAlchemy()
migrate = Migrate()
bcrypt = Bcrypt()
jwt = JWTManager()
# threading mode keeps local dev simple (no eventlet/gevent monkey-patching).
# Swap to eventlet + gunicorn for production if you need to scale sockets.
socketio = SocketIO(cors_allowed_origins="*", async_mode="threading")
cors = CORS()