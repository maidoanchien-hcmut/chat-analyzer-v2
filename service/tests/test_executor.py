from __future__ import annotations

from dataclasses import dataclass

from analysis_executor import ConversationAnalysisExecutor, DeterministicAnalysisAdapter
from analysis_models import (
  AdapterResultModel,
  AnalysisOutputModel,
  RuntimeSnapshotModel,
  StaffAssessmentModel,
  UnitBundleModel,
)
from config import ServiceConfig


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
