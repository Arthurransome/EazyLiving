"""Tests for FastAPI endpoints — verify the app runs and responds."""
import pytest
from httpx import AsyncClient

from gateway.main import app


async def test_app_startup():
    """Verify the app can be imported and initialized."""
    assert app is not None
    assert app.title is not None


async def test_api_root_access(async_client):
    """Verify the API root is accessible."""
    response = await async_client.get("/")
    # The root may return 404 or 200 depending on app setup
    # Just verify no 500 errors
    assert response.status_code in [200, 404]


async def test_docs_endpoint_accessible(async_client):
    """Verify API documentation endpoint is accessible."""
    response = await async_client.get("/docs")
    assert response.status_code == 200
    assert "swagger" in response.text.lower() or "openapi" in response.text.lower()


async def test_openapi_endpoint_accessible(async_client):
    """Verify OpenAPI schema endpoint is accessible."""
    response = await async_client.get("/openapi.json")
    assert response.status_code == 200
    assert "openapi" in response.json()


# ---------------------------------------------------------------------------
# Auth API Tests
# ---------------------------------------------------------------------------


async def test_user_registration_success(async_client_with_db):
    """Test successful user registration."""
    user_data = {
        "email": "test12@example.com",
        "name": "Test12 User",
        "password": "pass1234",  # 8 characters, meets minimum
        "role": "tenant"
    }

    response = await async_client_with_db.post("/api/v1/auth/register", json=user_data)
    assert response.status_code == 201

    data = response.json()
    assert data["email"] == user_data["email"]
    assert data["name"] == user_data["name"]
    assert data["role"] == user_data["role"]
    assert data["is_active"] is True
    assert "user_id" in data
    assert "created_at" in data


async def test_user_registration_duplicate_email(async_client_with_db):
    """Test registration fails with duplicate email."""
    user_data = {
        "email": "duplicate@example.com",
        "name": "First User",
        "password": "pass1234",
        "role": "tenant"
    }

    # First registration should succeed
    response1 = await async_client_with_db.post("/api/v1/auth/register", json=user_data)
    assert response1.status_code == 201

    # Second registration with same email should fail
    user_data["name"] = "Second User"
    response2 = await async_client_with_db.post("/api/v1/auth/register", json=user_data)
    assert response2.status_code == 409
    assert "Email already registered" in response2.json()["detail"]


async def test_user_registration_invalid_data(async_client_with_db):
    """Test registration fails with invalid data."""
    # Test short password
    user_data = {
        "email": "invalid@example.com",
        "name": "Invalid User",
        "password": "short",
        "role": "tenant"
    }
    response = await async_client_with_db.post("/api/v1/auth/register", json=user_data)
    assert response.status_code == 422  # Validation error

    # Test empty name
    user_data = {
        "email": "invalid2@example.com",
        "name": "",
        "password": "pass1234",
        "role": "tenant"
    }
    response = await async_client_with_db.post("/api/v1/auth/register", json=user_data)
    assert response.status_code == 422  # Validation error

    # Test invalid email
    user_data = {
        "email": "invalid-email",
        "name": "Invalid User",
        "password": "pass1234",
        "role": "tenant"
    }
    response = await async_client_with_db.post("/api/v1/auth/register", json=user_data)
    assert response.status_code == 422  # Validation error


async def test_user_login_success(async_client_with_db):
    """Test successful user login."""
    # First register a user
    user_data = {
        "email": "login@example.com",
        "name": "Login User",
        "password": "pass1234",
        "role": "tenant"
    }
    register_response = await async_client_with_db.post("/api/v1/auth/register", json=user_data)
    assert register_response.status_code == 201

    # Now try to login
    login_data = {
        "email": "login@example.com",
        "password": "pass1234"
    }
    response = await async_client_with_db.post("/api/v1/auth/login", json=login_data)
    assert response.status_code == 200

    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert isinstance(data["access_token"], str)
    assert len(data["access_token"]) > 0


async def test_user_login_wrong_password(async_client_with_db):
    """Test login fails with wrong password."""
    # First register a user
    user_data = {
        "email": "wrongpass@example.com",
        "name": "Wrong Pass User",
        "password": "pass1234",
        "role": "tenant"
    }
    register_response = await async_client_with_db.post("/api/v1/auth/register", json=user_data)
    assert register_response.status_code == 201

    # Try to login with wrong password
    login_data = {
        "email": "wrongpass@example.com",
        "password": "wrongpassword"
    }
    response = await async_client_with_db.post("/api/v1/auth/login", json=login_data)
    assert response.status_code == 401
    assert "Incorrect email or password" in response.json()["detail"]


async def test_user_login_nonexistent_email(async_client_with_db):
    """Test login fails with nonexistent email."""
    login_data = {
        "email": "nonexistent@example.com",
        "password": "pass1234"
    }
    response = await async_client_with_db.post("/api/v1/auth/login", json=login_data)
    assert response.status_code == 401
    assert "Incorrect email or password" in response.json()["detail"]


async def test_user_login_inactive_account(async_client_with_db, db_session):
    """Test login fails for inactive account."""
    from services.user_service.repositories.user_repo import UserRepository

    # Register a user
    user_data = {
        "email": "inactive@example.com",
        "name": "Inactive User",
        "password": "pass1234",
        "role": "tenant",
    }
    reg = await async_client_with_db.post("/api/v1/auth/register", json=user_data)
    assert reg.status_code == 201

    # Deactivate directly via the DB session shared by the test fixture
    repo = UserRepository(db_session)
    user = await repo.get_by_email("inactive@example.com")
    user.is_active = False
    await db_session.flush()

    # Login should now return 403 (account inactive)
    response = await async_client_with_db.post(
        "/api/v1/auth/login",
        json={"email": "inactive@example.com", "password": "pass1234"},
    )
    assert response.status_code == 403


async def test_get_current_user_profile(async_client_with_db):
    """Test getting current user profile with valid token."""
    # First register and login
    user_data = {
        "email": "profile@example.com",
        "name": "Profile User",
        "password": "pass1234",
        "role": "tenant"
    }
    await async_client_with_db.post("/api/v1/auth/register", json=user_data)

    login_data = {"email": "profile@example.com", "password": "pass1234"}
    login_response = await async_client_with_db.post("/api/v1/auth/login", json=login_data)
    token = login_response.json()["access_token"]

    # Now get profile with token
    headers = {"Authorization": f"Bearer {token}"}
    response = await async_client_with_db.get("/api/v1/users/me", headers=headers)
    assert response.status_code == 200

    data = response.json()
    assert data["email"] == user_data["email"]
    assert data["name"] == user_data["name"]
    assert data["role"] == user_data["role"]
    assert data["is_active"] is True


async def test_get_current_user_profile_no_token(async_client_with_db):
    """Test getting profile fails without authentication."""
    response = await async_client_with_db.get("/api/v1/users/me")
    assert response.status_code == 401


async def test_get_current_user_profile_invalid_token(async_client_with_db):
    """Test getting profile fails with invalid token."""
    headers = {"Authorization": "Bearer invalid_token"}
    response = await async_client_with_db.get("/api/v1/users/me", headers=headers)
    assert response.status_code == 401


async def test_health_endpoint(async_client):
    """Test health check endpoint."""
    response = await async_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
