"""
preprocess.py — Balaagh AI Preprocessing Pipeline (Approach 1)

Reusable preprocessing module. Handles all four models consistently.

Usage:
    python preprocess.py

    Or import and call:
        from preprocess import preprocess_split, run_pipeline
"""

import re
import json
import unicodedata
from pathlib import Path

import pandas as pd

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path(__file__).parent
DATA_DIR = ROOT / "data"
PROCESSED_DIR = DATA_DIR / "processed"
SUMMARY_PATH = PROCESSED_DIR / "preprocessing_summary.json"

SPLITS = {
    "train": DATA_DIR / "train.csv",
    "val":   DATA_DIR / "val.csv",
    "test":  DATA_DIR / "test.csv",
}

OUTPUT_PATHS = {
    "train": PROCESSED_DIR / "train_processed.csv",
    "val":   PROCESSED_DIR / "val_processed.csv",
    "test":  PROCESSED_DIR / "test_processed.csv",
}

# ---------------------------------------------------------------------------
# Label definitions
# ---------------------------------------------------------------------------
VALID_INCIDENT_TYPES = {
    "Infrastructure/Utilities",
    "Road/Transportation",
    "Fire/Explosion",
    "People at Risk/Medical",
    "Flood/Severe Weather",
    "Other",
}

# Maps any observed casing variant → canonical title-case value
PRIORITY_NORMALIZATION = {
    "critical": "Critical",
    "high":     "High",
    "medium":   "Medium",
    "low":      "Low",
}

VALID_PRIORITIES = set(PRIORITY_NORMALIZATION.values())  # {Critical, High, Medium, Low}


# ---------------------------------------------------------------------------
# Text cleaning
# ---------------------------------------------------------------------------

def clean_report(text: str) -> str:
    """
    Conservative text cleaning.

    What we DO:
    - Decode/normalize Unicode (NFC normalization — fixes encoding artifacts)
    - Strip leading/trailing whitespace
    - Collapse multiple internal whitespace into a single space
    - Remove non-printable / control characters

    What we DO NOT do:
    - Remove Arabic characters or words
    - Remove punctuation (Arabic punctuation is semantically meaningful)
    - Lowercase (preserves Arabic and proper nouns)
    - Remove digits or special characters aggressively
    """
    if not isinstance(text, str):
        return text  # leave NaN as-is; handled separately

    # NFC normalization: compose characters, fix encoding artifacts
    text = unicodedata.normalize("NFC", text)

    # Remove control/non-printable characters (but keep newlines as spaces)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)

    # Replace newlines and tabs with a space
    text = re.sub(r"[\r\n\t]", " ", text)

    # Collapse multiple spaces into one
    text = re.sub(r" {2,}", " ", text)

    # Strip edges
    text = text.strip()

    return text


# ---------------------------------------------------------------------------
# Priority normalization
# ---------------------------------------------------------------------------

def normalize_priority(value: str) -> str:
    """
    Normalise priority to one of: Critical | High | Medium | Low.
    Lookup is case-insensitive. Returns original value if unrecognized
    (so we can flag it later).
    """
    if not isinstance(value, str):
        return value
    return PRIORITY_NORMALIZATION.get(value.strip().lower(), value)


# ---------------------------------------------------------------------------
# Core preprocessing function (reusable across all models)
# ---------------------------------------------------------------------------

