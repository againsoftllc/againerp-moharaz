/** Curated Font Awesome 6 classes for side-menu live edit. */
export const SIDE_MENU_FA_ICONS: { className: string; label: string }[] = [
  { className: "fa-solid fa-phone", label: "Phone" },
  { className: "fa-solid fa-phone-volume", label: "Phone volume" },
  { className: "fa-solid fa-comment-dots", label: "Message" },
  { className: "fa-solid fa-comments", label: "Comments" },
  { className: "fa-solid fa-envelope", label: "Envelope" },
  { className: "fa-solid fa-right-left", label: "Compare" },
  { className: "fa-solid fa-arrows-left-right", label: "Arrows" },
  { className: "fa-solid fa-gift", label: "Gift" },
  { className: "fa-solid fa-fire", label: "Fire" },
  { className: "fa-solid fa-bolt", label: "Bolt" },
  { className: "fa-solid fa-desktop", label: "Desktop" },
  { className: "fa-solid fa-computer", label: "Computer" },
  { className: "fa-solid fa-laptop", label: "Laptop" },
  { className: "fa-solid fa-mobile-screen", label: "Mobile" },
  { className: "fa-solid fa-cart-shopping", label: "Cart" },
  { className: "fa-solid fa-bag-shopping", label: "Bag" },
  { className: "fa-solid fa-heart", label: "Heart" },
  { className: "fa-solid fa-star", label: "Star" },
  { className: "fa-solid fa-tags", label: "Tags" },
  { className: "fa-solid fa-percent", label: "Percent" },
  { className: "fa-solid fa-headset", label: "Headset" },
  { className: "fa-solid fa-location-dot", label: "Location" },
  { className: "fa-solid fa-house", label: "Home" },
  { className: "fa-solid fa-user", label: "User" },
  { className: "fa-solid fa-gear", label: "Gear" },
  { className: "fa-solid fa-circle-info", label: "Info" },
  { className: "fa-brands fa-whatsapp", label: "WhatsApp" },
  { className: "fa-brands fa-facebook-f", label: "Facebook" },
  { className: "fa-brands fa-instagram", label: "Instagram" },
  { className: "fa-brands fa-youtube", label: "YouTube" },
];

const FA_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css";

/** Ensure Font Awesome CSS is loaded once (admin live-edit drawer preview). */
export function ensureFontAwesomeCss(): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`link[data-fa-cdn="6.5.2"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = FA_CDN;
  link.setAttribute("data-fa-cdn", "6.5.2");
  document.head.appendChild(link);
}
