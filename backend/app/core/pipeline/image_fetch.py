"""SSRF-safe download of a candidate's logo / icon from a URL found in a search result.

Same rules as `url_safety` (public hosts only, standard ports, no credentials, every redirect hop re-validated,
connection pinned to the validated IP) plus: a hard size cap while streaming, a content-type allow-list, a
magic-byte check, and a decompression-bomb guard. Never raises anything but `FetchError`; callers treat any
failure as "logo unavailable" and carry on (a failed logo fetch never fails a candidate or a scan).
"""

from __future__ import annotations

import io
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, urlunsplit

import httpx
from PIL import Image

from app.core.pipeline.logo import sniff_format
from app.core.pipeline.url_safety import ClientFactory, Resolver, UnsafeURLError, system_resolver, validate_public_url

ALLOWED_TYPES = ("image/png", "image/jpeg", "image/webp", "image/gif")
PAGE_TYPES = ("text/html", "application/xhtml+xml")
PAGE_MAX_BYTES = 512 * 1024  # a profile page is read only for its picture meta tag: enough for the <head>, no more
MAX_PIXELS = 25_000_000


class _PictureMeta(HTMLParser):
    """Collects the first og:image / twitter:image URL from a page's <meta> tags (the public picture of a profile)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.found: dict[str, str] = {}

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag != "meta":
            return
        a = {k.lower(): (v or "") for k, v in attrs}
        key = (a.get("property") or a.get("name") or "").lower()
        if key in ("og:image", "og:image:url", "twitter:image", "twitter:image:src") and a.get("content"):
            self.found.setdefault(key, a["content"].strip())


def picture_url_from_page(html: bytes, base_url: str) -> str | None:
    """The absolute URL of the page's public picture (og:image, else twitter:image), or None. Pure."""
    parser = _PictureMeta()
    try:
        parser.feed(html.decode("utf-8", "replace"))
    except Exception:  # noqa: BLE001 - malformed markup: treat as no picture
        return None
    for key in ("og:image", "og:image:url", "twitter:image", "twitter:image:src"):
        if key in parser.found:
            return urljoin(base_url, parser.found[key])[:500]
    return None


class FetchError(Exception):
    """The image could not be fetched or is not an acceptable image. The message is safe to show."""


def _default_client() -> httpx.Client:
    return httpx.Client(follow_redirects=False, trust_env=False)


class SafeFetcher:
    def __init__(
        self,
        *,
        resolver: Resolver = system_resolver,
        client_factory: ClientFactory = _default_client,
        timeout: float = 5.0,
        max_redirects: int = 3,
        max_bytes: int = 2 * 1024 * 1024,
    ) -> None:
        self.resolver = resolver
        self.client_factory = client_factory
        self.timeout = timeout
        self.max_redirects = max_redirects
        self.max_bytes = max_bytes

    def fetch_image(self, url: str) -> Image.Image:
        data = self.fetch_bytes(url)
        Image.MAX_IMAGE_PIXELS = MAX_PIXELS
        try:
            img = Image.open(io.BytesIO(data))
            img.load()
            return img
        except Exception as exc:  # noqa: BLE001 - corrupt image, bomb guard, truncated file ...
            raise FetchError("The file is not a valid image") from exc

    def fetch_page_image(self, page_url: str) -> str | None:
        """Read a public profile / app page (HTML only, size-capped) and return the URL of its picture. The picture itself is
        then downloaded with `fetch_image`, with the same checks. None when the page has no picture meta tag."""
        return picture_url_from_page(self.fetch_bytes(page_url, page=True), page_url)

    def fetch_bytes(self, url: str, *, page: bool = False) -> bytes:
        try:
            return self._fetch(url, page=page)
        except UnsafeURLError as exc:
            raise FetchError(f"Refused: {exc}") from exc
        except httpx.TimeoutException as exc:
            raise FetchError("Timed out") from exc
        except httpx.HTTPError as exc:
            raise FetchError("Could not be reached") from exc

    def _fetch(self, url: str, *, page: bool = False) -> bytes:
        with self.client_factory() as client:
            for _hop in range(self.max_redirects + 1):
                host, ip = validate_public_url(url, self.resolver)  # raises UnsafeURLError for private / bad hosts
                parts = urlsplit(url)
                netloc_ip = f"[{ip}]" if ":" in ip else ip
                if parts.port:
                    netloc_ip += f":{parts.port}"
                pinned = urlunsplit((parts.scheme, netloc_ip, parts.path or "/", parts.query, ""))
                with client.stream(
                    "GET",
                    pinned,
                    headers={"Host": parts.netloc.split("@")[-1], "User-Agent": "BrandShield-ImageFetch/1.0",
                             "Accept": "text/html" if page else "image/*"},
                    extensions={"sni_hostname": host},
                    timeout=self.timeout,
                ) as resp:
                    code = resp.status_code
                    location = resp.headers.get("location")
                    if 300 <= code < 400 and location:
                        url = urljoin(url, location)
                        continue
                    if code != 200:
                        raise FetchError(f"The server answered with HTTP {code}")
                    ctype = resp.headers.get("content-type", "").split(";")[0].strip().lower()
                    if ctype not in (PAGE_TYPES if page else ALLOWED_TYPES):
                        raise FetchError("Not a web page" if page else "Not an image (content type is not png, jpeg, webp or gif)")
                    limit = PAGE_MAX_BYTES if page else self.max_bytes
                    declared = resp.headers.get("content-length")
                    if declared and declared.isdigit() and int(declared) > limit:
                        raise FetchError("Page is too large" if page else "Image is too large")
                    buf = bytearray()
                    for chunk in resp.iter_bytes():
                        buf.extend(chunk)
                        if len(buf) > limit:
                            raise FetchError("Page is too large" if page else "Image is too large")
                    data = bytes(buf)
                if page:
                    if not data:
                        raise FetchError("The page is empty")
                    return data
                if not data or (sniff_format(data[:16]) is None and not data.startswith((b"GIF87a", b"GIF89a"))):
                    raise FetchError("The file content is not a supported image")
                return data
        raise FetchError("Too many redirects")
