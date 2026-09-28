"""
train_arabert.py — Balaagh AI Model 3
AraBERT Multi-Task Classification (incident_type + priority)

Architecture:
    AraBERT encoder (aubmindlab/bert-base-arabertv02)
        |
        v
    [CLS] pooled representation
       /         \
      v           v
  incident      priority
    head          head
   (6 classes)  (4 classes)

Outputs
-------
models/arabert/                  <- best model checkpoint + tokenizer
results/arabert/                 <- metrics, reports, confusion matrices, predictions
results/error_analysis/arabert_errors.csv
results/model_comparison.csv     <- updated with AraBERT row
"""

import json
import os
import random
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

# ============================================================
# CONFIGURATION  — single source of truth for all parameters
# ============================================================
CONFIG = {
    # Data
    "train_path": "data/processed/train_processed.csv",
    "val_path":   "data/processed/val_processed.csv",
    "test_path":  "data/processed/test_processed.csv",

    # Paths
    "model_dir":        "models/arabert",
    "results_dir":      "results/arabert",
    "error_dir":        "results/error_analysis",
    "comparison_path":  "results/model_comparison.csv",
    "lr_metrics":       "results/logistic_regression/metrics.json",
    "svm_metrics":      "results/svm/metrics.json",

    # AraBERT checkpoint
    "checkpoint": "aubmindlab/bert-base-arabertv02",

    # Tokenizer
    "max_length": 128,

    # Training
    "epochs":        5,
    "batch_size":    16,
    "learning_rate": 2e-5,
    "weight_decay":  0.01,
    "seed":          42,

    # Class weights: compute from training set
    "use_class_weights": True,

    # Label sets (sorted for consistency)
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
# SEED
# ============================================================
def set_seed(seed: int):
    random.seed(seed)
    np.random.seed(seed)
    try:
        import torch
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
    except ImportError:
        pass

# ============================================================
# IMPORTS (deferred — torch/transformers may not be installed yet)
# ============================================================
def check_imports():
    missing = []
    try:
        import torch  # noqa: F401
    except ImportError:
        missing.append("torch")
    try:
        import transformers  # noqa: F401
    except ImportError:
        missing.append("transformers")
    if missing:
        print(f"ERROR: Required packages not installed: {missing}")
        print("Install with:")
        print("  pip install torch --index-url https://download.pytorch.org/whl/cpu")
        print("  pip install transformers accelerate")
        sys.exit(1)

# ============================================================
# DATASET
# ============================================================
class BalaghDataset:
    """PyTorch Dataset for multi-task classification."""

    def __init__(self, df: pd.DataFrame, tokenizer, it_label2id: dict,
                 pr_label2id: dict, max_length: int):
        self.texts      = df["report"].tolist()
        self.it_labels  = [it_label2id[l] for l in df["incident_type"]]
        self.pr_labels  = [pr_label2id[l]  for l in df["priority"]]
        self.tokenizer  = tokenizer
        self.max_length = max_length

    def __len__(self):
        return len(self.texts)

    def __getitem__(self, idx):
        import torch
        enc = self.tokenizer(
            self.texts[idx],
            max_length=self.max_length,
            padding="max_length",
            truncation=True,
            return_tensors="pt",
        )
        return {
            "input_ids":      enc["input_ids"].squeeze(0),
            "attention_mask": enc["attention_mask"].squeeze(0),
            "it_label":       torch.tensor(self.it_labels[idx], dtype=torch.long),
            "pr_label":       torch.tensor(self.pr_labels[idx], dtype=torch.long),
        }

# ============================================================
# MODEL
# ============================================================
class AraBERTMultiTask:
    """
    Multi-task classifier built on top of AraBERT.
    Implemented as a plain PyTorch nn.Module.
    """
    pass  # defined inside run() after torch is confirmed available


def build_model(checkpoint: str, num_it_classes: int, num_pr_classes: int):
    """Load AraBERT and attach two classification heads."""
    import torch
    import torch.nn as nn
    from transformers import AutoModel

    class _Model(nn.Module):
        def __init__(self):
            super().__init__()
            self.encoder     = AutoModel.from_pretrained(checkpoint)
            hidden           = self.encoder.config.hidden_size
            self.it_head     = nn.Linear(hidden, num_it_classes)
            self.pr_head     = nn.Linear(hidden, num_pr_classes)

        def forward(self, input_ids, attention_mask):
            outputs       = self.encoder(input_ids=input_ids,
                                         attention_mask=attention_mask)
            # Use [CLS] token representation as the pooled output
            pooled        = outputs.last_hidden_state[:, 0, :]
            it_logits     = self.it_head(pooled)
            pr_logits     = self.pr_head(pooled)
            return it_logits, pr_logits

    return _Model()

# ============================================================
# CLASS WEIGHTS
# ============================================================
def compute_class_weights(labels: list, num_classes: int):
    """
    Inverse-frequency class weights computed from training labels only.
    Returns a float tensor of shape (num_classes,).
    """
    import torch
    from sklearn.utils.class_weight import compute_class_weight
    classes    = np.arange(num_classes)
    weights    = compute_class_weight("balanced", classes=classes, y=np.array(labels))
    return torch.tensor(weights, dtype=torch.float)

# ============================================================
# METRICS
# ============================================================
def compute_metrics(y_true, y_pred, labels: list) -> dict:
    from sklearn.metrics import (
        accuracy_score, classification_report, confusion_matrix,
        f1_score, precision_score, recall_score,
    )
    return {
        "accuracy":        round(accuracy_score(y_true, y_pred), 4),
        "macro_f1":        round(f1_score(y_true, y_pred, average="macro",    zero_division=0), 4),
        "weighted_f1":     round(f1_score(y_true, y_pred, average="weighted", zero_division=0), 4),
        "macro_precision": round(precision_score(y_true, y_pred, average="macro",    zero_division=0), 4),
        "macro_recall":    round(recall_score(y_true, y_pred,    average="macro",    zero_division=0), 4),
        "report":          classification_report(y_true, y_pred, labels=labels, zero_division=0),
        "cm":              confusion_matrix(y_true, y_pred, labels=labels).tolist(),
    }

# ============================================================
# CONFUSION MATRIX PLOT
# ============================================================
def save_confusion_matrix(cm: list, labels: list, title: str, out_path: Path):
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
            ax.text(j, i, format(cm_arr[i, j], "d"), ha="center", va="center",
                    color="white" if cm_arr[i, j] > thresh else "black", fontsize=9)
    fig.tight_layout()
    plt.savefig(out_path, dpi=150)
    plt.close(fig)
    print(f"  Saved -> {out_path.name}")

# ============================================================
# EVAL LOOP
# ============================================================
def evaluate(model, loader, device, it_id2label: list, pr_id2label: list):
    """Run inference on a DataLoader. Returns predictions and true labels."""
    import torch
    model.eval()
    all_it_true, all_it_pred = [], []
    all_pr_true, all_pr_pred = [], []

    with torch.no_grad():
        for batch in loader:
            input_ids      = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            it_logits, pr_logits = model(input_ids, attention_mask)

            all_it_true.extend(batch["it_label"].cpu().numpy().tolist())
            all_it_pred.extend(it_logits.argmax(dim=-1).cpu().numpy().tolist())
            all_pr_true.extend(batch["pr_label"].cpu().numpy().tolist())
            all_pr_pred.extend(pr_logits.argmax(dim=-1).cpu().numpy().tolist())

    # Convert IDs back to label strings
    it_true = [it_id2label[i] for i in all_it_true]
    it_pred = [it_id2label[i] for i in all_it_pred]
    pr_true = [pr_id2label[i] for i in all_pr_true]
    pr_pred = [pr_id2label[i] for i in all_pr_pred]

    return it_true, it_pred, pr_true, pr_pred

# ============================================================
# TRAINING LOOP
# ============================================================
def train_one_epoch(model, loader, optimizer, it_loss_fn, pr_loss_fn, device):
    import torch
    model.train()
    total_loss = 0.0
    for batch in loader:
        input_ids      = batch["input_ids"].to(device)
        attention_mask = batch["attention_mask"].to(device)
        it_labels      = batch["it_label"].to(device)
        pr_labels      = batch["pr_label"].to(device)

        optimizer.zero_grad()
        it_logits, pr_logits = model(input_ids, attention_mask)

        loss = it_loss_fn(it_logits, it_labels) + pr_loss_fn(pr_logits, pr_labels)
        loss.backward()
        optimizer.step()
        total_loss += loss.item()

    return total_loss / len(loader)

# ============================================================
# COMPARISON TABLE UPDATE
# ============================================================
def update_comparison_table(cfg: dict, arabert_metrics: dict, root: Path):
    rows = []

    # Load LR
    with open(root / cfg["lr_metrics"], encoding="utf-8") as f:
        lr = json.load(f)
    rows.append({
        "Model":               "TF-IDF + Logistic Regression",
        "Incident Accuracy":   lr["test"]["incident_type"]["accuracy"],
        "Incident Macro F1":   lr["test"]["incident_type"]["macro_f1"],
        "Priority Accuracy":   lr["test"]["priority"]["accuracy"],
        "Priority Macro F1":   lr["test"]["priority"]["macro_f1"],
        "Joint Accuracy":      lr["test"]["joint_accuracy"],
    })

    # Load SVM
    with open(root / cfg["svm_metrics"], encoding="utf-8") as f:
        svm = json.load(f)
    rows.append({
        "Model":               "TF-IDF + Linear SVM",
        "Incident Accuracy":   svm["test"]["incident_type"]["accuracy"],
        "Incident Macro F1":   svm["test"]["incident_type"]["macro_f1"],
        "Priority Accuracy":   svm["test"]["priority"]["accuracy"],
        "Priority Macro F1":   svm["test"]["priority"]["macro_f1"],
        "Joint Accuracy":      svm["test"]["joint_accuracy"],
    })

    # AraBERT
    rows.append({
        "Model":               "AraBERT (bert-base-arabertv02)",
        "Incident Accuracy":   arabert_metrics["test"]["incident_type"]["accuracy"],
        "Incident Macro F1":   arabert_metrics["test"]["incident_type"]["macro_f1"],
        "Priority Accuracy":   arabert_metrics["test"]["priority"]["accuracy"],
        "Priority Macro F1":   arabert_metrics["test"]["priority"]["macro_f1"],
        "Joint Accuracy":      arabert_metrics["test"]["joint_accuracy"],
    })

    df = pd.DataFrame(rows)
    out = root / cfg["comparison_path"]
    df.to_csv(out, index=False, encoding="utf-8-sig")
    print(f"Comparison table updated -> {out}")
    return df

# ============================================================
# MAIN
# ============================================================
def run():
    check_imports()

    import torch
    from torch.utils.data import DataLoader
    from transformers import AutoTokenizer
    from tqdm import tqdm

    cfg  = CONFIG
    root = Path(__file__).parent
    set_seed(cfg["seed"])

    # --- Device ---
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    # --- Load data ---
    print("\n--- Loading data ---")
    train_df = pd.read_csv(cfg["train_path"])
    val_df   = pd.read_csv(cfg["val_path"])
    test_df  = pd.read_csv(cfg["test_path"])
    print(f"  train={len(train_df)}  val={len(val_df)}  test={len(test_df)}")

    # Sanity checks
    for name, df in [("train", train_df), ("val", val_df), ("test", test_df)]:
        missing = df[["report", "incident_type", "priority"]].isnull().sum().sum()
        assert missing == 0, f"Missing values in {name}: {missing}"

    # --- Label mappings ---
    it_labels = cfg["incident_type_labels"]
    pr_labels = cfg["priority_labels"]
    it_label2id = {l: i for i, l in enumerate(it_labels)}
    pr_label2id = {l: i for i, l in enumerate(pr_labels)}
    it_id2label = {i: l for l, i in it_label2id.items()}
    pr_id2label = {i: l for l, i in pr_label2id.items()}

    print("\n  incident_type distribution (train):")
    print(train_df["incident_type"].value_counts().to_string())
    print("\n  priority distribution (train):")
    print(train_df["priority"].value_counts().to_string())

    # --- Tokenizer ---
    print(f"\n--- Loading tokenizer: {cfg['checkpoint']} ---")
    tokenizer = AutoTokenizer.from_pretrained(cfg["checkpoint"])

    # --- Datasets & Loaders ---
    train_ds = BalaghDataset(train_df, tokenizer, it_label2id, pr_label2id, cfg["max_length"])
    val_ds   = BalaghDataset(val_df,   tokenizer, it_label2id, pr_label2id, cfg["max_length"])
    test_ds  = BalaghDataset(test_df,  tokenizer, it_label2id, pr_label2id, cfg["max_length"])

    # num_workers=0 is safest on Windows
    train_loader = DataLoader(train_ds, batch_size=cfg["batch_size"], shuffle=True,  num_workers=0)
    val_loader   = DataLoader(val_ds,   batch_size=cfg["batch_size"], shuffle=False, num_workers=0)
    test_loader  = DataLoader(test_ds,  batch_size=cfg["batch_size"], shuffle=False, num_workers=0)

    # --- Model ---
    print(f"\n--- Loading model: {cfg['checkpoint']} ---")
    model = build_model(cfg["checkpoint"], len(it_labels), len(pr_labels))
    model.to(device)

    # --- Class weights (from training set only) ---
    it_train_ids = [it_label2id[l] for l in train_df["incident_type"]]
    pr_train_ids = [pr_label2id[l] for l in train_df["priority"]]

    if cfg["use_class_weights"]:
        it_weights = compute_class_weights(it_train_ids, len(it_labels)).to(device)
        pr_weights = compute_class_weights(pr_train_ids, len(pr_labels)).to(device)
        print("  Using class weights for incident_type and priority.")
        it_loss_fn = torch.nn.CrossEntropyLoss(weight=it_weights)
        pr_loss_fn = torch.nn.CrossEntropyLoss(weight=pr_weights)
    else:
        print("  No class weights used.")
        it_loss_fn = torch.nn.CrossEntropyLoss()
        pr_loss_fn = torch.nn.CrossEntropyLoss()

    # --- Optimizer ---
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=cfg["learning_rate"],
        weight_decay=cfg["weight_decay"],
    )

    # --- Training ---
    print("\n--- Training ---")
    res_dir   = root / cfg["results_dir"]
    model_dir = root / cfg["model_dir"]
    res_dir.mkdir(parents=True, exist_ok=True)
    model_dir.mkdir(parents=True, exist_ok=True)

    best_avg_macro_f1 = -1.0
    best_epoch        = -1
    history           = []

    from sklearn.metrics import f1_score

    for epoch in range(1, cfg["epochs"] + 1):
        print(f"\nEpoch {epoch}/{cfg['epochs']}")

        # Train
        train_loss = train_one_epoch(
            model, tqdm(train_loader, desc="  train", leave=False),
            optimizer, it_loss_fn, pr_loss_fn, device
        )

        # Validate
        it_true, it_pred, pr_true, pr_pred = evaluate(
            model, val_loader, device, it_id2label, pr_id2label
        )

        val_it_macro = round(f1_score(it_true, it_pred, average="macro", zero_division=0), 4)
        val_pr_macro = round(f1_score(pr_true, pr_pred, average="macro", zero_division=0), 4)
        avg_macro    = round((val_it_macro + val_pr_macro) / 2, 4)

        # Compute val loss
        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for batch in val_loader:
                input_ids      = batch["input_ids"].to(device)
                attention_mask = batch["attention_mask"].to(device)
                it_lbl         = batch["it_label"].to(device)
                pr_lbl         = batch["pr_label"].to(device)
                it_logits, pr_logits = model(input_ids, attention_mask)
                val_loss += (it_loss_fn(it_logits, it_lbl) + pr_loss_fn(pr_logits, pr_lbl)).item()
        val_loss /= len(val_loader)

        print(f"  train_loss={train_loss:.4f}  val_loss={val_loss:.4f}  "
              f"it_macro_f1={val_it_macro:.4f}  pr_macro_f1={val_pr_macro:.4f}  "
              f"avg_macro_f1={avg_macro:.4f}")

        history.append({
            "epoch":               epoch,
            "train_loss":          round(train_loss, 4),
            "val_loss":            round(val_loss, 4),
            "val_incident_macro_f1": val_it_macro,
            "val_priority_macro_f1": val_pr_macro,
            "val_avg_macro_f1":    avg_macro,
        })

        # Save best checkpoint
        if avg_macro > best_avg_macro_f1:
            best_avg_macro_f1 = avg_macro
            best_epoch        = epoch
            # Save model weights + tokenizer
            model.encoder.save_pretrained(str(model_dir))
            tokenizer.save_pretrained(str(model_dir))
            torch.save(model.state_dict(), model_dir / "multitask_model.pt")
            print(f"  ** New best model saved (avg macro F1 = {avg_macro:.4f}) **")

    print(f"\nBest epoch: {best_epoch}  Best val avg macro F1: {best_avg_macro_f1:.4f}")

    # --- Save training history ---
    hist_df = pd.DataFrame(history)
    hist_df.to_csv(res_dir / "training_history.csv", index=False, encoding="utf-8-sig")
    print(f"Training history saved -> {res_dir / 'training_history.csv'}")

    # --- Load best checkpoint for test evaluation ---
    print("\n--- Loading best checkpoint for test evaluation ---")
    best_model = build_model(cfg["checkpoint"], len(it_labels), len(pr_labels))
    best_model.load_state_dict(torch.load(model_dir / "multitask_model.pt",
                                          map_location=device,
                                          weights_only=False))
    best_model.to(device)

    # --- Test evaluation ---
    print("--- Test evaluation ---")
    it_true, it_pred, pr_true, pr_pred = evaluate(
        best_model, test_loader, device, it_id2label, pr_id2label
    )

    test_it = compute_metrics(it_true, it_pred, it_labels)
    test_pr = compute_metrics(pr_true, pr_pred, pr_labels)

    # Joint accuracy: both tasks must be correct for a sample to count
    joint_arr      = np.array([it == ip and pt == pp
                               for it, ip, pt, pp
                               in zip(it_true, it_pred, pr_true, pr_pred)])
    joint_accuracy = round(float(joint_arr.mean()), 4)

    print(f"  incident_type  accuracy={test_it['accuracy']}  macro_f1={test_it['macro_f1']}")
    print(f"  priority       accuracy={test_pr['accuracy']}  macro_f1={test_pr['macro_f1']}")
    print(f"  joint_accuracy = {joint_accuracy}")

    # --- Error analysis ---
    err_dir = root / cfg["error_dir"]
    err_dir.mkdir(parents=True, exist_ok=True)

    err_df = test_df[["report"]].copy()
    err_df["true_incident_type"]      = it_true
    err_df["predicted_incident_type"] = it_pred
    err_df["true_priority"]           = pr_true
    err_df["predicted_priority"]      = pr_pred
    err_df["incident_correct"]        = [a == b for a, b in zip(it_true, it_pred)]
    err_df["priority_correct"]        = [a == b for a, b in zip(pr_true, pr_pred)]

    error_counts = {
        "both_correct":                    int((err_df["incident_correct"] & err_df["priority_correct"]).sum()),
        "correct_incident_wrong_priority": int((err_df["incident_correct"] & ~err_df["priority_correct"]).sum()),
        "wrong_incident_correct_priority": int((~err_df["incident_correct"] & err_df["priority_correct"]).sum()),
        "both_wrong":                      int((~err_df["incident_correct"] & ~err_df["priority_correct"]).sum()),
    }
    print("\n--- Error analysis ---")
    for k, v in error_counts.items():
        print(f"  {k}: {v}")

    err_df.to_csv(err_dir / "arabert_errors.csv", index=False, encoding="utf-8-sig")

    # --- Save predictions.csv ---
    pred_df = err_df.copy()
    pred_df.to_csv(res_dir / "predictions.csv", index=False, encoding="utf-8-sig")

    # --- Classification reports ---
    (res_dir / "classification_report_incident_type.txt").write_text(
        test_it["report"], encoding="utf-8"
    )
    (res_dir / "classification_report_priority.txt").write_text(
        test_pr["report"], encoding="utf-8"
    )

    # --- Confusion matrices ---
    save_confusion_matrix(
        test_it["cm"], it_labels,
        "Incident Type — Confusion Matrix (Test) — AraBERT",
        res_dir / "confusion_matrix_incident_type.png",
    )
    save_confusion_matrix(
        test_pr["cm"], pr_labels,
        "Priority — Confusion Matrix (Test) — AraBERT",
        res_dir / "confusion_matrix_priority.png",
    )

    # --- Label mappings ---
    label_mappings = {
        "incident_type": {"label2id": it_label2id, "id2label": {str(k): v for k, v in it_id2label.items()}},
        "priority":      {"label2id": pr_label2id, "id2label": {str(k): v for k, v in pr_id2label.items()}},
    }
    with open(model_dir / "label_mappings.json", "w", encoding="utf-8") as f:
        json.dump(label_mappings, f, ensure_ascii=False, indent=2)

    # --- metrics.json ---
    metrics = {
        "model":      "AraBERT (bert-base-arabertv02)",
        "checkpoint": cfg["checkpoint"],
        "device":     str(device),
        "best_epoch": best_epoch,
        "best_val_avg_macro_f1": best_avg_macro_f1,
        "use_class_weights": cfg["use_class_weights"],
        "training_config": {
            "epochs":        cfg["epochs"],
            "batch_size":    cfg["batch_size"],
            "learning_rate": cfg["learning_rate"],
            "weight_decay":  cfg["weight_decay"],
            "max_length":    cfg["max_length"],
            "seed":          cfg["seed"],
        },
        "validation_best": {
            "incident_type": {"macro_f1": history[best_epoch-1]["val_incident_macro_f1"]},
            "priority":      {"macro_f1": history[best_epoch-1]["val_priority_macro_f1"]},
            "avg_macro_f1":  history[best_epoch-1]["val_avg_macro_f1"],
        },
        "test": {
            "incident_type": {k: v for k, v in test_it.items() if k not in ("report", "cm")},
            "priority":      {k: v for k, v in test_pr.items() if k not in ("report", "cm")},
            "joint_accuracy": joint_accuracy,
            "error_analysis": error_counts,
        },
    }
    with open(res_dir / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)

    # --- config.json in model dir ---
    run_config = {
        "checkpoint":        cfg["checkpoint"],
        "max_length":        cfg["max_length"],
        "batch_size":        cfg["batch_size"],
        "learning_rate":     cfg["learning_rate"],
        "epochs":            cfg["epochs"],
        "weight_decay":      cfg["weight_decay"],
        "seed":              cfg["seed"],
        "use_class_weights": cfg["use_class_weights"],
        "best_epoch":        best_epoch,
        "best_val_avg_macro_f1": best_avg_macro_f1,
    }
    with open(model_dir / "run_config.json", "w", encoding="utf-8") as f:
        json.dump(run_config, f, ensure_ascii=False, indent=2)

    # --- Update comparison table ---
    print("\n--- Updating model comparison table ---")
    cmp_df = update_comparison_table(cfg, metrics, root)
    print(cmp_df.to_string(index=False))

    print("\n=== Model 3 (AraBERT) complete ===")
    print(f"  Results dir  : {res_dir}")
    print(f"  Models dir   : {model_dir}")
    print(f"  Error analysis: {err_dir / 'arabert_errors.csv'}")


if __name__ == "__main__":
    run()
