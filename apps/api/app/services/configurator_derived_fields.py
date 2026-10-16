"""Builder fields the rules need, read from what the catalog already has.

Most "No data for rules" products carry the value under another spec name (CPU "Default TDP: 65W",
motherboard "Memory Slot: 4"), inside a free-text spec ("2x M.2 … 4x SATA 6G"), or in the product
name ("32GB (2x16GB) DDR5", "Ryzen 5 7600X"). `derive()` fills a field only while it is empty, so a
value the admin set (attribute, Field Source, Chipset Lookup, Override) always wins, and it writes
the plain numbers / tokens the rule engine compares (lte / gte want a bare number, overlap a list).

Where the catalog has nothing, a few fields fall back to the makers' published figures (CPU TDP,
the GPU's recommended PSU) or the standard of the form factor (an ATX case takes an ATX PSU).
"""

from __future__ import annotations

import re
from typing import Dict, Iterable, List, Optional

# ---------- helpers ----------


def _first(stored: Dict[str, str], *keys: str) -> str:
    for key in keys:
        for k in (key, f"oc-{key}"):
            value = str(stored.get(k) or "").strip()
            if value:
                return value
    return ""


def _all_text(stored: Dict[str, str], keys: Iterable[str]) -> str:
    return "\n".join(str(stored.get(k) or "") for k in keys if str(stored.get(k) or "").strip())


def _number(text: str, unit: str = "") -> Optional[int]:
    m = re.search(rf"(\d{{1,5}})\s*{unit}\b", text.replace(",", ""), re.I) if unit else re.search(r"(\d{1,5})", text.replace(",", ""))
    return int(m.group(1)) if m else None


def _empty(attrs: Dict[str, str], key: str) -> bool:
    return not str(attrs.get(key) or "").strip()


def _set(attrs: Dict[str, str], key: str, value) -> None:
    if value is not None and str(value).strip() and _empty(attrs, key):
        attrs[key] = str(value)


# ---------- form factors ----------

# Board sizes as the overlap rule compares them; a case that takes a size takes every smaller one.
_FORMS = ["E-ATX", "ATX", "Micro-ATX", "Mini-ITX"]


def _form_sizes(text: str) -> List[str]:
    t = text.lower().replace("_", " ")
    found = []
    if re.search(r"\be-?atx\b|extended atx|ssi[- ]?ceb|ssi[- ]?eeb", t):
        found.append("E-ATX")
    if re.search(r"(?<![a-z-])atx\b", re.sub(r"(micro|mini|m|e|extended|flex)[- ]?atx", " ", t)):
        found.append("ATX")
    if re.search(r"micro[- ]?atx|\bm-?atx\b|\bmatx\b|mini[- ]?atx", t):
        found.append("Micro-ATX")
    if re.search(r"mini[- ]?itx|\bitx\b|mini[- ]?dtx", t):
        found.append("Mini-ITX")
    return found


def _board_form(text: str) -> Optional[str]:
    """One motherboard's size: the biggest one its text names."""
    sizes = _form_sizes(text)
    return sizes[0] if sizes else None


def _case_support(text: str) -> Optional[str]:
    sizes = _form_sizes(text)
    if not sizes:
        return None
    biggest = min(_FORMS.index(s) for s in sizes)
    return ",".join(_FORMS[biggest:])


# ---------- per part ----------


def _cpu(attrs: Dict[str, str], stored: Dict[str, str], name: str) -> None:
    n = name
    # TDP: the spec ("65W"), else the maker's figure from the model
    tdp = _number(_first(stored, "default_tdp", "processor_base_power", "base_power", "tdp"), "w")
    _set(attrs, "tdp", tdp or _cpu_tdp(n))

    # iGPU: Yes / No (the "no iGPU → graphics card required" rule)
    gfx = _first(stored, "graphics", "processor_features", "integrated_graphics", "processor_graphics").lower()
    if gfx:
        if re.search(r"without|no graphics|\bnone\b|not (?:available|included)|discrete", gfx):
            _set(attrs, "igpu", "No")
        elif re.search(r"graphics|uhd|iris|radeon|vega|\byes\b|integrated|intel arc", gfx):
            _set(attrs, "igpu", "Yes")
    _set(attrs, "igpu", _cpu_igpu(n))

    # generation, spelled as the Chipset Lookup spells it: "Ryzen 5000 Series" → "Ryzen 5000",
    # "Core Ultra Series 2" → "Core Ultra 200"; from the name when the spec is empty
    gen = str(attrs.get("generation") or "").strip()
    m = re.search(r"Ryzen\s+(\d)000", gen, re.I)
    if m:
        attrs["generation"] = f"Ryzen {m.group(1)}000"
    elif re.search(r"Core\s+Ultra\s+(?:Series\s+2|2\d\d)", gen, re.I):
        attrs["generation"] = "Core Ultra 200"
    elif not gen:
        _set(attrs, "generation", _cpu_generation(n))


