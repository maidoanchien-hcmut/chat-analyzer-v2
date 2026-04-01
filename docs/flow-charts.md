# Flow Charts

## Initial Page Onboarding

```mermaid
flowchart TD
  A["IT opens Page Onboarding Wizard"] --> B["Choose organization"]
  B --> C["Paste Pancake user access token"]
  C --> D["System lists available pages"]
  D --> E["IT selects page"]
  E --> F["Choose business timezone"]
  F --> G["Set initial_conversation_limit"]
  G --> H["Run onboarding sample extract for day D"]

  H --> H1["Select up to N conversations in day D"]
  H1 --> H2["Fetch all messages in day D for each selected conversation"]
  H2 --> H3["Build sample conversation_day + message + observed_tags + opening_candidate_window"]
  H3 --> I["Generate tag dictionary and repeated opening candidates"]

  I --> J["IT fine-tunes Tag Taxonomy Mapper"]
  I --> K["IT fine-tunes Opening Flow Mapper"]
  J --> L["Optional: Run Pilot AI on sample"]
  K --> L
  L --> M["IT decides runtime toggles"]
  M --> M1["Auto Scraper ON/OFF"]
  M --> M2["Auto AI Analysis ON/OFF"]
```

## Steady-State Automatic System Flow

```mermaid
flowchart LR
  A["Daily scheduler tick"] --> B{"Auto Scraper ON?"}
  B -- "No" --> Z["No scheduled extract for this page"]
  B -- "Yes" --> C["Run full extract for day D"]
  C --> D["Fetch conversation window for day D"]
  D --> E["Fetch message pages per conversation"]
  E --> F["Keep only messages in business day D"]
  F --> G["Transform and load seam 1"]
  G --> G1["conversation_day"]
  G --> G2["message"]
  G --> G3["observed_tags / tag_events"]
  G --> G4["opening block evidence"]
  G --> H["Finalize seam 1 snapshot"]

  H --> I{"Auto AI Analysis ON?"}
  I -- "No" --> J["Wait for manual pilot or manual rerun"]
  I -- "Yes" --> K["Read final seam 1 snapshot for day D"]
  K --> K1["Read normalized tag signals"]
  K --> K2["Read opening signals"]
  K --> K3["Read previous conversation_state_summary"]
  K --> L["Run seam 2 analysis"]
  L --> M["Write ai_result + conversation_state_summary"]
  M --> N["Publish analysis version"]
  N --> O["Dashboard official reads published snapshot + published analysis pair"]
```

## Data Flow For One Day

```mermaid
flowchart LR
  A["Pancake conversations API"] --> B["Conversation selector window for day D"]
  B --> C["Selected conversations"]
  C --> D["Pancake messages API"]
  D --> E["Worker filters only messages in day D"]
  E --> F["conversation_day"]
  E --> G["message"]
  C --> H["tags / tag_histories on conversation"]
  H --> I["observed_tags / tag_events"]
  E --> J["opening_candidate_window / opening_block"]
  K["page tag dictionary"] --> L["page tag mapping"]
  I --> M["normalized tag signals"]

  F --> N["published seam 1 snapshot"]
  G --> N
  I --> N
  J --> N
  M --> N

  N --> O["seam 2 input manifest"]
  P["previous conversation_state_summary"] --> O
  O --> Q["ai_result for day D"]
  O --> R["updated conversation_state_summary as-of-day D"]
```

## Scheduler Controls

```mermaid
flowchart TD
  A["IT opens page runtime controls"] --> B["Toggle Auto Scraper"]
  A --> C["Toggle Auto AI Analysis"]
  A --> D["Run Scraper Now"]
  A --> E["Run Pilot AI"]
  A --> F["Run AI for day/range manually"]

  B --> B1["ON: daily scheduled extract runs for this page"]
  B --> B2["OFF: no scheduled extract, manual runs still allowed"]

  C --> C1["ON: AI is enqueued only after final seam 1 snapshot exists"]
  C --> C2["OFF: no scheduled AI, pilot/manual AI still allowed"]

  B2 --> G["No new automatic seam 1 snapshots"]
  G --> H["Auto AI for new days has no input to run on"]
```

