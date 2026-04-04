from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field

from config import ServiceConfig


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
  thread_day_id: str
  thread_id: str
  connected_page_id: str
  pipeline_run_id: str
  run_group_id: str
  target_date: str
  business_timezone: str
  customer_display_name: str | None = None
  normalized_tag_signals_json: Any = None
  observed_tags_json: Any = None
  opening_block_json: Any = None
  first_meaningful_message_id: str | None = None
  first_meaningful_message_sender_role: str | None = None
  source_thread_json_redacted: Any = None
  messages: list[MessageModel] = Field(default_factory=list)


class AnalysisOutputModel(BaseModel):
  opening_theme_code: str = "unknown"
  opening_theme_reason: str | None = None
  customer_mood_code: str = "unknown"
  primary_need_code: str = "unknown"
  primary_topic_code: str = "unknown"
  journey_code: str = "unknown"
  closing_outcome_inference_code: str = "unknown"
  process_risk_level_code: str = "unknown"
  process_risk_reason_text: str | None = None
  staff_assessments_json: list[dict[str, Any]] = Field(default_factory=list)
  evidence_used_json: dict[str, Any] = Field(default_factory=dict)
  field_explanations_json: dict[str, Any] = Field(default_factory=dict)
  supporting_message_ids_json: list[str] = Field(default_factory=list)


class ServiceResultModel(BaseModel):
  thread_day_id: str
  result_status: str
  prompt_hash: str
  opening_theme_code: str
  opening_theme_reason: str | None = None
  customer_mood_code: str
  primary_need_code: str
  primary_topic_code: str
  journey_code: str
  closing_outcome_inference_code: str
  process_risk_level_code: str
  process_risk_reason_text: str | None = None
  staff_assessments_json: list[dict[str, Any]] = Field(default_factory=list)
  evidence_used_json: dict[str, Any] = Field(default_factory=dict)
  field_explanations_json: dict[str, Any] = Field(default_factory=dict)
  supporting_message_ids_json: list[str] = Field(default_factory=list)
  usage_json: dict[str, Any] = Field(default_factory=dict)
  cost_micros: int = 0
  failure_info_json: dict[str, Any] | None = None


SYSTEM_PROMPT_CONVERSATION_ANALYSIS = """Bạn là AI nhà phân tích hội thoại sales/cskh của hệ thống chat-analyzer cho một công ty duy nhất.

Vai trò cố định:
- Chỉ làm nhiệm vụ phân tích và đánh giá tuân thủ vận hành trong hội thoại.
- Không nhập vai nhân viên tư vấn hoặc chatbot trả lời khách hàng.
- Không tạo thông tin ngoài evidence.
- Luôn ưu tiên evidence deterministic từ extraction seam trước khi suy luận.

Trọng tâm đánh giá:
- Đánh giá nhân viên có làm đúng quy trình vận hành của page hay không.
- Chỉ ra lỗi thao tác, thiếu bước, và dấu hiệu vi phạm quy định nếu có.
- Nêu gợi ý cải thiện ngắn gọn, có thể hành động.

Nguyên tắc bắt buộc:
- Output phải ngắn gọn, rõ nghĩa, dùng được cho vận hành.
- Khi thiếu dữ liệu hoặc quy trình page chưa đủ rõ, trả về "unknown" thay vì suy đoán.
- Tôn trọng boundary ngày và snapshot; không trộn ngữ cảnh ngoài unit được cung cấp."""


