"""The public picture of a social profile: read from og:image / twitter:image of its page (pure parsing, no network)."""

from app.core.pipeline.image_fetch import PAGE_MAX_BYTES, picture_url_from_page


def test_og_image_is_taken_and_made_absolute():
    html = b'<html><head><meta property="og:image" content="/pics/logo.jpg"></head></html>'
    assert picture_url_from_page(html, "https://www.instagram.com/brand_support/") == "https://www.instagram.com/pics/logo.jpg"


def test_twitter_image_is_the_fallback_and_og_wins_when_both_exist():
    only_twitter = b'<meta name="twitter:image" content="https://cdn.example.com/a.png">'
    assert picture_url_from_page(only_twitter, "https://x.com/acme") == "https://cdn.example.com/a.png"
    both = b'<meta name="twitter:image" content="https://t.example/x.png"><meta property="og:image" content="https://o.example/y.png">'
    assert picture_url_from_page(both, "https://x.com/acme") == "https://o.example/y.png"


def test_no_picture_tag_means_no_picture():
    assert picture_url_from_page(b"<html><head><title>Profile</title></head></html>", "https://x.com/acme") is None
    assert picture_url_from_page(b"", "https://x.com/acme") is None


def test_attribute_names_are_case_insensitive_and_empty_content_is_ignored():
    html = b'<META PROPERTY="OG:IMAGE" CONTENT="https://a.example/p.webp"><meta property="og:image" content="">'
    assert picture_url_from_page(html, "https://x.com/acme") == "https://a.example/p.webp"


def test_page_reads_are_small():
    assert PAGE_MAX_BYTES <= 512 * 1024