def canonical_generations(value: str) -> str:
    """One spelling for CPU generations on both sides of the generation rules: "Ryzen 7000 Series" / "AMD Ryzen
    7000" → "Ryzen 7000", "14th Gen Intel Core" → "14th Gen", "Core Ultra Series 2" / "200S" → "Core Ultra 200".
    Lists stay lists ("Ryzen 7000 Series, Ryzen 8000 Series" → "Ryzen 7000, Ryzen 8000")."""
    out = []
    for part in re.split(r"[,|/]", str(value or "")):
        p = part.strip()
        if not p:
            continue
        m = re.search(r"Ryzen\s*(\d)000", p, re.I)
        g = re.search(r"\b(\d{1,2})(?:st|nd|rd|th)\s*Gen", p, re.I)
        if m:
            p = f"Ryzen {m.group(1)}000"
        elif re.search(r"Core\s*Ultra\s*(?:Series\s*2|2\d\d)", p, re.I):
            p = "Core Ultra 200"
        elif g:
            n = int(g.group(1))
            p = f"{n}{'st' if n == 1 else 'nd' if n == 2 else 'rd' if n == 3 else 'th'} Gen"
        out.append(p)
    return ", ".join(dict.fromkeys(out))


def _cpu_generation(name: str) -> Optional[str]:
    m = re.search(r"Ryzen\s+\d\s+(?:PRO\s+)?(\d)\d{3}", name, re.I)
    if m:
        return f"Ryzen {m.group(1)}000"
    if re.search(r"Core\s+Ultra\s+[579]\s+2\d\d", name, re.I):
        return "Core Ultra 200"
    m = re.search(r"\bi[3579][- ]?(1\d)\d{3}", name, re.I) or re.search(r"\bi[3579][- ]?([2-9])\d{3}(?!\d)", name, re.I)
    if m:
        g = int(m.group(1))
        return f"{g}{'nd' if g == 2 else 'rd' if g == 3 else 'th'} Gen"
    return None


def _cpu_tdp(name: str) -> Optional[int]:
    n = name
    if re.search(r"Athlon", n, re.I):
        return 35 if re.search(r"\d{3}GE\b", n) else 65
    m = re.search(r"Ryzen\s+(?:Threadripper\s+)?(?:PRO\s+)?\d?\s*(\d{4,5})(X3D|XT|X|GE|G|F)?\b", n, re.I)
    if m and "threadripper" not in n.lower():
        model, suf = int(m.group(1)), (m.group(2) or "").upper()
        if suf == "GE":
            return 35
        if suf == "X3D":
            return 170 if model in (7950, 9950) else 120
        if suf in ("X", "XT"):
            if model >= 7000:
                return 170 if model % 1000 >= 900 else (120 if model >= 9000 else 105)
            return 105 if model % 1000 >= 800 else 65
        return 65
    m = re.search(r"Core\s+Ultra\s+[579]\s+(\d{3})(K|KF|F)?\b", n, re.I)
    if m:
        return 125 if (m.group(2) or "").upper().startswith("K") else 65
    m = re.search(r"\bi[3579][- ]?(\d{4,5})(KS|KF|K|F|T)?\b", n, re.I)
    if m:
        suf = (m.group(2) or "").upper()
        if suf.startswith("K"):
            return 150 if suf == "KS" else 125
        if suf == "T":
            return 35
        return 60 if re.search(r"\bi3", n, re.I) else 65
    if re.search(r"Pentium|Celeron", n, re.I):
        return 46 if re.search(r"G7\d{3}", n) else 58
    return None


