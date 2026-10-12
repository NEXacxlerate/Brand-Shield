"""Builds a tiny but structurally valid APK in memory: binary AndroidManifest.xml (AXML), a signed v1 signature block and an assets file with URLs."""
import datetime
import io
import struct
import zipfile

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs7
from cryptography.x509.oid import NameOID

ANDROID_NS = "http://schemas.android.com/apk/res/android"
MANIFEST_MF = b"Manifest-Version: 1.0\r\n\r\n"
CERT_SF = b"Signature-Version: 1.0\r\nCreated-By: scammind-tests\r\n\r\n"


class _Pool:
    def __init__(self):
        self.items: list[str] = []

    def idx(self, s: str) -> int:
        if s not in self.items:
            self.items.append(s)
        return self.items.index(s)

    def chunk(self) -> bytes:
        blobs = []
        for s in self.items:
            b = s.encode("utf-16-le")
            blobs.append(struct.pack("<H", len(s)) + b + b"\x00\x00")
        offsets, pos = [], 0
        for b in blobs:
            offsets.append(pos)
            pos += len(b)
        data = b"".join(blobs)
        data += b"\x00" * ((4 - len(data) % 4) % 4)
        header_size = 28
        strings_start = header_size + 4 * len(self.items)
        size = strings_start + len(data)
        out = struct.pack("<HHIIIIII", 0x0001, header_size, size, len(self.items), 0, 0, strings_start, 0)
        out += b"".join(struct.pack("<I", o) for o in offsets) + data
        return out


def build_manifest(package: str, version: str, label: str, permissions: list[str]) -> bytes:
    pool = _Pool()
    chunks = []
    ns_prefix, ns_uri = pool.idx("android"), pool.idx(ANDROID_NS)
    chunks.append(struct.pack("<HHIIIII", 0x0100, 16, 24, 1, 0xFFFFFFFF, ns_prefix, ns_uri))

    def start(name: str, attrs: list[tuple[str | None, str, str]]):
        n = pool.idx(name)
        body = struct.pack("<IIHHHHHH", 0xFFFFFFFF, n, 20, 20, len(attrs), 0, 0, 0)
        for ns, an, val in attrs:
            v = pool.idx(val)
            body += struct.pack("<IIIHBBI", ns_uri if ns else 0xFFFFFFFF, pool.idx(an), v, 8, 0, 0x03, v)
        chunks.append(struct.pack("<HHIII", 0x0102, 16, 16 + len(body), 1, 0xFFFFFFFF) + body)

    def end(name: str):
        chunks.append(struct.pack("<HHIIIII", 0x0103, 16, 24, 1, 0xFFFFFFFF, 0xFFFFFFFF, pool.idx(name)))

    start("manifest", [(None, "package", package), (ANDROID_NS, "versionName", version)])
    for p in permissions:
        start("uses-permission", [(ANDROID_NS, "name", p)])
        end("uses-permission")
    start("application", [(ANDROID_NS, "label", label)])
    end("application")
    end("manifest")
    chunks.append(struct.pack("<HHIIIII", 0x0101, 16, 24, 1, 0xFFFFFFFF, ns_prefix, ns_uri))
    pool_chunk = pool.chunk()
    body = pool_chunk + b"".join(chunks)
    return struct.pack("<HHI", 0x0003, 8, 8 + len(body)) + body


def build_cert(org: str):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.ORGANIZATION_NAME, org), x509.NameAttribute(NameOID.COMMON_NAME, org)])
    now = datetime.datetime(2025, 1, 1)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now).not_valid_after(now + datetime.timedelta(days=3650)).sign(key, hashes.SHA256()))
    return key, cert


def build_apk(package="com.acrnebank.refund", version="1.0.3", label="Acme Refund Assistant",
              permissions=("android.permission.INTERNET", "android.permission.READ_SMS", "android.permission.SYSTEM_ALERT_WINDOW"),
              urls=("https://acrnebank-refund.com/api/collect", "https://acmebank.com/help"), org="AcmeRefund Tech"):
    """Returns (apk bytes, certificate SHA-256 hex)."""
    key, cert = build_cert(org)
    sig = (pkcs7.PKCS7SignatureBuilder().set_data(CERT_SF).add_signer(cert, key, hashes.SHA256())
           .sign(serialization.Encoding.DER, [pkcs7.PKCS7Options.DetachedSignature]))
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("AndroidManifest.xml", build_manifest(package, version, label, list(permissions)))
        z.writestr("META-INF/MANIFEST.MF", MANIFEST_MF)
        z.writestr("META-INF/CERT.SF", CERT_SF)
        z.writestr("META-INF/CERT.RSA", sig)
        z.writestr("assets/config.json", '{"endpoints": [' + ", ".join(f'"{u}"' for u in urls) + "]}")
    cert_sha256 = cert.fingerprint(hashes.SHA256()).hex()
    return buf.getvalue(), cert_sha256
