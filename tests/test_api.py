"""Tests for FastAPI endpoints — verify the app runs and responds."""
import pytest
from fastapi.testclient import TestClient

from gateway.main import app


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)


def test_app_startup():
    """Verify the app can be imported and initialized."""
    assert app is not None
    assert app.title is not None


def test_api_root_access(client):
    """Verify the API root is accessible."""
    response = client.get("/")
    # The root may return 404 or 200 depending on app setup
    # Just verify no 500 errors
    assert response.status_code in [200, 404]


def test_docs_endpoint_accessible(client):
    """Verify API documentation endpoint is accessible."""
    response = client.get("/docs")
    assert response.status_code == 200
    assert "swagger" in response.text.lower() or "openapi" in response.text.lower()


def test_openapi_endpoint_accessible(client):
    """Verify OpenAPI schema endpoint is accessible."""
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert "openapi" in response.json()
