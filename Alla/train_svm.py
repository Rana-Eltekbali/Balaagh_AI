"""
train_svm.py — Balaagh AI Model 2
TF-IDF + Linear SVM (multi-task: incident_type + priority)

Uses identical TF-IDF config as Model 1 for a fair comparison.

Outputs
-------
models/svm/
    tfidf_vectorizer.joblib
    incident_type_model.joblib
    priority_model.joblib

results/svm/
    metrics.json
    classification_report_incident_type.txt
    classification_report_priority.txt
    confusion_matrix_incident_type.png
    confusion_matrix_priority.png
    predictions.csv

results/error_analysis/
    svm_errors.csv

results/
    model_comparison.csv
"""

import json
from pathlib import Path

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)

# ============================================================
# CONFIGURATION
# ============================================================

CONFIG = {
    # Paths
    "train_path": "data/processed/train_processed.csv",
    "val_path":   "data/processed/val_processed.csv",
    "test_path":  "data/processed/test_processed.csv",

    "model_dir":   "models/svm",
    "results_dir": "results/svm",
    "error_dir":   "results/error_analysis",
    "comparison_path": "results/model_comparison.csv",

    # LR results (Model 1) for comparison table — read from saved metrics.json
    "lr_metrics_path": "results/logistic_regression/metrics.json",

    # TF-IDF — identical to Model 1 for fair comparison
    "tfidf": {
        "analyzer":    "word",
        "ngram_range": (1, 2),
        "sublinear_tf": True,
        "lowercase":   False,
        "max_features": 50_000,
        "min_df": 2,
        "strip_accents": None,
    },

    # SVM
    "svm": {
        "class_weight": "balanced",
        "random_state": 42,
        "max_iter":     2000,    # increased for convergence with smaller C values
    },

    # C values to sweep on validation set
    "C_grid": [0.01, 0.1, 1.0, 5.0, 10.0],

    # Label orders for consistent confusion matrices
    "incident_type_labels": [
        "Fire/Explosion",
        "Flood/Severe Weather",
        "Infrastructure/Utilities",
        "Other",
        "People at Risk/Medical",
        "Road/Transportation",
    ],
    "priority_labels": ["Critical", "High", "Medium", "Low"],
}

# ============================================================
# HELPERS
# ============================================================

def load_splits(cfg: dict) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    train = pd.read_csv(cfg["train_path"])
    val   = pd.read_csv(cfg["val_path"])
    test  = pd.read_csv(cfg["test_path"])
    print(f"Loaded  train={len(train)}  val={len(val)}  test={len(test)}")
    return train, val, test


def build_tfidf(cfg: dict, train_texts: pd.Series) -> TfidfVectorizer:
    """Fit TF-IDF on training corpus ONLY — identical settings to Model 1."""
    tc = cfg["tfidf"]
    vec = TfidfVectorizer(
        analyzer=tc["analyzer"],
        ngram_range=tc["ngram_range"],
        sublinear_tf=tc["sublinear_tf"],
        lowercase=tc["lowercase"],
        max_features=tc["max_features"],
        min_df=tc["min_df"],
        strip_accents=tc["strip_accents"],
    )
    vec.fit(train_texts)
    print(f"TF-IDF vocabulary size: {len(vec.vocabulary_):,}")
    return vec


def train_svm(X_train, y_train, cfg: dict, C: float) -> LinearSVC:
    sc = cfg["svm"]
    clf = LinearSVC(
        C=C,
        class_weight=sc["class_weight"],
        random_state=sc["random_state"],
        max_iter=sc["max_iter"],
        dual="auto",   # suppress FutureWarning in sklearn >= 1.3
    )
    clf.fit(X_train, y_train)
    return clf