## New Page Without Mappings

```mermaid
flowchart TD
  A["New page has no opening mapping yet"] --> C["Onboarding sample extract still runs"]
  B["New page has no tag mapping yet"] --> C

  C --> D["Extract sample conversation_day/message_day"]
  D --> E["Resolve page tag dictionary"]
  D --> F["Detect first_meaningful_human_message with default rules"]
  F --> G["Messages before that point = opening_candidate_window"]

  E --> H["Observed tags stay raw if not mapped"]
  G --> I["Opening candidate window stays raw if not mapped"]

  H --> J["Tag Taxonomy Mapper UI"]
  I --> K["Opening Flow Mapper UI"]

  J --> L["IT maps repeated patterns"]
  K --> L

  L --> M["Backfill normalized signals if needed"]
  M --> N["Pilot AI or automatic AI uses richer structured evidence"]
```

## Evidence Priority For AI

```mermaid
flowchart TD
  A["AI prepares input for one conversation-day"] --> B["Use opening_block_selection if available"]
  B --> C["Use normalized tag signals if available"]
  C --> D["Use previous conversation_state_summary"]
  D --> E["Read day D messages and observed tags"]
  E --> F{"Still missing key signals?"}
  F -- "No" --> G["Run AI with mostly structured context"]
  F -- "Yes" --> H["Infer missing parts from transcript context"]
  H --> G
```

## IT Use Cases

```mermaid
flowchart LR
  IT["IT / Operator"] --> U1["Add page"]
  IT --> U2["Monitor pipeline health"]
  IT --> U3["Run onboarding sample extract"]
  IT --> U4["Run Pilot AI on sample"]
  IT --> U5["Toggle Auto Scraper"]
  IT --> U6["Toggle Auto AI Analysis"]
  IT --> U7["Tag Taxonomy Mapper"]
  IT --> U8["Opening Flow Mapper"]
  IT --> U9["Review unmatched opening_candidate_window"]
  IT --> U10["Review unmapped tags"]
  IT --> U11["Prompt Sandbox"]
  IT --> U12["Manage analysis baseline"]
  IT --> U13["Backfill / replay"]
  IT --> U14["Inspect errors / payload drilldown"]
  IT --> U15["Track AI cost / rate limit"]

  U7 --> U7A["Map raw tag -> normalized taxonomy"]
  U7 --> U7B["Mark noise tags"]
  U8 --> U8A["Map postback/template -> customer_type / need / entry_flow"]
  U4 --> U4A["Select small pilot sample"]
  U13 --> U13A["Rebuild signals or AI results after mapping changes"]
```

## Business Use Cases

```mermaid
flowchart LR
  BOD["BoD / Lead Sales"] --> B1["View executive dashboard"]
  BOD --> B2["Compare pages"]
  BOD --> B3["View customer insights"]
  BOD --> B4["Review risk alerts"]
  BOD --> B5["Open transcript drilldown"]
  BOD --> B6["Export Excel report"]

  B1 --> B1A["Total thread / inbox mới / inbox cũ / tái khám"]
  B1 --> B1B["Closing outcome as-of-day"]
  B1 --> B1C["Sentiment / AI cost"]
  B3 --> B3A["Top needs"]
  B3 --> B3B["Opening themes"]
  B5 --> B5A["Raw chat for day D"]
  B5 --> B5B["AI result for day D"]
  B5 --> B5C["Opening signals / normalized tags / prior summary"]
```

## Mapping Improvement Loop

```mermaid
flowchart TD
  A["Page starts from onboarding sample extract"] --> B["System collects raw tags + opening_candidate_window"]
  B --> C["IT maps frequent patterns"]
  C --> D["System produces more normalized signals"]
  D --> E["AI needs less free-form inference"]
  E --> F["Lower cost + lower hallucination risk"]
  F --> G["Better dashboard quality"]
  G --> H["IT refines mappings further if needed"]
```
