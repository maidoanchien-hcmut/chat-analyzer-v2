from __future__ import annotations

import asyncio
import json
import logging
from concurrent import futures

import grpc

import conversation_analysis_pb2 as conversation_analysis_pb2
import conversation_analysis_pb2_grpc as conversation_analysis_pb2_grpc
from analysis_executor import ConversationAnalysisExecutor, DeterministicAnalysisAdapter
from analysis_models import MessageModel, RuntimeSnapshotModel, UnitBundleModel
from config import load_config


class ConversationAnalysisServiceServicer(conversation_analysis_pb2_grpc.ConversationAnalysisServiceServicer):
  def __init__(self, executor: ConversationAnalysisExecutor):
    self.executor = executor

  def AnalyzeConversation(self, request, context):
    runtime = RuntimeSnapshotModel(
      profile_id=request.runtime.profile_id,
      version_no=request.runtime.version_no,
      model_name=request.runtime.model_name,
      prompt_version=request.runtime.prompt_version,
      output_schema_version=request.runtime.output_schema_version,
      taxonomy_version=request.runtime.taxonomy_version,
      page_prompt_text=request.runtime.page_prompt_text,
      taxonomy_json=_parse_json(request.runtime.taxonomy_json, {}),
      generation_config=_parse_json(request.runtime.generation_config_json, {}),
      profile_json=_parse_json(request.runtime.profile_json, {}),
    )
    bundles = [
      UnitBundleModel(
        thread_day_id=bundle.thread_day_id,
        thread_id=bundle.thread_id,
        connected_page_id=bundle.connected_page_id,
        pipeline_run_id=bundle.pipeline_run_id,
        run_group_id=bundle.run_group_id,
        target_date=bundle.target_date,
        business_timezone=bundle.business_timezone,
        customer_display_name=bundle.customer_display_name or None,
        normalized_tag_signals_json=_parse_json(bundle.normalized_tag_signals_json, {}),
        observed_tags_json=_parse_json(bundle.observed_tags_json, []),
        opening_block_json=_parse_json(bundle.opening_block_json, {}),
        first_meaningful_message_id=bundle.first_meaningful_message_id or None,
        first_meaningful_message_sender_role=bundle.first_meaningful_message_sender_role or None,
        source_thread_json_redacted=_parse_json(bundle.source_thread_json_redacted, {}),
        messages=[
          MessageModel(
            id=message.id,
            inserted_at=message.inserted_at,
            sender_role=message.sender_role,
            sender_name=message.sender_name or None,
            message_type=message.message_type,
            redacted_text=message.redacted_text or None,
            is_meaningful_human_message=message.is_meaningful_human_message,
            is_opening_block_message=message.is_opening_block_message,
          )
          for message in bundle.messages
        ],
        first_meaningful_message_text_redacted=bundle.first_meaningful_message_text_redacted or None,
        explicit_revisit_signal=bundle.explicit_revisit_signal or None,
        explicit_need_signal=bundle.explicit_need_signal or None,
        explicit_outcome_signal=bundle.explicit_outcome_signal or None,
        message_count=bundle.message_count,
        first_staff_response_seconds=bundle.first_staff_response_seconds or None,
        avg_staff_response_seconds=bundle.avg_staff_response_seconds or None,
        staff_participants_json=_parse_json(bundle.staff_participants_json, []),
      )
      for bundle in request.bundles
    ]
    results, metadata = asyncio.run(self.executor.analyze(runtime, bundles))
    return conversation_analysis_pb2.AnalyzeConversationResponse(
      results=[
        conversation_analysis_pb2.AnalysisResult(
          thread_day_id=result.thread_day_id,
          result_status=result.result_status,
          prompt_hash=result.prompt_hash,
          opening_theme_code=result.opening_theme_code,
          opening_theme_reason=result.opening_theme_reason or "",
          customer_mood_code=result.customer_mood_code,
          primary_need_code=result.primary_need_code,
          primary_topic_code=result.primary_topic_code,
          journey_code=result.journey_code,
          closing_outcome_inference_code=result.closing_outcome_inference_code,
          process_risk_level_code=result.process_risk_level_code,
          process_risk_reason_text=result.process_risk_reason_text or "",
          staff_assessments_json=json.dumps([item.model_dump() for item in result.staff_assessments_json], ensure_ascii=False),
          evidence_used_json=json.dumps(result.evidence_used_json, ensure_ascii=False),
          field_explanations_json=json.dumps(result.field_explanations_json, ensure_ascii=False),
          supporting_message_ids_json=json.dumps(result.supporting_message_ids_json, ensure_ascii=False),
          usage=conversation_analysis_pb2.Usage(json=json.dumps(result.usage_json, ensure_ascii=False)),
          cost_micros=result.cost_micros,
          failure_info_json="" if result.failure_info_json is None else json.dumps(result.failure_info_json, ensure_ascii=False),
        )
        for result in results
      ],
      runtime_metadata_json=json.dumps(metadata.model_dump(), ensure_ascii=False),
    )


def serve() -> None:
  config = load_config()
  logging.basicConfig(
    level=getattr(logging, config.log_level, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
  )
  server = grpc.server(
    futures.ThreadPoolExecutor(max_workers=config.grpc_max_workers),
    options=[
      ("grpc.max_send_message_length", config.grpc_max_message_length),
      ("grpc.max_receive_message_length", config.grpc_max_message_length),
    ],
  )
  executor = ConversationAnalysisExecutor(
    config=config,
    adapter=DeterministicAnalysisAdapter(config),
  )
  conversation_analysis_pb2_grpc.add_ConversationAnalysisServiceServicer_to_server(
    ConversationAnalysisServiceServicer(executor),
    server,
  )
  bind_address = f"{config.grpc_host}:{config.grpc_port}"
  server.add_insecure_port(bind_address)
  server.start()
  logging.getLogger(__name__).info("Analysis service listening at %s", bind_address)
  server.wait_for_termination()


def _parse_json(raw: str, default):
  if not raw:
    return default
  try:
    return json.loads(raw)
  except json.JSONDecodeError:
    return default


if __name__ == "__main__":
  serve()
