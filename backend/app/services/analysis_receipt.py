import base64
import hashlib
import hmac
import json
import time
import zlib

from app.schemas.reports import AnalysisMetadata


class AnalysisReceipt:
    """Stateless signed metadata handoff between analyze and save. Not authentication."""

    def __init__(self, key: str, ttl: int):
        self.key, self.ttl = key.encode(), ttl

    def issue(self, text: str, metadata: AnalysisMetadata) -> str:
        payload = {
            "textHash": hashlib.sha256(text.encode()).hexdigest(),
            "issued": int(time.time()),
            "metadata": metadata.model_dump(mode="json"),
        }
        encoded = base64.urlsafe_b64encode(
            zlib.compress(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode())
        ).decode()
        signature = hmac.new(self.key, encoded.encode(), hashlib.sha256).hexdigest()
        return encoded + "." + signature

    def verify(self, token: str | None, text: str) -> AnalysisMetadata:
        if not token:
            return AnalysisMetadata()
        try:
            encoded, signature = token.rsplit(".", 1)
            expected = hmac.new(self.key, encoded.encode(), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected, signature):
                raise ValueError()
            # Signature is checked before decompressing; clients cannot submit compression bombs.
            payload = json.loads(zlib.decompress(base64.urlsafe_b64decode(encoded)))
            age = time.time() - payload["issued"]
            if (
                age < -60
                or age > self.ttl
                or payload["textHash"] != hashlib.sha256(text.encode()).hexdigest()
            ):
                raise ValueError()
            return AnalysisMetadata.model_validate(payload["metadata"])
        except (ValueError, KeyError, TypeError, zlib.error):
            raise ValueError(
                "Analysis receipt invalid or expired; analyze this text again"
            ) from None
