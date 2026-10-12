export const contentTypes = new Set(["terminology", "morphology", "abbreviation", "lesson", "quiz", "translation", "dataset"]);

export type ContentRecord = {
  stable_id: string;
  content_type: string;
  lifecycle_state: string;
  current_revision: number;
  published_revision: number | null;
};

export type ContentRevision = {
  revision: number;
  content: Record<string, unknown>;
  source_metadata: Record<string, unknown>;
  author_id: string;
  change_reason: string;
  review_state: string;
  reviewer_id: string | null;
  created_at: string;
  reviewed_at: string | null;
  published_at: string | null;
};