def _cpu_igpu(name: str) -> Optional[str]:
    n = name
    if re.search(r"Threadripper", n, re.I):
        return "No"
    m = re.search(r"Ryzen\s+(?:PRO\s+)?\d\s+(?:PRO\s+)?(\d)(\d{3})(X3D|XT|X|GE|G|F)?\b", n, re.I)
    if m:
        series, suf = int(m.group(1)), (m.group(3) or "").upper()
        if suf in ("G", "GE"):
            return "Yes"
        if suf == "F":
            return "No"
        # Ryzen 7000 / 9000 desktop parts have basic Radeon graphics; 8000 non-G and older non-G have none
        return "Yes" if series in (7, 9) else "No"
    if re.search(r"Athlon", n, re.I):
        return "Yes"
    if re.search(r"\b(?:i[3579][- ]?\d{4,5}|Ultra\s+[579]\s+\d{3})(K?F)\b", n, re.I):
        return "No"
    if re.search(r"Intel|Core\s+i[3579]|Core\s+Ultra|Pentium|Celeron", n, re.I):
        return "Yes"
    return None


def _sockets(text: str) -> List[str]:
    t = text.upper().replace(" ", "")
    out = []
    for tok, pat in (("am5", r"AM5"), ("am4", r"AM4"), ("am3", r"AM3"), ("lga_1851", r"1851"), ("lga_1700", r"1700"),
                     ("lga_1200", r"1200"), ("lga_2066", r"2066"), ("lga_2011", r"2011")):
        if re.search(pat, t):
            out.append(tok)
    if re.search(r"115X|1150|1151|1155|1156", t):
        out += ["lga_1150", "lga_1151", "lga_1155"]
    return out


def _cooler(attrs: Dict[str, str], stored: Dict[str, str], name: str) -> None:
    kind = f"{_first(stored, 'cooler_type', 'type')} {name}".lower()
    if re.search(r"liquid|aio|water|\b(120|240|280|360|420)\s*mm\b.*(radiator|liquid)", kind):
        cooler_type = "AIO"
    elif re.search(r"\bair\b|tower|heat ?pipe", kind):
        cooler_type = "Air"
    else:
        cooler_type = None
    # the rules gate on cooler_type = Air / AIO; a stored "Liquid Cooler" never matched them
    if cooler_type:
        attrs["cooler_type"] = cooler_type

    socket_text = _all_text(stored, [k for k in stored if re.search(r"socket|amd|intel", k, re.I)])
    socks = _sockets(socket_text)
    if socks:
        current = [s for s in str(attrs.get("socket_support") or "").split(",") if s]
        merged = list(dict.fromkeys([*current, *socks]))
        if set(merged) != set(current):
            attrs["socket_support"] = ",".join(merged)

    if cooler_type == "AIO":
        rad = _number(f"{_first(stored, 'cooler_size', 'size', 'radiator_size')} {name}", "mm")
        if rad in (120, 140, 240, 280, 360, 420, 480):
            _set(attrs, "cooler_radiator_size", rad)
    if cooler_type == "Air":
        dim = _first(stored, "dimension", "dimensions", "height", "cooler_height")
        m = re.search(r"\bH\s*[:=]?\s*(\d{2,3}(?:\.\d)?)\s*mm", dim, re.I) or re.search(r"height\s*[:=]?\s*(\d{2,3}(?:\.\d)?)", dim, re.I)
        if not m:
            nums = [float(x) for x in re.findall(r"(\d{2,3}(?:\.\d)?)", dim)]
            m_val = max(nums) if len(nums) == 3 else None
        else:
            m_val = float(m.group(1))
        if m_val and 30 <= m_val <= 200:
            _set(attrs, "cooler_height", int(round(m_val)))
    # rated TDP: a "TDP" spec, or "250W TDP" / "TDP 250W" in the name
    tdp_spec = _number(_all_text(stored, [k for k in stored if re.search(r"tdp", k, re.I)]), "w")
    m = re.search(r"(\d{2,3})\s*W\s*TDP|TDP\s*[:\-]?\s*(\d{2,3})\s*W", name, re.I)
    _set(attrs, "cooler_tdp_rating", tdp_spec or (int(m.group(1) or m.group(2)) if m else None))


