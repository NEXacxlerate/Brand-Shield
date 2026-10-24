"""
Email OTP for registration: in-memory store, free-email domain block, SMTP sender.
Thread-safe; no external dependencies beyond the stdlib.
"""
import hashlib
import random
import smtplib
import ssl
import threading
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config.config import Settings

OTP_DIGITS = 6
OTP_TTL_SECONDS = 600      # 10 minutes
OTP_MAX_ATTEMPTS = 3

_lock = threading.Lock()
# email (lower) -> (sha256(email:otp), expires_monotonic, attempts)
_store: dict[str, tuple[str, float, int]] = {}


FREE_EMAIL_DOMAINS: frozenset[str] = frozenset({
    # Google
    "gmail.com", "googlemail.com",
    # Microsoft
    "hotmail.com", "hotmail.co.uk", "hotmail.fr", "hotmail.de", "hotmail.it",
    "hotmail.ca", "hotmail.com.br", "hotmail.com.ar", "hotmail.es",
    "outlook.com", "outlook.fr", "outlook.co.uk", "outlook.de", "outlook.it",
    "outlook.es", "outlook.com.br", "live.com", "live.co.uk", "live.fr",
    "live.de", "live.it", "live.com.au", "live.ca", "live.in", "live.nl",
    "msn.com", "windowslive.com",
    # Apple
    "icloud.com", "me.com", "mac.com",
    # Yahoo
    "yahoo.com", "yahoo.co.uk", "yahoo.co.in", "yahoo.co.jp", "yahoo.fr",
    "yahoo.de", "yahoo.es", "yahoo.it", "yahoo.com.br", "yahoo.com.ar",
    "yahoo.com.au", "yahoo.ca", "ymail.com", "rocketmail.com",
    # AOL
    "aol.com", "aim.com",
    # ProtonMail
    "protonmail.com", "protonmail.ch", "proton.me", "pm.me",
    # Yandex
    "yandex.com", "yandex.ru", "yandex.co.uk", "yandex.fr", "yandex.kz",
    # GMX / Mail.com
    "gmx.com", "gmx.net", "gmx.de", "gmx.at", "gmx.ch", "mail.com",
    # Zoho (free tier)
    "zohomail.com",
    # Tutanota
    "tutanota.com", "tutanota.de", "tutamail.com", "tuta.io", "keemail.me",
    # Fastmail
    "fastmail.com", "fastmail.fm", "fastmail.org",
    # Russian services
    "mail.ru", "bk.ru", "internet.ru", "list.ru",
    # Indian consumer
    "rediffmail.com", "sify.com", "in.com",
    # Others
    "inbox.com",
    # Disposable / temporary
    "mailinator.com", "guerrillamail.com", "trashmail.com", "sharklasers.com",
    "guerrillamail.info", "spam4.me", "maildrop.cc", "getairmail.com",
    "fakeinbox.com", "mailnesia.com", "yopmail.com", "yopmail.fr",
    "spamgourmet.com", "tempinbox.com", "emailondeck.com", "tempemail.co",
    "mailtemp.info", "tempmail.org", "10minutemail.com", "10minutemail.net",
    "10minutemail.org", "dispostable.com", "mailnull.com", "tempr.email",
})


def is_free_email(email: str) -> bool:
    """Return True when the email's domain belongs to a known free / consumer provider."""
    domain = email.lower().split("@")[-1] if "@" in email else ""
    return domain in FREE_EMAIL_DOMAINS


def _hash(email: str, otp: str) -> str:
    return hashlib.sha256(f"{email.lower()}:{otp}".encode()).hexdigest()


def generate_and_store(email: str) -> str:
    """Generate a fresh 6-digit OTP, store it (replacing any previous one), return the plain code."""
    otp = f"{random.SystemRandom().randint(0, 10 ** OTP_DIGITS - 1):0{OTP_DIGITS}d}"
    key = email.lower()
    with _lock:
        _store[key] = (_hash(email, otp), time.monotonic() + OTP_TTL_SECONDS, 0)
    return otp


def verify(email: str, otp: str) -> tuple[bool, str]:
    """
    Verify the OTP.  Returns (True, "") on success; (False, reason) on failure.
    On success the entry is removed.  On failure the attempt counter is incremented.
    """
    key = email.lower()
    with _lock:
        entry = _store.get(key)
        if not entry:
            return False, "No verification code was sent to this email, or it has expired. Request a new one."
        stored_hash, expires, attempts = entry
        if time.monotonic() > expires:
            del _store[key]
            return False, "Verification code has expired. Request a new one."
        if attempts >= OTP_MAX_ATTEMPTS:
            del _store[key]
            return False, "Too many incorrect attempts. Request a new verification code."
        if _hash(email, otp.strip()) != stored_hash:
            _store[key] = (stored_hash, expires, attempts + 1)
            left = OTP_MAX_ATTEMPTS - attempts - 1
            return False, f"Incorrect code — {left} attempt{'s' if left != 1 else ''} left."
        del _store[key]
        return True, ""


def send_otp_email(settings: "Settings", to_email: str, otp: str) -> None:
    """Send the OTP via SMTP.  Raises smtplib.SMTPException (or OSError) on failure."""
    host = settings.smtp_host or ""
    port = settings.smtp_port
    username = settings.smtp_username or ""
    password = settings.smtp_password.get_secret_value() if settings.smtp_password else ""
    from_addr = settings.smtp_from or username or "noreply@brandshield.ai"

    subject = "Your BrandShield verification code"
    plain = (
        f"Your BrandShield registration verification code is:\n\n"
        f"    {otp}\n\n"
        f"This code expires in 10 minutes.\n"
        f"If you did not request this, you can safely ignore this email."
    )
    html = f"""\
<html><body style="font-family:sans-serif;color:#1a1a2e;max-width:480px;margin:auto;padding:0 16px">
  <div style="padding:32px 24px;background:#f8f9fb;border-radius:12px;border:1px solid #e2e8f0;margin:32px 0">
    <p style="font-size:13px;color:#64748b;margin:0 0 4px;letter-spacing:.04em;text-transform:uppercase">BrandShield</p>
    <h2 style="margin:0 0 20px;font-size:22px;color:#1e293b">Email verification</h2>
    <p style="margin:0 0 4px;color:#334155;font-size:15px">Your verification code:</p>
    <div style="text-align:center;margin:24px 0">
      <span style="font-size:38px;font-weight:700;letter-spacing:.18em;color:#1e40af;font-family:monospace">{otp}</span>
    </div>
    <p style="margin:0 0 4px;font-size:13px;color:#64748b">
      This code expires in <strong>10&nbsp;minutes</strong>.
    </p>
    <p style="margin:0;font-size:13px;color:#94a3b8">
      If you did not request this, you can safely ignore this email.
    </p>
  </div>
</body></html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))
    raw = msg.as_string()

    ctx = ssl.create_default_context()
    if settings.smtp_use_ssl:
        with smtplib.SMTP_SSL(host, port, context=ctx, timeout=8) as s:
            if username and password:
                s.login(username, password)
            s.sendmail(from_addr, to_email, raw)
    else:
        with smtplib.SMTP(host, port, timeout=8) as s:
            s.ehlo()
            if settings.smtp_use_tls:
                s.starttls(context=ctx)
                s.ehlo()
            if username and password:
                s.login(username, password)
            s.sendmail(from_addr, to_email, raw)
