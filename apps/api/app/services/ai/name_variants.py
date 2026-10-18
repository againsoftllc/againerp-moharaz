"""Bangla / Banglish name variants for the record search (docs/AI/ai.md, step 2.3).

Names in a Bangladeshi ERP are written many ways: রহিম, Rahim, Rohim; Md, Mohammad, Muhammad, মোঃ; Hossain, Hussain, Hosen. A search for one
spelling must find the others. `variants(word)` returns the word plus its known equivalents:

* a table of equivalent spellings (GROUPS) for the very common names and name parts - each group lists Latin and Bangla forms;
* a rule-based Bangla -> Latin transliteration, so a Bangla word that is NOT in the table (সিফাত) is still searched as sifat / sofat ...
  (the inherent vowel is tried as both "o" and "a", because রহিম is written Rahim or Rohim).

Only the QUERY is expanded: the database keeps the names as they were typed. Add a group whenever a real search misses
(scripts/run_name_search_eval.py shows which).
"""
from __future__ import annotations

import re
from functools import lru_cache

# Each group = spellings of the same name (Latin lower case, and Bangla). Keep to names / name parts, not ordinary words.
GROUPS: tuple[tuple[str, ...], ...] = (
    ("md", "mohammad", "mohammed", "muhammad", "muhammed", "mohammod", "mohd", "mhd", "মোঃ", "মোহাম্মদ", "মুহাম্মদ", "মোহাম্মাদ", "মোহাম্মেদ", "মুহাম্মাদ"),
    ("rahim", "rohim", "rahin", "রহিম", "রাহিম"),
    ("karim", "korim", "করিম", "কারিম"),
    ("rahman", "rahaman", "rehman", "rohman", "রহমান", "রহমন"),
    ("islam", "eslam", "ইসলাম"),
    ("ahmed", "ahmad", "ahmod", "আহমেদ", "আহমদ", "আহমাদ"),
    ("hossain", "hussain", "hosain", "hossen", "hosen", "hussein", "hosen", "হোসেন", "হোসাইন", "হুসাইন", "হোসাইন"),
    ("hasan", "hasen", "hassan", "হাসান"),
    ("ali", "আলী", "আলি"),
    ("akter", "akhter", "akhtar", "akhter", "aktar", "আক্তার", "আখতার", "আকতার"),
    ("begum", "begam", "বেগম"),
    ("khatun", "khatoon", "khaton", "খাতুন"),
    ("khan", "khaan", "খান"),
    ("uddin", "uddin", "ud din", "উদ্দিন", "উদ্দীন", "উদ্দিন"),
    ("alam", "আলম"),
    ("miah", "mia", "mian", "miyan", "মিয়া", "মিঞা"),
    ("chowdhury", "chaudhury", "chowdhuri", "choudhury", "chaudhuri", "চৌধুরী", "চৌধুরি"),
    ("sheikh", "shaikh", "sheik", "shake", "শেখ", "শেইখ"),
    ("sultana", "sultanah", "সুলতানা"),
    ("fatema", "fatima", "fatema", "fateha", "ফাতেমা", "ফাতিমা"),
    ("ayesha", "aisha", "ayeshah", "আয়শা", "আয়েশা", "আইশা"),
    ("sumon", "shumon", "sumun", "সুমন"),
    ("shamim", "samim", "shamimm", "শামীম", "সামিম"),
    ("shamsul", "samsul", "shamsol", "শামসুল", "সামসুল"),
    ("abdul", "abdur", "abdus", "আব্দুল", "আবদুল", "আব্দুর", "আবদুর"),
    ("kabir", "kobir", "কবির", "কাবির"),
    ("jahan", "jahan", "zahan", "জাহান"),
    ("jamal", "zamal", "jamal", "জামাল"),
    ("nasir", "nasser", "nazir", "নাসির", "নাছির"),
    ("sabbir", "shabbir", "sabir", "সাব্বির", "সাবির"),
    ("faruk", "faruque", "farooq", "farouk", "ফারুক", "ফারুখ"),
    ("hasnat", "hasnath", "হাসনাত"),
    ("tamim", "tameem", "তামিম", "তামীম"),
    ("rakib", "rakeeb", "raqib", "রাকিব", "রকিব"),
    ("shakil", "sakil", "shakeel", "শাকিল", "সাকিল"),
    ("sakib", "shakib", "সাকিব", "শাকিব"),
    ("mamun", "mamoon", "mamun", "মামুন"),
    ("rubel", "rubal", "রুবেল"),
    ("sohel", "suhel", "sohail", "সোহেল", "সুহেল"),
    ("rana", "রানা"),
    ("babu", "বাবু"),
    ("nur", "noor", "nour", "নূর", "নুর"),
    ("mia", "মিয়া"),
    ("store", "stores", "স্টোর", "স্টোরস"),
    ("traders", "trader", "trading", "ট্রেডার্স", "ট্রেডার্স"),
    ("enterprise", "enterprises", "এন্টারপ্রাইজ", "এন্টারপ্রাইজেস"),
    ("computer", "computers", "কম্পিউটার", "কম্পিউটারস"),
    ("electronics", "electronic", "ইলেকট্রনিক্স", "ইলেক্ট্রনিক্স"),
)

