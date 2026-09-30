import ssl
from unittest.mock import Mock

import pytest

from app.config import Settings
from app.db import session


def tls_settings(ca_file=""):
    return Settings(
        _env_file=None,
        app_env="test",
        database_url="postgresql+asyncpg://test:test@localhost/test",
        database_ssl=True,
        database_ssl_ca_file=ca_file,
    )


@pytest.mark.parametrize("custom_ca", [False, True])
def test_database_tls_verifies_hostname_and_preserves_system_trust(
    custom_ca, tmp_path, monkeypatch
):
    trusted_certificates = ssl.create_default_context().get_ca_certs(binary_form=True)
    ca_file = ""
    if custom_ca:
        assert trusted_certificates, "The test runtime must have a system CA trust store"
        certificate = tmp_path / "project-ca.pem"
        certificate.write_text(ssl.DER_cert_to_PEM_cert(trusted_certificates[0]), encoding="ascii")
        ca_file = str(certificate)
    create_engine = Mock(return_value=object())
    monkeypatch.setattr(session, "create_async_engine", create_engine)

    session.create_database(tls_settings(ca_file))

    context = create_engine.call_args.kwargs["connect_args"]["ssl"]
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname is True
    assert set(trusted_certificates) <= set(context.get_ca_certs(binary_form=True))


@pytest.mark.parametrize("invalid_ca", [False, True])
def test_database_tls_rejects_missing_or_invalid_ca_before_creating_engine(
    invalid_ca, tmp_path, monkeypatch
):
    certificate = tmp_path / "project-ca.pem"
    if invalid_ca:
        certificate.write_text("not a PEM certificate", encoding="ascii")
    create_engine = Mock(return_value=object())
    monkeypatch.setattr(session, "create_async_engine", create_engine)

    with pytest.raises(ssl.SSLError if invalid_ca else FileNotFoundError):
        session.create_database(tls_settings(str(certificate)))

    create_engine.assert_not_called()