def evaluate_split(model, X, y_true, labels: list, split_name: str) -> dict:
    """Compute full metrics for one task/split."""
    y_pred = model.predict(X)
    return {
        "split":           split_name,
        "accuracy":        round(accuracy_score(y_true, y_pred), 4),
        "macro_f1":        round(f1_score(y_true, y_pred, average="macro",    zero_division=0), 4),
        "weighted_f1":     round(f1_score(y_true, y_pred, average="weighted", zero_division=0), 4),
        "macro_precision": round(precision_score(y_true, y_pred, average="macro",    zero_division=0), 4),
        "macro_recall":    round(recall_score(y_true, y_pred,    average="macro",    zero_division=0), 4),
        "report":          classification_report(y_true, y_pred, labels=labels, zero_division=0),
        "cm":              confusion_matrix(y_true, y_pred, labels=labels).tolist(),
        "y_pred":          y_pred.tolist(),
    }


def save_confusion_matrix(cm: list, labels: list, title: str, out_path: Path):
    """Save a labelled confusion matrix heatmap as PNG."""
    cm_arr = np.array(cm)
    fig, ax = plt.subplots(figsize=(max(6, len(labels)), max(5, len(labels))))
    im = ax.imshow(cm_arr, interpolation="nearest", cmap="Blues")
    plt.colorbar(im, ax=ax)
    ax.set(
        xticks=np.arange(len(labels)),
        yticks=np.arange(len(labels)),
        xticklabels=labels,
        yticklabels=labels,
        ylabel="True label",
        xlabel="Predicted label",
        title=title,
    )
    plt.setp(ax.get_xticklabels(), rotation=30, ha="right", rotation_mode="anchor")
    thresh = cm_arr.max() / 2.0
    for i in range(len(labels)):
        for j in range(len(labels)):
            ax.text(
                j, i, format(cm_arr[i, j], "d"),
                ha="center", va="center",
                color="white" if cm_arr[i, j] > thresh else "black",
                fontsize=9,
            )
    fig.tight_layout()
    plt.savefig(out_path, dpi=150)
    plt.close(fig)
    print(f"  Saved confusion matrix -> {out_path.name}")


# ============================================================
# HYPERPARAMETER SELECTION ON VALIDATION SET
# ============================================================

def select_C(cfg, X_train, y_it_train, y_pr_train, X_val, y_it_val, y_pr_val):
    """
    Sweep C_grid. Score = average of incident_type and priority val Macro F1.
    Returns best C.
    """
    print("\n--- Validation sweep over C ---")
    best_C     = cfg["C_grid"][0]
    best_score = -1.0

    for C in cfg["C_grid"]:
        clf_it = train_svm(X_train, y_it_train, cfg, C)
        clf_pr = train_svm(X_train, y_pr_train, cfg, C)

        f1_it = f1_score(y_it_val, clf_it.predict(X_val), average="macro", zero_division=0)
        f1_pr = f1_score(y_pr_val, clf_pr.predict(X_val), average="macro", zero_division=0)
        avg   = (f1_it + f1_pr) / 2.0

        print(f"  C={C:<6}  incident_type Macro F1={f1_it:.4f}  "
              f"priority Macro F1={f1_pr:.4f}  avg={avg:.4f}")

        if avg > best_score:
            best_score = avg
            best_C     = C

    print(f"  Best C = {best_C}  (avg val Macro F1 = {best_score:.4f})")
    return best_C


# ============================================================
# COMPARISON TABLE
# ============================================================

def build_comparison_table(cfg: dict, svm_metrics: dict, root: Path) -> pd.DataFrame:
    """
    Load Model 1 (LR) metrics.json and combine with SVM results
    into a single comparison CSV.
    """
    lr_path = root / cfg["lr_metrics_path"]
    with open(lr_path, encoding="utf-8") as f:
        lr_metrics = json.load(f)

    rows = [
        {
            "Model":                    "TF-IDF + Logistic Regression",
            "Incident Accuracy":        lr_metrics["test"]["incident_type"]["accuracy"],
            "Incident Macro F1":        lr_metrics["test"]["incident_type"]["macro_f1"],
            "Priority Accuracy":        lr_metrics["test"]["priority"]["accuracy"],
            "Priority Macro F1":        lr_metrics["test"]["priority"]["macro_f1"],
            "Joint Accuracy":           lr_metrics["test"]["joint_accuracy"],
        },
        {
            "Model":                    "TF-IDF + Linear SVM",
            "Incident Accuracy":        svm_metrics["test"]["incident_type"]["accuracy"],
            "Incident Macro F1":        svm_metrics["test"]["incident_type"]["macro_f1"],
            "Priority Accuracy":        svm_metrics["test"]["priority"]["accuracy"],
            "Priority Macro F1":        svm_metrics["test"]["priority"]["macro_f1"],
            "Joint Accuracy":           svm_metrics["test"]["joint_accuracy"],
        },
    ]

    df = pd.DataFrame(rows)
    out_path = root / cfg["comparison_path"]
    df.to_csv(out_path, index=False, encoding="utf-8-sig")
    print(f"\nComparison table saved -> {out_path}")
    return df


