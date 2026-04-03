from __future__ import annotations

import os

from pydantic import BaseModel, Field, ValidationError


class ServiceConfig(BaseModel):
  grpc_host: str = Field(default="0.0.0.0")
  grpc_port: int = Field(default=50051, ge=1, le=65535)
  grpc_max_message_length: int = Field(default=64 * 1024 * 1024, ge=1024)
  grpc_max_workers: int = Field(default=8, ge=1, le=64)
  adk_app_name: str = Field(default="chat-analyzer-conversation-analysis")
  use_adk: bool = Field(default=False)
  log_level: str = Field(default="INFO")


def load_config() -> ServiceConfig:
  try:
    return ServiceConfig(
      grpc_host=os.getenv("ANALYSIS_SERVICE_GRPC_HOST", "0.0.0.0"),
      grpc_port=os.getenv("ANALYSIS_SERVICE_GRPC_PORT", "50051"),
      grpc_max_message_length=os.getenv("ANALYSIS_SERVICE_GRPC_MAX_MESSAGE_LENGTH", str(64 * 1024 * 1024)),
      grpc_max_workers=os.getenv("ANALYSIS_SERVICE_GRPC_MAX_WORKERS", "8"),
      adk_app_name=os.getenv("ANALYSIS_SERVICE_ADK_APP_NAME", "chat-analyzer-conversation-analysis"),
      use_adk=os.getenv("ANALYSIS_SERVICE_USE_ADK", "false").lower() in {"1", "true", "yes", "on"},
      log_level=os.getenv("ANALYSIS_SERVICE_LOG_LEVEL", "INFO").upper()
    )
  except ValidationError as exc:
    raise RuntimeError(f"Invalid service configuration: {exc}") from exc
