import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.config import Settings
from app.ml.loader import load_models
from app.services.inference import InferenceService


def test_production_rejects_disabled_models_and_short_signing_key():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, app_env="production", inference_mode="disabled")
    with pytest.raises(ValidationError):
        Settings(_env_file=None, app_env="production", analysis_signing_key="short")


def test_missing_model_configuration_fails_before_importing_weights():
    with pytest.raises(ValueError, match="CATEGORY_MODEL_PATH"):
        load_models(Settings(_env_file=None, category_model_path=""))


def test_missing_repository_checkpoint_fails_clearly(tmp_path):
    (tmp_path / "label_mappings.json").write_text("{}")
    with pytest.raises(ValueError, match="multitask_model.pt"):
        load_models(Settings(_env_file=None, category_model_path=str(tmp_path)))


async def test_disabled_inference_is_unavailable_not_fake():
    service = InferenceService(None, None, None, Settings(_env_file=None))
    with pytest.raises(HTTPException) as error:
        await service.analyze("بلاغ تجريبي")
    assert error.value.status_code == 503


async def test_inference_queue_timeout():
    service = InferenceService(
        object(), None, None, Settings(_env_file=None, inference_queue_timeout_seconds=0.01)
    )
    await service.semaphore.acquire()
    try:
        with pytest.raises(HTTPException) as error:
            await service.analyze("بلاغ تجريبي")
        assert error.value.status_code == 503
    finally:
        service.semaphore.release()
