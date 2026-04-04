import type { MappingQueueItem, PublishEligibility, RunDetailViewModel, RunGroupViewModel, RunSummaryViewModel } from "../../adapters/contracts.ts";

export type PublishActionDescriptor = {
  canPublish: boolean;
  publishAs: "official" | "provisional" | null;
  label: string;
  helperText: string;
};

export type MappingQueueAction =
  | { type: "approve"; itemId: string }
  | { type: "reject"; itemId: string }
  | { type: "remap"; itemId: string; candidateCustomer: string; confidence: string; evidence: string };

export function derivePublishAction(publishEligibility: PublishEligibility): PublishActionDescriptor {
  switch (publishEligibility) {
    case "official_full_day":
      return {
        canPublish: true,
        publishAs: "official",
        label: "Publish chính thức",
        helperText: "Full-day child run có thể promote thành snapshot official."
      };
    case "provisional_current_day_partial":
      return {
        canPublish: true,
        publishAs: "provisional",
        label: "Publish tạm thời",
        helperText: "Partial current day chỉ được publish dưới dạng provisional."
      };
    case "not_publishable_old_partial":
      return {
        canPublish: false,
        publishAs: null,
        label: "Không được publish dashboard",
        helperText: "Partial ngày cũ chỉ dùng để xem kết quả run."
      };
  }
}

export function describePublishEligibility(publishEligibility: PublishEligibility) {
  switch (publishEligibility) {
    case "official_full_day":
      return "Full-day, được publish chính thức";
    case "provisional_current_day_partial":
      return "Partial current day, chỉ publish tạm thời";
    case "not_publishable_old_partial":
      return "Partial old day, không được publish dashboard";
  }
}

export function applyMappingQueueAction(queue: MappingQueueItem[], action: MappingQueueAction) {
  return queue.map((item) => {
    if (item.id !== action.itemId) {
      return item;
    }

    if (action.type === "approve") {
      return { ...item, status: "approved" as const };
    }
    if (action.type === "reject") {
      return { ...item, status: "rejected" as const };
    }
    return {
      ...item,
      status: "remapped" as const,
      candidateCustomer: action.candidateCustomer,
      confidence: action.confidence,
      evidence: action.evidence
    };
  });
}

export function createInitialMappingQueue(): MappingQueueItem[] {
  return [
    {
      id: "map-1",
      threadLabel: "T-1001",
      candidateCustomer: "CRM KH-8821",
      confidence: "0.98",
      evidence: "Phone match + recent revisit",
      status: "pending"
    },
    {
      id: "map-2",
      threadLabel: "T-1008",
      candidateCustomer: "CRM KH-1190",
      confidence: "0.61",
      evidence: "Name similarity + lịch sử toa cũ",
      status: "pending"
    }
  ];
}

export function nextRemapCandidate(item: MappingQueueItem) {
  if (item.id === "map-1") {
    return {
      candidateCustomer: "CRM KH-2201",
      confidence: "0.73",
      evidence: "Manual remap sau khi đối chiếu lịch sử tái khám"
    };
  }
  return {
    candidateCustomer: "CRM KH-3308",
    confidence: "0.69",
    evidence: "Manual remap dựa trên ghi chú toa gần nhất"
  };
}

export function findRunForPublish(
  runGroup: RunGroupViewModel | null,
  runDetail: RunDetailViewModel | null,
  runId: string
): RunSummaryViewModel | null {
  const runFromGroup = runGroup?.childRuns.find((run) => run.id === runId);
  if (runFromGroup) {
    return runFromGroup;
  }
  if (runDetail?.run.id === runId) {
    return runDetail.run;
  }
  return null;
}
