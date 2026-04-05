import { createHash } from "node:crypto";
import { stableStringify } from "../chat_extractor/chat_extractor.artifacts.ts";

export const ANALYSIS_RUNTIME_PROFILE_ID = "conversation-analysis";
export const ANALYSIS_RUNTIME_PROFILE_VERSION = 1;
export const ANALYSIS_RUNTIME_MODEL_NAME = "service-managed";
export const ANALYSIS_OUTPUT_SCHEMA_VERSION = "conversation_analysis.v2";
export const ANALYSIS_BATCH_SIZE = 25;

export function hashAnalysisEvidence(value: unknown) {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

export function buildAnalysisSnapshotIdentityKey(value: unknown) {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(stableStringify(value)) as T;
}
