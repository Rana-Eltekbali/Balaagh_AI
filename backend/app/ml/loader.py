import json
from pathlib import Path
from types import SimpleNamespace

from app.config import Settings
from app.ml.category import Classifier, normalize_category, validate_labels
from app.ml.location import LocationNER
from app.ml.priority import normalize_priority
from app.schemas.reports import IncidentClass, Priority


def validate_loading(info: dict, name: str):
    # Reject randomly initialized or mismatched classification heads.
    if any(info.get(key) for key in ("missing_keys", "mismatched_keys", "error_msgs")):
        raise ValueError(f"{name} has missing or incompatible trained weights")


def load_models(settings: Settings):
    for name in ("category_model_path", "priority_model_path", "location_model_path"):
        if not getattr(settings, name):
            raise ValueError(f"{name.upper()} must point to a trained model")
        source = Path(getattr(settings, name))
        if (source / "label_mappings.json").is_file() and not (
            source / "multitask_model.pt"
        ).is_file():
            raise ValueError(
                f"{name.upper()} directory is missing multitask_model.pt from Alla/train_arabert.py"
            )

    import torch
    from transformers import (
        AutoConfig,
        AutoModel,
        AutoModelForSequenceClassification,
        AutoTokenizer,
    )

    if settings.model_device == "cuda" and not torch.cuda.is_available():
        raise ValueError("MODEL_DEVICE=cuda requested but CUDA is unavailable")
    device = settings.model_device
    shared = {}

    def classifier(source, task, normalize, values):
        path = Path(source)
        mappings = path / "label_mappings.json"
        # This repository's trainer saves an encoder + two heads in multitask_model.pt.
        if mappings.is_file():
            weights = path / "multitask_model.pt"
            if not weights.is_file():
                raise ValueError(
                    f"{task.upper()} model directory requires multitask_model.pt from Alla/train_arabert.py"
                )
            key = str(path.resolve())
            if key not in shared:
                label_data = json.loads(mappings.read_text(encoding="utf-8"))
                category_labels = validate_labels(
                    label_data["incident_type"]["id2label"], normalize_category, set(IncidentClass)
                )
                priority_labels = validate_labels(
                    label_data["priority"]["id2label"], normalize_priority, set(Priority)
                )
                config = AutoConfig.from_pretrained(source, trust_remote_code=False)

                class MultiTask(torch.nn.Module):
                    def __init__(self):
                        super().__init__()
                        self.encoder = AutoModel.from_config(config)
                        self.it_head = torch.nn.Linear(config.hidden_size, len(category_labels))
                        self.pr_head = torch.nn.Linear(config.hidden_size, len(priority_labels))

                    def forward(self, input_ids, attention_mask, **_):
                        pooled = self.encoder(
                            input_ids=input_ids, attention_mask=attention_mask
                        ).last_hidden_state[:, 0, :]
                        return self.it_head(pooled), self.pr_head(pooled)

                model = MultiTask()
                state = torch.load(weights, map_location="cpu", weights_only=True)
                model.load_state_dict(state, strict=True)
                del state
                model.to(device).eval()
                tokenizer = AutoTokenizer.from_pretrained(
                    source, use_fast=True, trust_remote_code=False
                )
                shared[key] = (model, tokenizer, category_labels, priority_labels)
            model, tokenizer, category_labels, priority_labels = shared[key]
            head = 0 if task == "category" else 1
            return Classifier(
                model,
                tokenizer,
                category_labels if head == 0 else priority_labels,
                device,
                settings.classification_max_tokens,
                head,
            )

        config = AutoConfig.from_pretrained(source, trust_remote_code=False)
        labels = validate_labels(config.id2label, normalize, values)
        model, info = AutoModelForSequenceClassification.from_pretrained(
            source, output_loading_info=True, trust_remote_code=False
        )
        validate_loading(info, task)
        model.to(device).eval()
        tokenizer = AutoTokenizer.from_pretrained(source, use_fast=True, trust_remote_code=False)
        return Classifier(model, tokenizer, labels, device, settings.classification_max_tokens)

    category = classifier(
        settings.category_model_path, "category", normalize_category, set(IncidentClass)
    )
    priority = classifier(
        settings.priority_model_path, "priority", normalize_priority, set(Priority)
    )
    location = load_location_model(settings)
    return SimpleNamespace(category=category, priority=priority, location=location)


def load_location_model(settings: Settings):
    import torch
    from transformers import AutoModelForTokenClassification, AutoTokenizer

    if not settings.location_model_path:
        raise ValueError("LOCATION_MODEL_PATH is required")
    if settings.model_device == "cuda" and not torch.cuda.is_available():
        raise ValueError("MODEL_DEVICE=cuda requested but CUDA is unavailable")
    location_model, info = AutoModelForTokenClassification.from_pretrained(
        settings.location_model_path, output_loading_info=True, trust_remote_code=False
    )
    validate_loading(info, "location")
    location_model.to(settings.model_device).eval()
    location_tokenizer = AutoTokenizer.from_pretrained(
        settings.location_model_path, use_fast=True, trust_remote_code=False
    )
    return LocationNER(
        location_model, location_tokenizer, settings.model_device, settings.location_max_tokens
    )
