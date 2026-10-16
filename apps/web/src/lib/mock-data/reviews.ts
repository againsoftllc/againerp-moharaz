// ─── Review Types ─────────────────────────────────────────────────────────────

export type ReviewStatus = "pending" | "approved" | "rejected" | "archived" | "spam";
export type ReviewType = "text" | "photo" | "video" | "verified";
export type SentimentType = "positive" | "negative" | "neutral" | "mixed";

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  archived: "Archived",
  spam: "Spam",
};

export const SENTIMENT_LABELS: Record<SentimentType, string> = {
  positive: "Positive",
  negative: "Negative",
  neutral: "Neutral",
  mixed: "Mixed",
};

export type CategoryRating = { label: string; score: number };

export type ReviewMedia = {
  id: string;
  type: "image" | "video";
  url: string;
  caption?: string;
};

export type ReviewAiAnalysis = {
  sentiment: SentimentType;
  sentimentScore: number;
  summary: string;
  prosSummary: string[];
  consSummary: string[];
  autoTags: string[];
  complaints: string[];
  mostLovedFeatures: string[];
  trustScore: number;
  qualityScore: number;
  isDuplicate: boolean;
  isSpam: boolean;
  suggestedAdminReply: string;
  productInsights: string[];
};

export type ReviewTimelineEvent = {
  id: string;
  type: "submitted" | "ai_analyzed" | "approved" | "rejected" | "edited" | "reported" | "note";
  title: string;
  description?: string;
  actor: string;
  actorInitials?: string;
  at: string;
};

export type ReviewNote = {
  id: string;
  author: string;
  authorInitials: string;
  body: string;
  at: string;
};

export type ReviewQA = {
  id: string;
  question: string;
  askedBy: string;
  askedAt: string;
  answers: {
    id: string;
    body: string;
    answeredBy: string;
    isVerified: boolean;
    answeredAt: string;
  }[];
};

export type Review = {
  id: string;
  reviewId: string;
  type: ReviewType;
  status: ReviewStatus;
  rating: number;
  title: string;
  body: string;
  pros: string[];
  cons: string[];
  categoryRatings: CategoryRating[];
  product: {
    id: string;
    name: string;
    sku: string;
    brand: string;
    category: string;
    imageUrl?: string;
    avgRating: number;
    totalReviews: number;
  };
  customer: {
    id: string;
    name: string;
    imageUrl?: string;
    group: string;
    totalOrders: number;
    ltv: number;
    trustScore: number;
    reviewCount: number;
  };
  isVerifiedPurchase: boolean;
  orderNumber?: string;
  purchaseDate?: string;
  helpfulVotes: number;
  notHelpfulVotes: number;
  media: ReviewMedia[];
  tags: string[];
  aiAnalysis: ReviewAiAnalysis;
  timeline: ReviewTimelineEvent[];
  notes: ReviewNote[];
  moderatedBy?: string;
  moderatedAt?: string;
  createdAt: string;
  updatedAt: string;
};

// ─── Seed data ─────────────────────────────────────────────────────────────────

