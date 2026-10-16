/**
 * Bangladesh mobile numbers — store as local `01XXXXXXXXX` (11 digits).
 * Accepts free input: spaces, dashes, +880 / 880, 10-digit without leading 0, etc.
 */

const BD_LOCAL_RE = /^01[3-9]\d{8}$/;

export type PhoneNormalizeResult =
  | { ok: true; phone: string }
  | { ok: false; phone: ""; reason: string };

/** Strip formatting and convert to `01XXXXXXXXX` when possible. */
export function normalizeBdPhone(input: string): PhoneNormalizeResult {
  const raw = (input ?? "").trim();
  if (!raw) {
    return { ok: true, phone: "" };
  }

  let digits = raw.replace(/\D/g, "");
  if (!digits) {
    return { ok: false, phone: "", reason: "Enter a valid phone number" };
  }

  // +880 / 880 country code
  if (digits.startsWith("880")) {
    digits = digits.slice(3);
  }

  // 10-digit mobile without leading 0 (e.g. 1642324294)
  if (digits.length === 10 && digits.startsWith("1")) {
    digits = `0${digits}`;
  }

  // 9-digit body after operator prefix was dropped (e.g. 642324294 → 01642324294)
  if (digits.length === 9 && /^[3-9]/.test(digits)) {
    digits = `01${digits}`;
  }

  // Accidental extra trailing digit on an otherwise valid 01… number
  if (digits.length === 12 && digits.startsWith("01") && BD_LOCAL_RE.test(digits.slice(0, 11))) {
    digits = digits.slice(0, 11);
  }

  if (!BD_LOCAL_RE.test(digits)) {
    return {
      ok: false,
      phone: "",
      reason:
        "Phone must be a Bangladesh mobile (e.g. 01642324294). You can type +880, spaces, or dashes — we will format it.",
    };
  }

  return { ok: true, phone: digits };
}

export function isValidBdPhone(input: string): boolean {
  return normalizeBdPhone(input).ok;
}

/** Compare two phones by normalized local form (empty never matches). */
export function phonesMatch(a: string, b: string): boolean {
  const left = normalizeBdPhone(a);
  const right = normalizeBdPhone(b);
  if (!left.ok || !right.ok || !left.phone || !right.phone) return false;
  return left.phone === right.phone;
}
