from __future__ import annotations

from fastapi.testclient import TestClient

from config import ServiceConfig
from main import create_app


def build_request_body():
  return {
    "runtime": {
      "profile_id": "conversation-analysis",
      "version_no": 1,
      "model_name": "service-managed",
      "prompt_version": "A",
      "output_schema_version": "conversation_analysis.v1",
      "taxonomy_version": "default.v1",
      "page_prompt_text": "Ưu tiên evidence explicit.",
      "taxonomy_json": {"categories": {}},
      "generation_config": {},
      "profile_json": {},
    },
    "bundles": [],
  }


def build_app():
  config = ServiceConfig(
    http_host="0.0.0.0",
    http_port=8000,
    http_max_request_bytes=64 * 1024 * 1024,
    shared_secret="test-shared-secret",
    runtime_mode="deterministic_dev",
    log_level="INFO",
  )
  return create_app(config=config)


def test_health_endpoint_reports_ready_service():
  client = TestClient(build_app())

  response = client.get("/health")

  assert response.status_code == 200
  assert response.json() == {
    "status": "ok",
    "runtime_mode": "deterministic_dev",
    "provider": "deterministic_dev",
    "model_name": "deterministic-dev",
  }


def test_internal_analyze_requires_bearer_secret():
  client = TestClient(build_app())

  response = client.post("/internal/analyze", json=build_request_body())

  assert response.status_code == 401
  assert response.json() == {"detail": "unauthorized"}


def test_internal_analyze_accepts_batch_with_valid_secret():
  client = TestClient(build_app())

  response = client.post(
    "/internal/analyze",
    headers={"Authorization": "Bearer test-shared-secret"},
    json=build_request_body(),
  )

  assert response.status_code == 200
  assert response.json()["results"] == []
  assert response.json()["runtime_metadata_json"]["runtime_mode"] == "deterministic_dev"
  assert response.json()["runtime_metadata_json"]["provider"] == "deterministic_dev"
