"""Rules of scripts/tidy_spec_profile.py, one block per product type (profile code → Rules).

A filter is written as its options and where to look for them, in order — the product's old filter value (EX),
its name (NAME), spec fields by name (SPEC) — or as a small function for what needs reading (sockets from
chipsets, totals from "8GB x 2"…). Profiles not listed here are tidied automatically (their own filters with the
spellings merged, spec fields shared by 10% of their products).
"""
from __future__ import annotations

import re
from typing import Optional

from scripts.spec_tidy_engine import (ALL, EX, NAME, SPEC, F, Product, Rules, TextField, buckets, exact, first, labels,
                                      number, pick)

# ── shared ───────────────────────────────────────────────────────────────────

COLORS = ["Black", "White", ("Silver", r"silver"), ("Grey", r"gr[ae]y|gunmetal"), "Red", "Blue", "Pink", "Green",
          "Purple", "Orange", "Yellow"]


def color(*extra_sources):
    return pick(COLORS, NAME, EX("color"), *extra_sources, SPEC(r"^colou?r", r"^body colou?r"))


def connectivity(*sources, wired_default: bool = True):
    """Wired / Wireless / Bluetooth: the name and old filter values; a peripheral that never mentions wireless
    or Bluetooth is wired."""
    opts = [("Wired", r"\bwired\b|tri-?mode"), ("Wireless", r"wireless|2\.4 ?g|tri-?mode|dongle"),
            ("Bluetooth", r"bluetooth|\bbt\b|tri-?mode|dual[- ]mode")]
    found = pick(opts, NAME, *sources, multi=True)

    def derive(p: Product) -> list[str]:
        got = found(p)
        if not got and wired_default:
            return ["Wired"]
        return got

    return derive


def gb_size(text: str) -> Optional[float]:
    """"1TB" → 1000, "512 GB" → 512."""
    m = re.search(r"(\d+(?:\.\d+)?)\s*(TB|GB)\b", text, re.I)
    if not m:
        return None
    n = float(m.group(1))
    return n * 1000 if m.group(2).upper() == "TB" else n


# ── motherboards ─────────────────────────────────────────────────────────────

AMD_CHIPSETS = ["A68H", "A88X", "A320", "B350", "X370", "B450", "X470", "A520", "B550", "X570", "A620", "B650",
                "X670", "X670E", "B840", "B850", "X870", "X870E", "TRX40", "TRX50", "WRX80", "WRX90"]
INTEL_CHIPSETS = ["G41", "H55", "H61", "B75", "H77", "Z77", "H81", "B85", "H87", "Z87", "H97", "Z97", "H110", "B150",
                  "H170", "Z170", "B250", "H270", "Z270", "H310", "B360", "B365", "H370", "Q370", "Z370", "Z390", "H410",
                  "B460", "H470", "Q470", "Z490", "H510", "B560", "H570", "Q570", "Z590", "H610", "B660", "H670",
                  "Q670", "Z690", "B760", "H770", "Z790", "H810", "B860", "Z890", "W480", "W580", "W680", "W790",
                  "X299", "C246", "C256"]
CHIPSET_SOCKET = {
    "A68H": "FM2+", "A88X": "FM2+", "G41": "LGA775", "H55": "LGA1156", "Q370": "LGA1151", "Q470": "LGA1200",
    "Q570": "LGA1200", "Q670": "LGA1700",
    **{c: "AM4" for c in ["A320", "B350", "X370", "B450", "X470", "A520", "B550", "X570"]},
    **{c: "AM5" for c in ["A620", "B650", "X670", "X670E", "B840", "B850", "X870", "X870E"]},
    "TRX40": "sTRX4", "TRX50": "sTR5", "WRX80": "sWRX8", "WRX90": "sTR5",
    **{c: "LGA1155" for c in ["H61", "B75", "H77", "Z77"]},
    **{c: "LGA1150" for c in ["H81", "B85", "H87", "Z87", "H97", "Z97"]},
    **{c: "LGA1151" for c in ["H110", "B150", "H170", "Z170", "B250", "H270", "Z270", "H310", "B360", "B365", "H370",
                              "Z370", "Z390", "C246"]},
    **{c: "LGA1200" for c in ["H410", "B460", "H470", "Z490", "H510", "B560", "H570", "Z590", "W480", "W580"]},
    **{c: "LGA1700" for c in ["H610", "B660", "H670", "Z690", "B760", "H770", "Z790", "W680"]},
    **{c: "LGA1851" for c in ["H810", "B860", "Z890"]},
    "W790": "LGA4677", "X299": "LGA2066", "C256": "LGA1200",
}
SOCKETS = ["LGA1851", "LGA1700", "LGA1200", "LGA1151", "LGA1150", "LGA1155", "LGA2066", "LGA4677",
           "LGA1156", "LGA775", "AM5", "AM4", "FM2+", "sTR5", "sTRX4", "sWRX8"]
CHIPSET_RE = re.compile(r"(?<![A-Z0-9])(TRX40|TRX50|WRX80|WRX90|A68H|A88X|[ABHXZWCQG]\d{2,3})(E?)(?=[^0-9]|$)")
SOCKET_RE = re.compile(r"\b(?:LGA|socket) ?(1851|1700|1200|1151|1150|1155|1156|2066|4677|775)\b|\b(AM[45]|FM2\+)|\b(sTRX4|sTR5|sWRX8)\b",
                       re.I)


def _chipset_order(chip: str) -> tuple:
    sock = CHIPSET_SOCKET.get(chip, "")
    tier = "ZXBHAQWCGT".find(chip[0])
    num = int(re.sub(r"\D", "", chip) or 0)
    return (SOCKETS.index(sock) if sock in SOCKETS else 99, tier, -num, -len(chip))


CHIPSET_OPTIONS = [f"{'AMD' if c in AMD_CHIPSETS else 'Intel'} {c}" for c in sorted(AMD_CHIPSETS + INTEL_CHIPSETS, key=_chipset_order)]
FORM_FIELDS = (r"form factor", r"motherboard type", r"^type$", r"product type")
MEMORY_FIELDS = (r"memory", r"ram", r"dimm", r"^type$", r"channel architecture")
WIRELESS_FIELDS = (r"wi ?fi", r"wireless", r"bluetooth", r"wlan")


def mb_chipset(p: Product) -> Optional[str]:
    """The board's chipset ("B650", "X870E"): the name first (it carries the exact model, where the chipset field
    often says "AMD X670" for an X670E board), then the chipset and CPU fields."""
    for text in (p.name, p.text(r"chipset"), p.text(r"^cpu$", r"processor", r"supported cpu")):
        up = text.upper().replace("®", " ").replace("™", " ")
        for base, e in CHIPSET_RE.findall(up):
            model = base + ("E" if e and base + "E" in AMD_CHIPSETS else "")
            if model in AMD_CHIPSETS or model in INTEL_CHIPSETS:
                return model
    return None


def socket_in(text: str) -> Optional[str]:
    m = SOCKET_RE.search(text)
    if not m:
        return None
    if m.group(1):
        return f"LGA{m.group(1)}"
    if m.group(2):
        return m.group(2).upper()
    return next(s for s in SOCKETS if s.lower() == m.group(3).lower())


def mb_socket(p: Product) -> list[str]:
    chip = mb_chipset(p)
    if chip and chip in CHIPSET_SOCKET:
        return [CHIPSET_SOCKET[chip]]
    for text in (p.text(r"socket"), p.name, p.all_text()):
        s = socket_in(text)
        if s:
            return [s]
    return []


def mb_processor_type(p: Product) -> list[str]:
    sock = mb_socket(p)
    if sock:
        return ["Intel" if sock[0].startswith("LGA") else "AMD"]
    if re.search(r"\bintel\b", p.name, re.I):
        return ["Intel"]
    if re.search(r"\bamd\b|ryzen", p.name, re.I):
        return ["AMD"]
    return []


def mb_chipset_option(p: Product) -> list[str]:
    chip = mb_chipset(p)
    return [f"{'AMD' if chip in AMD_CHIPSETS else 'Intel'} {chip}"] if chip else []


def _form_in(text: str) -> Optional[str]:
    if re.search(r"\b(e-?atx|extended[- ]atx|eatx|ssi[- ]?eeb)\b", text, re.I):
        return "E-ATX"
    if re.search(r"mini[- ]?itx|\bm?itx\b", text, re.I):
        return "Mini-ITX"
    if re.search(r"micro[- ]?atx|\bm-?atx\b|\bu-?atx\b|\bmicroatx\b|\bmini[- ]?atx\b", text, re.I):
        return "Micro ATX"
    if re.search(r"\batx\b", text, re.I):
        return "ATX"
    return None


