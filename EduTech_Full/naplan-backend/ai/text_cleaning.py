import re
from typing import Optional

# ----------------------------
# Text cleaning / safety
# ----------------------------
NON_ASCII_RE = re.compile(r"[^\x00-\x7F]+")
MULTI_DOT_RE = re.compile(r"\.{3,}")  # "...." -> "..."
MULTI_SPACE_RE = re.compile(r"\s{2,}")
WEIRD_PUNCT_RE = re.compile(r"[•●▪︎◆◇■□▶►➤➔→]+")


def sanitize_text(s: str, max_len: Optional[int] = None) -> str:
    t = (s or "").strip()

    # normalize curly quotes/dashes BEFORE stripping non-ascii
    t = t.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    t = t.replace("–", "-").replace("—", "-")

    t = WEIRD_PUNCT_RE.sub("", t)
    t = NON_ASCII_RE.sub("", t)
    t = MULTI_DOT_RE.sub("...", t)
    t = MULTI_SPACE_RE.sub(" ", t).strip()

    if max_len is not None and len(t) > max_len:
        cut = t[:max_len]
        cut = cut.rsplit(" ", 1)[0].strip() if " " in cut else cut.strip()
        t = (cut + "...").strip()

    return t


def has_special_chars(text: str) -> bool:
    t = text or ""
    return bool(NON_ASCII_RE.search(t) or WEIRD_PUNCT_RE.search(t))


def cleaned_for_checks(text: str) -> str:
    return sanitize_text(text, max_len=None)


def is_blank(text: str) -> bool:
    return (text or "").strip() == ""


def count_words(text: str) -> int:
    t = (text or "").strip()
    if not t:
        return 0
    return len(t.split())


def make_preview_first_lines(text: str, max_lines: int, max_words: int) -> str:
    lines = (text or "").splitlines()
    head = "\n".join(lines[:max_lines]).strip()
    words = head.split()
    if len(words) > max_words:
        head = " ".join(words[:max_words]).strip()
    return head
