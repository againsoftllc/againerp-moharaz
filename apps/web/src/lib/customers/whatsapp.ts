/** Normalize a Bangladesh (or international) phone for WhatsApp wa.me links. */
export function toWhatsAppDigits(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("880") && digits.length >= 13) return digits;
  if (digits.startsWith("0") && digits.length >= 11) return `880${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("1")) return `880${digits}`;
  if (digits.length >= 10) return digits;
  return null;
}

export function whatsappChatUrl(phone: string): string | null {
  const digits = toWhatsAppDigits(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}