def mb_form_factor(p: Product) -> list[str]:
    form = _form_in(p.text(*FORM_FIELDS)) or _form_in(p.name)
    if not form:
        # model suffix on the chipset: "B650M" micro ATX, "B760I" mini-ITX, plain "B760" ATX
        m = re.search(r"\b(?:[ABHXZW]\d{3}E?|TRX\d0|WRX\d0)([MI])?(?=[^A-Z0-9]|$)", p.name.upper())
        if m:
            form = {"M": "Micro ATX", "I": "Mini-ITX"}.get(m.group(1) or "", "ATX")
    return [form] if form else []


def mb_ram_type(p: Product) -> list[str]:
    for text in (p.name, p.text(*MEMORY_FIELDS)):
        m = re.search(r"\bDDR([345])\b|\bD([45])\b", text, re.I)
        if m:
            return [f"DDR{m.group(1) or m.group(2)}"]
    sock = mb_socket(p)
    by_socket = {"AM5": "DDR5", "LGA1851": "DDR5", "AM4": "DDR4", "LGA1200": "DDR4", "LGA1151": "DDR4",
                 "LGA1150": "DDR3", "LGA1155": "DDR3"}
    return [by_socket[sock[0]]] if sock and sock[0] in by_socket else []


MAX_MEMORY = ["16GB", "32GB", "64GB", "96GB", "128GB", "192GB", "256GB", "512GB"]


def mb_max_memory(p: Product) -> list[str]:
    for text in (p.text(r"max", r"capacity"), p.text(r"memory")):
        for pat in (r"(?:up to|max(?:imum)?(?: capacity| memory)?(?: of| is)?|supporting up to|total)\D{0,20}?(\d{2,3})\s*GB",
                    r"(\d{2,3})\s*GB"):
            for n in re.findall(pat, text, re.I):
                if f"{int(n)}GB" in MAX_MEMORY:
                    return [f"{int(n)}GB"]
    return []


def mb_memory_slots(p: Product) -> list[str]:
    text = p.text(*MEMORY_FIELDS)
    n = None
    for pat in (r"(\d)\s*[x×]\s*(?:DDR\d\s*)?(?:U-?|SO-?)?DIMM", r"(\d)\s*[x×]?\s*(?:DDR\d\s+)?(?:memory\s+|dimm\s+)?slots?\b",
                r"slots?\s*:?\s*(\d)\s*(?:x\s*)?DIMM", r"(\d)\s*DIMMs?\b", r"(\d)\s*[x×]\s*DDR\d\b"):
        m = re.search(pat, text, re.I)
        if m:
            n = m.group(1)
            break
    if n in {"2", "4", "8"}:
        return [f"{n} Slots"]
    if mb_form_factor(p) == ["Mini-ITX"]:
        return ["2 Slots"]
    return []


def mb_features(p: Product) -> list[str]:
    name, wireless, everything = p.name, p.text(*WIRELESS_FIELDS), p.all_text()
    out = []
    # in the name only an explicit "WIFI" counts ("BATTLE-AX" is not Wi-Fi 6)
    if re.search(r"wi-?fi", name, re.I) or re.search(r"wi-?fi\s*\d|802\.11|wireless lan|wlan|wi-?fi", wireless, re.I):
        out.append("Wi-Fi")
    if re.search(r"bluetooth|\bBT\b", wireless + "\n" + name, re.I):
        out.append("Bluetooth")
    if re.search(r"\bm\.?2\b", everything + "\n" + name, re.I):
        out.append("M.2")
    if re.search(r"\ba?rgb\b|aura sync|mystic light|rgb fusion|polychrome", everything + "\n" + name, re.I):
        out.append("RGB")
    if re.search(r"type[- ]?c\b|usb[- ]?c\b", everything, re.I):
        out.append("USB Type-C")
    if re.search(r"pci-?e(?:xpress)?\s*(?:gen\s*)?5(?:\.0)?\b|gen\s*5\b", everything, re.I):
        out.append("PCIe 5.0")
    return out


MOTHERBOARD = Rules(
    groups=[
        ("Processor", [TextField("Supported CPU", [r"^cpu$", r"^cpu support", r"^supported cpu", r"^processors?$", r"^generation$"])]),
        ("Memory", [TextField("Memory", [r"^memory$", r"^supported memory$", r"^memory support$", r"^memory mhz$",
                                         r"^memory channel$", r"^channel architecture$", r"^ecc"])]),
        ("Expansion & Storage", [
            TextField("Expansion Slots", [r"^slots?( \d+)?$", r"^pci( \d+)?$", r"^pci e$", r"^pci express slot$",
                                          r"^expansion slots?$", r"multi gpu"]),
            TextField("Storage", [r"^storage( \d+)?$", r"^supported storage$", r"^m 2", r"^sata( ports?)?$",
                                  r"^storage interface$", r"^raid( support)?$", r"optane"]),
        ]),
        ("Graphics & Display", [
            TextField("Onboard Graphics", [r"^graphics?( \d+)?$", r"^onboard graphics$", r"integrated video",
                                           r"^graphics (memory|chipset|card)$", r"max shared memory", r"^display$"]),
            TextField("Display Outputs", [r"^hdmi( port)?$", r"^display ?port( s)?$", r"^vga( s| port)?$", r"^d sub( s)?$",
                                          r"^dvi( d)?( s)?$"]),
        ]),
        ("Networking", [
            TextField("LAN", [r"^lan( port)?( s)?$", r"^ethernet( controller)?$", r"^lan chipset$", r"^lan speed"]),
            TextField("Wireless", [r"wireless", r"^wi ?fi", r"^bluetooth$"]),
        ]),
        ("Audio", [TextField("Audio", [r"^audio"])]),
        ("Ports & Connectors", [
            TextField("USB", [r"^usb( ports?)?( s)?$"]),
            TextField("Rear Panel I/O", [r"^back( panel)?( i o)?", r"^rear( panel)? i o", r"^i o ports?$", r"^external i o",
                                         r"^connectors?( ports)?$", r"^ports$"]),
            TextField("Internal Connectors", [r"^int\w*nal", r"^i o connection", r"fan connectors", r"power connectors", r"header"]),
        ]),
        ("Other Features", [
            TextField("BIOS", [r"^bios", r"^rom$"]),
            TextField("Special Features", [r"^special features$", r"^unique features?$", r"^software features$",
                                           r"^features$", r"^others?$", r"^other features$", r"^led feature$",
                                           r"^manageability$", r"^h w monitoring$", r"^tpm", r"^security$"]),
            TextField("Operating System", [r"operating system", r"^os( support)?$"]),
            TextField("Bundled Software", [r"^bundled? software$"]),
            TextField("Accessories", [r"^accessories$"]),
            TextField("Dimensions", [r"^dimensions?$"]),
        ]),
        ("Warranty", [TextField("Warranty", [r"warrant"])]),
    ],
    filters=[
        F("processor_type", "Processor Type", ["Intel", "AMD"], mb_processor_type, [r"^processor type$"]),
        F("socket", "Socket", SOCKETS, mb_socket, [r"^(cpu )?sockets?( supported)?$"]),
        F("chipset", "Chipset", CHIPSET_OPTIONS, mb_chipset_option, [r"^chipset( model| manufacturer)?$"]),
        F("form_factor", "Form Factor", ["ATX", "Micro ATX", "Mini-ITX", "E-ATX"], mb_form_factor,
          [r"^form factor$", r"^motherboard type$", r"^type$", r"^product type$"]),
        F("ram_type", "RAM Type", ["DDR5", "DDR4", "DDR3"], mb_ram_type, [r"^(ram|memory) type$"]),
        F("maximum_memory", "Maximum Memory", MAX_MEMORY, mb_max_memory,
          [r"^max(imum)? (memory|mamory)( supported)?$", r"^memory max$", r"^maximum capacity$", r"^memory capacity$"]),
        F("memory_slots", "Memory Slots", ["2 Slots", "4 Slots", "8 Slots"], mb_memory_slots, [r"memory slots?$"]),
        F("features", "Features", ["Wi-Fi", "Bluetooth", "M.2", "RGB", "USB Type-C", "PCIe 5.0"], mb_features,
          [r"^special feature$"]),
    ],
)


# ── processors ───────────────────────────────────────────────────────────────

