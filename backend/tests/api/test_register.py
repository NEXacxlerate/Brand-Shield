from sqlalchemy import select

from app.config.config import Settings
from app.models import AuditLog, User
from tests.conftest import login
from app.config.ratelimit import RequestLimiter

GOOD = {"name": "  Rita   Shah ", "email": "Rita.Shah@Example.com", "password": "Correct-Horse-9"}



def register(client, **over):
    return client.post("/api/auth/register", json={**GOOD, **over})


def test_register_returns_login_shaped_response_and_works(client, db):
    r = register(client)
    assert r.status_code == 201, r.text
    body = r.json()
    assert set(body) == {"access_token", "refresh_token", "token_type", "expires_in", "user"}
    assert body["user"]["email"] == "rita.shah@example.com"
    assert body["user"]["name"] == "Rita Shah"
    assert body["user"]["role"] == "analyst" and body["user"]["active"] is True
    assert body["user"]["default_brand_id"] is None
    assert "password" not in str(body)
    # the token works at once, and a normal login works too
    me = client.get("/api/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200 and me.json()["email"] == "rita.shah@example.com"
    assert login(client, "RITA.SHAH@example.com", GOOD["password"]).status_code == 200
    u = db.scalar(select(User).where(User.email == "rita.shah@example.com"))
    assert u.password_hash.startswith("$2") and u.role == "analyst"
    assert db.scalar(select(AuditLog).where(AuditLog.action == "auth.registered", AuditLog.actor_id == u.id)) is not None


def test_duplicate_email_is_409_case_insensitive(client):
    assert register(client).status_code == 201
    r = register(client, email="RITA.SHAH@EXAMPLE.COM", name="Other")
    assert r.status_code == 409
    assert r.json() == {"detail": "An account with this email already exists."}
    assert register(client, email="admin@example.com").status_code == 409  # the seeded admin too


def test_name_rules(client):
    assert register(client, name="   ").status_code == 422
    assert register(client, name="x" * 81).status_code == 422
    assert register(client, name="x" * 80, email="long@example.com").status_code == 201


def test_bad_email_rejected(client):
    assert register(client, email="not-an-email").status_code == 422


def test_password_policy(client):
    for bad in ("short1!", "password1234", "Password1234", "1234567890123", "aaaaaaaaaaaa", "Rita Shah", "rita.shah@example.com"):
        r = register(client, password=bad)
        assert r.status_code == 422, bad
        assert bad not in r.text
    assert register(client, name="Sam Lee", email="sam@example.com", password="sam@example.com").status_code == 422
    assert register(client, password="x" * 73).status_code == 422  # beyond bcrypt's 72 bytes
    assert register(client, password="a good long passphrase").status_code == 201


def test_signup_can_be_disabled(settings, checker):
    from fastapi.testclient import TestClient

    from app.db.base import Base
    from app.db.session import make_engine
    from app.main import create_app

    s = Settings(_env_file=None, data_dir=settings.data_dir, database_url="sqlite://", response_cache_seconds=0, signup_enabled=False)  # type: ignore[call-arg]
    engine = make_engine("sqlite://")
    Base.metadata.create_all(engine)
    with TestClient(create_app(s, engine=engine, url_checker=checker)) as c:  # type: ignore[arg-type]
        r = register(c)
        assert r.status_code == 403 and r.json() == {"detail": "Sign-up is disabled"}


def test_signup_rate_limited_per_ip(client):
    client.app.state.signup_ip_limiter = RequestLimiter(5, 3600)
    codes = [register(client, email=f"user{i}@example.com", name=f"User {i}").status_code for i in range(7)]
    assert codes[:5] == [201] * 5
    assert codes[5:] == [429, 429]


def test_signup_rate_limited_per_email(client):
    client.app.state.signup_email_limiter = RequestLimiter(3, 3600)
    codes = [register(client, email="same@example.com", password=f"Another-Pass-{i}").status_code for i in range(4)]
    assert codes == [201, 409, 409, 429]


def test_new_account_cannot_use_admin_features(client):
    tok = register(client).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    assert client.put("/api/settings/data-mode", json={"data_mode": "sample"}, headers=h).status_code == 403