def _case(attrs: Dict[str, str], stored: Dict[str, str], name: str) -> None:
    support = _case_support(" ".join(filter(None, [
        str(attrs.get("case_motherboard_support") or ""), _first(stored, "motherboard_support", "motherboard_type"), name,
    ])))
    if support:
        # an ATX case takes Micro-ATX and Mini-ITX boards too; a bare "ATX" made them look incompatible
        attrs["case_motherboard_support"] = support

    rad_text = _first(stored, "radiator_support")
    sizes = [int(x) for x in re.findall(r"(120|140|240|280|360|420|480)\s*mm", rad_text, re.I)]
    if sizes:
        _set(attrs, "case_max_radiator", max(sizes))

    psu_text = f"{_first(stored, 'psu', 'power_supply', 'psu_support')} {name}"
    if re.search(r"\bSFX-?L?\b", psu_text, re.I) and not re.search(r"\bATX\s*PSU|ATX\s*power", psu_text, re.I):
        _set(attrs, "case_psu_support", "SFX")
    elif support:
        # every case that takes an ATX or Micro-ATX board takes an ATX PSU; an ITX-only case usually an SFX one
        _set(attrs, "case_psu_support", "ATX,SFX" if "ATX" in support.split(",") or "Micro-ATX" in support.split(",") else "SFX")


def _psu(attrs: Dict[str, str], stored: Dict[str, str], name: str) -> None:
    text = f"{_first(stored, 'form_factor', 'psu_form_factor')} {name}"
    if re.search(r"\bSFX-?L\b", text, re.I):
        _set(attrs, "psu_form_factor", "SFX")
    elif re.search(r"\bSFX\b", text, re.I):
        _set(attrs, "psu_form_factor", "SFX")
    elif re.search(r"\bTFX\b", text, re.I):
        _set(attrs, "psu_form_factor", "TFX")
    else:
        _set(attrs, "psu_form_factor", "ATX")  # desktop PSUs are ATX unless they say otherwise
    # the Wattage spec is often the filter's range ("800-999W", "Up to 499W"); the name says "850W"
    stored_watt = _first(stored, "wattage", "total_power")
    named = re.search(r"\b(\d{3,4})\s*W\b", name, re.I)
    if named and (not stored_watt or re.search(r"-|&|up\s*to|above|\+", stored_watt, re.I)):
        attrs["wattage"] = named.group(1)


# NVIDIA / AMD recommended system power (W)
_GPU_PSU = [
    (r"5090", 1000), (r"4090", 850), (r"5080", 850), (r"4080", 750), (r"5070\s*Ti", 750), (r"4070\s*Ti", 700),
    (r"5070", 650), (r"4070", 650), (r"5060\s*Ti", 600), (r"4060\s*Ti", 550), (r"5060", 550), (r"5050", 550),
    (r"4060", 550), (r"3090", 750), (r"3080", 750), (r"3070", 650), (r"3060\s*Ti", 600), (r"3060", 550), (r"3050", 450),
    (r"2060", 500), (r"1660", 450), (r"1650", 300), (r"GT\s*10[34]0", 300), (r"GT\s*7[13]0", 300),
    (r"7900\s*XTX", 800), (r"7900\s*(?:XT|GRE)", 750), (r"9070\s*XT", 750), (r"9070", 650), (r"7800\s*XT", 700),
    (r"7700\s*XT", 700), (r"9060\s*XT", 500), (r"7600", 550), (r"6750", 650), (r"6700", 600), (r"6650|6600", 500),
    (r"6500|6400", 400), (r"A770|A750", 650), (r"B580|B570", 600), (r"A380|A310", 300),
]


def _ports(text: str) -> List[str]:
    t = text.lower()
    out = []
    if "hdmi" in t:
        out.append("HDMI")
    if re.search(r"display\s*port|\bdp\b|\bdp\s*\d|\bdp\d", t):
        out.append("DisplayPort")
    if "dvi" in t:
        out.append("DVI")
    if re.search(r"\bvga\b|d-?sub", t):
        out.append("VGA")
    if re.search(r"usb[- ]?c|type[- ]?c|thunderbolt", t):
        out.append("USB-C")
    return out


