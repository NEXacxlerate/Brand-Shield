from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.config.security import MAX_PASSWORD_BYTES


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)

    @field_validator("password")
    @classmethod
    def _bytes(cls, v: str) -> str:
        if len(v.encode()) > MAX_PASSWORD_BYTES:
            raise ValueError("Password is too long")
        return v


# The most common passwords that still pass a length check (>= 10 characters). Not a full breach list: it stops the obvious ones.
TRIVIAL_PASSWORDS = frozenset({
    "password12", "password123", "password1234", "password12345", "passw0rd123", "passw0rd1234", "password!23", "password@123",
    "qwerty12345", "qwerty123456", "qwertyuiop", "qwertyuiop1", "1234567890", "12345678910", "123456789012", "0123456789",
    "abcdefghij", "abcd123456", "abcd1234567", "iloveyou123", "iloveyou12", "letmein1234", "welcome1234", "welcome123", "admin12345",
    "admin123456", "administrator", "changeme123", "changeme1234", "trustno1234", "monkey12345", "dragon12345", "football123",
    "baseball123", "superman123", "sunshine123", "princess123", "00000000000", "1111111111", "aaaaaaaaaa", "brandshield", "brandshield1",
    "brandshield123", "scammind123", "scammind1234", "brandstudio", "brandstudio1", "brandstudio123",
})
PASSWORD_MIN = 10


def password_problem(password: str, *, name: str = "", email: str = "") -> str | None:
    """Plain-language reason a sign-up password is refused, or None when it is acceptable."""
    if len(password) < PASSWORD_MIN:
        return f"Password must be at least {PASSWORD_MIN} characters."
    if len(password.encode()) > MAX_PASSWORD_BYTES:
        return "Password is too long (72 bytes at most)."
    low = password.lower().strip()
    local = email.lower().split("@")[0]
    if low in TRIVIAL_PASSWORDS or password.isdigit() or len(set(password)) < 5:
        return "That password is too easy to guess. Choose a longer or less common one."
    if low in {email.lower(), name.lower().strip(), local} or (len(local) >= 6 and low == local * 2):
        return "Password must not be the same as your name or email."
    return None


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join("".join(ch for ch in v if ch.isprintable() or ch.isspace()).split())
        if not 1 <= len(v) <= 80:
            raise ValueError("Name must be 1 to 80 characters.")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if len(v) > 254:
            raise ValueError("Email is too long.")
        return v

    @model_validator(mode="after")
    def _password(self) -> "RegisterRequest":
        problem = password_problem(self.password, name=self.name, email=self.email)
        if problem:
            raise ValueError(problem)
        return self


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=10)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: str
    role: str
    active: bool
    default_brand_id: int | None = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class OkResponse(BaseModel):
    ok: bool = True
    detail: str = ""