CPU_SERIES = [
    ("Core Ultra 9", r"core\s*ultra\s*9|\bcu9\b"), ("Core Ultra 7", r"core\s*ultra\s*7|\bcu7\b"),
    ("Core Ultra 5", r"core\s*ultra\s*5|\bcu5\b"), ("Core i9", r"\bi9\b|i9-"), ("Core i7", r"\bi7\b|i7-"),
    ("Core i5", r"\bi5\b|i5-"), ("Core i3", r"\bi3\b|i3-"), ("Core 7", r"\bcore\s*7\s+\d"), ("Core 5", r"\bcore\s*5\s+\d"),
    ("Core 3", r"\bcore\s*3\s+\d"), ("Ryzen Threadripper", r"threadripper"), ("Ryzen 9", r"ryzen\s*9"),
    ("Ryzen 7", r"ryzen\s*7"), ("Ryzen 5", r"ryzen\s*5"), ("Ryzen 3", r"ryzen\s*3"), ("Pentium", r"pentium"),
    ("Celeron", r"celeron"), ("Athlon", r"athlon"), ("Xeon", r"xeon"), ("Apple M4", r"\bm4\b"),
    ("Apple M3", r"\bm3\b"), ("Apple M2", r"\bm2\b"), ("Apple M1", r"\bm1\b"), ("Snapdragon", r"snapdragon"),
]
INTEL_GEN_SOCKET = lambda g: ("LGA1700" if g >= 12 else "LGA1200" if g >= 10 else "LGA1151" if g >= 6 else  # noqa: E731
                              "LGA1150" if g >= 4 else "LGA1155" if g >= 2 else None)


def intel_gen(name: str) -> Optional[int]:
    m = re.search(r"\bi[3579][- ]?(1\d)\d{3}", name, re.I) or re.search(r"\bi[3579][- ]?([2-9])\d{3}(?!\d)", name, re.I)
    if m:
        return int(m.group(1))
    m = re.search(r"\b(\d{1,2})(?:st|nd|rd|th)\s*gen", name, re.I)
    return int(m.group(1)) if m and re.search(r"intel|core|pentium|celeron", name, re.I) else None


def cpu_brand(p: Product) -> list[str]:
    if re.search(r"intel|core\s*(i\d|ultra|\d\s)|pentium|celeron|xeon", p.name, re.I):
        return ["Intel"]
    if re.search(r"\bamd\b|ryzen|athlon|threadripper", p.name, re.I):
        return ["AMD"]
    return pick(["Intel", "AMD"], EX("processor_type"), EX("chipset"))(p)


def cpu_socket(p: Product) -> list[str]:
    name = p.name
    s = socket_in(name) or socket_in(p.text(r"socket"))
    if s:
        return [s]
    for v in p.filters.get("socket", []):
        s = socket_in(v.replace("amd ", ""))
        if s:
            return [s]
    m = re.search(r"Ryzen\s+(?:\d|Threadripper)\s+(?:PRO\s+)?(\d)\d{3}", name, re.I)
    if m:
        return ["AM5" if int(m.group(1)) >= 7 else "AM4"]
    if re.search(r"core\s*ultra\s*[579]\s*2\d\d|\b2\d\dK?F?\b.*core ultra", name, re.I):
        return ["LGA1851"]
    g = intel_gen(name)
    if g and INTEL_GEN_SOCKET(g):
        return [INTEL_GEN_SOCKET(g)]
    return []


def cpu_generation(p: Product) -> list[str]:
    name = p.name
    if re.search(r"core\s*ultra", name, re.I):
        return ["Core Ultra Series 2" if re.search(r"ultra\s*[579]\s*2\d\d", name, re.I) else "Core Ultra Series 1"]
    g = intel_gen(name)
    if g:
        return [f"{g}{'st' if g == 1 else 'nd' if g == 2 else 'rd' if g == 3 else 'th'} Gen"]
    m = re.search(r"Ryzen\s+(?:\d|Threadripper)\s+(?:PRO\s+)?(\d)\d{3}", name, re.I)
    if m:
        return [f"Ryzen {m.group(1)}000 Series"]
    return []


def cpu_graphics(p: Product) -> list[str]:
    name = p.name
    old = pick(["With Graphics", "Without Graphics"], EX("processor_features"))(p)
    if old:
        return old
    if re.search(r"\bi[3579][- ]?\d{4,5}K?F\b|ultra\s*[579]\s*\d{3}K?F\b", name, re.I):
        return ["Without Graphics"]
    if re.search(r"intel|core|pentium|celeron", name, re.I):
        return ["With Graphics"]
    m = re.search(r"Ryzen\s+\d\s+(?:PRO\s+)?(\d)\d{2,3}(G|GE|F|X3D|X)?\b", name, re.I)
    if m:
        series, suffix = int(m.group(1)), (m.group(2) or "").upper()
        if suffix.startswith("G") or (series >= 7 and suffix != "F"):
            return ["With Graphics"]
        return ["Without Graphics"]
    return []


CPU_CORES = {float(c): f"{c} Cores" for c in (2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 64)}

PROCESSOR = Rules(filters=[
    F("processor_type", "Processor Type", ["Intel", "AMD"], cpu_brand, [r"^processor type$"]),
    F("processor_series", "Series", CPU_SERIES, pick(CPU_SERIES, NAME, EX("processor_type"))),
    F("socket", "Socket", SOCKETS, cpu_socket, [r"^(cpu )?sockets?( supported)?$"]),
    F("processor_generation", "Generation", None, cpu_generation, [r"^generation$"],
      sort_key=lambda v: (0 if "Ultra" in v else 1 if "Gen" in v else 2, -int(re.sub(r"\D", "", v) or 0))),
    F("number_of_core", "Cores", list(CPU_CORES.values()),
      number(EX("number_of_core"), SPEC(r"^(number of |total )?cores?$", r"core count", r"^cores"),
             rx=r"(\d{1,2})", to_label=exact(CPU_CORES)), [r"^(number of |total )?cores?$"]),
    F("processor_features", "Graphics", ["With Graphics", "Without Graphics"], cpu_graphics),
])


# ── graphics cards ───────────────────────────────────────────────────────────

def gpu_model(p: Product) -> list[str]:
    name = p.name.upper().replace("-", " ")
    m = re.search(r"\b(RTX|GTX|GT)\s*(\d{3,4})\s*(TI\s*SUPER|TI|SUPER)?\b", name)
    if m:
        suffix = {"TI SUPER": " Ti Super", "TI": " Ti", "SUPER": " Super"}.get(re.sub(r"\s+", " ", m.group(3) or ""), "")
        return [f"{m.group(1)} {m.group(2)}{suffix}"]
    m = re.search(r"\bRX\s*(\d{3,4})\s*(XTX|XT|GRE)?\b", name)
    if m:
        return [f"RX {m.group(1)}{' ' + m.group(2) if m.group(2) else ''}"]
    m = re.search(r"\bARC\s*([AB]\d{3})\b", name)
    if m:
        return [f"Arc {m.group(1)}"]
    return []


def gpu_model_key(v: str):
    m = re.search(r"(\d{3,4})", v)
    n = int(m.group(1)) if m else 0
    brand = 0 if v.startswith(("RTX", "GTX", "GT")) else 1 if v.startswith("RX") else 2
    tier = n % 100 if n >= 1000 else n % 10
    gen = n // 100 if n >= 1000 else n // 100
    return (brand, -gen, -tier, -len(v), v)


GPU_MEMORY = {float(g): f"{g}GB" for g in (1, 2, 3, 4, 6, 8, 10, 11, 12, 16, 20, 24, 32, 48)}
GPU_MEMORY_TYPES = [("GDDR7", r"gddr7"), ("GDDR6X", r"gddr6x"), ("GDDR6", r"gddr6(?!x)|\bd6\b|^ddr6$"),
                    ("GDDR5X", r"gddr5x"), ("GDDR5", r"gddr5(?!x)|\bd5\b"), ("GDDR4", r"gddr4"), ("GDDR3", r"gddr3"),
                    ("DDR4", r"(?<!g)ddr4"), ("DDR3", r"(?<!g)ddr3"), ("HBM2", r"hbm2")]