def _gpu(attrs: Dict[str, str], stored: Dict[str, str], name: str) -> None:
    model = f"{_first(stored, 'gpu_model', 'chipset')} {name}"
    dims = _first(stored, "dimensions", "dimension", "card_length", "length")
    m = re.search(r"length\s*[:=]?\s*(\d{2,3}(?:\.\d)?)", dims, re.I)
    nums = [float(x) for x in re.findall(r"(\d{2,3}(?:\.\d+)?)", dims)]
    length = float(m.group(1)) if m else (max(nums) if nums and re.search(r"mm|x", dims, re.I) else None)
    if length and 100 <= length <= 420:
        _set(attrs, "gpu_length", int(round(length)))

    psu = _number(_first(stored, "recommended_psu", "recommended_power_supply", "power_requirement"), "w")
    if not psu:
        psu = next((w for pat, w in _GPU_PSU if re.search(pat, model, re.I)), None)
    _set(attrs, "gpu_recommended_psu", psu)

    port_text = _all_text(stored, [k for k in stored if re.search(r"output|hdmi|display|port|connector|interface", k, re.I)
                                    and not re.search(r"memory_interface|power_connector", k, re.I)])
    ports = _ports(port_text)
    if ports and re.search(r"\b(RTX|GTX\s*16|RX\s*[5-9]\d{2,3}|Arc)\b", model, re.I):
        # current cards all have HDMI and DisplayPort; a spec table with only a "DisplayPort" row lists one of them
        ports = list(dict.fromkeys([*ports, "HDMI", "DisplayPort"]))
    if not ports:
        # every current NVIDIA / AMD / Intel card has HDMI and DisplayPort; the old GT 7x0 has HDMI, DVI and VGA
        ports = ["HDMI", "DVI", "VGA"] if re.search(r"GT\s*7[13]0|GT\s*610|HD\s*5450", model, re.I) else ["HDMI", "DisplayPort"]
    _set(attrs, "gpu_ports", ",".join(ports))


def _memory(attrs: Dict[str, str], stored: Dict[str, str], name: str) -> None:
    kit = re.search(r"(\d)\s*[x×]\s*(\d{1,3})\s*GB", name, re.I)
    kit_rev = re.search(r"(\d{1,3})\s*GB\s*[x×]\s*(\d)\b", name, re.I) or re.search(r"\((\d{1,3})\s*[x×]\s*(\d)\)", name)  # "(8GB x2)", "(16x2)"
    total = None
    if kit or kit_rev:
        modules, each = (int(kit.group(1)), int(kit.group(2))) if kit else (int(kit_rev.group(2)), int(kit_rev.group(1)))
        total = modules * each
        _set(attrs, "ram_modules", modules)
    else:
        _set(attrs, "ram_modules", 2 if re.search(r"\bkit\b|dual", name, re.I) and not re.search(r"single", name, re.I) else 1)
    cap = _number(_first(stored, "capacity", "memory_size", "size"), "gb") or _number(name, "gb") or total
    if total and cap and cap < total:
        cap = total  # "16GB" listed per stick on a 2x16GB kit
    _set(attrs, "ram_capacity", cap)


def _monitor(attrs: Dict[str, str], stored: Dict[str, str], name: str) -> None:
    text = _all_text(stored, [k for k in stored if re.search(r"port|hdmi|display|input|connect|interface|vga|dvi|usb", k, re.I)])
    ports = _ports(f"{text} {name}")
    if ports:
        _set(attrs, "monitor_ports", ",".join(ports))