@dataclass(slots=True)
class ConversationAnalysisEngine:
  config: ServiceConfig

  async def analyze(self, runtime: RuntimeSnapshotModel, bundles: list[UnitBundleModel]) -> list[ServiceResultModel]:
    effective_runtime = _with_system_prompt(runtime)
    prompt_hash = _build_prompt_hash(effective_runtime)
    return [self._build_heuristic_result(effective_runtime, bundle, prompt_hash) for bundle in bundles]

  def _build_heuristic_result(
    self,
    runtime: RuntimeSnapshotModel,
    bundle: UnitBundleModel,
    prompt_hash: str,
  ) -> ServiceResultModel:
    analysis_messages = [message for message in bundle.messages if not message.is_opening_block_message]
    transcript = "\n".join(
      [message.redacted_text.strip() for message in analysis_messages if message.redacted_text and message.redacted_text.strip()]
    ).lower()
    opening_signals = _collect_explicit_signals(bundle.opening_block_json)
    tag_signals = _as_object(bundle.normalized_tag_signals_json)
    staff_messages = [message for message in analysis_messages if message.sender_role == "staff_via_pancake"]
    customer_messages = [message for message in analysis_messages if message.sender_role == "customer"]

    primary_need_code = (
      _normalize_code(_first_signal_value(tag_signals, "need"))
      or _keyword_match(transcript, ["đặt lịch", "lịch hẹn"], "appointment_booking")
      or _keyword_match(transcript, ["tư vấn", "consult"], "consultation")
      or "unknown"
    )
    opening_theme_reason = _first_opening_reason(bundle)
    process_risk_level_code = (
      "high"
      if (not staff_messages and customer_messages)
      else _keyword_match(transcript, ["không trả lời", "seen"], "medium")
      or "low"
    )

    output = AnalysisOutputModel(
      opening_theme_code=_normalize_code(opening_theme_reason) or primary_need_code,
      opening_theme_reason=_normalize_nullable_text(opening_theme_reason),
      customer_mood_code=_keyword_match(transcript, ["không hài lòng", "bực", "khó chịu"], "negative")
      or _keyword_match(transcript, ["cảm ơn", "ok", "ổn"], "positive")
      or "neutral",
      primary_need_code=primary_need_code,
      primary_topic_code=primary_need_code,
      journey_code=_resolve_journey_code(opening_signals, tag_signals, transcript),
      closing_outcome_inference_code=_keyword_match(transcript, ["đã đặt lịch", "hẹn lúc"], "appointment_booked")
      or _keyword_match(transcript, ["để em gọi", "liên hệ sau"], "follow_up")
      or "unknown",
      process_risk_level_code=process_risk_level_code,
      process_risk_reason_text="Khách có nhắn nhưng chưa thấy nhân viên phản hồi trong snapshot ngày."
      if process_risk_level_code == "high"
      else None,
      staff_assessments_json=_build_staff_assessments(staff_messages, customer_messages),
      evidence_used_json=_build_evidence(bundle, opening_signals, tag_signals, staff_messages),
      field_explanations_json=_build_field_explanations(
        opening_theme_reason,
        primary_need_code,
        process_risk_level_code,
        staff_messages,
        customer_messages,
      ),
      supporting_message_ids_json=_build_supporting_message_ids(analysis_messages),
    )
    normalized = _normalize_output(output)

    return ServiceResultModel(
      thread_day_id=bundle.thread_day_id,
      result_status="succeeded" if bundle.messages else "unknown",
      prompt_hash=prompt_hash,
      opening_theme_code=normalized.opening_theme_code,
      opening_theme_reason=normalized.opening_theme_reason,
      customer_mood_code=normalized.customer_mood_code,
      primary_need_code=normalized.primary_need_code,
      primary_topic_code=normalized.primary_topic_code,
      journey_code=normalized.journey_code,
      closing_outcome_inference_code=normalized.closing_outcome_inference_code,
      process_risk_level_code=normalized.process_risk_level_code,
      process_risk_reason_text=normalized.process_risk_reason_text,
      staff_assessments_json=normalized.staff_assessments_json,
      evidence_used_json=normalized.evidence_used_json,
      field_explanations_json=normalized.field_explanations_json,
      supporting_message_ids_json=normalized.supporting_message_ids_json,
      usage_json={
        "provider": self.config.runtime_mode,
        "model_name": runtime.model_name,
        "token_estimate": _estimate_token_count(analysis_messages)
      },
      cost_micros=0,
      failure_info_json=None if bundle.messages else {"reason": "empty_transcript"}
    )


