"""Demo data for a fictional brand ("Acme Bank"). Ported unchanged from TrustMesh.

The sample accounts, websites and apps are SYNTHETIC. The logos are generated here, so the logo
hashing in the demo runs on real images. Nothing in this file refers to a real person or business.
"""
from PIL import Image, ImageDraw, ImageEnhance

from ..config import settings

OFFICIAL_TEXT = ("Acme Bank. Official account. We will never ask for your PIN, OTP or card details. "
                 "Beware of fake accounts. Acme Bank will never ask you to pay a fee to receive a refund. "
                 "Customer care 1800 123 4567. acmebank.com")

BRAND = {
    "name": "Acme Bank",
    "aliases": ["Acme", "AcmeBank"],
    "domains": ["acmebank.com"],
    "handles": {"instagram": "acmebank", "x": "acmebank", "facebook": "acmebank"},
    "app_ids": ["com.acmebank.mobile"],
    "developers": ["Acme Bank Ltd"],
    "cert_sha256": "9f3a1c7e5b2d4a8f6e0c1b3d5a7f9e2c4b6d8a0f1e3c5b7d9a2f4e6c8b0d1a3f",
    "permissions": ["INTERNET", "USE_BIOMETRIC", "CAMERA", "POST_NOTIFICATIONS"],
    "phones": ["18001234567"],
    "official_text": OFFICIAL_TEXT,
    "logo": "official.png",
    "demo": True,
}

KNOWLEDGE = [
    ("Refund scam", "DM us for your refund. Pay a small verification fee to claim your refund. Official refund desk. Send a screenshot of the payment within 24 hours."),
    ("KYC / account-update phishing", "Your KYC is expired. Update your KYC now or your account will be blocked. Click the link and enter OTP, card number and PIN."),
    ("Fake giveaway or reward", "Congratulations you won. Claim your reward. Pay a processing fee. Limited time offer. Follow and share to win."),
    ("Fake customer-care number", "Call our toll free customer care number. Contact support on WhatsApp. Our agent will help you resolve your issue. Share your OTP."),
]

# ----------------------------------------------------------------- logos ---


def _official(s=256):
    im = Image.new("RGB", (s, s), (255, 255, 255))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([s * .06, s * .06, s * .94, s * .94], radius=s * .18, fill=(18, 64, 140))
    d.polygon([(s * .26, s * .80), (s * .50, s * .18), (s * .74, s * .80), (s * .62, s * .80), (s * .50, s * .46), (s * .38, s * .80)], fill=(255, 255, 255))
    d.rectangle([s * .38, s * .62, s * .62, s * .69], fill=(255, 255, 255))
    d.ellipse([s * .66, s * .12, s * .84, s * .30], fill=(255, 140, 0))
    return im


def _variant_a(s=256):  # ring A's edited copy: red badge bottom-right
    im = _official(s)
    d = ImageDraw.Draw(im)
    d.ellipse([s * .58, s * .58, s * .96, s * .96], fill=(200, 30, 30))
    d.rectangle([s * .70, s * .70, s * .84, s * .84], fill=(255, 255, 255))
    return ImageEnhance.Brightness(im).enhance(1.05)


def _variant_b(s=256):  # ring B's edited copy: dark banner on top, channels swapped
    im = _official(s)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, s, s * .22], fill=(20, 20, 20))
    r, g, b = im.split()
    return Image.merge("RGB", (g, b, r))


def _fan(s=256):  # zoomed crop
    im = _official(s)
    c = int(s * .045)
    return im.crop((c, c, s - c, s - c)).resize((s, s))


def _bakery(s=256):
    im = Image.new("RGB", (s, s), (250, 240, 225))
    d = ImageDraw.Draw(im)
    d.ellipse([s * .15, s * .30, s * .85, s * .90], fill=(196, 130, 60))
    d.arc([s * .25, s * .20, s * .75, s * .70], 200, 340, fill=(120, 70, 30), width=int(s * .05))
    d.rectangle([s * .10, s * .08, s * .90, s * .16], fill=(120, 70, 30))
    return im


def _rewards(s=256):  # near-copy with a thin gold border, slightly cropped
    im = _official(s)
    c = int(s * .03)
    return im.crop((c, c, s - c, s - c)).resize((s, s))


def make_logos():
    settings.logo_dir.mkdir(parents=True, exist_ok=True)
    out = settings.logo_dir
    _official().save(out / "official.png")
    _official(160).save(out / "copy_exact.jpg", quality=70)
    for i, (size, q) in enumerate([(256, 90), (180, 80), (140, 70), (96, 65)]):
        _variant_a(size).save(out / f"va_{i}.jpg", quality=q)
    for i, (size, q) in enumerate([(256, 90), (180, 75)]):
        _variant_b(size).save(out / f"vb_{i}.jpg", quality=q)
    _fan().save(out / "fan.jpg", quality=80)
    _bakery().save(out / "bakery.png")
    _rewards(200).save(out / "rewards.jpg", quality=75)


