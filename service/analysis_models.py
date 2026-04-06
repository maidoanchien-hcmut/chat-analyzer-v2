from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


AnalysisStatus = Literal["succeeded", "unknown", "failed"]


class RuntimeSnapshotModel(BaseModel):
  model_config = ConfigDict(extra="forbid")

  profile_id: str
  version_no: int
  model_name: str
  prompt_version: str
  output_schema_version: str
  taxonomy_version: str
  page_prompt_text: str = ""
  taxonomy_json: dict[str, Any] = Field(default_factory=dict)
  generation_config: dict[str, Any] = Field(default_factory=dict)
  profile_json: dict[str, Any] = Field(default_factory=dict)


class MessageModel(BaseModel):
  model_config = ConfigDict(extra="forbid")

  id: str
  inserted_at: str
  sender_role: str
  sender_name: str | None = None
  message_type: str
  redacted_text: str | None = None
  is_meaningful_human_message: bool = False
  is_opening_block_message: bool = False


class StaffParticipantModel(BaseModel):
  model_config = ConfigDict(extra="forbid")

  staff_name: str
  sender_source_id: str | None = None
  message_count: int = 0


class UnitBundleModel(BaseModel):
  model_config = ConfigDict(extra="forbid")

  thread_day_id: str
  thread_id: str
  connected_page_id: str
  pipeline_run_id: str
  run_group_id: str
  target_date: str
  business_timezone: str
  customer_display_name: str | None = None
  normalized_tag_signals_json: dict[str, Any] = Field(default_factory=dict)
  observed_tags_json: list[Any] = Field(default_factory=list)
  opening_block_json: dict[str, Any] = Field(default_factory=dict)
  first_meaningful_message_id: str | None = None
  first_meaningful_message_sender_role: str | None = None
  source_thread_json_redacted: dict[str, Any] = Field(default_factory=dict)
  messages: list[MessageModel] = Field(default_factory=list)
  first_meaningful_message_text_redacted: str | None = None
  explicit_revisit_signal: str | None = None
  explicit_need_signal: str | None = None
  explicit_outcome_signal: str | None = None
  message_count: int = 0
  first_staff_response_seconds: int | None = None
  avg_staff_response_seconds: int | None = None
  staff_participants_json: list[StaffParticipantModel | str] = Field(default_factory=list)


class StaffAssessmentModel(BaseModel):
  model_config = ConfigDict(extra="forbid")

  staff_name: str
  response_quality_code: str
  issue_text: str | None = None
  improvement_text: str | None = None


class AnalysisOutputModel(BaseModel):
  model_config = ConfigDict(extra="forbid")

  opening_theme_code: str = "unknown"
  opening_theme_reason: str | None = None
  customer_mood_code: str = "unknown"
  primary_need_code: str = "unknown"
  primary_topic_code: str = "unknown"
  journey_code: str = "unknown"
  closing_outcome_inference_code: str = "unknown"
  process_risk_level_code: str = "unknown"
  process_risk_reason_text: str | None = None
  staff_assessments_json: list[StaffAssessmentModel] = Field(default_factory=list)
  evidence_used_json: dict[str, Any] = Field(default_factory=dict)
  field_explanations_json: dict[str, Any] = Field(default_factory=dict)
  supporting_message_ids_json: list[str] = Field(default_factory=list)


class ServiceResultModel(BaseModel):
  model_config = ConfigDict(extra="forbid")

  thread_day_id: str
  result_status: AnalysisStatus
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
  staff_assessments_json: list[StaffAssessmentModel] = Field(default_factory=list)
  evidence_used_json: dict[str, Any] = Field(default_factory=dict)
  field_explanations_json: dict[str, Any] = Field(default_factory=dict)
  supporting_message_ids_json: list[str] = Field(default_factory=list)
  usage_json: dict[str, Any] = Field(default_factory=dict)
  cost_micros: int = 0
  failure_info_json: dict[str, Any] | None = None


class RuntimeMetadataModel(BaseModel):
  model_config = ConfigDict(extra="forbid")

  runtime_mode: str
  provider: str
  model_name: str
  system_prompt_version: str
  effective_prompt_hash: str
  effective_prompt_text: str
  output_schema_version: str
  profile_id: str
  version_no: int
  taxonomy_version: str
  generation_config: dict[str, Any] = Field(default_factory=dict)


class InvalidServiceResultError(ValueError):
  pass


class AdapterResultModel(BaseModel):
  model_config = ConfigDict(extra="forbid")

  status: AnalysisStatus
  output: AnalysisOutputModel
  usage_json: dict[str, Any] = Field(default_factory=dict)
  cost_micros: int = 0
  failure_info_json: dict[str, Any] | None = None

  @model_validator(mode="after")
  def validate_failure_state(self) -> "AdapterResultModel":
    if self.status == "failed" and self.failure_info_json is None:
      raise InvalidServiceResultError("failed results must include failure_info_json")
    return self
