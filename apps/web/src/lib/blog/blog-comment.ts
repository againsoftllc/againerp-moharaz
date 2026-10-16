export type BlogCommentStatus = "pending" | "approved" | "rejected" | "spam";

export const BLOG_COMMENT_STATUS_LABELS: Record<BlogCommentStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  spam: "Spam",
};

export type BlogComment = {
  id: string;
  postId: string;
  articleTitle: string;
  authorName: string;
  authorEmail: string | null;
  body: string;
  status: BlogCommentStatus;
  parentId: string | null;
  moderatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};
