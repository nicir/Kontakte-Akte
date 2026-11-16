"""Deterministic text normalisation used for de-duplication and search."""

from __future__ import annotations

import re
import unicodedata

_WS = re.compile(r"\s+")
_GERMAN_TRANSLIT = str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"})


def clean(value: str | None) -> str:
    """Trim, collapse whitespace and apply NFKC. Used for stored display values."""
    if not value:
        return ""
    return _WS.sub(" ", unicodedata.normalize("NFKC", value)).strip()


def clean_optional(value: str | None) -> str | None:
    cleaned = clean(value)
    return cleaned or None


def clean_multiline(value: str | None) -> str | None:
    if value is None:
        return None
    text = unicodedata.normalize("NFC", value).strip()
    return text or None


def fold(value: str | None) -> str:
    """Case-insensitive, diacritic-insensitive key: 'Steuerrecht ', 'steuerrecht' → 'steuerrecht'."""
    value = clean(value).casefold()
    value = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in value if not unicodedata.combining(ch))


def search_document(*parts: str | None) -> str:
    """Build the text stored in the FTS index.

    Contains the folded text plus, where German umlauts occur, a transliterated
    variant so that both "Müller"/"muller" and "Mueller" match.
    """
    joined = " | ".join(p for p in (clean(part) for part in parts) if p)
    lowered = joined.casefold()
    variants = [fold(joined)]
    translit = lowered.translate(_GERMAN_TRANSLIT)
    if translit != lowered:
        variants.append(fold(translit))
    return " || ".join(variants)


def search_terms(query: str) -> list[str]:
    folded = fold(query)
    return [term for term in folded.split(" ") if term]


def escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def initials(display_name: str) -> str:
    parts = [p for p in clean(display_name).split(" ") if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()
