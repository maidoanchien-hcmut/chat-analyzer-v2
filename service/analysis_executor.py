from __future__ import annotations

import asyncio
import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Callable, Protocol
from urllib import error as urllib_error
from urllib import request as urllib_request

from config import ServiceConfig
from analysis_models import (
  AdapterResultModel,
  AnalysisOutputModel,
  InvalidServiceResultError,
  RuntimeMetadataModel,
  RuntimeSnapshotModel,
  ServiceResultModel,
  StaffAssessmentModel,
  StaffParticipantModel,
  UnitBundleModel,
)

SYSTEM_PROMPT_VERSION = "service_system.v2"
SYSTEM_PROMPT_CONVERSATION_ANALYSIS = """Bạn là AI phân tích hội thoại sales/cskh nội bộ của hệ thống chat-analyzer cho một công ty duy nhất.

Vai trò cố định:
- Chỉ phân tích chất lượng xử lý hội thoại và tín hiệu vận hành trong đúng slice được cung cấp.
- Không nhập vai nhân viên tư vấn hay chatbot trả lời khách.
- Không tạo thông tin ngoài evidence.
- Luôn ưu tiên evidence deterministic từ extraction seam trước khi suy luận.

Hợp đồng phân loại bắt buộc:
- Phải phân loại tối thiểu các trục: `opening_theme_code`, `customer_mood_code`, `primary_need_code`, `primary_topic_code`, `journey_code`, `closing_outcome_inference_code`, `process_risk_level_code`, `staff_assessments_json`.
- `journey_code` và `primary_need_code` là hai trục khác nhau; `revisit` không bao giờ là `primary_need_code`.
- Phải phân biệt field nào dựa trên explicit signal và field nào là inference.
- Khi evidence không đủ, trả `unknown` thay vì đoán.
- Ưu tiên explicit source evidence, opening selections, tag signals và deterministic metrics trước transcript-level inference.

Yêu cầu output:
- Chỉ trả về đúng một JSON object hợp lệ theo output contract.
- `field_explanations_json` phải nêu rõ cách suy ra từng field quan trọng và whether explicit/inference.
- `staff_assessments_json` chỉ chứa nhân sự thực sự có trong `staff_participants_json`.
- Nội dung phải ngắn gọn, dùng được cho vận hành."""


class AnalysisAdapter(Protocol):
  async def analyze_bundle(
    self,
    runtime: RuntimeSnapshotModel,
    bundle: UnitBundleModel,
    prompt_hash: str,
    effective_prompt_text: str,
  ) -> AdapterResultModel:
    ...


LiveTransport = Callable[[str, dict[str, str], dict[str, Any], float], dict[str, Any]]


@dataclass(slots=True)
class DeterministicAnalysisAdapter:
  config: ServiceConfig

  async def analyze_bundle(
    self,
    runtime: RuntimeSnapshotModel,
    bundle: UnitBundleModel,
    prompt_hash: str,
    effective_prompt_text: str,
  ) -> AdapterResultModel:
    analysis_messages = [message for message in bundle.messages if not message.is_opening_block_message]
    transcript = "\n".join(
      [message.redacted_text.strip() for message in analysis_messages if message.redacted_text and message.redacted_text.strip()]
    ).lower()
    opening_signals = _collect_explicit_signals(bundle.opening_block_json)
    tag_signals = _as_object(bundle.normalized_tag_signals_json)
    staff_messages = [message for message in analysis_messages if message.sender_role == "staff_via_pancake"]
    customer_messages = [message for message in analysis_messages if message.sender_role == "customer"]

    primary_need_code = (
      _normalize_code(bundle.explicit_need_signal)
      or _normalize_code(_first_signal_value(tag_signals, "need"))
      or _keyword_match(transcript, ["đặt lịch", "lịch hẹn"], "appointment_booking")
      or _keyword_match(transcript, ["tư vấn", "consult"], "consultation")
      or "unknown"
    )
    if primary_need_code == "revisit":
      primary_need_code = "unknown"

    journey_code = _resolve_journey_code(opening_signals, tag_signals, transcript, bundle.explicit_revisit_signal)
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
      journey_code=journey_code,
      closing_outcome_inference_code=_normalize_code(bundle.explicit_outcome_signal)
      or _keyword_match(transcript, ["đã đặt lịch", "hẹn lúc"], "appointment_booked")
      or _keyword_match(transcript, ["để em gọi", "liên hệ sau"], "follow_up")
      or "unknown",
      process_risk_level_code=process_risk_level_code,
      process_risk_reason_text="Khách có nhắn nhưng chưa thấy nhân viên phản hồi trong snapshot ngày."
      if process_risk_level_code == "high"
      else None,
      staff_assessments_json=_build_staff_assessments(bundle.staff_participants_json, staff_messages, customer_messages),
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

    status = "succeeded" if analysis_messages else "unknown"
    failure_info = None if analysis_messages else {"reason": "empty_transcript"}

    return AdapterResultModel(
      status=status,
      output=output,
      usage_json={
        "provider": self.config.resolve_provider_name(),
        "runtime_mode": self.config.runtime_mode,
        "model_name": runtime.model_name,
        "token_estimate": _estimate_token_count(analysis_messages),
      },
      cost_micros=0,
      failure_info_json=failure_info,
    )


