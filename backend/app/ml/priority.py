from app.schemas.reports import Priority


def normalize_priority(label: str) -> str:
    for value in Priority:
        if label.strip().casefold() == value.casefold():
            return value.value
    raise ValueError(f"Unmapped priority label: {label!r}")
