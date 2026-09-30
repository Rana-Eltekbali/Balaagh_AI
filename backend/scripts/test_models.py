"""Run from backend/ as a module or script. Never writes to the database."""

import argparse
import json
import sys
from pathlib import Path

# Direct script execution puts scripts/, rather than backend/, on sys.path.
# Resolve from this file so the import does not depend on OS-specific paths.
if not __package__:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings  # noqa: E402
from app.ml.loader import load_location_model, load_models  # noqa: E402
from app.ml.location import primary_location  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--text", default="اندلع حريق في منزل بمنطقة سوق الجمعة")
    parser.add_argument(
        "--location-only",
        action="store_true",
        help="Verify MARBERT independently of classifier checkpoints",
    )
    args = parser.parse_args()
    try:
        if args.location_only:
            entities = load_location_model(Settings()).predict(args.text)
            print(json.dumps([e.model_dump() for e in entities], ensure_ascii=False, indent=2))
            return
        models = load_models(Settings())
        incident, incident_confidence = models.category.predict(args.text)
        priority, priority_confidence = models.priority.predict(args.text)
        locations = models.location.predict(args.text)
        primary = primary_location(locations)
        print(
            json.dumps(
                {
                    "incidentClass": incident,
                    "incidentClassConfidence": incident_confidence,
                    "priority": priority,
                    "priorityConfidence": priority_confidence,
                    "extractedLocations": [e.model_dump() for e in locations],
                    "location": primary.name if primary else "",
                    "locationConfidence": primary.confidence if primary else None,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    except (OSError, ValueError, RuntimeError) as error:
        print(f"Model sanity check failed: {error}", file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