@dataclass(slots=True)
class OpenAICompatibleAnalysisAdapter:
  config: ServiceConfig
  transport: LiveTransport | None = None

  async def analyze_bundle(
    self,
    runtime: RuntimeSnapshotModel,
    bundle: UnitBundleModel,
    prompt_hash: str,
    effective_prompt_text: str,
  ) -> AdapterResultModel:
    payload = {
      "model": runtime.model_name,
      "messages": [
        {"role": "system", "content": effective_prompt_text},
        {"role": "user", "content": build_bundle_prompt_text(bundle)},
      ],
      "temperature": _read_float(runtime.generation_config.get("temperature"), self.config.generation_temperature),
      "top_p": _read_float(runtime.generation_config.get("top_p"), self.config.generation_top_p),
      "response_format": {"type": "json_object"},
      "max_tokens": _read_int(
        runtime.generation_config.get("max_output_tokens"),
        self.config.generation_max_output_tokens,
      ),
    }
    url = resolve_chat_completions_url(self.config.provider_base_url or "")
    headers = {
      "Authorization": f"Bearer {self.config.provider_api_key or ''}",
      "Content-Type": "application/json",
    }
    transport = self.transport or default_live_transport
    raw_response = await asyncio.to_thread(
      transport,
      url,
      headers,
      payload,
      self.config.request_timeout_seconds,
    )
    assistant_text = extract_assistant_text(raw_response)
    output = AnalysisOutputModel.model_validate(parse_json_object_from_text(assistant_text))
    usage = _as_object(raw_response.get("usage"))

    return AdapterResultModel(
      status="succeeded",
      output=output,
      usage_json={
        "provider": self.config.resolve_provider_name(),
        "runtime_mode": self.config.runtime_mode,
        "model_name": runtime.model_name,
        **usage,
      },
      cost_micros=_read_int(raw_response.get("cost_micros") or usage.get("cost_micros"), 0),
      failure_info_json=None,
    )


@dataclass(slots=True)
class ConversationAnalysisExecutor:
  config: ServiceConfig
  adapter: AnalysisAdapter

  async def analyze(
    self,
    runtime: RuntimeSnapshotModel,
    bundles: list[UnitBundleModel],
  ) -> tuple[list[ServiceResultModel], RuntimeMetadataModel]:
    resolved_runtime = resolve_runtime_snapshot(runtime, self.config)
    effective_prompt_text = build_effective_prompt_text(resolved_runtime)
    prompt_hash = build_prompt_hash(resolved_runtime, effective_prompt_text)
    metadata = RuntimeMetadataModel(
      runtime_mode=self.config.runtime_mode,
      provider=self.config.resolve_provider_name(),
      model_name=resolved_runtime.model_name,
      system_prompt_version=SYSTEM_PROMPT_VERSION,
      effective_prompt_hash=prompt_hash,
      effective_prompt_text=effective_prompt_text,
      output_schema_version=resolved_runtime.output_schema_version,
      profile_id=resolved_runtime.profile_id,
      version_no=resolved_runtime.version_no,
      taxonomy_version=resolved_runtime.taxonomy_version,
      generation_config=resolved_runtime.generation_config,
    )
    results = []
    for bundle in bundles:
      try:
        adapter_result = await self.adapter.analyze_bundle(resolved_runtime, bundle, prompt_hash, effective_prompt_text)
        normalized = normalize_adapter_result(bundle, prompt_hash, adapter_result)
      except Exception as error:
        normalized = failure_result_from_exception(bundle.thread_day_id, prompt_hash, error)
      results.append(normalized)
    return results, metadata