GRAPHICS_CARD = Rules(filters=[
    F("gpu_brand", "GPU Brand", ["NVIDIA", "AMD", "Intel"],
      pick([("NVIDIA", r"nvidia|geforce|\brtx\b|\bgtx\b|\bgt ?\d{3,4}\b|quadro"), ("AMD", r"\bamd\b|radeon|\brx ?\d{3,4}"),
            ("Intel", r"intel|\barc\b")], NAME, EX("chipset"), SPEC(r"chipset|gpu|graphics engine"))),
    F("gpu_model", "GPU Model", None, gpu_model, sort_key=gpu_model_key),
    F("memory_size", "Memory Size", list(GPU_MEMORY.values()),
      number(NAME, EX("capacity"), SPEC(r"memory size", r"^memory$", r"video memory", r"capacity"),
             rx=r"(\d{1,2})\s*GB", to_label=exact(GPU_MEMORY))),
    F("memory_type", "Memory Type", GPU_MEMORY_TYPES,
      pick(GPU_MEMORY_TYPES, NAME, EX("memory_type"), SPEC(r"memory type", r"^memory$"))),
    F("color", "Color", ["Black", "White"], pick(["Black", "White"], NAME, EX("color"))),
])


# ── SSD / HDD ────────────────────────────────────────────────────────────────

SSD_CAPACITY = ["128GB", "256GB", "512GB", "1TB", "2TB", "4TB", "8TB"]


def ssd_capacity(p: Product) -> list[str]:
    for text in [p.name, p.text(r"capacity")] + p.filters.get("capacity", []):
        n = gb_size(text)
        if n is None:
            continue
        for limit, label in ((140, "128GB"), (280, "256GB"), (560, "512GB"), (1100, "1TB"), (2100, "2TB"),
                             (4200, "4TB"), (8400, "8TB")):
            if n <= limit and n >= 100:
                return [label]
    return []


SSD_INTERFACE = [("NVMe PCIe", r"nvme|pci-?e|pci express|\bpcie"), ("SATA", r"\bsata"),
                 ("USB (External)", r"\busb\b|external|portable|thunderbolt")]
SSD_FORM = [("M.2", r"m\.?2\b|\b22(30|42|60|80)\b"), ("2.5 Inch", r"2\.5\s*(\"|”|inch|in\b|-inch)?"), ("mSATA", r"msata"),
            ("Portable", r"portable|external|\busb\b")]

READ_BANDS = buckets((600, "Up to 600MB/s"), (2000, "601-2000MB/s"), (3500, "2001-3500MB/s"), (5000, "3501-5000MB/s"),
                     (7000, "5001-7000MB/s"), above="Above 7000MB/s")


def ssd_read(p: Product) -> list[str]:
    """The sequential read speed: "Read: up to 7,000MB/s" anywhere, else a read-speed field's MB/s (never random
    read IOPS, never the old filter's bands)."""
    def mbs(n: str) -> float:
        return float(n.replace(",", ""))

    for text in (p.name, p.all_text()):
        m = re.search(r"(?<!random )read\D{0,30}?(\d[\d,]{2,5})\s*MB", text, re.I)
        if m and mbs(m.group(1)) >= 100:
            return [READ_BANDS(mbs(m.group(1)))]
    old_bands = {v.lower() for v in p.filters.get("read_speed", []) + p.filters.get("write_speed", [])}
    for key, items in p.by_field.items():
        if "read" in key and not re.search(r"random|iops|4k", key):
            for _, v in items:
                if v.lower() in old_bands or re.search(r"to above|\d\s*mb/ ?s to \d", v, re.I):
                    continue
                m = re.search(r"(\d[\d,]{2,5})\s*MB", v, re.I)
                if m and mbs(m.group(1)) >= 100:
                    return [READ_BANDS(mbs(m.group(1)))]
    # SATA tops out at 600MB/s
    if pick(SSD_INTERFACE, NAME, check=["USB (External)", "NVMe PCIe"])(p) == ["SATA"]:
        return ["Up to 600MB/s"]
    return []


SSD = Rules(filters=[
    F("capacity", "Capacity", SSD_CAPACITY, ssd_capacity),
    F("interface", "Interface", SSD_INTERFACE,
      pick(SSD_INTERFACE, NAME, EX("interface"), SPEC(r"interface", r"connect"), check=["USB (External)", "NVMe PCIe"])),
    F("form_factor", "Form Factor", SSD_FORM,
      pick(SSD_FORM, NAME, SPEC(r"form factor", r"type"), EX("form_factor"), check=["Portable", "mSATA"])),
    F("pcie_nvme_generation", "PCIe Generation", ["Gen 5", "Gen 4", "Gen 3"],
      pick([("Gen 5", r"gen\s*5|pcie\s*5|5\.0"), ("Gen 4", r"gen\s*4|pcie\s*4|4\.0"), ("Gen 3", r"gen\s*3|pcie\s*3|3\.0")],
           NAME, EX("pcie_nvme_generation"), SPEC(r"interface"),
           when=lambda p: bool(re.search(r"nvme|pcie|pci-e|pci express", p.name + p.text(r"interface"), re.I)))),
    F("read_speed", "Read Speed", ["Up to 600MB/s", "601-2000MB/s", "2001-3500MB/s", "3501-5000MB/s", "5001-7000MB/s",
                                   "Above 7000MB/s"], ssd_read),
])

HDD_CAPACITY = ["500GB", "1TB", "2TB", "3TB", "4TB", "6TB", "8TB", "10TB", "12TB", "14TB", "16TB", "18TB", "20TB",
                "22TB", "24TB"]


def hdd_capacity(p: Product) -> list[str]:
    for text in [p.name, p.text(r"capacity")] + p.filters.get("capacity", []):
        n = gb_size(text)
        if n:
            label = f"{int(n / 1000)}TB" if n >= 1000 else f"{int(n)}GB"
            if label in HDD_CAPACITY:
                return [label]
    return []


HDD = Rules(filters=[
    F("capacity", "Capacity", HDD_CAPACITY, hdd_capacity),
    F("hdd_type", "Type", ["Internal", "External"],
      first(pick([("External", r"external|portable|\busb\b")], NAME),
            pick([("Internal", r"3\.5|2\.5|\bsata\b|\bsas\b|internal|nas|surveillance|enterprise|desktop hdd")], NAME, ALL))),
    F("hdd_rpm", "RPM", ["5400 RPM", "5900 RPM", "7200 RPM", "10000 RPM"],
      number(NAME, EX("hdd_rpm"), SPEC(r"rpm", r"speed", r"rotation"), rx=r"(5400|5900|7200|10000)",
             to_label=lambda n, m: f"{int(n)} RPM")),
    F("interface", "Interface", ["SATA", "SAS", "USB"],
      pick([("SAS", r"\bsas\b"), ("SATA", r"\bsata"), ("USB", r"\busb")], NAME, EX("interface"), SPEC(r"interface"))),
])


# ── RAM ──────────────────────────────────────────────────────────────────────

RAM_CAPACITY = ["4GB", "8GB", "16GB", "24GB", "32GB", "48GB", "64GB", "96GB", "128GB"]


def ram_capacity(p: Product) -> list[str]:
    for text in [p.name, p.text(r"capacity")] + p.filters.get("capacity", []):
        m = re.search(r"(\d{1,3})\s*GB\s*\(?\s*[x×]\s*(\d)", text, re.I) or re.search(r"(\d)\s*[x×]\s*(\d{1,3})\s*GB", text, re.I)
        if m:
            total = int(m.group(1)) * int(m.group(2))
        else:
            m = re.search(r"(\d{1,3})\s*GB", text, re.I)
            total = int(m.group(1)) if m else 0
        if f"{total}GB" in RAM_CAPACITY:
            return [f"{total}GB"]
    return []


RAM_SPEEDS = [1600, 2133, 2400, 2666, 3000, 3200, 3600, 4000, 4800, 5200, 5600, 6000, 6400, 6800, 7200, 7600, 8000]


def ram_speed(p: Product) -> list[str]:
    for text in [p.name, p.text(r"speed", r"frequency", r"bus")] + p.filters.get("bus_speed", []):
        m = re.search(r"(\d{4})\s*(?:MHz|MT/?s)|DDR\d-(\d{4})", text, re.I)
        if m:
            n = int(m.group(1) or m.group(2))
            if n in RAM_SPEEDS:
                return [f"{n}MHz"]
    return []


