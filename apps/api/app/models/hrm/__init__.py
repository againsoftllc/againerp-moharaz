"""HRM domain SQLAlchemy models (prefix hrm_)."""
from __future__ import annotations

from app.models.hrm.org import (  # noqa: F401
    HrmBranch,
    HrmDepartment,
    HrmDesignation,
    HrmDocumentType,
    HrmEmployee,
    HrmEmployeeDocument,
    HrmAwardType,
    HrmAward,
    HrmIpRestriction
)

from app.models.hrm.documents import (  # noqa: F401
    HrmDocumentCategory,
    HrmHrDocument,
    HrmDocumentAcknowledgment,
    HrmDocumentTemplate,
    HrmContractType,
    HrmContractTemplate,
    HrmEmployeeContract,
    HrmContractRenewal
)

from app.models.hrm.attendance import (  # noqa: F401
    HrmLeaveType,
    HrmLeavePolicy,
    HrmLeaveApplication,
    HrmLeaveBalance,
    HrmShift,
    HrmAttendancePolicy,
    HrmAttendanceRecord,
    HrmAttendanceRegularization,
    HrmTimeEntry,
    HrmHoliday,
    HrmHolidayBranch
)

from app.models.hrm.payroll import (  # noqa: F401
    HrmSalaryComponent,
    HrmEmployeeSalary,
    HrmEmployeeSalaryComponent,
    HrmPayrollRun,
    HrmPayrollEntry,
    HrmPayslip
)

from app.models.hrm.recruitment import (  # noqa: F401
    HrmJobCategory,
    HrmJobType,
    HrmJobLocation,
    HrmJobRequisition,
    HrmJobPosting,
    HrmCandidateSource,
    HrmCandidate,
    HrmInterviewType,
    HrmInterviewRound,
    HrmInterview,
    HrmInterviewFeedback,
    HrmCandidateAssessment,
    HrmOfferTemplate,
    HrmOffer,
    HrmOnboardingChecklist,
    HrmChecklistItem,
    HrmCandidateOnboarding,
    HrmCustomQuestion
)

from app.models.hrm.performance import (  # noqa: F401
    HrmPerformanceIndicatorCategory,
    HrmPerformanceIndicator,
    HrmGoalType,
    HrmEmployeeGoal,
    HrmReviewCycle,
    HrmEmployeeReview,
    HrmEmployeeReviewRating
)

from app.models.hrm.lifecycle import (  # noqa: F401
    HrmResignation,
    HrmPromotion,
    HrmTermination,
    HrmWarning,
    HrmComplaint,
    HrmEmployeeTransfer,
    HrmTrip,
    HrmTripExpense
)

from app.models.hrm.training import (  # noqa: F401
    HrmTrainingType,
    HrmTrainingProgram,
    HrmTrainingSession,
    HrmTrainingSessionAttendance,
    HrmEmployeeTraining,
    HrmTrainingAssessment,
    HrmEmployeeAssessmentResult
)

from app.models.hrm.assets import (  # noqa: F401
    HrmAssetType,
    HrmAsset,
    HrmAssetAssignment,
    HrmAssetMaintenance,
    HrmAssetDepreciation
)

from app.models.hrm.meetings import (  # noqa: F401
    HrmMeetingType,
    HrmMeetingRoom,
    HrmMeeting,
    HrmMeetingAttendee,
    HrmMeetingMinute,
    HrmActionItem,
    HrmAnnouncement,
    HrmAnnouncementView
)

__all__ = [
    "HrmBranch",
    "HrmDepartment",
    "HrmDesignation",
    "HrmDocumentType",
    "HrmEmployee",
    "HrmEmployeeDocument",
    "HrmAwardType",
    "HrmAward",
    "HrmIpRestriction",
    "HrmDocumentCategory",
    "HrmHrDocument",
    "HrmDocumentAcknowledgment",
    "HrmDocumentTemplate",
    "HrmContractType",
    "HrmContractTemplate",
    "HrmEmployeeContract",
    "HrmContractRenewal",
    "HrmLeaveType",
    "HrmLeavePolicy",
    "HrmLeaveApplication",
    "HrmLeaveBalance",
    "HrmShift",
    "HrmAttendancePolicy",
    "HrmAttendanceRecord",
    "HrmAttendanceRegularization",
    "HrmTimeEntry",
    "HrmHoliday",
    "HrmHolidayBranch",
    "HrmSalaryComponent",
    "HrmEmployeeSalary",
    "HrmEmployeeSalaryComponent",
    "HrmPayrollRun",
    "HrmPayrollEntry",
    "HrmPayslip",
    "HrmJobCategory",
    "HrmJobType",
    "HrmJobLocation",
    "HrmJobRequisition",
    "HrmJobPosting",
    "HrmCandidateSource",
    "HrmCandidate",
    "HrmInterviewType",
    "HrmInterviewRound",
    "HrmInterview",
    "HrmInterviewFeedback",
    "HrmCandidateAssessment",
    "HrmOfferTemplate",
    "HrmOffer",
    "HrmOnboardingChecklist",
    "HrmChecklistItem",
    "HrmCandidateOnboarding",
    "HrmCustomQuestion",
    "HrmPerformanceIndicatorCategory",
    "HrmPerformanceIndicator",
    "HrmGoalType",
    "HrmEmployeeGoal",
    "HrmReviewCycle",
    "HrmEmployeeReview",
    "HrmEmployeeReviewRating",
    "HrmResignation",
    "HrmPromotion",
    "HrmTermination",
    "HrmWarning",
    "HrmComplaint",
    "HrmEmployeeTransfer",
    "HrmTrip",
    "HrmTripExpense",
    "HrmTrainingType",
    "HrmTrainingProgram",
    "HrmTrainingSession",
    "HrmTrainingSessionAttendance",
    "HrmEmployeeTraining",
    "HrmTrainingAssessment",
    "HrmEmployeeAssessmentResult",
    "HrmAssetType",
    "HrmAsset",
    "HrmAssetAssignment",
    "HrmAssetMaintenance",
    "HrmAssetDepreciation",
    "HrmMeetingType",
    "HrmMeetingRoom",
    "HrmMeeting",
    "HrmMeetingAttendee",
    "HrmMeetingMinute",
    "HrmActionItem",
    "HrmAnnouncement",
    "HrmAnnouncementView",
]
