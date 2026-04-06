from __future__ import annotations

from dataclasses import dataclass

import pytest

from analysis_executor import (
  ConversationAnalysisExecutor,
  DeterministicAnalysisAdapter,
  OpenAICompatibleAnalysisAdapter,
  build_effective_prompt_text,
  resolve_runtime_snapshot,
)
from analysis_models import (
  AdapterResultModel,
  AnalysisOutputModel,
  RuntimeSnapshotModel,
  StaffAssessmentModel,
  UnitBundleModel,
)
from config import ServiceConfig, load_config


def build_runtime() -> RuntimeSnapshotModel:
  return RuntimeSnapshotModel(
    profile_id="deterministic-dev",
    version_no=1,
    model_name="deterministic-dev",
    prompt_version="A",
    output_schema_version="conversation_analysis.v1",
    taxonomy_version="default.v1",
    page_prompt_text="Ưu tiên signal deterministic trước khi suy luận.",
    taxonomy_json={"categories": {}},
    generation_config={},
    profile_json={},
  )


def build_bundle(**overrides) -> UnitBundleModel:
  payload = {
    "thread_day_id": "thread-day-1",
    "thread_id": "thread-1",
    "connected_page_id": "page-1",
    "pipeline_run_id": "run-1",
    "run_group_id": "group-1",
    "target_date": "2026-04-05",
    "business_timezone": "Asia/Saigon",
    "customer_display_name": "Khách A",
    "normalized_tag_signals_json": {},
    "observed_tags_json": [],
    "opening_block_json": {},
    "first_meaningful_message_id": "msg-1",
    "first_meaningful_message_sender_role": "customer",
    "source_thread_json_redacted": {},
    "messages": [
      {
        "id": "msg-1",
        "inserted_at": "2026-04-05T00:00:00.000Z",
        "sender_role": "customer",
        "sender_name": "Khách A",
        "message_type": "text",
        "redacted_text": "Khách tái khám muốn đặt lịch",
        "is_meaningful_human_message": True,
        "is_opening_block_message": False,
      },
      {
        "id": "msg-2",
        "inserted_at": "2026-04-05T00:05:00.000Z",
        "sender_role": "staff_via_pancake",
        "sender_name": "Lan",
        "message_type": "text",
        "redacted_text": "Dạ em hỗ trợ mình đặt lịch nhé",
        "is_meaningful_human_message": True,
        "is_opening_block_message": False,
      },
    ],
    "first_meaningful_message_text_redacted": "Khách tái khám muốn đặt lịch",
    "explicit_revisit_signal": "revisit",
    "explicit_need_signal": "appointment_booking",
    "explicit_outcome_signal": "",
    "message_count": 2,
    "first_staff_response_seconds": 300,
    "avg_staff_response_seconds": 300,
    "staff_participants_json": ["Lan"],
  }
  payload.update(overrides)
  return UnitBundleModel.model_validate(payload)


def build_config() -> ServiceConfig:
  return ServiceConfig(
    grpc_host="0.0.0.0",
    grpc_port=50051,
    grpc_max_message_length=64 * 1024 * 1024,
    grpc_max_workers=8,
    runtime_mode="deterministic_dev",
    log_level="INFO",
  )


def test_revisit_signal_does_not_become_primary_need_code():
  executor = ConversationAnalysisExecutor(build_config(), DeterministicAnalysisAdapter(build_config()))

  results, _ = run(executor.analyze(build_runtime(), [build_bundle(explicit_need_signal="revisit")]))

  assert len(results) == 1
  result = results[0]
  assert result.journey_code == "revisit"
  assert result.primary_need_code == "unknown"
  assert result.result_status == "succeeded"
  assert result.failure_info_json is None


def test_staff_assessments_only_include_present_staff():
  executor = ConversationAnalysisExecutor(build_config(), DeterministicAnalysisAdapter(build_config()))

  results, _ = run(
    executor.analyze(
      build_runtime(),
      [
        build_bundle(
          staff_participants_json=["Lan"],
          messages=[
            {
              "id": "msg-1",
              "inserted_at": "2026-04-05T00:00:00.000Z",
              "sender_role": "customer",
              "sender_name": "Khách A",
              "message_type": "text",
              "redacted_text": "Em muốn đặt lịch",
              "is_meaningful_human_message": True,
              "is_opening_block_message": False,
            }
          ],
        )
      ],
    )
  )

  assert len(results[0].staff_assessments_json) == 1
  assert results[0].staff_assessments_json[0].staff_name == "Lan"