RAM = Rules(filters=[
    F("ram_type", "RAM Type", ["DDR5", "DDR4", "DDR3"],
      pick([("DDR5", r"ddr5|\bd5\b"), ("DDR4", r"ddr4|\bd4\b"), ("DDR3", r"ddr3")], NAME, EX("memory_type"), EX("ram_type"),
           SPEC(r"type", r"memory"))),
    F("capacity", "Capacity", RAM_CAPACITY, ram_capacity),
    F("bus_speed", "Speed", [f"{s}MHz" for s in RAM_SPEEDS], ram_speed),
    F("ram_form", "Form Factor", ["Desktop", "Laptop"],
      first(pick([("Laptop", r"laptop|notebook|so-?dimm|sodimm")], NAME, SPEC(r"form", r"type")),
            pick([("Desktop", r"\bram\b|memory|ddr\d|dimm|desktop")], NAME))),
    F("features", "Features", ["RGB", "Heatsink", "ECC"],
      pick([("RGB", r"rgb"), ("Heatsink", r"heat ?sink|heat ?spreader"), ("ECC", r"\becc\b")], NAME, EX("other_feature"),
           SPEC(r"feature", r"heat", r"light"), multi=True)),
])


# ── power supplies ───────────────────────────────────────────────────────────

PSU_WATTS = buckets((499, "Up to 499W"), (599, "500-599W"), (699, "600-699W"), (799, "700-799W"), (999, "800-999W"),
                    above="1000W & Above")
PSU_EFFICIENCY = [("80+ Titanium", r"titanium"), ("80+ Platinum", r"platin(um|am)"), ("80+ Gold", r"\bgold\b"),
                  ("80+ Silver", r"\bsilver\b"), ("80+ Bronze", r"bronze"),
                  ("80+ White", r"80\s*(\+|plus)\s*(white|standard)?(?!\s*(bronze|silver|gold|platin|titan))")]

POWER_SUPPLY = Rules(filters=[
    F("wattage", "Wattage", ["Up to 499W", "500-599W", "600-699W", "700-799W", "800-999W", "1000W & Above"],
      number(NAME, SPEC(r"wattage", r"^power$", r"output", r"capacity", r"max"),
             rx=r"(\d{3,4})\s*(?:w\b|watt|w\s)", to_label=PSU_WATTS)),
    F("efficiency", "80 Plus Rating", PSU_EFFICIENCY,
      pick(PSU_EFFICIENCY, NAME, EX("efficiency"), SPEC(r"efficien", r"certif", r"80"))),
    F("modular", "Modular", ["Full Modular", "Semi Modular", "Non Modular"],
      pick([("Full Modular", r"full(y)?[- ]?modular|^full"), ("Semi Modular", r"semi[- ]?modular"),
            ("Non Modular", r"non[- ]?modular")], NAME, EX("modular"), SPEC(r"modular", r"cable"))),
    F("form_factor", "Form Factor", ["ATX", "SFX", "TFX"],
      pick([("SFX", r"\bsfx"), ("TFX", r"\btfx"), ("ATX", r"\batx")], NAME, EX("form_factor"), SPEC(r"form factor", r"type"),
           check=["SFX", "TFX"])),
])


# ── casings ──────────────────────────────────────────────────────────────────

CASE_BOARDS = [("E-ATX", r"\be-?atx|extended[- ]atx|\beatx"),
               ("ATX", r"(?<![a-z\-])(?<!micro )(?<!mini )atx(?![a-z])"),
               ("Micro ATX", r"micro[- ]?atx|\bm-?atx|\bmatx|\bu-?atx|mini[- ]atx|microatx"),
               ("Mini-ITX", r"mini[- ]?itx|\bitx\b")]

CASING = Rules(filters=[
    F("type", "Type", ["Full Tower", "Mid Tower", "Mini Tower", "Micro Tower", "Small Form Factor"],
      pick([("Full Tower", r"full[- ]?tower"), ("Mid Tower", r"mid(dle)?[- ]?tower"), ("Mini Tower", r"mini[- ]?tower"),
            ("Micro Tower", r"micro[- ]?tower"), ("Small Form Factor", r"\bsff\b|small form")],
           NAME, EX("type"), SPEC(r"type", r"form factor", r"case"))),
    F("motherboard_support", "Motherboard Support", ["E-ATX", "ATX", "Micro ATX", "Mini-ITX"],
      pick(CASE_BOARDS, EX("motherboard_type"), EX("form_factor"), SPEC(r"motherboard", r"form factor", r"support"), NAME,
           multi=True)),
    F("side_panel", "Side Panel", ["Tempered Glass", "Mesh", "Acrylic", "Solid / Metal"],
      pick([("Tempered Glass", r"temp[ae]red|\btg\b|glass"), ("Mesh", r"mesh"), ("Acrylic", r"acrylic"),
            ("Solid / Metal", r"solid|steel side|metal side")], EX("side_panel"), NAME, SPEC(r"side panel", r"panel"))),
    F("power_supply", "Power Supply", ["Included", "Not Included"],
      pick([("Not Included", r"^no\b|without psu|not included|support|bottom"),
            ("Included", r"^yes|pre-?install|included|\d+\s*w(att)?\b|with (power supply|psu)")],
           EX("power_supply"), NAME)),
    F("color", "Color", labels(COLORS), color()),
    F("features", "Features", ["RGB", "USB 3.0", "USB Type-C", "Gaming"],
      pick([("RGB", r"a?rgb|\bled\b"), ("USB 3.0", r"usb ?3"), ("USB Type-C", r"type[- ]?c|usb[- ]?c\b"),
            ("Gaming", r"gaming")], NAME, EX("special_feature"), SPEC(r"front|i o|port|feature|fan|light"), multi=True)),
])


# ── monitors ─────────────────────────────────────────────────────────────────

SCREEN_SIZES = ["15-17 Inch", "18-20 Inch", "21-22 Inch", "23-25 Inch", "26-30 Inch", "31-40 Inch", "41 Inch & Above"]
INCH_RX = r"(\d{2}(?:\.\d{1,2})?)\s*(?:\"|”|''|inch|in\b|-inch|\s?inches)"
RESOLUTIONS = [("HD or Below", r"\bhd\b(?!\s*\+)|1366|1280\s*[x×*]\s*720|hd or below|1600\s*[x×*]\s*900"),
               ("FHD", r"fhd|full ?hd|1920\s*[x×*]\s*1080|1080p|1920\s*[x×*]\s*1200|wuxga"),
               ("2K QHD", r"qhd|\b2k\b|1440p|2560\s*[x×*]\s*1440|3440\s*[x×*]\s*1440"),
               ("4K UHD", r"\b4k\b|uhd|3840\s*[x×*]\s*2160|2160p"), ("5K & Above", r"\b[568]k\b|5120|6016")]
MONITOR = Rules(filters=[
    F("screen_size", "Screen Size", SCREEN_SIZES,
      number(NAME, SPEC(r"size", r"screen", r"diagonal", r"display"), EX("screen_size"), rx=INCH_RX,
             to_label=buckets((17.9, "15-17 Inch"), (20.9, "18-20 Inch"), (22.9, "21-22 Inch"), (25.9, "23-25 Inch"),
                              (30.9, "26-30 Inch"), (40.9, "31-40 Inch"), above="41 Inch & Above"))),
    F("resolution", "Resolution", RESOLUTIONS,
      pick(RESOLUTIONS, NAME, EX("resolution"), SPEC(r"resolution"), check=["5K & Above", "4K UHD", "2K QHD", "FHD"])),
    F("refresh_rate", "Refresh Rate", ["Up to 75Hz", "100Hz", "120Hz", "144Hz", "165Hz", "170-180Hz", "200-240Hz",
                                       "Above 240Hz"],
      number(NAME, SPEC(r"refresh"), EX("refresh_rate"), rx=r"(\d{2,3})\s*hz",
             to_label=buckets((75, "Up to 75Hz"), (100, "100Hz"), (120, "120Hz"), (144, "144Hz"), (165, "165Hz"),
                              (180, "170-180Hz"), (240, "200-240Hz"), above="Above 240Hz"))),
    F("panel_type", "Panel Type", ["IPS", "VA", "TN", "OLED"],
      pick([("OLED", r"oled"), ("IPS", r"\bips\b|\bads\b"), ("VA", r"\bva\b"), ("TN", r"\btn\b")],
           NAME, EX("panel_type"), SPEC(r"panel"))),
    F("response_time", "Response Time", ["0.5ms or Less", "1-4ms", "5-7ms", "8ms & Above"],
      number(SPEC(r"response"), EX("response_time"), NAME, rx=r"(\d+(?:\.\d+)?)\s*(?:-\s*\d+\s*)?ms",
             to_label=buckets((0.5, "0.5ms or Less"), (4, "1-4ms"), (7, "5-7ms"), above="8ms & Above"))),
    F("features", "Features", ["Built-in Speaker", "Curved", "HDR", "FreeSync / G-Sync", "USB Type-C", "Height Adjustable",
                               "Wall Mountable"],
      pick([("Built-in Speaker", r"speaker"), ("Curved", r"curved"), ("HDR", r"\bhdr"),
            ("FreeSync / G-Sync", r"free-?sync|g-?sync|adaptive[- ]sync"), ("USB Type-C", r"type[- ]?c|usb[- ]?c\b"),
            ("Height Adjustable", r"height adjust"), ("Wall Mountable", r"wall mount|vesa")],
           NAME, EX("features"), SPEC(r"feature", r"speaker", r"curv", r"hdr", r"sync", r"vesa", r"stand"), multi=True)),
    F("ports", "Ports", ["HDMI", "DisplayPort", "VGA", "DVI", "USB Type-C"],
      pick([("HDMI", r"hdmi"), ("DisplayPort", r"display ?port|\bdp\b"), ("VGA", r"vga|d-?sub"), ("DVI", r"\bdvi"),
            ("USB Type-C", r"type[- ]?c|usb[- ]?c\b")], EX("input_type"), SPEC(r"input", r"port", r"connect", r"interface",
                                                                                 r"i o", r"signal"), multi=True)),
])


