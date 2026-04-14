from __future__ import annotations

import asyncio
import logging
import secrets

import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from analysis_executor import ConversationAnalysisExecutor, build_analysis_adapter
from analysis_models import AnalyzeConversationRequestModel, AnalyzeConversationResponseModel
from config import load_config


def create_app(
  config = None,
  executor: ConversationAnalysisExecutor | None = None,
) -> FastAPI:
  resolved_config = config or load_config()
  resolved_executor = executor or ConversationAnalysisExecutor(
    config=resolved_config,
    adapter=build_analysis_adapter(resolved_config),
  )
  app = FastAPI()

  @app.middleware("http")
  async def max_request_size_guard(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit():
      if int(content_length) > resolved_config.http_max_request_bytes:
        return JSONResponse(
          status_code=413,
          content={"detail": "request body too large"},
        )
    return await call_next(request)

  def require_internal_secret(authorization: str | None = Header(default=None)):
    expected = f"Bearer {resolved_config.shared_secret}"
    if authorization is None or not secrets.compare_digest(authorization, expected):
      raise HTTPException(status_code=401, detail="unauthorized")

  @app.get("/health")
  async def health():
    return {
      "status": "ok",
      "runtime_mode": resolved_config.runtime_mode,
      "provider": resolved_config.resolve_provider_name(),
      "model_name": resolved_config.resolve_model_name(),
    }

  @app.post("/internal/analyze", response_model=AnalyzeConversationResponseModel)
  async def analyze_conversation(
    request: AnalyzeConversationRequestModel,
    _authorized: None = Depends(require_internal_secret),
  ):
    results, metadata = await resolved_executor.analyze(request.runtime, request.bundles)
    return AnalyzeConversationResponseModel(
      results=results,
      runtime_metadata_json=metadata.model_dump(),
    )

  return app


def serve() -> None:
  config = load_config()
  logging.basicConfig(
    level=getattr(logging, config.log_level, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
  )
  app = create_app(config=config)
  logging.getLogger(__name__).info(
    "Analysis service listening at %s (runtime_mode=%s, provider=%s, model=%s)",
    f"http://{config.http_host}:{config.http_port}",
    config.runtime_mode,
    config.resolve_provider_name(),
    config.resolve_model_name(),
  )
  uvicorn.run(app, host=config.http_host, port=config.http_port, log_level=config.log_level.lower())


if __name__ == "__main__":
  serve()