def _build_prompt_hash(runtime: RuntimeSnapshotModel) -> str:
  payload = json.dumps(
    {
      "prompt_template": runtime.prompt_template,
      "output_schema_version": runtime.output_schema_version,
      "model_name": runtime.model_name,
      "generation_config": runtime.generation_config,
    },
    ensure_ascii=False,
    sort_keys=True,
  )
  return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _with_system_prompt(runtime: RuntimeSnapshotModel) -> RuntimeSnapshotModel:
  page_rules = runtime.prompt_template.strip()
  if page_rules:
    merged = f"{SYSTEM_PROMPT_CONVERSATION_ANALYSIS}\n\n[PAGE_OPERATIONAL_RULES]\n{page_rules}"
  else:
    merged = (
      f"{SYSTEM_PROMPT_CONVERSATION_ANALYSIS}\n\n"
      "[PAGE_OPERATIONAL_RULES]\n"
      "Không có quy trình vận hành riêng cho page; chỉ áp dụng quy tắc hệ thống."
    )
  return runtime.model_copy(update={"prompt_template": merged})


def _normalize_output(output: AnalysisOutputModel) -> AnalysisOutputModel:
  return AnalysisOutputModel(
    opening_theme_code=_normalize_code(output.opening_theme_code) or "unknown",
    opening_theme_reason=_normalize_nullable_text(output.opening_theme_reason),
    customer_mood_code=_normalize_enum(
      output.customer_mood_code,
      {"positive", "neutral", "negative"},
      "unknown",
      aliases={
        "tich_cuc": "positive",
        "tot": "positive",
        "xau": "negative",
        "tieu_cuc": "negative",
        "binh_thuong": "neutral",
      },
    ),
    primary_need_code=_normalize_code(output.primary_need_code) or "unknown",
    primary_topic_code=_normalize_code(output.primary_topic_code) or "unknown",
    journey_code=_normalize_enum(
      output.journey_code,
      {"new_to_clinic", "revisit"},
      "unknown",
      aliases={
        "kh_moi": "new_to_clinic",
        "khach_moi": "new_to_clinic",
        "lan_dau": "new_to_clinic",
        "first_time": "new_to_clinic",
        "new_customer": "new_to_clinic",
        "tai_kham": "revisit",
        "khach_tai_kham": "revisit",
        "returning_customer": "revisit",
      },
    ),
    closing_outcome_inference_code=_normalize_enum(
      output.closing_outcome_inference_code,
      {"appointment_booked", "follow_up", "not_closed"},
      "unknown",
      aliases={
        "booked": "appointment_booked",
        "booking": "appointment_booked",
        "da_chot_hen": "appointment_booked",
        "followup": "follow_up",
        "follow_up_later": "follow_up",
        "chua_chot": "not_closed",
        "not_booked": "not_closed",
      },
    ),
    process_risk_level_code=_normalize_enum(
      output.process_risk_level_code,
      {"low", "medium", "high"},
      "unknown",
      aliases={
        "thap": "low",
        "trung_binh": "medium",
        "cao": "high",
      },
    ),
    process_risk_reason_text=_normalize_nullable_text(output.process_risk_reason_text),
    staff_assessments_json=_normalize_staff_assessments(output.staff_assessments_json),
    evidence_used_json=_normalize_json_object(output.evidence_used_json),
    field_explanations_json=_normalize_json_object(output.field_explanations_json),
    supporting_message_ids_json=_normalize_string_list(output.supporting_message_ids_json),
  )


def _normalize_staff_assessments(value: Any) -> list[dict[str, Any]]:
  if not isinstance(value, list):
    return []
  normalized: list[dict[str, Any]] = []
  for raw_item in value:
    if not isinstance(raw_item, dict):
      continue
    normalized.append(
      {
        "staff_name": _normalize_nullable_text(raw_item.get("staff_name")),
        "response_quality_code": _normalize_enum(
          str(raw_item.get("response_quality_code", "")),
          {"strong", "adequate", "needs_attention"},
          "unknown",
          aliases={
            "tot": "strong",
            "dat": "adequate",
            "can_cai_thien": "needs_attention",
          },
        ),
        "issue_text": _normalize_nullable_text(raw_item.get("issue_text")),
        "improvement_text": _normalize_nullable_text(raw_item.get("improvement_text")),
      }
    )
  return normalized