# ── CPU coolers ──────────────────────────────────────────────────────────────

def cooler_type(p: Product) -> list[str]:
    text = " ".join([p.name] + p.filters.get("cooler_type", []))
    if re.search(r"liquid|\baio\b|water", text, re.I):
        return ["Liquid Cooler"]
    if re.search(r"cooler|air|tower|heatsink", text, re.I):
        return ["Air Cooler"]
    return []


def cooler_size(p: Product) -> list[str]:
    liquid = cooler_type(p) == ["Liquid Cooler"]
    sizes = ["240mm", "280mm", "360mm", "420mm", "120mm"] if liquid else ["92mm", "120mm", "140mm"]
    for text in [p.name, p.text(r"radiator", r"fan size", r"fan dimension", r"size")] + p.filters.get("cooler_size", []):
        for m in re.finditer(r"\b(92|90|120|140|240|280|360|420)\s*(?:mm|\b)|\b(9|12|14)\s*cm\b", text, re.I):
            mm = int(m.group(1)) if m.group(1) else int(m.group(2)) * 10
            mm = 92 if mm == 90 else mm
            if f"{mm}mm" in sizes:
                return [f"{mm}mm"]
    return []


COOLER_SOCKETS = [("LGA1851", r"1851"), ("LGA1700", r"1700"), ("LGA1200", r"\b1200\b"), ("LGA115X", r"115[0-6x]"),
                  ("AM5", r"am5"), ("AM4", r"am4"), ("AM3 / FM2", r"am3|am2|fm[12]"), ("TR4 / sTRX4", r"tr4|strx4|str5|swrx8")]

CPU_COOLER = Rules(filters=[
    F("cooler_type", "Cooler Type", ["Air Cooler", "Liquid Cooler"], cooler_type),
    F("cooler_size", "Size", ["92mm", "120mm", "140mm", "240mm", "280mm", "360mm", "420mm"], cooler_size),
    F("socket", "Socket", ["LGA1851", "LGA1700", "LGA1200", "LGA115X", "AM5", "AM4", "AM3 / FM2", "TR4 / sTRX4"],
      pick(COOLER_SOCKETS, EX("socket"), SPEC(r"socket", r"compatib", r"support", r"platform"), multi=True)),
    F("lighting", "Lighting", ["ARGB", "RGB", "No Lighting"],
      pick([("ARGB", r"argb|a-rgb|addressable|d-rgb"), ("RGB", r"rgb|\bled\b")], NAME, EX("cpu_cooler_special_features"),
           EX("special_feature"), SPEC(r"light", r"led", r"rgb", r"feature"), check=["ARGB"])),
    F("color", "Color", ["Black", "White"], pick(["Black", "White"], NAME, EX("color"))),
])


# ── keyboards, mice, headphones, speakers ───────────────────────────────────

KEYBOARDS = Rules(filters=[
    F("keyboard_type", "Type", ["Mechanical", "Membrane"],
      pick([("Mechanical", r"mechanical|hot-?swap|gateron|outemu|kailh|cherry mx|\bswitch"), ("Membrane", r"membrane|chiclet|scissor")],
           NAME, EX("switch_type"), EX("special_feature"), SPEC(r"switch", r"type", r"key"))),
    F("connectivity", "Connectivity", ["Wired", "Wireless", "Bluetooth"],
      connectivity(EX("interface"), SPEC(r"connect", r"interface"))),
    F("layout", "Layout", ["Full Size", "TKL (80%)", "75%", "65%", "60%"],
      pick([("Full Size", r"\b10[4-8]\b|full[- ]?size|100%"), ("TKL (80%)", r"\b8[78]\b|tkl|tenkeyless|80%"),
            ("75%", r"75%|\b8[1-4]\b"), ("65%", r"65%|\b6[6-9]\b"), ("60%", r"60%|\b6[0-4]\b")],
           EX("number_of_keys"), SPEC(r"number of keys", r"keys", r"layout"))),
    F("features", "Features", ["RGB", "Hot-Swappable", "Programmable", "Gaming"],
      pick([("RGB", r"rgb|backlit|backlight"), ("Hot-Swappable", r"hot-?swap"), ("Programmable", r"programmable|macro"),
            ("Gaming", r"gaming")], NAME, EX("special_feature"), EX("type"), SPEC(r"feature", r"backlight", r"light"),
           multi=True)),
    F("color", "Color", ["Black", "White", "Grey", "Pink", "Blue"], color()),
])

DPI_BANDS = buckets((3000, "Up to 3000"), (8000, "3001-8000"), (20000, "8001-20000"), above="Above 20000")


def mouse_dpi(p: Product) -> list[str]:
    """The highest DPI the mouse states: "24000DPI" in the name, a DPI spec ("200-12000"), or the old filter's band.
    A number in the name only counts next to "DPI" (model numbers are not DPI)."""
    for text in (p.name, p.text(r"dpi", r"resolution", r"sensitivity", r"cpi")):
        rx = r"(\d{1,2}[,.]?\d{3}|\d{3,5})\s*(?:dpi|cpi)" if text is p.name else r"(\d{1,2}[,.]\d{3}|\d{3,5})"
        nums = [float(n.replace(",", "").replace(".", "")) for n in re.findall(rx, text, re.I)]
        nums = [n for n in nums if 100 <= n <= 60000]
        if nums:
            return [DPI_BANDS(max(nums))]
    for v in p.filters.get("max_dpi", []):
        m = re.search(r"(\d[\d,]*)", v)
        if m:
            return [DPI_BANDS(float(m.group(1).replace(",", "")))]
    return []


MOUSE = Rules(filters=[
    F("connectivity", "Connectivity", ["Wired", "Wireless", "Bluetooth"],
      connectivity(EX("interface"), SPEC(r"connect", r"interface"))),
    F("mouse_type", "Type", ["Gaming", "Office"],
      first(pick([("Gaming", r"gaming|\brgb\b")], NAME, EX("mouse_type")),
            pick([("Office", r"office|standard|optical|mouse")], EX("mouse_type"), NAME))),
    F("max_dpi", "Max DPI", ["Up to 3000", "3001-8000", "8001-20000", "Above 20000"], mouse_dpi),
    F("buttons", "Buttons", ["Up to 3", "4-6", "7-10", "11 & Above"],
      number(SPEC(r"button", r"keys"), EX("number_of_keys"), rx=r"(\d{1,2})",
             to_label=buckets((3, "Up to 3"), (6, "4-6"), (10, "7-10"), above="11 & Above"))),
    F("features", "Features", ["RGB", "Programmable", "Rechargeable"],
      pick([("RGB", r"rgb"), ("Programmable", r"programmable|macro"), ("Rechargeable", r"rechargeable|battery")],
           NAME, EX("mouse_type"), SPEC(r"feature", r"light", r"battery"), multi=True)),
    F("color", "Color", ["Black", "White", "Grey", "Pink", "Blue"], color()),
])

HEADPHONE = Rules(filters=[
    F("connectivity", "Connectivity", ["Wired", "Wireless", "Bluetooth"],
      connectivity(EX("interface"), EX("type"), SPEC(r"connect", r"interface"))),
    F("plug", "Plug", ["USB", "3.5mm"],
      pick([("USB", r"\busb"), ("3.5mm", r"3\.5|\baux\b|jack")], NAME, EX("interface"), SPEC(r"connect", r"interface", r"plug",
                                                                                              r"cable"), multi=True)),
    F("features", "Features", ["Gaming", "Microphone", "7.1 Surround", "RGB", "Noise Cancelling"],
      pick([("Gaming", r"gaming"), ("Microphone", r"\bmic|headset"), ("7.1 Surround", r"7\.1|surround"), ("RGB", r"rgb"),
            ("Noise Cancelling", r"noise cancel|\banc\b|\benc\b")], NAME, EX("type"), EX("special_feature"),
           SPEC(r"feature", r"microphone"), multi=True)),
    F("color", "Color", ["Black", "White", "Grey", "Pink", "Blue", "Red"], color()),
])

