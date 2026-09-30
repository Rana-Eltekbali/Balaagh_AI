from app.schemas.reports import ExtractedLocation


def reconstruct_bio(
    text: str, tokens: list[tuple[int, int, str, float]]
) -> list[ExtractedLocation]:
    """Offsets refer to the untouched (outer-whitespace-trimmed) input text.

    An orphan I-LOC begins a new entity. Special tokens must be removed by the caller.
    """
    entities = []
    active = []

    def flush():
        if active:
            start, end = active[0][0], active[-1][1]
            entities.append(
                ExtractedLocation(
                    name=text[start:end],
                    start=start,
                    end=end,
                    confidence=sum(t[3] for t in active) / len(active),
                )
            )
            active.clear()

    for token in tokens:
        start, end, label, _ = token
        if end <= start:
            continue
        if label == "O":
            flush()
        elif label == "B-LOC":
            flush()
            active.append(token)
        elif label == "I-LOC":
            active.append(token)
        else:
            raise ValueError("Unsupported BIO label")
    flush()
    return entities


def primary_location(entities: list[ExtractedLocation]) -> ExtractedLocation | None:
    return min(entities, key=lambda e: (-e.confidence, e.start)) if entities else None


class LocationNER:
    def __init__(self, model, tokenizer, device, max_tokens):
        self.model, self.tokenizer = model, tokenizer
        self.device, self.max_tokens = device, max_tokens
        self.labels = {int(k): v for k, v in model.config.id2label.items()}
        if set(self.labels.values()) != {"O", "B-LOC", "I-LOC"} or set(self.labels) != {0, 1, 2}:
            raise ValueError("LOCATION_MODEL_PATH must declare O, B-LOC, I-LOC in id2label")
        if not tokenizer.is_fast:
            raise ValueError("Location NER requires a fast tokenizer with original-text offsets")

    def predict(self, text: str) -> list[ExtractedLocation]:
        import torch

        # Overlapping windows avoid silently dropping locations near the end of long reports.
        encoded = self.tokenizer(
            text,
            return_tensors="pt",
            return_offsets_mapping=True,
            return_overflowing_tokens=True,
            truncation=True,
            max_length=self.max_tokens,
            stride=min(32, self.max_tokens // 4),
            padding="max_length",
        )
        offsets = encoded.pop("offset_mapping")
        encoded.pop("overflow_to_sample_mapping", None)
        best_tokens = {}
        with torch.inference_mode():
            for window in range(len(offsets)):
                inputs = {k: v[window : window + 1].to(self.device) for k, v in encoded.items()}
                probs = self.model(**inputs).logits[0].softmax(dim=-1)
                scores, ids = probs.max(dim=-1)
                for i, (start, end) in enumerate(offsets[window].tolist()):
                    if start == end:
                        continue
                    # Select the window where this token has the most surrounding context.
                    context = min(i, int(encoded["attention_mask"][window].sum()) - i - 1)
                    key = (start, end)
                    if key not in best_tokens or context > best_tokens[key][0]:
                        best_tokens[key] = (context, self.labels[ids[i].item()], scores[i].item())
        tokens = [
            (start, end, label, score)
            for (start, end), (_, label, score) in sorted(best_tokens.items())
        ]
        return reconstruct_bio(text, tokens)