# ============================================================
# MAIN PIPELINE
# ============================================================

def run():
    cfg  = CONFIG
    root = Path(__file__).parent

    # --- Load data ---
    train_df, val_df, test_df = load_splits(cfg)

    y_it_train = train_df["incident_type"].values
    y_pr_train = train_df["priority"].values
    y_it_val   = val_df["incident_type"].values
    y_pr_val   = val_df["priority"].values
    y_it_test  = test_df["incident_type"].values
    y_pr_test  = test_df["priority"].values

    # --- TF-IDF: fit on train only, transform all splits ---
    print("\n--- Building TF-IDF ---")
    vec     = build_tfidf(cfg, train_df["report"])
    X_train = vec.transform(train_df["report"])
    X_val   = vec.transform(val_df["report"])
    X_test  = vec.transform(test_df["report"])

    # --- Select best C on validation ---
    best_C = select_C(cfg, X_train, y_it_train, y_pr_train, X_val, y_it_val, y_pr_val)

    # --- Train final models with best C ---
    print(f"\n--- Training final models (C={best_C}) ---")
    clf_it = train_svm(X_train, y_it_train, cfg, best_C)
    clf_pr = train_svm(X_train, y_pr_train, cfg, best_C)

    # --------------------------------------------------------
    # VALIDATION METRICS (for reporting)
    # --------------------------------------------------------
    print("\n--- Validation metrics ---")
    val_it = evaluate_split(clf_it, X_val, y_it_val, cfg["incident_type_labels"], "val")
    val_pr = evaluate_split(clf_pr, X_val, y_pr_val, cfg["priority_labels"],       "val")
    print(f"  incident_type  accuracy={val_it['accuracy']}  macro_f1={val_it['macro_f1']}")
    print(f"  priority       accuracy={val_pr['accuracy']}  macro_f1={val_pr['macro_f1']}")

    # --------------------------------------------------------
    # TEST METRICS (evaluated once, config locked)
    # --------------------------------------------------------
    print("\n--- Test metrics ---")
    test_it = evaluate_split(clf_it, X_test, y_it_test, cfg["incident_type_labels"], "test")
    test_pr = evaluate_split(clf_pr, X_test, y_pr_test, cfg["priority_labels"],       "test")
    print(f"  incident_type  accuracy={test_it['accuracy']}  macro_f1={test_it['macro_f1']}")
    print(f"  priority       accuracy={test_pr['accuracy']}  macro_f1={test_pr['macro_f1']}")

    # Joint accuracy
    y_it_pred_test = np.array(test_it["y_pred"])
    y_pr_pred_test = np.array(test_pr["y_pred"])
    both_correct   = (y_it_pred_test == y_it_test) & (y_pr_pred_test == y_pr_test)
    joint_accuracy = round(float(both_correct.mean()), 4)
    print(f"  joint_accuracy = {joint_accuracy}")

    # --------------------------------------------------------
    # SAVE MODELS
    # --------------------------------------------------------
    model_dir = root / cfg["model_dir"]
    model_dir.mkdir(parents=True, exist_ok=True)

    joblib.dump(vec,    model_dir / "tfidf_vectorizer.joblib")
    joblib.dump(clf_it, model_dir / "incident_type_model.joblib")
    joblib.dump(clf_pr, model_dir / "priority_model.joblib")
    print(f"\n  Models saved -> {model_dir}")

    # --------------------------------------------------------
    # SAVE RESULTS
    # --------------------------------------------------------
    res_dir = root / cfg["results_dir"]
    res_dir.mkdir(parents=True, exist_ok=True)

    # Build metrics dict (strip non-serialisable fields before saving)
    metrics = {
        "model": "TF-IDF + Linear SVM",
        "best_C": best_C,
        "tfidf_config": {
            **cfg["tfidf"],
            "ngram_range": list(cfg["tfidf"]["ngram_range"]),
        },
        "svm_config": {**cfg["svm"], "C": best_C},
        "validation": {
            "incident_type": {k: v for k, v in val_it.items() if k not in ("report", "cm", "y_pred")},
            "priority":      {k: v for k, v in val_pr.items() if k not in ("report", "cm", "y_pred")},
        },
        "test": {
            "incident_type": {k: v for k, v in test_it.items() if k not in ("report", "cm", "y_pred")},
            "priority":      {k: v for k, v in test_pr.items() if k not in ("report", "cm", "y_pred")},
            "joint_accuracy": joint_accuracy,
        },
    }

    # 1. metrics.json (written again after error analysis is added below)
    with open(res_dir / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)

    # 2. Classification reports
    (res_dir / "classification_report_incident_type.txt").write_text(
        test_it["report"], encoding="utf-8"
    )
    (res_dir / "classification_report_priority.txt").write_text(
        test_pr["report"], encoding="utf-8"
    )

    # 3. Confusion matrices
    save_confusion_matrix(
        test_it["cm"], cfg["incident_type_labels"],
        "Incident Type — Confusion Matrix (Test) — SVM",
        res_dir / "confusion_matrix_incident_type.png",
    )
    save_confusion_matrix(
        test_pr["cm"], cfg["priority_labels"],
        "Priority — Confusion Matrix (Test) — SVM",
        res_dir / "confusion_matrix_priority.png",
    )

    # 4. predictions.csv
    pred_df = test_df[["report"]].copy()
    pred_df["true_incident_type"]      = y_it_test
    pred_df["predicted_incident_type"] = y_it_pred_test
    pred_df["true_priority"]           = y_pr_test
    pred_df["predicted_priority"]      = y_pr_pred_test
    pred_df.to_csv(res_dir / "predictions.csv", index=False, encoding="utf-8-sig")

    # --------------------------------------------------------
    # ERROR ANALYSIS
    # --------------------------------------------------------
    err_dir = root / cfg["error_dir"]
    err_dir.mkdir(parents=True, exist_ok=True)

    err_df = pred_df.copy()
    err_df["incident_correct"] = (err_df["true_incident_type"] == err_df["predicted_incident_type"])
    err_df["priority_correct"]  = (err_df["true_priority"]      == err_df["predicted_priority"])
    err_df.to_csv(err_dir / "svm_errors.csv", index=False, encoding="utf-8-sig")

    error_counts = {
        "both_correct":                     int((err_df["incident_correct"]  & err_df["priority_correct"]).sum()),
        "correct_incident_wrong_priority":  int((err_df["incident_correct"]  & ~err_df["priority_correct"]).sum()),
        "wrong_incident_correct_priority":  int((~err_df["incident_correct"] & err_df["priority_correct"]).sum()),
        "both_wrong":                       int((~err_df["incident_correct"] & ~err_df["priority_correct"]).sum()),
    }

    print("\n--- Error analysis ---")
    for k, v in error_counts.items():
        print(f"  {k}: {v}")

    # Add error counts to metrics.json
    metrics["test"]["error_analysis"] = error_counts
    with open(res_dir / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)

    # --------------------------------------------------------
    # COMPARISON TABLE
    # --------------------------------------------------------
    print("\n--- Model comparison table ---")
    cmp_df = build_comparison_table(cfg, metrics, root)
    print(cmp_df.to_string(index=False))

    print("\n=== Model 2 complete ===")
    print(f"  Results dir   : {res_dir}")
    print(f"  Models dir    : {model_dir}")
    print(f"  Error analysis: {err_dir / 'svm_errors.csv'}")
    print(f"  Comparison    : {root / cfg['comparison_path']}")


if __name__ == "__main__":
    run()