SPEAKER = Rules(filters=[
    F("channel", "Channel", ["2.0", "2.1", "4.1", "5.1", "7.1"],
      pick([("2.0", r"\b2[.:]0\b"), ("2.1", r"\b2[.:]1\b"), ("4.1", r"\b4[.:]1\b"), ("5.1", r"\b5[.:]1\b"), ("7.1", r"\b7[.:]1\b")],
           NAME, EX("type"), SPEC(r"channel", r"type", r"system"))),
    F("speaker_type", "Type", ["Soundbar", "Bookshelf", "Multimedia", "Portable", "Party"],
      pick([("Soundbar", r"sound ?bar"), ("Bookshelf", r"bookshelf"), ("Party", r"party"), ("Portable", r"portable|mini"),
            ("Multimedia", r"multimedia|computer|desktop|gaming speaker|usb speaker|2[.:][01]")], NAME, EX("type"),
           EX("special_feature"))),
    F("connectivity", "Connectivity", ["Bluetooth", "USB", "3.5mm / AUX", "Optical"],
      pick([("Bluetooth", r"bluetooth|\bbt\b"), ("USB", r"\busb"), ("3.5mm / AUX", r"3\.5|\baux\b|rca"), ("Optical", r"optical")],
           NAME, EX("interface"), SPEC(r"connect", r"interface", r"input"), multi=True)),
])


# ── printers, scanners ───────────────────────────────────────────────────────

PRINTER_TYPES = [("Ink Tank", r"ink ?tank|eco ?tank|smart ?tank|\bl\d{3,4}\b"), ("Laser", r"laser"),
                 ("Inkjet", r"ink ?jet|deskjet|ink advantage|pixma|officejet"), ("Thermal / Receipt", r"thermal|receipt|\bpos\b"),
                 ("Dot Matrix", r"dot ?matrix"), ("Label", r"label")]


def printer_color(p: Product) -> list[str]:
    text = " ".join([p.name] + p.filters.get("color_output", []))
    if re.search(r"colou?r(?! ?:? ?black)", text, re.I) and not re.search(r"^black", text, re.I):
        return ["Color"]
    kind = pick(PRINTER_TYPES, NAME, EX("printer_type"))(p)
    if kind and kind[0] in ("Ink Tank", "Inkjet"):
        return ["Color"]
    if re.search(r"mono|black ?(&|and) ?white|b/w", text, re.I) or (kind and kind[0] in ("Laser", "Thermal / Receipt",
                                                                                         "Dot Matrix", "Label")):
        return ["Monochrome"]
    return []


PRINTER = Rules(filters=[
    F("printer_type", "Printer Type", labels(PRINTER_TYPES),
      pick(PRINTER_TYPES, NAME, EX("printer_type"), SPEC(r"type", r"technology"))),
    F("color_output", "Color", ["Color", "Monochrome"], printer_color),
    F("functionality", "Functions", ["All-in-One", "Print Only"],
      first(pick([("All-in-One", r"all[- ]?in[- ]?one|multi ?function|\bmfp?\b|\bmfc|print.*scan|scan.*copy|\bmf\d")],
                 NAME, EX("functionality"), SPEC(r"function")),
            pick([("Print Only", r"single function|only print|\bsfp\b|printer")], EX("functionality"), NAME))),
    F("printer_interface", "Connectivity", ["USB", "Wi-Fi", "LAN"],
      pick([("USB", r"\busb"), ("Wi-Fi", r"wi-?fi|wireless"), ("LAN", r"\blan\b|ethernet|network")], EX("printer_interface"),
           NAME, SPEC(r"connect", r"interface"), multi=True)),
    F("printer_features", "Features", ["Duplex", "Fax", "ADF"],
      pick([("Duplex", r"duplex"), ("Fax", r"\bfax"), ("ADF", r"\badf\b|document feeder")], NAME, EX("printer_features"),
           EX("functionality"), SPEC(r"feature", r"duplex", r"fax"), multi=True)),
])


# ── laptops, desktops ────────────────────────────────────────────────────────

def laptop_size(p: Product) -> list[str]:
    for text in [p.name, p.text(r"display", r"screen")] + p.filters.get("display_size", []):
        m = re.search(r"\b(1[0-8](?:\.\d)?)\s*(?:\"|”|inch|in\b|-inch|''|\s?inches)", text, re.I)
        if m:
            n = float(m.group(1))
            return [buckets((12.9, "Up to 12.9 Inch"), (13.9, "13-13.9 Inch"), (14.9, "14-14.9 Inch"), (15.9, "15-15.9 Inch"),
                            (16.9, "16-16.9 Inch"), above="17 Inch & Above")(n)]
    return []


def laptop_ram(p: Product) -> list[str]:
    for text in [p.name, p.text(r"^ram", r"memory")] + p.filters.get("ram_size", []):
        m = re.search(r"(\d{1,2})\s*GB\s*(?:\w+\s*)?(?:RAM|DDR|LPDDR|memory|unified)|^(\d{1,2})\s*GB", text, re.I)
        if m:
            n = int(m.group(1) or m.group(2))
            if n in (4, 8, 12, 16, 18, 24, 32, 36, 48, 64):
                return [f"{n}GB"]
    return []


def laptop_storage(p: Product) -> list[str]:
    for text in [p.name, p.text(r"ssd", r"storage")] + p.filters.get("ssd", []):
        m = re.search(r"(\d{3,4})\s*GB\s*(?:\w+\s*)?(?:SSD|NVMe|storage|M\.2)|(\d)\s*TB\s*(?:\w+\s*)?(?:SSD|NVMe|storage|M\.2)|^(\d{3,4})\s*gb|^(\d)\s*tb",
                      text, re.I)
        if m:
            gb = int(m.group(1) or m.group(3) or 0) or int(m.group(2) or m.group(4)) * 1024
            return [{128: "128GB", 256: "256GB", 512: "512GB", 1024: "1TB", 1000: "1TB", 2048: "2TB"}.get(gb, f"{gb}GB")]
    return []


LAPTOP = Rules(filters=[
    F("processor_type", "Processor Type", ["Intel", "AMD", "Apple", "Qualcomm"],
      pick([("Intel", r"intel|core\s*(i\d|ultra|\d\b)|\bcu\d|celeron|pentium"), ("AMD", r"\bamd\b|ryzen|athlon"),
            ("Apple", r"apple|macbook|\bm[1-4]\b"), ("Qualcomm", r"snapdragon|qualcomm")], NAME, EX("processor_type"),
           EX("processor_model"))),
    F("processor_series", "Processor", CPU_SERIES, pick(CPU_SERIES, NAME, EX("processor_model"))),
    F("ram_size", "RAM", ["4GB", "8GB", "12GB", "16GB", "18GB", "24GB", "32GB", "36GB", "48GB", "64GB"], laptop_ram),
    F("ssd", "Storage", ["128GB", "256GB", "512GB", "1TB", "2TB"], laptop_storage),
    F("display_size", "Display Size", ["Up to 12.9 Inch", "13-13.9 Inch", "14-14.9 Inch", "15-15.9 Inch", "16-16.9 Inch",
                                       "17 Inch & Above"], laptop_size),
    F("graphics_type", "Graphics", ["Dedicated", "Integrated"],
      first(pick([("Dedicated", r"\brtx\b|\bgtx\b|radeon rx|\brx ?\d{4}m?\b|arc a\d|dedicated")], NAME, EX("graphics_card_memory"),
                 SPEC(r"graphic")),
            pick([("Integrated", r"intel|amd|ryzen|core|celeron|apple|shared|integrated")], EX("graphics_card_memory"), NAME))),
    F("operating_system", "Operating System", ["Windows", "Free DOS", "macOS", "Chrome OS"],
      pick([("Windows", r"\bwin(dows)?\b"), ("Free DOS", r"\bdos\b|without os|no os"), ("macOS", r"mac ?os|macbook"),
            ("Chrome OS", r"chrome ?(os|book)")], EX("operating_system"), NAME, SPEC(r"operating system", r"^os$"))),
])

