export const LEAD_SOURCES = [
  { value: "website", label: "Website" },
  { value: "facebook", label: "Facebook" },
  { value: "google", label: "Google" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "referral", label: "Referral" },
  { value: "campaign", label: "Campaign" },
  { value: "event", label: "Event" },
  { value: "cold_call", label: "Cold call" },
  { value: "social", label: "Social" },
  { value: "manual", label: "Manual" },
  { value: "other", label: "Other" },
];

export const LEAD_STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  interested: "Interested",
  qualified: "Qualified",
  unqualified: "Unqualified",
  converted: "Converted",
  lost: "Lost",
};

export const LEAD_NEXT_STATUS: Record<string, string> = {
  new: "contacted",
  contacted: "interested",
  interested: "qualified",
};

export const LEAD_LOST_REASONS = [
  { value: "budget_issue", label: "Budget Issue" },
  { value: "competitor_selected", label: "Competitor Selected" },
  { value: "no_response", label: "No Response" },
  { value: "project_cancelled", label: "Project Cancelled" },
  { value: "not_interested", label: "Not Interested" },
  { value: "wrong_lead", label: "Wrong Lead" },
  { value: "timeline_changed", label: "Timeline Changed" },
  { value: "other", label: "Other" },
];

export const FOLLOW_UP_TYPES = [
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "send_proposal", label: "Send Proposal" },
  { value: "demo", label: "Demo" },
  { value: "other", label: "Other" },
];

export const COLLAB_ACTION_LABELS: Record<string, string> = {
  created: "Lead created",
  updated: "Lead updated",
  assignment: "Reassigned",
  stage_changed: "Stage changed",
  qualification_updated: "Qualification details added",
  follow_up_scheduled: "Follow-up scheduled",
  follow_up_completed: "Follow-up completed",
  follow_up_rescheduled: "Follow-up rescheduled",
  follow_up_cancelled: "Follow-up cancelled",
  converted: "Converted to deal",
  comment: "Note added",
};