def test_staff_participants_object_array_is_accepted_as_canonical_contract():
  executor = ConversationAnalysisExecutor(build_config(), DeterministicAnalysisAdapter(build_config()))

  results, _ = run(
    executor.analyze(
      build_runtime(),
      [
        build_bundle(
          staff_participants_json=[
            {
              "staff_name": "Lan",
              "sender_source_id": "staff-1",
              "message_count": 2,
            }
          ],
          messages=[
            {
              "id": "msg-1",
              "inserted_at": "2026-04-05T00:00:00.000Z",
              "sender_role": "customer",
              "sender_name": "Khách A",
              "message_type": "text",
              "redacted_text": "Em muốn đặt lịch",
              "is_meaningful_human_message": True,
              "is_opening_block_message": False,
            }
          ],
        )
      ],
    )
  )

  assert len(results) == 1
  assert results[0].result_status == "succeeded"
  assert [item.staff_name for item in results[0].staff_assessments_json] == ["Lan"]


def test_invalid_outputs_fail_closed():
  executor = ConversationAnalysisExecutor(build_config(), InvalidAdapter())

  results, _ = run(executor.analyze(build_runtime(), [build_bundle()]))

  assert results[0].result_status == "failed"
  assert results[0].primary_need_code == "unknown"
  assert results[0].failure_info_json == {
    "reason": "invalid_output",
    "error": "primary_need_code cannot be revisit",
  }


@pytest.mark.parametrize(
  ("field_name", "field_value", "expected_error"),
  [
    ("provider_name", None, "provider_name"),
    ("provider_base_url", " ", "provider_base_url"),
    ("provider_api_key", "", "provider_api_key"),
    ("provider_model", " ", "provider_model"),
  ],
)
def test_live_runtime_requires_explicit_provider_contract(field_name, field_value, expected_error):
  payload = {
    "grpc_host": "0.0.0.0",
    "grpc_port": 50051,
    "grpc_max_message_length": 64 * 1024 * 1024,
    "grpc_max_workers": 8,
    "runtime_mode": "openai_compatible_live",
    "provider_name": "openai_compatible",
    "provider_base_url": "https://example.test/v1",
    "provider_api_key": "secret-key",
    "provider_model": "gpt-live",
    "log_level": "INFO",
  }
  payload[field_name] = field_value

  with pytest.raises(Exception, match=expected_error):
    ServiceConfig(**payload)


def test_live_runtime_rejects_unknown_provider_name():
  with pytest.raises(Exception, match="provider_name=openai_compatible"):
    ServiceConfig(
      grpc_host="0.0.0.0",
      grpc_port=50051,
      grpc_max_message_length=64 * 1024 * 1024,
      grpc_max_workers=8,
      runtime_mode="openai_compatible_live",
      provider_name="other_provider",
      provider_base_url="https://example.test/v1",
      provider_api_key="secret-key",
      provider_model="gpt-live",
      log_level="INFO",
    )


def test_load_config_fails_closed_for_live_runtime_without_required_provider_fields(monkeypatch):
  monkeypatch.setenv("ANALYSIS_SERVICE_RUNTIME_MODE", "openai_compatible_live")
  monkeypatch.delenv("ANALYSIS_SERVICE_PROVIDER_NAME", raising=False)
  monkeypatch.setenv("ANALYSIS_SERVICE_PROVIDER_BASE_URL", "https://example.test/v1")
  monkeypatch.setenv("ANALYSIS_SERVICE_PROVIDER_API_KEY", "secret-key")
  monkeypatch.setenv("ANALYSIS_SERVICE_PROVIDER_MODEL", "gpt-live")

  with pytest.raises(RuntimeError, match="provider_name"):
    load_config()


def test_load_config_allows_deterministic_dev_without_live_provider_fields(monkeypatch):
  monkeypatch.setenv("ANALYSIS_SERVICE_RUNTIME_MODE", "deterministic_dev")
  monkeypatch.delenv("ANALYSIS_SERVICE_PROVIDER_NAME", raising=False)
  monkeypatch.delenv("ANALYSIS_SERVICE_PROVIDER_BASE_URL", raising=False)
  monkeypatch.delenv("ANALYSIS_SERVICE_PROVIDER_API_KEY", raising=False)
  monkeypatch.delenv("ANALYSIS_SERVICE_PROVIDER_MODEL", raising=False)

  config = load_config()

  assert config.runtime_mode == "deterministic_dev"
  assert config.resolve_provider_name() == "deterministic_dev"


def test_runtime_metadata_uses_resolved_provider_model_and_generation_config():
  runtime = build_runtime().model_copy(update={
    "model_name": "service-managed",
    "generation_config": {
      "temperature": 0.3,
    },
  })
  config = build_config()
  executor = ConversationAnalysisExecutor(config, DeterministicAnalysisAdapter(config))

  results, metadata = run(executor.analyze(runtime, [build_bundle()]))

  assert len(results) == 1
  assert metadata.runtime_mode == "deterministic_dev"
  assert metadata.provider == "deterministic_dev"
  assert metadata.model_name == "deterministic-dev"
  assert metadata.system_prompt_version == "service_system.v2"
  assert metadata.generation_config == {
    "temperature": 0.3,
    "top_p": 1.0,
    "max_output_tokens": 1200,
  }
  assert results[0].usage_json["provider"] == "deterministic_dev"
  assert results[0].usage_json["runtime_mode"] == "deterministic_dev"
  assert results[0].usage_json["model_name"] == "deterministic-dev"