def preprocess_split(df: pd.DataFrame, split_name: str = "") -> tuple[pd.DataFrame, dict]:
    """
    Preprocess a single DataFrame split.

    Steps:
        1. Select only: report, incident_type, priority
        2. Capture before-normalization priority counts
        3. Normalize priority labels
        4. Clean report text
        5. Drop rows with missing values in any of the three columns
        6. Drop rows with invalid incident_type labels
        7. Drop rows with invalid priority labels
        8. Drop exact duplicate report+incident_type+priority rows

    Returns:
        processed_df : cleaned DataFrame with columns [report, incident_type, priority]
        stats        : dict with counts and details for the summary report
    """
    stats: dict = {"split": split_name}

    # --- 1. Select columns ---
    df = df[["report", "incident_type", "priority"]].copy()
    stats["original_row_count"] = len(df)

    # --- 2. Priority counts BEFORE normalization ---
    stats["priority_before"] = df["priority"].value_counts().to_dict()

    # --- 3. Normalize priority ---
    df["priority"] = df["priority"].apply(normalize_priority)

    # --- 4. Clean report text ---
    df["report"] = df["report"].apply(clean_report)

    # --- 5. Drop rows missing in any of the three key columns ---
    missing_mask = df[["report", "incident_type", "priority"]].isnull().any(axis=1)
    rows_dropped_missing = int(missing_mask.sum())
    if rows_dropped_missing:
        print(f"  [{split_name}] Dropping {rows_dropped_missing} row(s) with missing values.")
    df = df[~missing_mask].reset_index(drop=True)

    # Also drop rows where report is empty string after cleaning
    empty_report_mask = df["report"].str.strip() == ""
    rows_dropped_empty = int(empty_report_mask.sum())
    if rows_dropped_empty:
        print(f"  [{split_name}] Dropping {rows_dropped_empty} row(s) with empty report after cleaning.")
    df = df[~empty_report_mask].reset_index(drop=True)

    stats["rows_dropped_missing"] = rows_dropped_missing + rows_dropped_empty

    # --- 6. Drop rows with invalid incident_type ---
    invalid_type_mask = ~df["incident_type"].isin(VALID_INCIDENT_TYPES)
    rows_dropped_type = int(invalid_type_mask.sum())
    if rows_dropped_type:
        bad_types = df.loc[invalid_type_mask, "incident_type"].unique().tolist()
        print(f"  [{split_name}] Dropping {rows_dropped_type} row(s) with invalid incident_type: {bad_types}")
    df = df[~invalid_type_mask].reset_index(drop=True)
    stats["rows_dropped_invalid_incident_type"] = rows_dropped_type

    # --- 7. Drop rows with invalid priority ---
    invalid_priority_mask = ~df["priority"].isin(VALID_PRIORITIES)
    rows_dropped_priority = int(invalid_priority_mask.sum())
    if rows_dropped_priority:
        bad_priorities = df.loc[invalid_priority_mask, "priority"].unique().tolist()
        print(f"  [{split_name}] Dropping {rows_dropped_priority} row(s) with invalid priority: {bad_priorities}")
    df = df[~invalid_priority_mask].reset_index(drop=True)
    stats["rows_dropped_invalid_priority"] = rows_dropped_priority

    # --- 8. Drop duplicate rows ---
    dupes_mask = df.duplicated()
    rows_dropped_dupes = int(dupes_mask.sum())
    if rows_dropped_dupes:
        print(f"  [{split_name}] Dropping {rows_dropped_dupes} duplicate row(s).")
    df = df[~dupes_mask].reset_index(drop=True)
    stats["rows_dropped_duplicates"] = rows_dropped_dupes

    # --- Final counts ---
    stats["processed_row_count"] = len(df)
    stats["total_rows_removed"] = stats["original_row_count"] - stats["processed_row_count"]

    # --- Priority counts AFTER normalization ---
    stats["priority_after"] = df["priority"].value_counts().to_dict()

    # --- incident_type counts AFTER ---
    stats["incident_type_after"] = df["incident_type"].value_counts().to_dict()

    # --- Missing values AFTER ---
    stats["missing_after"] = df.isnull().sum().to_dict()

    # --- Duplicates AFTER ---
    stats["duplicates_after"] = int(df.duplicated().sum())

    return df, stats


# ---------------------------------------------------------------------------
# Pipeline runner
# ---------------------------------------------------------------------------

def run_pipeline():
    """Load all splits, preprocess, save processed CSVs, and write summary."""

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    all_stats = {}

    for split_name, input_path in SPLITS.items():
        print(f"\nProcessing [{split_name}] ...")
        df_raw = pd.read_csv(input_path)
        df_processed, stats = preprocess_split(df_raw, split_name=split_name)

        out_path = OUTPUT_PATHS[split_name]
        df_processed.to_csv(out_path, index=False, encoding="utf-8-sig")
        print(f"  Saved -> {out_path}")
        print(f"  Rows: {stats['original_row_count']} -> {stats['processed_row_count']} "
              f"({stats['total_rows_removed']} removed)")

        all_stats[split_name] = stats

    # --- Save summary JSON ---
    with open(SUMMARY_PATH, "w", encoding="utf-8") as f:
        json.dump(all_stats, f, ensure_ascii=False, indent=2)
    print(f"\nPreprocessing summary saved -> {SUMMARY_PATH}")

    return all_stats


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    run_pipeline()