def _normalize_string_list(value: Any) -> list[str]:
  if not isinstance(value, list):
    return []
  items = []
  for raw_item in value:
    if isinstance(raw_item, str):
      normalized = raw_item.strip()
      if normalized:
        items.append(normalized)
  return items


def _normalize_json_object(value: Any) -> dict[str, Any]:
  return value if isinstance(value, dict) else {}


def _normalize_nullable_text(value: Any) -> str | None:
  if not isinstance(value, str):
    return None
  normalized = value.strip()
  return normalized or None


def _normalize_code(value: Any) -> str | None:
  if not isinstance(value, str):
    return None
  normalized = _canonical_key(value)
  return normalized or None


def _normalize_enum(value: str, allowed: set[str], default: str, aliases: dict[str, str] | None = None) -> str:
  normalized = _canonical_key(value)
  if normalized in allowed:
    return normalized
  mapped = (aliases or {}).get(normalized)
  if mapped in allowed:
    return mapped
  return default


def _canonical_key(value: str) -> str:
  base = value.strip().lower()
  no_tone = unicodedata.normalize("NFKD", base)
  no_tone = "".join(ch for ch in no_tone if not unicodedata.combining(ch))
  no_tone = no_tone.replace("đ", "d")
  no_tone = re.sub(r"[^a-z0-9]+", "_", no_tone)
  return re.sub(r"_+", "_", no_tone).strip("_")


def _as_object(value: Any) -> dict[str, Any]:
  return value if isinstance(value, dict) else {}


def _first_signal_value(mapping: dict[str, Any], key: str) -> str | None:
  raw = mapping.get(key)
  if isinstance(raw, list) and raw:
    first = raw[0]
    if isinstance(first, str):
      return first
    if isinstance(first, dict):
      canonical_code = first.get("canonical_code")
      if isinstance(canonical_code, str) and canonical_code.strip():
        return canonical_code.strip()
      signal_code = first.get("signal_code")
      if isinstance(signal_code, str) and signal_code.strip():
        return signal_code.strip()
  return None


def _resolve_journey_code(opening_signals: dict[str, Any], tag_signals: dict[str, Any], transcript: str) -> str:
  journey_signal = _normalize_code(_first_signal_value(opening_signals, "journey") or _first_signal_value(tag_signals, "journey"))
  if journey_signal in {"revisit", "tai_kham", "khach_tai_kham"}:
    return "revisit"
  if journey_signal in {"new_to_clinic", "kh_moi", "khach_moi", "lan_dau"}:
    return "new_to_clinic"

  transcript_key = _canonical_key(transcript)
  if "tai_kham" in transcript_key:
    return "revisit"
  if "lan_dau" in transcript_key or "khach_moi" in transcript_key:
    return "new_to_clinic"
  return "unknown"


def _keyword_match(haystack: str, keywords: list[str], value: str) -> str | None:
  return value if any(keyword in haystack for keyword in keywords) else None


def _first_opening_reason(bundle: UnitBundleModel) -> str | None:
  opening = _as_object(bundle.opening_block_json)
  explicit_signals = opening.get("explicit_signals")
  if isinstance(explicit_signals, list):
    for signal in explicit_signals:
      if not isinstance(signal, dict):
        continue
      raw_text = signal.get("raw_text")
      if isinstance(raw_text, str) and raw_text.strip():
        return raw_text.strip()
      signal_code = signal.get("signal_code")
      if isinstance(signal_code, str) and signal_code.strip():
        return signal_code.strip()
  for message in bundle.messages:
    if message.is_meaningful_human_message and message.redacted_text and message.redacted_text.strip():
      return message.redacted_text.strip()
  return None