# --------------------------------------------------------------- dataset ---

UPI = "acmerefund@okaxis"
SOCIAL = [
    # ---- Ring A: refund scam
    dict(platform="instagram", handle="acme_refund_help", display_name="Acme Bank Refund Help", created_days_ago=3, followers=1240, following=82, posts_last_7d=14,
         bio="Official Acme Bank refund desk. DM us for your refund. Pay ₹10 verification fee to acmerefund@okaxis to release it within 24 hours. We will never ask for your PIN or OTP.",
         links=["https://acrnebank-refund.com"], logo="va_0.jpg"),
    dict(platform="instagram", handle="acmebank.support.official", display_name="Acme Bank Support", created_days_ago=5, followers=860, following=640, posts_last_7d=9,
         bio="Acme Bank official support. Failed transaction? DM now to claim your refund. Verification fee ₹10 to acmerefund@okaxis. Telegram: t.me/acme_refund_desk",
         logo="va_1.jpg"),
    dict(platform="instagram", handle="acme_bank_care", display_name="Acme Bank Care", created_days_ago=9, followers=410, following=980, posts_last_7d=31,
         bio="Acme Bank customer care | refunds and disputes. Send ₹10 to acmerefund@okaxis then DM the screenshot. Limited time, refund window closes in 24 hours.",
         logo="va_2.jpg"),
    dict(platform="x", handle="AcmeBankHelp24", display_name="Acme Bank Help 24x7", created_days_ago=6, followers=330, following=1500, posts_last_7d=44,
         bio="Help for Acme Bank customers. Refund pending? Pay ₹10 verification fee to acmerefund@okaxis and DM your payment screenshot.",
         logo="copy_exact.jpg"),
    dict(platform="facebook", handle="acmebankrefundcenter", display_name="Acme Bank Refund Center", created_days_ago=11, followers=2100, following=40, posts_last_7d=6,
         bio="Claim your refund today at acrnebank-refund.com. Enter your card number and OTP on our secure portal.",
         links=["https://acrnebank-refund.com"], logo="va_3.jpg"),
    dict(platform="instagram", handle="acrnebank_care", display_name="Acme Bank Care Team", created_days_ago=2, followers=95, following=410, posts_last_7d=12,
         bio="Visit acrnebank-refund.com to receive your refund within 24 hours.", links=["https://acrnebank-refund.com"], logo="va_0.jpg"),
    dict(platform="telegram", handle="acme_refund_desk", display_name="Acme Refund Desk", created_days_ago=2, followers=1800, following=0, posts_last_7d=22,
         bio="Refund desk for Acme Bank customers. Send ₹10 to acmerefund@okaxis and message our agent. Visit acrnebank-refund.com.", links=["https://acrnebank-refund.com"], logo="va_1.jpg"),
    dict(platform="instagram", handle="acme.refunds.now", display_name="Acme Refunds", created_days_ago=1, followers=40, following=700, posts_last_7d=18,
         bio="Instant refunds. Official partner of Acme Bank. DM now. t.me/acme_refund_desk", logo="va_2.jpg"),
    # ---- Ring B: KYC phishing
    dict(platform="instagram", handle="acmebank_kyc_update", display_name="Acme Bank KYC", created_days_ago=7, followers=520, following=300, posts_last_7d=8,
         bio="Acme Bank KYC update. Your KYC is expired, update now or your account will be blocked. Call +91 90000 12345 or visit acme-bank-kyc.in",
         phones=["+91 90000 12345"], links=["https://acme-bank-kyc.in"], logo="vb_0.jpg"),
    dict(platform="x", handle="AcmeKYCDesk", display_name="Acme KYC Desk", created_days_ago=8, followers=210, following=900, posts_last_7d=26,
         bio="KYC verification desk for Acme Bank customers. Account will be suspended within 24 hours if KYC is not updated. WhatsApp +91 90000 12345", logo="vb_1.jpg"),
    dict(platform="facebook", handle="acme.bank.verify", display_name="Verify Acme Bank", created_days_ago=14, followers=700, following=55, posts_last_7d=4,
         bio="Verify your Acme Bank account. Enter OTP and card number at acme-bank-kyc.in to avoid suspension.", links=["https://acme-bank-kyc.in"], logo="vb_0.jpg"),
    dict(platform="instagram", handle="acmebank_customer_care_", display_name="Acme Bank Customer Care", created_days_ago=12, followers=150, following=620, posts_last_7d=15,
         bio="Customer care. Share your OTP with our agent to complete KYC. Call +91 90000 12345", logo="vb_1.jpg"),
    # ---- Lone fake
    dict(platform="instagram", handle="acmebank_giveaway_2026", display_name="Acme Bank Giveaway", created_days_ago=4, followers=900, following=1200, posts_last_7d=36,
         bio="Acme Bank anniversary giveaway! Win ₹50,000. Follow, share and pay ₹99 processing fee to acmegift99@ybl to claim your reward. Limited time offer.",
         logo="copy_exact.jpg"),
    # ---- Should NOT be flagged
    dict(platform="instagram", handle="acmebank_fans", display_name="Acme Bank Fans", created_days_ago=900, followers=12400, following=120, posts_last_7d=3,
         bio="Fan page. Unofficial. Not affiliated with Acme Bank. We share banking tips and news.", logo="fan.jpg"),
    dict(platform="instagram", handle="acme_bakery", display_name="Acme Bakery Pune", created_days_ago=600, followers=3100, following=410, posts_last_7d=5,
         bio="Fresh sourdough every morning in Pune. Order via DM.", logo="bakery.png"),
    # ---- The brand's own account: the connector returns it, the allowlist drops it
    dict(platform="instagram", handle="acmebank", display_name="Acme Bank", created_days_ago=2500, followers=480000, following=12, posts_last_7d=4,
         bio="Acme Bank. Official account. We will never ask for your PIN, OTP or card details.", logo="official.png"),
]

