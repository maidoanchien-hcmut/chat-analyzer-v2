from __future__ import annotations

import os

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator


RuntimeMode = Literal["deterministic_dev", "openai_compatible_live"]


class ServiceConfig(BaseModel):
  model_config = ConfigDict(extra="forbid")

  grpc_host: str = Field(default="0.0.0.0")
  grpc_port: int = Field(default=50051, ge=1, le=65535)
  grpc_max_message_length: int = Field(default=64 * 1024 * 1024, ge=1024)
  grpc_max_workers: int = Field(default=8, ge=1, le=64)
  runtime_mode: RuntimeMode = Field(default="deterministic_dev")
  provider_name: str | None = None
  provider_base_url: str | None = None
  provider_api_key: str | None = None
  provider_model: str | None = None
  request_timeout_seconds: float = Field(default=60.0, gt=0, le=300)
  generation_temperature: float = Field(default=0.0, ge=0, le=2)
  generation_top_p: float = Field(default=1.0, gt=0, le=1)
  generation_max_output_tokens: int = Field(default=1200, ge=1, le=8192)
  log_level: str = Field(default="INFO")

  @model_validator(mode="after")
  def validate_runtime_contract(self) -> "ServiceConfig":
    if self.runtime_mode == "deterministic_dev":
      provider_name = (self.provider_name or "").strip()
      if provider_name and provider_name != "deterministic_dev":
        raise ValueError("runtime_mode=deterministic_dev requires provider_name=deterministic_dev")
      return self

    missing: list[str] = []
    provider_name = (self.provider_name or "").strip()
    if not provider_name:
      missing.append("provider_name")
    if not (self.provider_base_url or "").strip():
      missing.append("provider_base_url")
    if not (self.provider_api_key or "").strip():
      missing.append("provider_api_key")
    if not (self.provider_model or "").strip():
      missing.append("provider_model")
    if missing:
      raise ValueError(f"runtime_mode=openai_compatible_live requires: {', '.join(missing)}")
    if provider_name != "openai_compatible":
      raise ValueError("runtime_mode=openai_compatible_live requires provider_name=openai_compatible")
    return self

  def resolve_provider_name(self) -> str:
    if self.runtime_mode == "deterministic_dev":
      return "deterministic_dev"
    return (self.provider_name or "").strip()

  def resolve_model_name(self) -> str:
    return "deterministic-dev" if self.runtime_mode == "deterministic_dev" else (self.provider_model or "").strip()

  def default_generation_config(self) -> dict[str, Any]:
    return {
      "temperature": self.generation_temperature,
      "top_p": self.generation_top_p,
      "max_output_tokens": self.generation_max_output_tokens,
    }


def load_config() -> ServiceConfig:
  try:
    return ServiceConfig(
      grpc_host=os.getenv("ANALYSIS_SERVICE_GRPC_HOST", "0.0.0.0"),
      grpc_port=os.getenv("ANALYSIS_SERVICE_GRPC_PORT", "50051"),
      grpc_max_message_length=os.getenv("ANALYSIS_SERVICE_GRPC_MAX_MESSAGE_LENGTH", str(64 * 1024 * 1024)),
      grpc_max_workers=os.getenv("ANALYSIS_SERVICE_GRPC_MAX_WORKERS", "8"),
      runtime_mode=os.getenv("ANALYSIS_SERVICE_RUNTIME_MODE", "deterministic_dev"),
      provider_name=os.getenv("ANALYSIS_SERVICE_PROVIDER_NAME"),
      provider_base_url=os.getenv("ANALYSIS_SERVICE_PROVIDER_BASE_URL"),
      provider_api_key=os.getenv("ANALYSIS_SERVICE_PROVIDER_API_KEY"),
      provider_model=os.getenv("ANALYSIS_SERVICE_PROVIDER_MODEL"),
      request_timeout_seconds=os.getenv("ANALYSIS_SERVICE_REQUEST_TIMEOUT_SECONDS", "60"),
      generation_temperature=os.getenv("ANALYSIS_SERVICE_GENERATION_TEMPERATURE", "0"),
      generation_top_p=os.getenv("ANALYSIS_SERVICE_GENERATION_TOP_P", "1"),
      generation_max_output_tokens=os.getenv("ANALYSIS_SERVICE_GENERATION_MAX_OUTPUT_TOKENS", "1200"),
      log_level=os.getenv("ANALYSIS_SERVICE_LOG_LEVEL", "INFO").upper()
    )
  except ValidationError as exc:
    raise RuntimeError(f"Invalid service configuration: {exc}") from exc