_INDEX: dict[str, tuple[str, ...]] = {}
for _g in GROUPS:
    for _w in _g:
        _INDEX[_w.lower()] = tuple(dict.fromkeys(list(_INDEX.get(_w.lower(), ())) + list(_g)))

BN_RANGE = re.compile(r"[ঀ-৿]")

_CONS = {
    "ক": "k", "খ": "kh", "গ": "g", "ঘ": "gh", "ঙ": "ng", "চ": "ch", "ছ": "ch", "জ": "j", "ঝ": "jh", "ঞ": "n",
    "ট": "t", "ঠ": "th", "ড": "d", "ঢ": "dh", "ণ": "n", "ত": "t", "থ": "th", "দ": "d", "ধ": "dh", "ন": "n",
    "প": "p", "ফ": "f", "ব": "b", "ভ": "bh", "ম": "m", "য": "j", "র": "r", "ল": "l", "শ": "sh", "ষ": "sh",
    "স": "s", "হ": "h", "ড়": "r", "ঢ়": "rh", "য়": "y", "ৎ": "t", "ং": "ng", "ঃ": "h",
}
_VOW = {"অ": "o", "আ": "a", "ই": "i", "ঈ": "i", "উ": "u", "ঊ": "u", "ঋ": "ri", "এ": "e", "ঐ": "oi", "ও": "o", "ঔ": "ou"}
_SIGN = {"া": "a", "ি": "i", "ী": "i", "ু": "u", "ূ": "u", "ৃ": "ri", "ে": "e", "ৈ": "oi", "ো": "o", "ৌ": "ou"}
_VIRAMA = "্"
_SKIP = {"ঁ", "়"}


def bn_to_latin(word: str, inherent: str = "o") -> str:
    """Rough Bangla -> Latin: রহিম -> rohim (inherent="o") / rahim (inherent="a"). The inherent vowel is dropped at the end of a word."""
    chars = [c for c in word if c not in _SKIP]
    out: list[str] = []
    i = 0
    while i < len(chars):
        c = chars[i]
        if c in _CONS:
            out.append(_CONS[c])
            nxt = chars[i + 1] if i + 1 < len(chars) else ""
            if nxt == _VIRAMA:
                i += 2  # conjunct: no vowel after this consonant
                continue
            if nxt in _SIGN:
                out.append(_SIGN[nxt])
                i += 2
                continue
            if i + 1 < len(chars) and nxt in _CONS or nxt in _VOW:
                out.append(inherent)  # inherent vowel between consonants
            # at the end of the word the inherent vowel is silent
        elif c in _VOW:
            out.append(_VOW[c])
        elif c in _SIGN:
            out.append(_SIGN[c])
        elif c == _VIRAMA:
            pass
        else:
            out.append(c)
        i += 1
    return "".join(out)


@lru_cache(maxsize=4096)
def variants(word: str) -> tuple[str, ...]:
    """The word and its known equivalents (lower case), at most 12. Always starts with the word itself."""
    w = (word or "").strip().lower()
    if not w:
        return ()
    out: list[str] = [w]
    out += [v for v in _INDEX.get(w, ()) if v != w]
    if BN_RANGE.search(w):
        for inh in ("o", "a"):
            t = bn_to_latin(w, inh)
            if t and t not in out:
                out.append(t)
    return tuple(dict.fromkeys(out))[:12]
