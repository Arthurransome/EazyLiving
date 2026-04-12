# EazyLiving Development Guide

Complete guide to set up and run the EazyLiving property management system in development.

## 📋 Prerequisites

Before starting, ensure you have:
- Python 3.12+
- PostgreSQL 18+ running
- Redis (optional, for notifications)
- MongoDB (optional, for advanced features)

## 🚀 Quick Start (5 minutes)

### 1. Start Required Services

```bash
# Start PostgreSQL (should already be running)
brew services start postgresql@18

# Start Redis (optional but recommended)
brew services start redis

# Start MongoDB (optional but recommended)
brew services start mongodb-community
```

### 2. Create Python Virtual Environment

```bash
cd /path/to/EazyLiving
python -m venv .venv
source .venv/bin/activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Initialize Database

```bash
# Create tables and enums
python -c "
from shared.db.database import engine
from shared.db.models import Base
import asyncio

async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print('✓ Tables created successfully')

asyncio.run(create_tables())
"
```

### 5. Start Development Server

```bash
fastapi dev gateway/main.py
```

The API will be available at: **http://localhost:8000**

---

## 📚 Detailed Setup Instructions

### Environment Configuration

The `.env` file contains all necessary configuration:

```env
# Database
DATABASE_URL=postgresql+asyncpg://aswadhardi:aswadhardi@localhost:5432/eazyliving
DB_ECHO=true  # Set to false in production

# Cache
REDIS_URL=redis://localhost:6379/0

# Document Store  
MONGO_URL=mongodb://localhost:27017
MONGO_DB=eazyliving

# JWT Authentication
JWT_SECRET=your-local-dev-secret
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440  # 24 hours
```

**For production**, generate a strong `JWT_SECRET`:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Database Setup

#### Option 1: Automatic Table Creation (Recommended)

```bash
python -c "
from shared.db.database import engine
from shared.db.models import Base
import asyncio

async def setup():
    # Drop all existing tables (only for dev!)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    print('✓ Database reset and tables created')

asyncio.run(setup())
"
```

#### Option 2: Using Migrations (Alembic)

```bash
# View migration status
alembic current

# Create tables from migration
alembic upgrade head

# Rollback (for development)
alembic downgrade base
```

### Start Services

**Terminal 1 - API Gateway:**
```bash
source .venv/bin/activate
fastapi dev gateway/main.py
```

**Terminal 2 - Redis (if needed):**
```bash
brew services start redis
```

**Terminal 3 - MongoDB (if needed):**
```bash
brew services start mongodb-community
```

---

## 👤 Testing the API

### 1. Create a User Account

```bash
curl -X POST "http://localhost:8000/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "name": "John Doe",
    "password": "SecurePassword123",
    "role": "tenant"
  }'
```

**Response:**
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "tenant",
  "is_active": true,
  "created_at": "2026-04-11T23:18:35.714559Z"
}
```

### 2. Login to Get JWT Token

```bash
curl -X POST "http://localhost:8000/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123"
  }'
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

### 3. Access Protected Endpoints

Use the `access_token` from login in the Authorization header:

```bash
TOKEN="<access_token_from_login>"

# Get current user profile
curl -X GET "http://localhost:8000/api/v1/users/me" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🧪 Running Tests

### Run All Tests

```bash
pytest tests/test_api.py -v
```

### Run Specific Test

```bash
pytest tests/test_api.py::test_user_registration_success -v
```

### Run with Coverage Report

```bash
pytest tests/test_api.py --cov=services --cov=gateway --cov-report=html
```

The coverage report will be generated in `htmlcov/index.html`

---

## 📖 API Documentation

Once the server is running, access interactive documentation:

- **Swagger UI (OpenAPI)**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI Schema**: http://localhost:8000/openapi.json

---

## 🏗️ Project Structure

```
EazyLiving/
├── gateway/                 # FastAPI application entry point
│   ├── main.py             # App configuration & route registration
│   └── auth.py             # Authentication utilities
├── services/               # Microservices (each has its own router)
│   ├── user_service/       # User management
│   ├── property_service/   # Property & lease management
│   ├── payment_service/    # Payment processing
│   ├── maintenance_service/ # Maintenance requests
│   └── notification_service/ # Notifications
├── shared/                 # Shared utilities
│   ├── db/                 # Database configuration
│   │   ├── models.py       # SQLAlchemy ORM models
│   │   ├── database.py     # Engine & session factory
│   │   └── config.py       # Settings from .env
│   ├── schemas/            # Pydantic request/response schemas
│   ├── repositories/       # Base repository class
│   └── events.py           # Event bus
├── tests/                  # Test suite
│   ├── conftest.py         # Pytest fixtures & configuration
│   └── test_api.py         # API endpoint tests
├── migrations/             # Alembic database migrations
├── requirements.txt        # Python dependencies
├── pyproject.toml         # Project configuration
└── .env                   # Environment variables
```

---

## 🐛 Troubleshooting

### Cannot Connect to PostgreSQL

```bash
# Check if PostgreSQL is running
brew services list | grep postgresql

# Start PostgreSQL if not running
brew services start postgresql@18

# Test connection
psql postgresql://aswadhardi:aswadhardi@localhost:5432/eazyliving -c "\dt"
```

### Port 8000 Already in Use

```bash
# Find process using port 8000
lsof -i :8000

# Kill the process
kill -9 <PID>

# Or use a different port
fastapi dev gateway/main.py --port 8001
```

### Tables Not Creating

```bash
# Check if tables exist
psql -d eazyliving -c "\dt"

# Manually create tables
python -c "
from shared.db.database import engine
from shared.db.models import Base
import asyncio

async def create():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

asyncio.run(create())
"
```

### JWT Token Errors

- Make sure `JWT_SECRET` is set in `.env`
- Verify token hasn't expired (default: 24 hours)
- Check token format: `Bearer <token>`

---

## 📝 Common Development Tasks

### Add a New Migration

```bash
alembic revision --autogenerate -m "Description of changes"
alembic upgrade head
```

### Reset Database (Development Only)

```bash
# Delete all data and recreate tables
python -c "
from shared.db.database import engine
from shared.db.models import Base
import asyncio

async def reset():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    print('✓ Database reset')

asyncio.run(reset())
"
```

### Create Admin User via Python

```bash
python -c "
import asyncio
from shared.db.database import AsyncSessionLocal
from services.user_service.services.user_service import UserService

async def create_admin():
    session = AsyncSessionLocal()
    service = UserService(session)
    user = await service.create_user(
        email='admin@example.com',
        name='Admin User',
        password='AdminPassword123',
        role='admin'
    )
    print(f'✓ Admin created: {user.email}')
    await session.close()

asyncio.run(create_admin())
"
```

---

## 🔒 Security Notes for Development

- ⚠️ The `.env` file contains credentials - **never commit to git**
- ⚠️ `DB_ECHO=true` logs all SQL - disable in production
- ⚠️ `CORS` allows all origins (`*`) - restrict in production
- ⚠️ `JWT_SECRET` is a dummy value - generate a strong one for production

---

## 📞 Getting Help

If you encounter issues:

1. Check this guide for common troubleshooting
2. Review API documentation at `/docs`
3. Check server logs (they print to console in dev mode)
4. Run tests to verify setup: `pytest tests/test_api.py -v`
