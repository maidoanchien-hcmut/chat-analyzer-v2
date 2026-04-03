from __future__ import annotations

import hashlib
import json
import logging
import os
import uuid
from dataclasses import dataclass
from typing import Any

from google.adk.agents import LlmAgent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types as genai_types
from pydantic import BaseModel, Field

from config import ServiceConfig

logger = logging.getLogger(__name__)


class RuntimeSnapshotModel(BaseModel):
  profile_id: str
  version_no: int
  model_name: str
  output_schema_version: str
  prompt_template: str = ""
  generation_config: dict[str, Any] = Field(default_factory=dict)
  profile_json: Any = None


class MessageModel(BaseModel):
  id: str
  inserted_at: str
  sender_role: str
  sender_name: str | None = None
  message_type: str
  redacted_text: str | None = None
  is_meaningful_human_message: bool = False
  is_opening_block_message: bool = False


class UnitBundleModel(BaseModel):
  conversation_day_id: str
  conversation_id: str
  connected_page_id: str
  etl_run_id: str
  run_group_id: str
  target_date: str
  business_timezone: str
  customer_display_name: str | None = None
  normalized_tag_signals_json: Any = None
  observed_tags_json: Any = None
  opening_blocks_json: Any = None
  first_meaningful_human_message_id: str | None = None
  first_meaningful_human_sender_role: str | None = None
  source_conversation_json_redacted: Any = None
  messages: list[MessageModel] = Field(default_factory=list)


class AnalysisOutputModel(BaseModel):
  opening_theme: str = "unknown"
  customer_mood: str = "unknown"
  primary_need: str = "unknown"
  primary_topic: str = "unknown"
  content_customer_type: str = "unknown"
  closing_outcome_as_of_day: str = "unknown"
  response_quality_label: str = "unknown"
  process_risk_level: str = "unknown"
  response_quality_issue_text: str | None = None
  response_quality_improvement_text: str | None = None
  process_risk_reason_text: str | None = None


class ServiceResultModel(BaseModel):
  conversation_day_id: str
  result_status: str
  prompt_hash: str
  opening_theme: str
  customer_mood: str
  primary_need: str
  primary_topic: str
  content_customer_type: str
  closing_outcome_as_of_day: str
  response_quality_label: str
  process_risk_level: str
  response_quality_issue_text: str | None = None
  response_quality_improvement_text: str | None = None
  process_risk_reason_text: str | None = None
  usage_json: dict[str, Any] = Field(default_factory=dict)
  cost_micros: int = 0
  failure_info_json: dict[str, Any] | None = None