WEBSITES = [
    dict(domain="acrnebank-refund.com", registered_days_ago=4, has_mx=True, cert_issued_days_ago=4, ip="185.220.101.14", nameserver="ns1.cheapdns.example",
         title="Acme Bank Refund Portal", logo="va_0.jpg",
         text="Acme Bank refund portal. Enter your card number, CVV and OTP to receive your refund. Download the Acme Refund Assistant app. Pay verification fee to acmerefund@okaxis.",
         links=["https://acrnebank-refund.com/acme-refund.apk"]),
    dict(domain="acme-bank-kyc.in", registered_days_ago=10, has_mx=True, cert_issued_days_ago=10, ip="45.9.148.77", nameserver="ns2.cheapdns.example",
         title="Acme Bank - Update KYC", logo="vb_0.jpg",
         text="Acme Bank KYC update. Enter customer ID, card number, CVV and OTP to continue. Your account will be blocked if KYC is not completed. Call +91 90000 12345."),
    dict(domain="acmebank-offers.shop", registered_days_ago=21, has_mx=False, cert_issued_days_ago=21,
         title="Acme Bank Offers and Cashback",
         text="Exclusive cashback offers for customers. Login with your net banking password to claim your reward."),
]

APPS = [
    dict(package="com.acrnebank.refund", title="Acme Refund Assistant", developer="AcmeRefund Tech", developer_email="dev@acrnebank-refund.com", store="sideload",
         hosted_on="acrnebank-refund.com", installs=420, released_days_ago=3, cert_sha256="c0ffee11aa22bb33cc44dd55ee66ff7788990011223344556677889900aabbcc",
         permissions=["INTERNET", "READ_SMS", "RECEIVE_SMS", "SYSTEM_ALERT_WINDOW", "BIND_ACCESSIBILITY_SERVICE"],
         urls=["https://acrnebank-refund.com/api/collect"], logo="va_1.jpg"),
    dict(package="com.acmebank.kyc.update", title="Acme KYC Update", developer="KYC Services", store="sideload", hosted_on="acme-bank-kyc.in", installs=800,
         released_days_ago=9, cert_sha256="deadbeef00112233445566778899aabbccddeeff00112233445566778899aabb",
         permissions=["INTERNET", "READ_SMS", "RECEIVE_SMS", "READ_CONTACTS", "BIND_ACCESSIBILITY_SERVICE"],
         urls=["https://acme-bank-kyc.in/api/submit"], logo="vb_0.jpg"),
    dict(package="com.acmerewards.wallet", title="Acme Rewards Wallet", developer="Rewards Hub Pvt", store="play", installs=5000, released_days_ago=40,
         cert_sha256="1111aaaa2222bbbb3333cccc4444dddd5555eeee6666ffff7777000088881111", permissions=["INTERNET", "READ_CONTACTS"],
         urls=["https://rewardshub.example/api"], logo="rewards.jpg"),
    dict(package="com.acmebank.mobile", title="Acme Bank", developer="Acme Bank Ltd", store="play", installs=3000000, released_days_ago=1200,
         cert_sha256=BRAND["cert_sha256"], permissions=BRAND["permissions"], urls=["https://acmebank.com/api"], logo="official.png"),
]


# Where each demo entity was reported from. Taken from analyst notes in the demo data; never derived from a phone number or IP.
STATE_NOTES = {
    "acme_refund_help": "MH", "acmebank.support.official": "MH", "acme_bank_care": "UP", "AcmeBankHelp24": "DL",
    "acmebankrefundcenter": "KA", "acrnebank_care": "MH", "acme_refund_desk": "TN", "acme.refunds.now": "UP",
    "acmebank_kyc_update": "DL", "AcmeKYCDesk": "KA", "acme.bank.verify": "DL", "acmebank_customer_care_": "MH",
    "acmebank_giveaway_2026": "UP",
    "acrnebank-refund.com": "MH", "acme-bank-kyc.in": "DL", "acmebank-offers.shop": "KA",
    "com.acrnebank.refund": "MH", "com.acmebank.kyc.update": "DL", "com.acmerewards.wallet": "TN",
}
