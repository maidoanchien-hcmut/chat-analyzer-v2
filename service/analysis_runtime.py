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


SYSTEM_PROMPT_CONVERSATION_ANALYSIS = """Bạn là AI nhà phân tích hội thoại sales/cskh của hệ thống chat-analyzer cho một công ty duy nhất.

Vai trò cố định:
- Chỉ làm nhiệm vụ phân tích và đánh giá tuân thủ vận hành trong hội thoại.
- Không nhập vai nhân viên tư vấn hoặc chatbot trả lời khách hàng.
- Không tạo thông tin ngoài evidence.
- Luôn ưu tiên evidence deterministic từ Seam 1 trước khi suy luận.

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
    return [self._build_heuristic_result(effective_runtime, bundle) for bundle in bundles]

  def _build_heuristic_result(self, runtime: RuntimeSnapshotModel, bundle: UnitBundleModel) -> ServiceResultModel:
    analysis_messages = [message for message in bundle.messages if not message.is_opening_block_message]
    transcript = "\n".join(
      [message.redacted_text.strip() for message in analysis_messages if message.redacted_text and message.redacted_text.strip()]
    ).lower()
    opening_signals = _read_array_map(bundle.opening_blocks_json, "deterministic_signals")
    tag_signals = _as_object(bundle.normalized_tag_signals_json)
    has_staff = any(message.sender_role == "staff_via_pancake" for message in analysis_messages)
    has_customer = any(message.sender_role == "customer" for message in analysis_messages)

    primary_need = (
      _first_signal_value(tag_signals, "need")
      or _keyword_match(transcript, ["đặt lịch", "lịch hẹn"], "booking")
      or _keyword_match(transcript, ["tư vấn", "consult"], "consultation")
      or "unknown"
    )
    process_risk_level = "high" if (not has_staff and has_customer) else _keyword_match(transcript, ["không trả lời", "seen"], "medium") or "low"

    output = AnalysisOutputModel(
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
    )
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
        "provider": self.config.runtime_mode,
        "model_name": runtime.model_name,
        "token_estimate": _estimate_token_count(analysis_messages)
      },
      cost_micros=0,
      failure_info_json=None if bundle.messages else {"reason": "empty_transcript"}
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
    opening_theme=_normalize_free_text(output.opening_theme),
    customer_mood=_normalize_enum(output.customer_mood, {"positive", "neutral", "negative"}, "unknown", aliases={
      "tich_cuc": "positive",
      "tot": "positive",
      "xau": "negative",
      "tieu_cuc": "negative",
      "binh_thuong": "neutral"
    }),
    primary_need=_normalize_free_text(output.primary_need),
    primary_topic=_normalize_free_text(output.primary_topic),
    content_customer_type=_normalize_enum(output.content_customer_type, {"kh_moi", "tai_kham"}, "unknown", aliases={
      "khach_moi": "kh_moi",
      "lan_dau": "kh_moi",
      "first_time": "kh_moi",
      "new_customer": "kh_moi",
      "khach_tai_kham": "tai_kham",
      "tai_kham": "tai_kham",
      "tai_kham_lai": "tai_kham",
      "revisit": "tai_kham",
      "returning_customer": "tai_kham"
    }),
    closing_outcome_as_of_day=_normalize_enum(output.closing_outcome_as_of_day, {"booked", "follow_up", "not_closed"}, "unknown", aliases={
      "da_chot_hen": "booked",
      "book_appointment": "booked",
      "booking": "booked",
      "chua_chot": "not_closed",
      "not_booked": "not_closed",
      "followup": "follow_up",
      "follow_up_later": "follow_up"
    }),
    response_quality_label=_normalize_enum(output.response_quality_label, {"strong", "adequate", "needs_attention"}, "unknown", aliases={
      "tot": "strong",
      "dat": "adequate",
      "can_cai_thien": "needs_attention",
      "need_attention": "needs_attention"
    }),
    process_risk_level=_normalize_enum(output.process_risk_level, {"low", "medium", "high"}, "unknown", aliases={
      "thap": "low",
      "trung_binh": "medium",
      "cao": "high"
    }),
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


def _read_array_map(value: Any, key: str) -> dict[str, Any]:
  raw = _as_object(value).get(key)
  return raw if isinstance(raw, dict) else {}


def _first_signal_value(mapping: dict[str, Any], key: str) -> str | None:
  raw = mapping.get(key)
  if isinstance(raw, list) and raw and isinstance(raw[0], str):
    return raw[0]
  return None


def _resolve_customer_type(opening_signals: dict[str, Any], tag_signals: dict[str, Any], transcript: str) -> str:
  opening_customer_type = _canonical_key(_first_signal_value(opening_signals, "customer_type") or "")
  if opening_customer_type in {"revisit", "tai_kham", "khach_tai_kham"}:
    return "tai_kham"
  if opening_customer_type in {"first_time", "kh_moi", "khach_moi", "lan_dau"}:
    return "kh_moi"

  tag_customer_type = _canonical_key(_first_signal_value(tag_signals, "customer_type") or "")
  if tag_customer_type in {"tai_kham", "khach_tai_kham", "revisit"} or ("tai" in tag_customer_type and "kham" in tag_customer_type):
    return "tai_kham"
  if tag_customer_type in {"kh_moi", "khach_moi", "first_time"} or "moi" in tag_customer_type:
    return "kh_moi"
  transcript_key = _canonical_key(transcript)
  if "tai_kham" in transcript_key:
    return "tai_kham"
  if "lan_dau" in transcript_key or "khach_moi" in transcript_key:
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


def _estimate_token_count(messages: list[MessageModel]) -> int:
  text_length = sum(len(message.redacted_text or "") for message in messages)
  return max(1, round(text_length / 4)) if text_length > 0 else 0