def build_analysis_adapter(config: ServiceConfig) -> AnalysisAdapter:
  if config.runtime_mode == "deterministic_dev":
    return DeterministicAnalysisAdapter(config)
  return OpenAICompatibleAnalysisAdapter(config)


def resolve_runtime_snapshot(runtime: RuntimeSnapshotModel, config: ServiceConfig) -> RuntimeSnapshotModel:
  generation_config = config.default_generation_config()
  generation_config.update(_as_object(runtime.generation_config))
  return runtime.model_copy(
    update={
      "model_name": config.resolve_model_name(),
      "generation_config": generation_config,
    }
  )


def build_effective_prompt_text(runtime: RuntimeSnapshotModel) -> str:
  page_prompt = runtime.page_prompt_text.strip() or "Không có quy trình vận hành riêng cho page; chỉ áp dụng quy tắc hệ thống."
  taxonomy_text = json.dumps(runtime.taxonomy_json, ensure_ascii=False, sort_keys=True)
  return "\n\n".join([
    SYSTEM_PROMPT_CONVERSATION_ANALYSIS,
    f"[PROMPT_VERSION]\n{runtime.prompt_version}",
    f"[TAXONOMY_VERSION]\n{runtime.taxonomy_version}",
    f"[OUTPUT_SCHEMA_VERSION]\n{runtime.output_schema_version}",
    f"[TAXONOMY_JSON]\n{taxonomy_text}",
    f"[PAGE_OPERATIONAL_RULES]\n{page_prompt}",
  ])


def build_bundle_prompt_text(bundle: UnitBundleModel) -> str:
  return "\n\n".join([
    "Phân tích đúng 1 thread_day dưới đây. Trả về duy nhất 1 JSON object với đúng các field của output contract.",
    "Nếu không đủ evidence, điền unknown. Không thêm markdown, không thêm giải thích ngoài JSON.",
    "[UNIT_BUNDLE_JSON]",
    json.dumps(bundle.model_dump(mode="json"), ensure_ascii=False, sort_keys=True),
  ])


def build_prompt_hash(runtime: RuntimeSnapshotModel, effective_prompt_text: str) -> str:
  payload = json.dumps(
    {
      "effective_prompt_text": effective_prompt_text,
      "model_name": runtime.model_name,
      "generation_config": runtime.generation_config,
      "profile_id": runtime.profile_id,
      "version_no": runtime.version_no,
    },
    ensure_ascii=False,
    sort_keys=True,
  )
  return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def parse_json_object_from_text(value: str) -> dict[str, Any]:
  raw = value.strip()
  if raw.startswith("```"):
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
  try:
    parsed = json.loads(raw)
  except json.JSONDecodeError:
    start = raw.find("{")
    end = raw.rfind("}")
    if start < 0 or end <= start:
      raise InvalidServiceResultError("live provider did not return a JSON object")
    parsed = json.loads(raw[start:end + 1])
  if not isinstance(parsed, dict):
    raise InvalidServiceResultError("live provider output must be a JSON object")
  return parsed


def resolve_chat_completions_url(base_url: str) -> str:
  normalized = base_url.strip().rstrip("/")
  if not normalized:
    raise RuntimeError("provider_base_url is required for live runtime")
  return normalized if normalized.endswith("/chat/completions") else f"{normalized}/chat/completions"


def extract_assistant_text(response: dict[str, Any]) -> str:
  choices = response.get("choices")
  if not isinstance(choices, list) or not choices:
    raise InvalidServiceResultError("live provider response missing choices")
  message = _as_object(_as_object(choices[0]).get("message"))
  content = message.get("content")
  if isinstance(content, str) and content.strip():
    return content.strip()
  if isinstance(content, list):
    text_parts = []
    for item in content:
      if isinstance(item, str):
        text_parts.append(item)
        continue
      if isinstance(item, dict):
        text_value = item.get("text")
        if isinstance(text_value, str):
          text_parts.append(text_value)
    joined = "\n".join(part.strip() for part in text_parts if part and part.strip())
    if joined:
      return joined
  raise InvalidServiceResultError("live provider response missing message content")