def test_live_adapter_uses_shared_prompt_builder_and_returns_usage_metadata():
  captured: dict[str, object] = {}
  config = ServiceConfig(
    grpc_host="0.0.0.0",
    grpc_port=50051,
    grpc_max_message_length=64 * 1024 * 1024,
    grpc_max_workers=8,
    runtime_mode="openai_compatible_live",
    provider_name="openai_compatible",
    provider_base_url="https://example.test/v1",
    provider_api_key="secret-key",
    provider_model="gpt-live",
    request_timeout_seconds=15,
    generation_temperature=0.1,
    generation_max_output_tokens=900,
    log_level="INFO",
  )
  runtime = resolve_runtime_snapshot(build_runtime(), config)
  bundle = build_bundle()
  expected_prompt = build_effective_prompt_text(runtime)
  adapter = OpenAICompatibleAnalysisAdapter(config, transport=stub_transport(captured))
  executor = ConversationAnalysisExecutor(config, adapter)

  results, metadata = run(executor.analyze(build_runtime(), [bundle]))

  assert metadata.runtime_mode == "openai_compatible_live"
  assert metadata.provider == "openai_compatible"
  assert metadata.model_name == "gpt-live"
  assert metadata.generation_config == {
    "temperature": 0.1,
    "top_p": 1.0,
    "max_output_tokens": 900,
  }
  assert captured["url"] == "https://example.test/v1/chat/completions"
  assert captured["headers"] == {
    "Authorization": "Bearer secret-key",
    "Content-Type": "application/json",
  }
  assert captured["timeout"] == 15
  payload = captured["payload"]
  assert isinstance(payload, dict)
  assert payload["model"] == "gpt-live"
  assert payload["temperature"] == 0.1
  assert payload["top_p"] == 1.0
  assert payload["max_tokens"] == 900
  assert payload["messages"][0]["content"] == expected_prompt
  assert "UNIT_BUNDLE_JSON" in payload["messages"][1]["content"]
  assert results[0].result_status == "succeeded"
  assert results[0].primary_need_code == "appointment_booking"
  assert results[0].usage_json["provider"] == "openai_compatible"
  assert results[0].usage_json["runtime_mode"] == "openai_compatible_live"
  assert results[0].usage_json["model_name"] == "gpt-live"
  assert results[0].usage_json["prompt_tokens"] == 123
  assert results[0].cost_micros == 456


@dataclass(slots=True)
class InvalidAdapter:
  async def analyze_bundle(self, runtime, bundle, prompt_hash, effective_prompt_text):
    return AdapterResultModel(
      status="succeeded",
      output=AnalysisOutputModel(
        primary_need_code="revisit",
        primary_topic_code="revisit",
        journey_code="revisit",
        opening_theme_code="revisit",
        customer_mood_code="neutral",
        closing_outcome_inference_code="unknown",
        process_risk_level_code="low",
        staff_assessments_json=[
          StaffAssessmentModel(
            staff_name="Ghost",
            response_quality_code="strong",
          )
        ],
      ),
      usage_json={},
      cost_micros=0,
    )


def run(coro):
  import asyncio

  return asyncio.run(coro)


def stub_transport(captured: dict[str, object]):
  def transport(url, headers, payload, timeout_seconds):
    captured["url"] = url
    captured["headers"] = headers
    captured["payload"] = payload
    captured["timeout"] = timeout_seconds
    return {
      "choices": [
        {
          "message": {
            "content": """
            {
              "opening_theme_code": "appointment_booking",
              "opening_theme_reason": "Khách tái khám muốn đặt lịch",
              "customer_mood_code": "neutral",
              "primary_need_code": "appointment_booking",
              "primary_topic_code": "appointment_booking",
              "journey_code": "revisit",
              "closing_outcome_inference_code": "follow_up",
              "process_risk_level_code": "low",
              "staff_assessments_json": [
                {
                  "staff_name": "Lan",
                  "response_quality_code": "adequate",
                  "issue_text": null,
                  "improvement_text": null
                }
              ],
              "evidence_used_json": {
                "source": "live-provider"
              },
              "field_explanations_json": {
                "primary_need_code": "explicit_or_inference=explicit"
              },
              "supporting_message_ids_json": ["msg-1", "msg-2"]
            }
            """
          }
        }
      ],
      "usage": {
        "prompt_tokens": 123,
        "completion_tokens": 45,
      },
      "cost_micros": 456,
    }

  return transport