export const reviewsSeed: Review[] = [
  {
    id: "rev_001",
    reviewId: "R-20001",
    type: "photo",
    status: "approved",
    rating: 5,
    title: "Best laptop I've ever bought — completely worth it!",
    body: "I've been using this laptop for 3 months now and I'm extremely impressed. The performance is outstanding, the display is gorgeous, and the battery easily lasts all day. Build quality feels premium. Highly recommend to anyone looking for a reliable daily driver.",
    pros: ["Exceptional performance", "Stunning display", "All-day battery", "Premium build quality"],
    cons: ["Slightly heavy for travel", "Charging brick is bulky"],
    categoryRatings: [
      { label: "Performance", score: 5 },
      { label: "Display", score: 5 },
      { label: "Battery", score: 4 },
      { label: "Build Quality", score: 5 },
      { label: "Value For Money", score: 4 },
      { label: "Keyboard", score: 5 },
      { label: "Portability", score: 3 },
    ],
    product: {
      id: "prod_001",
      name: "Dell XPS 15 (2025)",
      sku: "DELL-XPS15-2025",
      brand: "Dell",
      category: "Laptops",
      imageUrl: "https://placehold.co/48x48",
      avgRating: 4.6,
      totalReviews: 142,
    },
    customer: {
      id: "cust_001",
      name: "Rakibul Hasan",
      group: "retail",
      totalOrders: 18,
      ltv: 145200,
      trustScore: 92,
      reviewCount: 8,
    },
    isVerifiedPurchase: true,
    orderNumber: "#ORD-1001",
    purchaseDate: "2026-03-10",
    helpfulVotes: 47,
    notHelpfulVotes: 2,
    media: [
      { id: "m1", type: "image", url: "https://placehold.co/400x300", caption: "Unboxing the laptop" },
      { id: "m2", type: "image", url: "https://placehold.co/400x300", caption: "Display quality" },
    ],
    tags: ["performance", "display", "battery", "build-quality"],
    aiAnalysis: {
      sentiment: "positive",
      sentimentScore: 94,
      summary: "Highly positive review praising display, performance, and build quality. Minor concerns about portability and charging accessories.",
      prosSummary: ["Exceptional performance", "Stunning display quality", "All-day battery life", "Premium build"],
      consSummary: ["Heavy for commuting", "Bulky charger"],
      autoTags: ["performance", "display", "battery", "build-quality", "keyboard"],
      complaints: [],
      mostLovedFeatures: ["Display quality", "Performance", "Keyboard"],
      trustScore: 95,
      qualityScore: 91,
      isDuplicate: false,
      isSpam: false,
      suggestedAdminReply: "Thank you Rakibul for your detailed review! We're thrilled to hear the XPS 15 is meeting your expectations. Regarding the weight, we're working on lighter designs for future models. Your feedback about the charging brick has been noted for our product team.",
      productInsights: [
        "Display quality is a key purchase driver for this product",
        "Portability concerns may deter business traveler segment",
        "Keyboard satisfaction is consistently high — keep as selling point",
      ],
    },
    timeline: [
      { id: "tl_r001_1", type: "submitted", title: "Review submitted", actor: "Rakibul Hasan", at: "2026-06-10T10:00:00Z" },
      { id: "tl_r001_2", type: "ai_analyzed", title: "AI analysis completed", description: "Sentiment: Positive (94%). No spam detected.", actor: "AI Agent", at: "2026-06-10T10:01:00Z" },
      { id: "tl_r001_3", type: "approved", title: "Review approved", actor: "Sumaiya Akter", at: "2026-06-10T10:15:00Z" },
    ],
    notes: [
      { id: "n_r001_1", author: "Sumaiya Akter", authorInitials: "SA", body: "High-trust customer, verified purchase. Fast-tracked approval.", at: "2026-06-10T10:14:00Z" },
    ],
    moderatedBy: "Sumaiya Akter",
    moderatedAt: "2026-06-10T10:15:00Z",
    createdAt: "2026-06-10T10:00:00Z",
    updatedAt: "2026-06-10T10:15:00Z",
  },
  {
    id: "rev_002",
    reviewId: "R-20002",
    type: "text",
    status: "pending",
    rating: 2,
    title: "Disappointed — overheats constantly",
    body: "I bought this laptop expecting great things based on the reviews but I've been very disappointed. It overheats terribly during video calls and the fan noise is unbearable. The performance throttles badly. Customer support was unhelpful. Considering returning it.",
    pros: ["Good display", "Fast SSD"],
    cons: ["Extreme overheating", "Loud fan noise", "Performance throttling", "Poor customer support"],
    categoryRatings: [
      { label: "Performance", score: 2 },
      { label: "Display", score: 4 },
      { label: "Battery", score: 3 },
      { label: "Build Quality", score: 3 },
      { label: "Value For Money", score: 1 },
      { label: "Cooling", score: 1 },
    ],
    product: {
      id: "prod_001",
      name: "Dell XPS 15 (2025)",
      sku: "DELL-XPS15-2025",
      brand: "Dell",
      category: "Laptops",
      imageUrl: "https://placehold.co/48x48",
      avgRating: 4.6,
      totalReviews: 142,
    },
    customer: {
      id: "cust_003",
      name: "Jahidul Islam",
      group: "retail",
      totalOrders: 4,
      ltv: 18500,
      trustScore: 65,
      reviewCount: 2,
    },
    isVerifiedPurchase: true,
    orderNumber: "#ORD-3001",
    purchaseDate: "2026-05-20",
    helpfulVotes: 18,
    notHelpfulVotes: 3,
    media: [],
    tags: ["overheating", "cooling", "performance", "support"],
    aiAnalysis: {
      sentiment: "negative",
      sentimentScore: 18,
      summary: "Highly negative review focused on thermal throttling and cooling failures. Mentions potential return. Requires immediate response.",
      prosSummary: ["Display quality noted as positive", "SSD speed appreciated"],
      consSummary: ["Critical overheating problem", "Unacceptable fan noise", "Performance throttling under load", "Support failure"],
      autoTags: ["cooling", "overheating", "performance", "support", "return-risk"],
      complaints: ["Overheating under normal workload", "Fan noise disrupts video calls", "Performance throttling during demanding tasks", "Customer support did not resolve issue"],
      mostLovedFeatures: ["Display", "SSD"],
      trustScore: 72,
      qualityScore: 25,
      isDuplicate: false,
      isSpam: false,
      suggestedAdminReply: "Dear Jahidul, we sincerely apologize for your experience. Overheating issues should not occur under normal usage. Please contact our priority support line at 01700-000000 and mention review #R-20002 for immediate assistance. We want to make this right for you.",
      productInsights: [
        "Thermal management is a recurring complaint — escalate to product team",
        "Fan noise is impacting professional use cases — needs engineering review",
        "Support channel failure detected — review support SLA for this product",
      ],
    },
    timeline: [
      { id: "tl_r002_1", type: "submitted", title: "Review submitted", actor: "Jahidul Islam", at: "2026-06-11T14:00:00Z" },
      { id: "tl_r002_2", type: "ai_analyzed", title: "AI flagged: Negative review with complaint signals", description: "Sentiment: Negative (18%). Return risk detected. Immediate attention required.", actor: "AI Agent", at: "2026-06-11T14:01:00Z" },
    ],
    notes: [],
    createdAt: "2026-06-11T14:00:00Z",
    updatedAt: "2026-06-11T14:01:00Z",
  },
  {
    id: "rev_003",
    reviewId: "R-20003",
    type: "photo",
    status: "approved",
    rating: 4,
    title: "Excellent phone — camera is incredible",
    body: "The Samsung Galaxy S25 Ultra is a powerhouse. The camera system is absolutely incredible — the 200MP main sensor produces breathtaking photos. Battery life is great. The S Pen is a nice bonus. Only minor complaint is the premium price tag.",
    pros: ["Incredible camera system", "Excellent battery life", "S Pen included", "Smooth performance"],
    cons: ["Very expensive", "Heavy device"],
    categoryRatings: [
      { label: "Camera", score: 5 },
      { label: "Battery", score: 5 },
      { label: "Performance", score: 5 },
      { label: "Display", score: 5 },
      { label: "Value For Money", score: 3 },
      { label: "Build Quality", score: 4 },
    ],
    product: {
      id: "prod_002",
      name: "Samsung Galaxy S25 Ultra",
      sku: "SAM-S25U-256",
      brand: "Samsung",
      category: "Smartphones",
      imageUrl: "https://placehold.co/48x48",
      avgRating: 4.7,
      totalReviews: 289,
    },
    customer: {
      id: "cust_004",
      name: "Nasrin Akter",
      group: "corporate",
      totalOrders: 22,
      ltv: 320000,
      trustScore: 88,
      reviewCount: 12,
    },
    isVerifiedPurchase: true,
    orderNumber: "#ORD-4002",
    purchaseDate: "2026-05-25",
    helpfulVotes: 62,
    notHelpfulVotes: 4,
    media: [
      { id: "m3", type: "image", url: "https://placehold.co/400x300", caption: "Camera sample - daylight" },
      { id: "m4", type: "image", url: "https://placehold.co/400x300", caption: "Camera sample - night mode" },
      { id: "m5", type: "image", url: "https://placehold.co/400x300", caption: "Box contents" },
    ],
    tags: ["camera", "battery", "performance", "display"],
    aiAnalysis: {
      sentiment: "positive",
      sentimentScore: 88,
      summary: "Strong positive review with exceptional praise for camera system. Price sensitivity noted but does not reduce overall satisfaction.",
      prosSummary: ["200MP camera praised as best-in-class", "Battery performance exceeds expectations", "S Pen adds productivity value"],
      consSummary: ["Price is the primary friction point", "Weight noted by some users"],
      autoTags: ["camera", "battery", "performance", "display", "s-pen"],
      complaints: [],
      mostLovedFeatures: ["Camera", "Battery", "S Pen"],
      trustScore: 90,
      qualityScore: 88,
      isDuplicate: false,
      isSpam: false,
      suggestedAdminReply: "Thank you Nasrin for your wonderful review! We're thrilled the camera system exceeded your expectations. The Galaxy S25 Ultra is our flagship experience and your feedback inspires our team. Stay tuned for exclusive camera tips from our Samsung experts!",
      productInsights: [
        "Camera quality is the primary purchase driver — feature prominently in ads",
        "Price objections are common but don't prevent purchase — premium segment is price-insensitive",
        "S Pen feature has higher satisfaction than expected — increase marketing visibility",
      ],
    },
    timeline: [
      { id: "tl_r003_1", type: "submitted", title: "Review submitted", actor: "Nasrin Akter", at: "2026-06-09T11:00:00Z" },
      { id: "tl_r003_2", type: "ai_analyzed", title: "AI analysis completed", description: "Sentiment: Positive (88%). High-value review with media.", actor: "AI Agent", at: "2026-06-09T11:01:00Z" },
      { id: "tl_r003_3", type: "approved", title: "Review approved", actor: "Rafiq Ahmed", at: "2026-06-09T11:30:00Z" },
    ],
    notes: [],
    moderatedBy: "Rafiq Ahmed",
    moderatedAt: "2026-06-09T11:30:00Z",
    createdAt: "2026-06-09T11:00:00Z",
    updatedAt: "2026-06-09T11:30:00Z",
  },
  {
    id: "rev_004",
    reviewId: "R-20004",
    type: "text",
    status: "pending",
    rating: 3,
    title: "Average performance, great value",
    body: "It's a decent laptop for the price. Performance is acceptable for office work but struggles with heavy multitasking. The display is good and the keyboard is comfortable. Battery life is average. If you're on a budget, this works. Don't expect flagship performance.",
    pros: ["Good price-to-value", "Comfortable keyboard", "Decent display"],
    cons: ["Average performance under load", "Average battery life", "Fan gets loud"],
    categoryRatings: [
      { label: "Performance", score: 3 },
      { label: "Display", score: 4 },
      { label: "Battery", score: 3 },
      { label: "Build Quality", score: 3 },
      { label: "Value For Money", score: 4 },
      { label: "Keyboard", score: 4 },
    ],
    product: {
      id: "prod_003",
      name: "HP Pavilion 15",
      sku: "HP-PAV15-2025",
      brand: "HP",
      category: "Laptops",
      imageUrl: "https://placehold.co/48x48",
      avgRating: 3.8,
      totalReviews: 74,
    },
    customer: {
      id: "cust_005",
      name: "Tanvir Ahmed",
      group: "retail",
      totalOrders: 3,
      ltv: 22400,
      trustScore: 72,
      reviewCount: 1,
    },
    isVerifiedPurchase: true,
    orderNumber: "#ORD-5001",
    purchaseDate: "2026-06-01",
    helpfulVotes: 5,
    notHelpfulVotes: 1,
    media: [],
    tags: ["value", "keyboard", "display", "performance"],
    aiAnalysis: {
      sentiment: "neutral",
      sentimentScore: 52,
      summary: "Balanced review — positive about price-value ratio, neutral on performance. No critical complaints detected. Typical mid-range buyer assessment.",
      prosSummary: ["Value for money praised", "Keyboard comfort positive", "Display adequate"],
      consSummary: ["Performance limitations under heavy load", "Battery life below expectations"],
      autoTags: ["value", "keyboard", "display", "performance", "budget"],
      complaints: ["Performance throttling under heavy multitasking"],
      mostLovedFeatures: ["Value for money", "Keyboard"],
      trustScore: 80,
      qualityScore: 65,
      isDuplicate: false,
      isSpam: false,
      suggestedAdminReply: "Thank you Tanvir for your honest review! The HP Pavilion 15 is designed for everyday productivity and you've captured its strengths perfectly. For heavier workloads, we'd suggest upgrading to our HP EliteBook range. Let us know if you need any assistance!",
      productInsights: [
        "Value-for-money is the key differentiator — highlight in positioning",
        "Performance ceiling is understood and accepted by target segment",
      ],
    },
    timeline: [
      { id: "tl_r004_1", type: "submitted", title: "Review submitted", actor: "Tanvir Ahmed", at: "2026-06-12T09:00:00Z" },
      { id: "tl_r004_2", type: "ai_analyzed", title: "AI analysis completed", description: "Sentiment: Neutral (52%). Awaiting moderation.", actor: "AI Agent", at: "2026-06-12T09:01:00Z" },
    ],
    notes: [],
    createdAt: "2026-06-12T09:00:00Z",
    updatedAt: "2026-06-12T09:01:00Z",
  },
  {
    id: "rev_005",
    reviewId: "R-20005",
    type: "video",
    status: "approved",
    rating: 5,
    title: "Unboxing + Full Review — worth every taka!",
    body: "I made a full unboxing and review video. The build quality on this monitor is absolutely premium. The 4K display is a joy to work on. Color accuracy is professional-grade. I use it for graphic design work and it's transformed my workflow. The 144Hz refresh is smooth as butter for gaming too.",
    pros: ["4K resolution is stunning", "Professional color accuracy", "144Hz gaming performance", "Premium build", "USB-C hub built in"],
    cons: ["Expensive", "Thick bezel on bottom"],
    categoryRatings: [
      { label: "Display Quality", score: 5 },
      { label: "Color Accuracy", score: 5 },
      { label: "Refresh Rate", score: 5 },
      { label: "Build Quality", score: 5 },
      { label: "Value For Money", score: 4 },
      { label: "Connectivity", score: 5 },
    ],
    product: {
      id: "prod_004",
      name: "Dell UltraSharp 27 4K USB-C Monitor",
      sku: "DELL-U2723D",
      brand: "Dell",
      category: "Monitors",
      imageUrl: "https://placehold.co/48x48",
      avgRating: 4.8,
      totalReviews: 56,
    },
    customer: {
      id: "cust_002",
      name: "Fatema Begum",
      group: "wholesale",
      totalOrders: 54,
      ltv: 892000,
      trustScore: 97,
      reviewCount: 28,
    },
    isVerifiedPurchase: true,
    orderNumber: "#ORD-2001",
    purchaseDate: "2026-06-01",
    helpfulVotes: 94,
    notHelpfulVotes: 1,
    media: [
      { id: "m6", type: "video", url: "https://placehold.co/400x300", caption: "Full unboxing & review video" },
      { id: "m7", type: "image", url: "https://placehold.co/400x300", caption: "Color accuracy test" },
    ],
    tags: ["display", "color-accuracy", "4k", "gaming", "professional"],
    aiAnalysis: {
      sentiment: "positive",
      sentimentScore: 97,
      summary: "Exceptional review from a high-trust customer. Video review with media evidence. Strong endorsement for professional and gaming use cases.",
      prosSummary: ["4K quality praised as stunning", "Color accuracy validated for professional use", "144Hz noted for gaming", "USB-C hub is a key differentiator"],
      consSummary: ["Premium pricing", "Minor bezel complaint"],
      autoTags: ["display", "4k", "color-accuracy", "gaming", "professional", "usb-c"],
      complaints: [],
      mostLovedFeatures: ["4K display", "Color accuracy", "USB-C hub"],
      trustScore: 99,
      qualityScore: 97,
      isDuplicate: false,
      isSpam: false,
      suggestedAdminReply: "Fatema, thank you for this incredible review! Your video showcases the UltraSharp 27 perfectly. We're featuring your review in our 'Verified Professional' collection. As a thank-you, please check your email for a special loyalty reward from our team!",
      productInsights: [
        "USB-C hub is undermarketed — customers discover and love it post-purchase",
        "Professional creative segment is highly satisfied — target design community",
        "Video reviews have 3x more helpful votes — incentivize video submissions",
      ],
    },
    timeline: [
      { id: "tl_r005_1", type: "submitted", title: "Review submitted with video", actor: "Fatema Begum", at: "2026-06-08T15:00:00Z" },
      { id: "tl_r005_2", type: "ai_analyzed", title: "AI analysis completed", description: "Sentiment: Positive (97%). High-value video review — VIP customer.", actor: "AI Agent", at: "2026-06-08T15:01:00Z" },
      { id: "tl_r005_3", type: "approved", title: "Featured review — approved", actor: "Sumaiya Akter", at: "2026-06-08T15:20:00Z" },
    ],
    notes: [
      { id: "n_r005_1", author: "Sumaiya Akter", authorInitials: "SA", body: "VIP customer with 28 past reviews. Feature this as a hero review on the product page. Send loyalty reward.", at: "2026-06-08T15:19:00Z" },
    ],
    moderatedBy: "Sumaiya Akter",
    moderatedAt: "2026-06-08T15:20:00Z",
    createdAt: "2026-06-08T15:00:00Z",
    updatedAt: "2026-06-08T15:20:00Z",
  },
  {
    id: "rev_006",
    reviewId: "R-20006",
    type: "text",
    status: "rejected",
    rating: 1,
    title: "FAKE PRODUCT DO NOT BUY",
    body: "This is a total scam!!!! The product I received is NOT the original. It's a cheap Chinese copy. The box looks fake, the accessories are different. I demand a full refund immediately!!! Filing a complaint with consumer protection!!!",
    pros: [],
    cons: ["Product appears to be counterfeit", "Suspicious packaging"],
    categoryRatings: [],
    product: {
      id: "prod_002",
      name: "Samsung Galaxy S25 Ultra",
      sku: "SAM-S25U-256",
      brand: "Samsung",
      category: "Smartphones",
      imageUrl: "https://placehold.co/48x48",
      avgRating: 4.7,
      totalReviews: 289,
    },
    customer: {
      id: "cust_x01",
      name: "Unknown User",
      group: "retail",
      totalOrders: 1,
      ltv: 12000,
      trustScore: 15,
      reviewCount: 0,
    },
    isVerifiedPurchase: false,
    helpfulVotes: 2,
    notHelpfulVotes: 31,
    media: [],
    tags: ["spam", "suspicious", "unverified"],
    aiAnalysis: {
      sentiment: "negative",
      sentimentScore: 5,
      summary: "Suspicious review — unverified purchase, inflammatory language, no media evidence. High spam probability detected.",
      prosSummary: [],
      consSummary: ["Counterfeit claim with no evidence"],
      autoTags: ["spam", "fake", "unverified"],
      complaints: ["Counterfeit product allegation"],
      mostLovedFeatures: [],
      trustScore: 12,
      qualityScore: 8,
      isDuplicate: false,
      isSpam: true,
      suggestedAdminReply: "",
      productInsights: [],
    },
    timeline: [
      { id: "tl_r006_1", type: "submitted", title: "Review submitted", actor: "Unknown User", at: "2026-06-07T08:00:00Z" },
      { id: "tl_r006_2", type: "ai_analyzed", title: "AI flagged: High spam probability", description: "Trust score: 12%. No verified purchase. Inflammatory language detected.", actor: "AI Agent", at: "2026-06-07T08:01:00Z" },
      { id: "tl_r006_3", type: "rejected", title: "Review rejected — spam detected", actor: "Rafiq Ahmed", at: "2026-06-07T09:00:00Z" },
    ],
    notes: [
      { id: "n_r006_1", author: "Rafiq Ahmed", authorInitials: "RA", body: "No verified purchase. AI flagged as spam. Rejected per moderation policy.", at: "2026-06-07T09:00:00Z" },
    ],
    moderatedBy: "Rafiq Ahmed",
    moderatedAt: "2026-06-07T09:00:00Z",
    createdAt: "2026-06-07T08:00:00Z",
    updatedAt: "2026-06-07T09:00:00Z",
  },
  {
    id: "rev_007",
    reviewId: "R-20007",
    type: "text",
    status: "pending",
    rating: 4,
    title: "Good router, solid performance",
    body: "TP-Link Archer AX90 has been a solid performer in my office. Coverage is excellent throughout 3 floors. Setup was simple with the app. Speed tests consistently hit 900+ Mbps on 5GHz. A little pricey but the performance justifies it.",
    pros: ["Excellent coverage", "Easy setup", "Fast speeds on 5GHz", "Stable connection"],
    cons: ["Expensive", "App could be more intuitive"],
    categoryRatings: [
      { label: "Coverage", score: 5 },
      { label: "Speed", score: 4 },
      { label: "Setup Ease", score: 5 },
      { label: "Stability", score: 4 },
      { label: "Value For Money", score: 3 },
    ],
    product: {
      id: "prod_005",
      name: "TP-Link Archer AX90",
      sku: "TPL-AX90",
      brand: "TP-Link",
      category: "Networking",
      imageUrl: "https://placehold.co/48x48",
      avgRating: 4.3,
      totalReviews: 38,
    },
    customer: {
      id: "cust_004",
      name: "Nasrin Akter",
      group: "corporate",
      totalOrders: 22,
      ltv: 320000,
      trustScore: 88,
      reviewCount: 13,
    },
    isVerifiedPurchase: true,
    orderNumber: "#ORD-4001",
    purchaseDate: "2026-05-28",
    helpfulVotes: 12,
    notHelpfulVotes: 0,
    media: [],
    tags: ["coverage", "speed", "setup", "networking"],
    aiAnalysis: {
      sentiment: "positive",
      sentimentScore: 82,
      summary: "Positive review focused on coverage and speed. Price sensitivity noted. Corporate use case validation is valuable social proof.",
      prosSummary: ["Coverage praised for multi-floor office", "Speed performance verified", "Setup simplicity appreciated"],
      consSummary: ["Premium pricing", "App UX improvements needed"],
      autoTags: ["coverage", "speed", "setup", "wifi", "office"],
      complaints: ["App UX could be improved"],
      mostLovedFeatures: ["Coverage", "Setup", "Speed"],
      trustScore: 88,
      qualityScore: 82,
      isDuplicate: false,
      isSpam: false,
      suggestedAdminReply: "Thank you Nasrin for your review! Great to hear the AX90 is covering your 3-floor office effectively. We'll pass your app feedback to the TP-Link development team. Corporate customers like yourself drive our product improvements!",
      productInsights: [
        "Multi-floor office is an important use case to highlight in marketing",
        "App UX is a recurring friction point — schedule improvement",
      ],
    },
    timeline: [
      { id: "tl_r007_1", type: "submitted", title: "Review submitted", actor: "Nasrin Akter", at: "2026-06-12T16:00:00Z" },
      { id: "tl_r007_2", type: "ai_analyzed", title: "AI analysis completed", description: "Sentiment: Positive (82%). Awaiting moderation.", actor: "AI Agent", at: "2026-06-12T16:01:00Z" },
    ],
    notes: [],
    createdAt: "2026-06-12T16:00:00Z",
    updatedAt: "2026-06-12T16:01:00Z",
  },
  {
    id: "rev_008",
    reviewId: "R-20008",
    type: "text",
    status: "approved",
    rating: 5,
    title: "Logitech MX Master 3 — productivity game changer",
    body: "After using this mouse for 2 weeks, I can confidently say it's the best peripheral I've ever bought. The MagSpeed scroll wheel is revolutionary. Multi-device Bluetooth switching is seamless. Ergonomics are perfect for long work sessions. Battery lasts weeks on a single charge.",
    pros: ["MagSpeed scroll wheel is amazing", "Multi-device switching", "Excellent ergonomics", "Long battery life"],
    cons: ["Expensive for a mouse", "Not ideal for small hands"],
    categoryRatings: [
      { label: "Ergonomics", score: 5 },
      { label: "Battery Life", score: 5 },
      { label: "Performance", score: 5 },
      { label: "Features", score: 5 },
      { label: "Value For Money", score: 4 },
    ],
    product: {
      id: "prod_006",
      name: "Logitech MX Master 3S",
      sku: "LOG-MXM3S",
      brand: "Logitech",
      category: "Accessories",
      imageUrl: "https://placehold.co/48x48",
      avgRating: 4.9,
      totalReviews: 213,
    },
    customer: {
      id: "cust_001",
      name: "Rakibul Hasan",
      group: "retail",
      totalOrders: 18,
      ltv: 145200,
      trustScore: 92,
      reviewCount: 9,
    },
    isVerifiedPurchase: true,
    orderNumber: "#ORD-987",
    purchaseDate: "2026-05-22",
    helpfulVotes: 78,
    notHelpfulVotes: 2,
    media: [],
    tags: ["ergonomics", "battery", "productivity", "multi-device"],
    aiAnalysis: {
      sentiment: "positive",
      sentimentScore: 96,
      summary: "Exceptional review from a loyal customer. High engagement potential. Ergonomics and MagSpeed wheel are primary purchase drivers.",
      prosSummary: ["MagSpeed scroll praised as revolutionary", "Multi-device feature highly valued", "Ergonomics perfect for extended work"],
      consSummary: ["Price perception as premium", "Hand size compatibility noted"],
      autoTags: ["ergonomics", "battery", "productivity", "bluetooth", "multi-device"],
      complaints: [],
      mostLovedFeatures: ["MagSpeed scroll", "Multi-device", "Ergonomics"],
      trustScore: 94,
      qualityScore: 95,
      isDuplicate: false,
      isSpam: false,
      suggestedAdminReply: "Rakibul, thank you for such a detailed review of the MX Master 3S! Your insights about the MagSpeed wheel are spot-on — it truly transforms productivity. We're so happy it's made a difference in your work sessions. See you at our next tech launch event!",
      productInsights: [
        "MagSpeed scroll is a key differentiator — use in conversion copy",
        "Multi-device Bluetooth is a selling point for power users",
        "Hand size compatibility should be addressed in product specs",
      ],
    },
    timeline: [
      { id: "tl_r008_1", type: "submitted", title: "Review submitted", actor: "Rakibul Hasan", at: "2026-06-05T14:00:00Z" },
      { id: "tl_r008_2", type: "ai_analyzed", title: "AI analysis completed", description: "Sentiment: Positive (96%). Featured review candidate.", actor: "AI Agent", at: "2026-06-05T14:01:00Z" },
      { id: "tl_r008_3", type: "approved", title: "Review approved", actor: "Sumaiya Akter", at: "2026-06-05T14:10:00Z" },
    ],
    notes: [],
    moderatedBy: "Sumaiya Akter",
    moderatedAt: "2026-06-05T14:10:00Z",
    createdAt: "2026-06-05T14:00:00Z",
    updatedAt: "2026-06-05T14:10:00Z",
  },
];

// ─── Helper functions ─────────────────────────────────────────────────────────

export function countReviewsByStatus(reviews: Review[]): Record<string, number> {
  return reviews.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      acc.all = (acc.all ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
}

export const reviewsDashboardKpis = {
  total: 1847,
  pending: 134,
  approved: 1598,
  rejected: 115,
  avgRating: 4.3,
  responseRate: 67,
  photoReviews: 423,
  videoReviews: 89,
  verifiedReviews: 1342,
  negativeAlerts: 28,
};
