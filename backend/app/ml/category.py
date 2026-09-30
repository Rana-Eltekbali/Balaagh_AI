from app.schemas.reports import IncidentClass


def normalize_category(label: str) -> str:
    compact = "".join(label.split()).casefold()
    for value in IncidentClass:
        if "".join(value.split()).casefold() == compact:
            return value.value
    raise ValueError(f"Unmapped category label: {label!r}")


def validate_labels(id2label: dict, normalize, expected: set[str]) -> dict[int, str]:
    mapped = {int(key): normalize(value) for key, value in id2label.items()}
    if (
        set(mapped) != set(range(len(mapped)))
        or set(mapped.values()) != expected
        or len(mapped) != len(expected)
    ):
        raise ValueError("Model labels must map one-to-one to the complete canonical label set")
    return mapped


class Classifier:
    def __init__(self, model, tokenizer, labels, device, max_tokens, head=None):
        self.model = model
        self.tokenizer = tokenizer
        self.labels = labels
        self.device = device
        self.max_tokens = max_tokens
        self.head = head

    def predict(self, text: str) -> tuple[str, float]:
        import torch

        encoded = self.tokenizer(
            text, return_tensors="pt", truncation=True, max_length=self.max_tokens
        )
        inputs = {
            k: v.to(self.device)
            for k, v in encoded.items()
            if k in ("input_ids", "attention_mask", "token_type_ids")
        }
        with torch.inference_mode():
            output = self.model(**inputs)
            logits = output[self.head] if self.head is not None else output.logits
            probabilities = torch.softmax(logits[0], dim=-1)
            confidence, index = probabilities.max(dim=-1)
        return self.labels[index.item()], confidence.item()