def _motherboard(attrs: Dict[str, str], stored: Dict[str, str], name: str) -> None:
    n = re.sub(r"\(.*?\)", "", name)
    by_name = ("Mini-ITX" if re.search(r"\b[ABHXZ]\d{3}[A-Z]?-?I\b|ITX", n, re.I)
               else "Micro-ATX" if re.search(r"\b[ABHXZ]\d{3}M\b|m-?atx|micro", n, re.I)
               else "E-ATX" if re.search(r"e-?atx", n, re.I) else "ATX" if re.search(r"\bATX\b", n, re.I) else None)
    # the model name ("B450M", "B650I") outranks a form-factor spec that says otherwise
    form = by_name if by_name in ("Micro-ATX", "Mini-ITX") else (_board_form(_first(stored, "form_factor", "mb_form_factor")) or by_name)
    _set(attrs, "mb_form_factor", form)

    memory = f"{_first(stored, 'memory_slots')}\n{_first(stored, 'memory')}"
    m = (re.search(r"(?:memory|dimm)\s*slots?\s*[:=]?\s*(\d)", memory, re.I) or re.search(r"(\d)\s*(?:x|×)?\s*(?:DDR\d\s*)?DIMM", memory, re.I)
         or re.search(r"^\s*(\d)\s*slots?", memory, re.I | re.M))
    slots = int(m.group(1)) if m and 1 <= int(m.group(1)) <= 8 else (2 if form == "Mini-ITX" else None)
    _set(attrs, "ram_slots", slots)

    maxi = _number(_first(stored, "maximum_memory", "max_memory"), "gb")
    if not maxi:
        m = re.search(r"(?:max(?:imum)?\.?(?:\s*capacity[^:\n]*)?|up\s*to)\s*[:=]?\s*(?:supports?\s*)?(?:up\s*to\s*)?(\d{2,4})\s*GB", memory, re.I)
        maxi = int(m.group(1)) if m else None
    if maxi and 8 <= maxi <= 1024:
        _set(attrs, "max_ram", maxi)

    # M.2 / SATA: a total ("Total Supports 3 X M.2 Socket", "2x M.2") or one "1 x … M.2 Socket" line per slot
    # (Key E slots are for Wi-Fi cards, not drives); left empty when the text can't tell
    storage = _first(stored, "storage")
    total = re.search(r"total[^\n]*?(\d)\s*(?:x|×)\s*M\.?2", storage, re.I)
    if total:
        _set(attrs, "m2_slots", int(total.group(1)))
    else:
        per_slot = [int(c) for c, rest in re.findall(r"(\d)\s*(?:x|×)\s*([^\n]{0,40}?M\.?2[^\n]*)", storage, re.I) if not re.search(r"key\s*e\b", rest, re.I)]
        if per_slot:
            # "M.2 Socket: 2x M.2" and "Supported Storage: 2x M.2" repeat one figure; separate slots each say "1 x"
            _set(attrs, "m2_slots", sum(per_slot) if all(c == 1 for c in per_slot) else max(per_slot))
    sata = [int(c) for c in re.findall(r"(\d)\s*(?:x|×)\s*SATA", storage, re.I)]
    if sata:
        _set(attrs, "sata_ports", max(sata))


def derive(attrs: Dict[str, str], stored: Dict[str, str], name: str) -> Dict[str, str]:
    """Fills the rule fields this product's own data can answer (see the module docstring). Each part's
    fields are filled only for a product that looks like that part, so a RAM stick never gets a socket."""
    out = dict(attrs)
    has = lambda *keys: any(_first(stored, k) for k in keys)
    low = name.lower()
    if re.search(r"\b(ryzen|athlon|core\s+(i[3579]|ultra)|pentium|celeron|xeon|threadripper)\b", low) and "laptop" not in low \
            and not re.search(r"motherboard|cooler|board", low):
        _cpu(out, stored, name)
    if has("cooler_type") or re.search(r"cpu cooler|liquid cooler|air cooler|aio\b", low):
        _cooler(out, stored, name)
    if has("motherboard_support", "motherboard_type", "radiator_support") or re.search(r"\bcasing\b|\bcase\b|chassis|tower", low):
        _case(out, stored, name)
    if has("80_plus_rating", "efficiency", "modular") or re.search(r"power supply|\bpsu\b", low):
        _psu(out, stored, name)
    if has("gpu_model", "gpu_brand", "cuda_cores") or re.search(r"graphics card|\b(rtx|gtx|rx)\s?\d{3,4}", low):
        _gpu(out, stored, name)
    if has("ram_form", "bus_speed") or (re.search(r"\bram\b|memory", low) and re.search(r"ddr\d", low) and "motherboard" not in low):
        _memory(out, stored, name)
    if has("screen_size", "panel_type", "refresh_rate"):
        _monitor(out, stored, name)
    if (has("chipset") and has("form_factor") and has("socket")) or "motherboard" in low:
        _motherboard(out, stored, name)
    return out