@dataclass(slots=True)
class ConversationAnalysisEngine:
  config: ServiceConfig

  async def analyze(self, runtime: RuntimeSnapshotModel, bundles: list[UnitBundleModel]) -> list[ServiceResultModel]:
    if self._should_use_adk():
      results: list[ServiceResultModel] = []
      for bundle in bundles:
        try:
          results.append(await self._analyze_with_adk(runtime, bundle))
        except Exception as exc:  # pragma: no cover
          logger.exception("ADK analysis failed for conversation_day_id=%s", bundle.conversation_day_id)
          results.append(self._build_unknown_result(runtime, bundle, "adk_runtime_error", str(exc)))
      return results

    return [self._build_fallback_result(runtime, bundle) for bundle in bundles]

  def _should_use_adk(self) -> bool:
    if not self.config.use_adk:
      return False
    return bool(
      _non_empty_env("GOOGLE_API_KEY")
      or (_non_empty_env("GOOGLE_CLOUD_PROJECT") and _non_empty_env("GOOGLE_CLOUD_LOCATION"))
      or _non_empty_env("GOOGLE_GENAI_USE_VERTEXAI")
    )

  async def _analyze_with_adk(self, runtime: RuntimeSnapshotModel, bundle: UnitBundleModel) -> ServiceResultModel:
    session_service = InMemorySessionService()
    agent = LlmAgent(
      name="conversation_analysis",
      model=runtime.model_name,
      instruction=self._build_instruction(runtime),
      output_schema=AnalysisOutputModel,
      output_key="analysis_result",
      generate_content_config=self._build_generate_content_config(runtime.generation_config)
    )
    runner = Runner(
      app_name=self.config.adk_app_name,
      agent=agent,
      session_service=session_service
    )
    session = await session_service.create_session(
      app_name=self.config.adk_app_name,
      user_id="system",
      session_id=str(uuid.uuid4())
    )

    async for _event in runner.run_async(
      user_id="system",
      session_id=session.id,
      new_message=genai_types.UserContent(parts=[genai_types.Part(text=self._build_user_prompt(bundle))])
    ):
      pass

    updated_session = await session_service.get_session(
      app_name=self.config.adk_app_name,
      user_id="system",
      session_id=session.id
    )
    raw_result = None if updated_session is None else updated_session.state.get("analysis_result")
    if raw_result is None:
      raise RuntimeError("ADK session did not produce analysis_result output.")

    output = AnalysisOutputModel.model_validate(raw_result)
    return self._build_success_result(runtime, bundle, output, provider="google_adk")

  def _build_instruction(self, runtime: RuntimeSnapshotModel) -> str:
    base_instruction = """
Bạn là AI runtime của chat-analyzer-v2 cho bài toán conversation-analysis ở grain 1 conversation_day.
Chỉ dùng evidence có trong payload. Ưu tiên opening block, deterministic signals và tag signals trước transcript.
Không được suy luận hay trả về nhãn inbox mới/inbox cũ. Không được rewrite truth của Seam 1.
Mỗi chiều business phải trả đúng 1 scalar.

Quy ước:
- content_customer_type: kh_moi | tai_kham | unknown
- customer_mood: positive | neutral | negative | unknown
- closing_outcome_as_of_day: booked | follow_up | not_closed | unknown
- response_quality_label: strong | adequate | needs_attention | unknown
- process_risk_level: low | medium | high | unknown

Nếu evidence yếu hoặc mâu thuẫn, dùng unknown thay vì bịa thêm.
Các text hỗ trợ phải ngắn, hành động được, và có thể để null nếu không cần.
""".strip()
    if runtime.prompt_template.strip():
      return f"{base_instruction}\n\nYêu cầu profile theo page:\n{runtime.prompt_template.strip()}"
    return base_instruction

  def _build_user_prompt(self, bundle: UnitBundleModel) -> str:
    payload = {
      "conversation_day_id": bundle.conversation_day_id,
      "conversation_id": bundle.conversation_id,
      "connected_page_id": bundle.connected_page_id,
      "target_date": bundle.target_date,
      "business_timezone": bundle.business_timezone,
      "customer_display_name": bundle.customer_display_name,
      "first_meaningful_human_message_id": bundle.first_meaningful_human_message_id,
      "first_meaningful_human_sender_role": bundle.first_meaningful_human_sender_role,
      "normalized_tag_signals_json": bundle.normalized_tag_signals_json,
      "observed_tags_json": bundle.observed_tags_json,
      "opening_blocks_json": bundle.opening_blocks_json,
      "source_conversation_json_redacted": bundle.source_conversation_json_redacted,
      "messages": [message.model_dump(mode="json") for message in bundle.messages]
    }
    return "\n".join([
      "Phân tích 1 conversation_day và trả đúng JSON theo output schema.",
      "Không thêm markdown, không giải thích ngoài JSON.",
      json.dumps(payload, ensure_ascii=False)
    ])

  def _build_generate_content_config(self, raw_config: dict[str, Any]) -> genai_types.GenerateContentConfig | None:
    if not raw_config:
      return None
    allowed_keys = set(genai_types.GenerateContentConfig.model_fields.keys()) - {"response_mime_type", "response_schema"}
    payload = {
      key: value
      for key, value in raw_config.items()
      if key in allowed_keys and value is not None
    }
    if not payload:
      return None
    return genai_types.GenerateContentConfig(**payload)

  def _build_success_result(
    self,
    runtime: RuntimeSnapshotModel,
    bundle: UnitBundleModel,
    output: AnalysisOutputModel,
    *,
    provider: str
  ) -> ServiceResultModel:
    normalized = _normalize_output(output)
    return ServiceResultModel(
      conversation_day_id=bundle.conversation_day_id,
      result_status="succeeded" if bundle.messages else "unknown",
      prompt_hash=_build_prompt_hash(runtime, bundle.conversation_day_id),
      opening_theme=normalized.opening_theme,
      customer_mood=normalized.customer_mood,
      primary_need=normalized.primary_need,
      primary_topic=normalized.primary_topic,
      content_customer_type=normalized.content_customer_type,
      closing_outcome_as_of_day=normalized.closing_outcome_as_of_day,
      response_quality_label=normalized.response_quality_label,
      process_risk_level=normalized.process_risk_level,
      response_quality_issue_text=normalized.response_quality_issue_text,
      response_quality_improvement_text=normalized.response_quality_improvement_text,
      process_risk_reason_text=normalized.process_risk_reason_text,
      usage_json={
        "provider": provider,
        "model_name": runtime.model_name,
        "token_estimate": _estimate_token_count(bundle)
      },
      cost_micros=0,
      failure_info_json=None if bundle.messages else {"reason": "empty_transcript"}
    )

  def _build_fallback_result(self, runtime: RuntimeSnapshotModel, bundle: UnitBundleModel) -> ServiceResultModel:
    transcript = "\n".join(
      [message.redacted_text.strip() for message in bundle.messages if message.redacted_text and message.redacted_text.strip()]
    ).lower()
    opening_signals = _read_array_map(bundle.opening_blocks_json, "deterministic_signals")
    tag_signals = _as_object(bundle.normalized_tag_signals_json)
    has_staff = any(message.sender_role == "staff_via_pancake" for message in bundle.messages)
    has_customer = any(message.sender_role == "customer" for message in bundle.messages)
    primary_need = (
      _first_signal_value(tag_signals, "need")
      or _keyword_match(transcript, ["đặt lịch", "lịch hẹn"], "booking")
      or _keyword_match(transcript, ["tư vấn", "consult"], "consultation")
      or "unknown"
    )
    process_risk_level = "high" if (not has_staff and has_customer) else _keyword_match(transcript, ["không trả lời", "seen"], "medium") or "low"

    return ServiceResultModel(
      conversation_day_id=bundle.conversation_day_id,
      result_status="succeeded" if bundle.messages else "unknown",
      prompt_hash=_build_prompt_hash(runtime, bundle.conversation_day_id),
      opening_theme=_first_opening_theme(bundle) or primary_need,
      customer_mood=_keyword_match(transcript, ["không hài lòng", "bực", "khó chịu"], "negative")
      or _keyword_match(transcript, ["cảm ơn", "ok", "ổn"], "positive")
      or "neutral",
      primary_need=primary_need,
      primary_topic=primary_need,
      content_customer_type=_resolve_customer_type(opening_signals, tag_signals, transcript),
      closing_outcome_as_of_day=_keyword_match(transcript, ["đã đặt lịch", "hẹn lúc"], "booked")
      or _keyword_match(transcript, ["để em gọi", "liên hệ sau"], "follow_up")
      or "unknown",
      response_quality_label="needs_attention" if not has_staff else "adequate" if has_customer else "unknown",
      process_risk_level=process_risk_level,
      response_quality_issue_text="Chưa thấy phản hồi từ nhân viên trong slice ngày này." if not has_staff and has_customer else None,
      response_quality_improvement_text="Cần đảm bảo có phản hồi đầu tiên từ nhân viên trong ngày để tránh rơi lead." if not has_staff and has_customer else None,
      process_risk_reason_text="Khách có nhắn nhưng chưa thấy nhân viên phản hồi trong snapshot ngày." if process_risk_level == "high" else None,
      usage_json={
        "provider": "fallback_local",
        "model_name": runtime.model_name,
        "token_estimate": _estimate_token_count(bundle)
      },
      cost_micros=0,
      failure_info_json=None if bundle.messages else {"reason": "empty_transcript"}
    )

  def _build_unknown_result(
    self,
    runtime: RuntimeSnapshotModel,
    bundle: UnitBundleModel,
    reason: str,
    detail: str | None = None
  ) -> ServiceResultModel:
    failure_info = {"reason": reason}
    if detail:
      failure_info["detail"] = detail
    return ServiceResultModel(
      conversation_day_id=bundle.conversation_day_id,
      result_status="unknown",
      prompt_hash=_build_prompt_hash(runtime, bundle.conversation_day_id),
      opening_theme="unknown",
      customer_mood="unknown",
      primary_need="unknown",
      primary_topic="unknown",
      content_customer_type="unknown",
      closing_outcome_as_of_day="unknown",
      response_quality_label="unknown",
      process_risk_level="unknown",
      usage_json={
        "provider": "google_adk" if self.config.use_adk else "fallback_local",
        "model_name": runtime.model_name,
        "token_estimate": _estimate_token_count(bundle)
      },
      cost_micros=0,
      failure_info_json=failure_info
    )