DESKTOP = Rules(filters=[
    F("processor_series", "Processor", CPU_SERIES, pick(CPU_SERIES, NAME, EX("processor_model"))),
    F("ram_size", "RAM", ["4GB", "8GB", "16GB", "32GB"], laptop_ram),
    F("ssd", "Storage", ["256GB", "512GB", "1TB", "2TB"], laptop_storage),
])


# ── UPS, routers ─────────────────────────────────────────────────────────────

def ups_va(n: float, m: re.Match) -> Optional[str]:
    va = n * 1000 if (m.group(2) or "").lower() == "k" else n
    return buckets((650, "Up to 650VA"), (1000, "651-1000VA"), (1500, "1001-1500VA"), (2000, "1501-2000VA"),
                   (3000, "2001-3000VA"), (6000, "3001-6000VA"), above="Above 6KVA")(va) if va >= 100 else None


UPS = Rules(filters=[
    F("ups_capacity", "Capacity", ["Up to 650VA", "651-1000VA", "1001-1500VA", "1501-2000VA", "2001-3000VA", "3001-6000VA",
                                   "Above 6KVA"],
      number(NAME, EX("volt_ampere_va"), SPEC(r"capacity", r"va", r"rating"), rx=r"(\d+(?:\.\d+)?)\s*(k)?\s*va\b", to_label=ups_va)),
    F("ups_type", "Type", ["Online", "Offline", "Line Interactive"],
      pick([("Line Interactive", r"line[- ]?interactive"), ("Online", r"\bonline"), ("Offline", r"offline|standby")],
           NAME, SPEC(r"type", r"topology", r"technology"))),
])

WIFI = [("Wi-Fi 7", r"wi-?fi ?7|\bbe\d{4,5}\b|802\.11be"), ("Wi-Fi 6E", r"wi-?fi ?6e|\baxe\d{4}"),
        ("Wi-Fi 6", r"wi-?fi ?6|\bax\d{3,5}\b|802\.11ax"), ("Wi-Fi 5", r"wi-?fi ?5|\bac\d{3,4}\b|802\.11ac"),
        ("Wi-Fi 4", r"wi-?fi ?4|\bn\d{3}\b|802\.11n|wireless n|\b300 ?mbps")]

ROUTERS = Rules(filters=[
    F("wifi_standard", "Wi-Fi Standard", [w[0] for w in WIFI], pick(WIFI, NAME, SPEC(r"standard", r"wireless", r"wi ?fi"))),
    F("band", "Band", ["Single Band", "Dual Band", "Tri Band"],
      pick([("Tri Band", r"tri[- ]?band"), ("Dual Band", r"dual[- ]?band|\bac\d{3,4}\b|\bax\d{3,5}\b"),
            ("Single Band", r"single[- ]?band|2\.4 ?ghz only|\bn300\b|300 ?mbps")], NAME, EX("type"), SPEC(r"band", r"frequency"))),
    F("router_type", "Type", ["Router", "Mesh", "Gaming Router", "Range Extender", "Access Point"],
      pick([("Mesh", r"mesh|\bdeco\b"), ("Range Extender", r"extender|repeater"), ("Access Point", r"access point"),
            ("Gaming Router", r"gaming"), ("Router", r"router")], NAME, EX("type"))),
])


# ── projectors, scanners, gamepads, earphones ────────────────────────────────

LUMEN_BANDS = buckets((2000, "Up to 2000 Lumens"), (3000, "2001-3000 Lumens"), (4000, "3001-4000 Lumens"),
                      above="Above 4000 Lumens")

PROJECTOR = Rules(filters=[
    F("lumens", "Brightness", ["Up to 2000 Lumens", "2001-3000 Lumens", "3001-4000 Lumens", "Above 4000 Lumens"],
      first(number(NAME, rx=r"(\d[\d,]{2,5})\s*(?:ansi\s*)?(?:lumens?|lm\b)", to_label=LUMEN_BANDS),
            number(SPEC(r"lumen", r"brightness"), EX("lumens"), rx=r"(\d[\d,]{2,5})", to_label=LUMEN_BANDS))),
    F("resolution", "Resolution", ["SVGA", "XGA", "WXGA", "HD", "FHD", "4K UHD"],
      pick([("4K UHD", r"\b4k\b|uhd|3840"), ("FHD", r"fhd|full ?hd|1920\s*[x×*]\s*10[28]0|1080p|wuxga"),
            ("WXGA", r"wxga|1280\s*[x×*]\s*800"), ("XGA", r"(?<!w)xga|1024\s*[x×*]\s*768"),
            ("HD", r"\bhd\b|1280\s*[x×*]\s*720|720p"), ("SVGA", r"svga|800\s*[x×*]\s*600")],
           NAME, EX("resolution"), SPEC(r"resolution"), check=["4K UHD", "FHD", "WXGA", "XGA"])),
    F("display_technology", "Technology", ["3LCD", "DLP", "LCD", "LED", "Laser"],
      pick([("3LCD", r"3 ?lcd"), ("DLP", r"\bdlp"), ("Laser", r"laser"), ("LED", r"\bled\b"), ("LCD", r"\blcd")],
           NAME, EX("display_technology"), SPEC(r"technology", r"display", r"light source", r"lamp"))),
])

SCANNER = Rules(filters=[
    F("scanner_type", "Type", ["Flatbed", "Sheetfed / ADF", "Portable", "Document Camera"],
      pick([("Flatbed", r"flatbed|flat bed"), ("Sheetfed / ADF", r"sheet ?fed|\badf\b|document scanner|duplex"),
            ("Portable", r"portable|mobile|handheld"), ("Document Camera", r"camera|visualizer")],
           NAME, SPEC(r"type", r"scanner type"))),
    F("connectivity", "Connectivity", ["USB", "Wi-Fi", "LAN"],
      pick([("USB", r"\busb"), ("Wi-Fi", r"wi-?fi|wireless"), ("LAN", r"\blan\b|ethernet|network")], NAME, EX("connectivity"),
           SPEC(r"connect", r"interface"), multi=True)),
])

GAMEPAD = Rules(filters=[
    F("connectivity", "Connectivity", ["Wired", "Wireless", "Bluetooth"],
      connectivity(EX("interface"), SPEC(r"connect", r"interface"))),
    F("platform", "Platform", ["PC", "PlayStation", "Xbox", "Nintendo Switch", "Android / iOS"],
      pick([("PC", r"\bpc\b|windows|computer"), ("PlayStation", r"ps[345]|playstation|dualsense|dualshock"),
            ("Xbox", r"xbox"), ("Nintendo Switch", r"switch|nintendo"), ("Android / iOS", r"android|ios|iphone|mobile")],
           NAME, SPEC(r"compatib", r"platform", r"support", r"system"), multi=True)),
])

EARPHONE = Rules(filters=[
    F("connectivity", "Connectivity", ["Wired", "Wireless", "Bluetooth"],
      connectivity(EX("interface"), SPEC(r"connect", r"interface", r"bluetooth"))),
    F("features", "Features", ["Microphone", "Noise Cancelling", "Gaming", "Water Resistant"],
      pick([("Microphone", r"\bmic"), ("Noise Cancelling", r"noise cancel|\banc\b|\benc\b"), ("Gaming", r"gaming"),
            ("Water Resistant", r"waterproof|water[- ]resist|\bipx?\d")], NAME, SPEC(r"feature", r"microphone", r"water"),
           multi=True)),
])


PROFILES: dict[str, Rules] = {
    "oc-motherboard": MOTHERBOARD,
    "oc-processor": PROCESSOR,
    "oc-graphics-card": GRAPHICS_CARD,
    "oc-ssd": SSD,
    "oc-hdd": HDD,
    "oc-ram": RAM,
    "oc-power-supply": POWER_SUPPLY,
    "oc-casing": CASING,
    "oc-monitor": MONITOR,
    "oc-cpu-cooler": CPU_COOLER,
    "oc-keyboards": KEYBOARDS,
    "oc-mouse": MOUSE,
    "oc-headphone": HEADPHONE,
    "oc-speaker": SPEAKER,
    "oc-printer": PRINTER,
    "oc-laptop": LAPTOP,
    "oc-desktop": DESKTOP,
    "oc-ups": UPS,
    "oc-routers": ROUTERS,
    "oc-projector": PROJECTOR,
    "oc-scanner": SCANNER,
    "oc-gamepad": GAMEPAD,
    "oc-earphone": EARPHONE,
    "oc-earbud": EARPHONE,
}