def _collect_explicit_signals(value: Any) -> dict[str, list[str]]:
  opening = _as_object(value)
  explicit_signals = opening.get("explicit_signals")
  buckets: dict[str, list[str]] = {}
  if not isinstance(explicit_signals, list):
    return buckets
  for raw_signal in explicit_signals:
    if not isinstance(raw_signal, dict):
      continue
    signal_role = raw_signal.get("signal_role")
    signal_code = raw_signal.get("signal_code")
    if not isinstance(signal_role, str) or not isinstance(signal_code, str):
      continue
    normalized_role = signal_role.strip()
    normalized_code = signal_code.strip()
    if not normalized_role or not normalized_code:
      continue
    bucket = buckets.get(normalized_role, [])
    if normalized_code not in bucket:
      bucket.append(normalized_code)
    buckets[normalized_role] = bucket
  return buckets


def _build_staff_assessments(staff_messages: list[MessageModel], customer_messages: list[MessageModel]) -> list[dict[str, Any]]:
  staff_names = []
  seen = set()
  for message in staff_messages:
    staff_name = _normalize_nullable_text(message.sender_name) or "Nhân viên chưa rõ tên"
    if staff_name in seen:
      continue
    seen.add(staff_name)
    staff_names.append(staff_name)

  if not staff_names:
    return []

  response_quality_code = "adequate" if customer_messages else "unknown"
  issue_text = None
  improvement_text = None
  if customer_messages and not staff_messages:
    response_quality_code = "needs_attention"
    issue_text = "Chưa thấy phản hồi từ nhân viên trong slice ngày này."
    improvement_text = "Cần đảm bảo có phản hồi đầu tiên từ nhân viên trong ngày để tránh rơi lead."

  return [
    {
      "staff_name": staff_name,
      "response_quality_code": response_quality_code,
      "issue_text": issue_text,
      "improvement_text": improvement_text,
    }
    for staff_name in staff_names
  ]


def _build_evidence(
  bundle: UnitBundleModel,
  opening_signals: dict[str, Any],
  tag_signals: dict[str, Any],
  staff_messages: list[MessageModel],
) -> dict[str, Any]:
  return {
    "opening_signals": opening_signals,
    "normalized_tag_signals": tag_signals,
    "first_meaningful_message_id": bundle.first_meaningful_message_id,
    "first_meaningful_message_sender_role": bundle.first_meaningful_message_sender_role,
    "staff_names": sorted(
      {
        _normalize_nullable_text(message.sender_name) or "Nhân viên chưa rõ tên"
        for message in staff_messages
      }
    ),
  }


def _build_field_explanations(
  opening_theme_reason: str | None,
  primary_need_code: str,
  process_risk_level_code: str,
  staff_messages: list[MessageModel],
  customer_messages: list[MessageModel],
) -> dict[str, Any]:
  return {
    "opening_theme_code": "Lấy từ opening block nếu có explicit signal, fallback về first meaningful message.",
    "primary_need_code": f"Heuristic theo tag signal hoặc keyword; current value = {primary_need_code}.",
    "journey_code": "Ưu tiên explicit opening/tag journey signal, fallback keyword transcript.",
    "process_risk_level_code": (
      "Đẩy lên high khi có khách nhắn mà chưa thấy nhân viên phản hồi trong slice."
      if process_risk_level_code == "high"
      else "Heuristic nhẹ dựa trên transcript và sự hiện diện của phản hồi nhân viên."
    ),
    "staff_assessments_json": (
      "Chỉ sinh assessment cho staff thực sự xuất hiện trong thread_day."
      if staff_messages
      else "Không có staff participant nên không tạo staff assessment."
    ),
    "opening_theme_reason": opening_theme_reason,
    "customer_message_count": len(customer_messages),
  }


def _build_supporting_message_ids(messages: list[MessageModel]) -> list[str]:
  candidates = []
  for message in messages:
    if not message.id:
      continue
    if message.is_meaningful_human_message or message.sender_role in {"customer", "staff_via_pancake"}:
      candidates.append(message.id)
    if len(candidates) >= 5:
      break
  return candidates


def _estimate_token_count(messages: list[MessageModel]) -> int:
  text_length = sum(len(message.redacted_text or "") for message in messages)
  return max(1, round(text_length / 4)) if text_length > 0 else 0