def _build_prompt_hash(runtime: RuntimeSnapshotModel, conversation_day_id: str) -> str:
  payload = json.dumps(
    {
      "prompt_template": runtime.prompt_template,
      "output_schema_version": runtime.output_schema_version,
      "conversation_day_id": conversation_day_id,
    },
    ensure_ascii=False,
    sort_keys=True,
  )
  return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _normalize_output(output: AnalysisOutputModel) -> AnalysisOutputModel:
  return AnalysisOutputModel(
    opening_theme=_normalize_free_text(output.opening_theme),
    customer_mood=_normalize_enum(output.customer_mood, {"positive", "neutral", "negative"}, "unknown"),
    primary_need=_normalize_free_text(output.primary_need),
    primary_topic=_normalize_free_text(output.primary_topic),
    content_customer_type=_normalize_enum(output.content_customer_type, {"kh_moi", "tai_kham"}, "unknown"),
    closing_outcome_as_of_day=_normalize_enum(output.closing_outcome_as_of_day, {"booked", "follow_up", "not_closed"}, "unknown"),
    response_quality_label=_normalize_enum(output.response_quality_label, {"strong", "adequate", "needs_attention"}, "unknown"),
    process_risk_level=_normalize_enum(output.process_risk_level, {"low", "medium", "high"}, "unknown"),
    response_quality_issue_text=_normalize_nullable_text(output.response_quality_issue_text),
    response_quality_improvement_text=_normalize_nullable_text(output.response_quality_improvement_text),
    process_risk_reason_text=_normalize_nullable_text(output.process_risk_reason_text),
  )