def default_live_transport(
  url: str,
  headers: dict[str, str],
  payload: dict[str, Any],
  timeout_seconds: float,
) -> dict[str, Any]:
  body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
  request = urllib_request.Request(url, data=body, headers=headers, method="POST")
  try:
    with urllib_request.urlopen(request, timeout=timeout_seconds) as response:
      raw = response.read().decode("utf-8")
  except urllib_error.HTTPError as exc:
    details = exc.read().decode("utf-8", errors="replace")
    raise RuntimeError(f"live provider request failed: HTTP {exc.code}: {details}") from exc
  except urllib_error.URLError as exc:
    raise RuntimeError(f"live provider request failed: {exc.reason}") from exc
  try:
    parsed = json.loads(raw)
  except json.JSONDecodeError as exc:
    raise RuntimeError("live provider returned invalid JSON") from exc
  if not isinstance(parsed, dict):
    raise RuntimeError("live provider response must be a JSON object")
  return parsed


def normalize_adapter_result(
  bundle: UnitBundleModel,
  prompt_hash: str,
  adapter_result: AdapterResultModel,
) -> ServiceResultModel:
  output = adapter_result.output
  normalized_staff = normalize_staff_assessments(bundle.staff_participants_json, output.staff_assessments_json)
  primary_need_code = _normalize_code(output.primary_need_code) or "unknown"
  journey_code = _normalize_code(output.journey_code) or "unknown"
  if primary_need_code == "revisit":
    raise InvalidServiceResultError("primary_need_code cannot be revisit")
  if adapter_result.status == "failed" and adapter_result.failure_info_json is None:
    raise InvalidServiceResultError("failed result missing failure_info_json")

  return ServiceResultModel(
    thread_day_id=bundle.thread_day_id,
    result_status=adapter_result.status,
    prompt_hash=prompt_hash,
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
    primary_need_code=primary_need_code,
    primary_topic_code=_normalize_code(output.primary_topic_code) or "unknown",
    journey_code=_normalize_enum(
      journey_code,
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
    staff_assessments_json=normalized_staff,
    evidence_used_json=_normalize_json_object(output.evidence_used_json),
    field_explanations_json=_normalize_json_object(output.field_explanations_json),
    supporting_message_ids_json=_normalize_string_list(output.supporting_message_ids_json),
    usage_json=_normalize_json_object(adapter_result.usage_json),
    cost_micros=max(0, adapter_result.cost_micros),
    failure_info_json=adapter_result.failure_info_json,
  )


def failure_result_from_exception(thread_day_id: str, prompt_hash: str, error: Exception) -> ServiceResultModel:
  return ServiceResultModel(
    thread_day_id=thread_day_id,
    result_status="failed",
    prompt_hash=prompt_hash,
    opening_theme_code="unknown",
    customer_mood_code="unknown",
    primary_need_code="unknown",
    primary_topic_code="unknown",
    journey_code="unknown",
    closing_outcome_inference_code="unknown",
    process_risk_level_code="unknown",
    staff_assessments_json=[],
    evidence_used_json={},
    field_explanations_json={},
    supporting_message_ids_json=[],
    usage_json={},
    cost_micros=0,
    failure_info_json={
      "reason": "invalid_output",
      "error": str(error),
    },
  )


def normalize_staff_assessments(
  staff_participants: list[StaffParticipantModel | str],
  values: list[StaffAssessmentModel],
) -> list[StaffAssessmentModel]:
  allowed_names = {staff_name for staff_name in _iter_staff_names(staff_participants)}
  normalized: list[StaffAssessmentModel] = []
  seen: set[str] = set()
  for item in values:
    staff_name = _normalize_nullable_text(item.staff_name)
    if staff_name is None or staff_name not in allowed_names or staff_name in seen:
      continue
    seen.add(staff_name)
    normalized.append(
      StaffAssessmentModel(
        staff_name=staff_name,
        response_quality_code=_normalize_enum(
          item.response_quality_code,
          {"strong", "adequate", "needs_attention"},
          "unknown",
          aliases={
            "tot": "strong",
            "dat": "adequate",
            "can_cai_thien": "needs_attention",
          },
        ),
        issue_text=_normalize_nullable_text(item.issue_text),
        improvement_text=_normalize_nullable_text(item.improvement_text),
      )
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


def _resolve_journey_code(
  opening_signals: dict[str, Any],
  tag_signals: dict[str, Any],
  transcript: str,
  explicit_revisit_signal: str | None,
) -> str:
  journey_signal = _normalize_code(explicit_revisit_signal)
  if journey_signal in {"revisit", "tai_kham", "khach_tai_kham"}:
    return "revisit"
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
  if bundle.first_meaningful_message_text_redacted and bundle.first_meaningful_message_text_redacted.strip():
    return bundle.first_meaningful_message_text_redacted.strip()
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


def _build_staff_assessments(
  staff_participants: list[StaffParticipantModel | str],
  staff_messages: list[Any],
  customer_messages: list[Any],
) -> list[StaffAssessmentModel]:
  allowed_names = list(_iter_staff_names(staff_participants))
  if not allowed_names:
    return []

  response_quality_code = "adequate" if customer_messages else "unknown"
  issue_text = None
  improvement_text = None
  if customer_messages and not staff_messages:
    response_quality_code = "needs_attention"
    issue_text = "Chưa thấy phản hồi từ nhân viên trong slice ngày này."
    improvement_text = "Cần đảm bảo có phản hồi đầu tiên từ nhân viên trong ngày để tránh rơi lead."

  return [
    StaffAssessmentModel(
      staff_name=staff_name,
      response_quality_code=response_quality_code,
      issue_text=issue_text,
      improvement_text=improvement_text,
    )
    for staff_name in allowed_names
  ]


def _iter_staff_names(staff_participants: list[StaffParticipantModel | str]):
  seen: set[str] = set()
  for participant in staff_participants:
    if isinstance(participant, StaffParticipantModel):
      staff_name = _normalize_nullable_text(participant.staff_name)
    else:
      staff_name = _normalize_nullable_text(participant)
    if staff_name is None or staff_name in seen:
      continue
    seen.add(staff_name)
    yield staff_name


def _build_evidence(
  bundle: UnitBundleModel,
  opening_signals: dict[str, Any],
  tag_signals: dict[str, Any],
  staff_messages: list[Any],
) -> dict[str, Any]:
  return {
    "opening_signals": opening_signals,
    "normalized_tag_signals": tag_signals,
    "first_meaningful_message_id": bundle.first_meaningful_message_id,
    "first_meaningful_message_sender_role": bundle.first_meaningful_message_sender_role,
    "first_meaningful_message_text_redacted": bundle.first_meaningful_message_text_redacted,
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
  staff_messages: list[Any],
  customer_messages: list[Any],
) -> dict[str, Any]:
  return {
    "opening_theme_code": "Ưu tiên explicit opening signal; fallback về first meaningful message. explicit_or_inference=explicit_then_fallback",
    "primary_need_code": f"Ưu tiên explicit need signal/tag signal, fallback keyword; current value = {primary_need_code}. explicit_or_inference=mixed",
    "journey_code": "Ưu tiên explicit revisit/journey signal, fallback keyword transcript. explicit_or_inference=mixed",
    "process_risk_level_code": (
      "Đẩy lên high khi có khách nhắn mà chưa thấy nhân viên phản hồi trong slice. explicit_or_inference=inference"
      if process_risk_level_code == "high"
      else "Suy luận nhẹ dựa trên transcript và sự hiện diện của phản hồi nhân viên. explicit_or_inference=inference"
    ),
    "staff_assessments_json": (
      "Chỉ sinh assessment cho staff thực sự xuất hiện trong thread_day."
      if staff_messages
      else "Không có staff participant nên không tạo staff assessment."
    ),
    "opening_theme_reason": opening_theme_reason,
    "customer_message_count": len(customer_messages),
  }


def _build_supporting_message_ids(messages: list[Any]) -> list[str]:
  candidates = []
  for message in messages:
    if not message.id:
      continue
    if message.is_meaningful_human_message or message.sender_role in {"customer", "staff_via_pancake"}:
      candidates.append(message.id)
    if len(candidates) >= 5:
      break
  return candidates


def _estimate_token_count(messages: list[Any]) -> int:
  text_length = sum(len(message.redacted_text or "") for message in messages)
  return max(1, round(text_length / 4)) if text_length > 0 else 0


def _read_float(value: Any, fallback: float) -> float:
  if isinstance(value, (int, float)):
    return float(value)
  if isinstance(value, str):
    try:
      return float(value)
    except ValueError:
      return fallback
  return fallback


def _read_int(value: Any, fallback: int) -> int:
  if isinstance(value, (int, float)):
    return int(value)
  if isinstance(value, str):
    try:
      return int(value)
    except ValueError:
      return fallback
  return fallback