def _normalize_free_text(value: str) -> str:
  normalized = value.strip()
  return normalized if normalized else "unknown"


def _normalize_nullable_text(value: str | None) -> str | None:
  if value is None:
    return None
  normalized = value.strip()
  return normalized or None


def _normalize_enum(value: str, allowed: set[str], default: str) -> str:
  normalized = value.strip().lower()
  return normalized if normalized in allowed else default


def _as_object(value: Any) -> dict[str, Any]:
  return value if isinstance(value, dict) else {}


def _read_array_map(value: Any, key: str) -> dict[str, Any]:
  raw = _as_object(value).get(key)
  return raw if isinstance(raw, dict) else {}


def _first_signal_value(mapping: dict[str, Any], key: str) -> str | None:
  raw = mapping.get(key)
  if isinstance(raw, list) and raw and isinstance(raw[0], str):
    return raw[0]
  return None


def _resolve_customer_type(opening_signals: dict[str, Any], tag_signals: dict[str, Any], transcript: str) -> str:
  opening_customer_type = _first_signal_value(opening_signals, "customer_type")
  if opening_customer_type in {"revisit", "tai_kham"}:
    return "tai_kham"
  if opening_customer_type in {"first_time", "kh_moi"}:
    return "kh_moi"

  tag_customer_type = (_first_signal_value(tag_signals, "customer_type") or "").lower()
  if "tái khám" in tag_customer_type or "tai" in tag_customer_type:
    return "tai_kham"
  if "mới" in tag_customer_type or "moi" in tag_customer_type:
    return "kh_moi"
  if "tái khám" in transcript or "tai kham" in transcript:
    return "tai_kham"
  if "lần đầu" in transcript or "khách mới" in transcript:
    return "kh_moi"
  return "unknown"


def _keyword_match(haystack: str, keywords: list[str], value: str) -> str | None:
  return value if any(keyword in haystack for keyword in keywords) else None


def _first_opening_theme(bundle: UnitBundleModel) -> str | None:
  opening = _as_object(bundle.opening_blocks_json)
  matched_selections = opening.get("matched_selections")
  if isinstance(matched_selections, list):
    for selection in matched_selections:
      if isinstance(selection, dict):
        raw_text = selection.get("raw_text")
        if isinstance(raw_text, str) and raw_text.strip():
          return raw_text.strip()
  for message in bundle.messages:
    if message.is_meaningful_human_message and message.redacted_text and message.redacted_text.strip():
      return message.redacted_text.strip()
  return None


def _estimate_token_count(bundle: UnitBundleModel) -> int:
  text_length = sum(len(message.redacted_text or "") for message in bundle.messages)
  return max(1, round(text_length / 4)) if text_length > 0 else 0


def _non_empty_env(name: str) -> str | None:
  value = os.getenv(name)
  return value if value and value.strip() else None
