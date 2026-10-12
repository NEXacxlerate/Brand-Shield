"""SSRF guard shared by every outbound fetch.

A host is allowed only if it resolves and EVERY resolved address is globally routable. Loopback, private
(10/8, 172.16/12, 192.168/16), link-local (169.254/16, includes cloud metadata 169.254.169.254), CGNAT,
multicast and reserved ranges are blocked. Unresolvable hosts are blocked too (fail closed).
"""
import ipaddress
import socket
from urllib.parse import urlparse


def is_public_ip(ip: str) -> bool:
    try:
        return ipaddress.ip_address(ip.split("%")[0]).is_global
    except ValueError:
        return False


def is_public_host(host: str) -> bool:
    if not host:
        return False
    host = host.strip("[]")
    try:
        ipaddress.ip_address(host)
        return is_public_ip(host)
    except ValueError:
        pass
    try:
        infos = socket.getaddrinfo(host, None)
    except Exception:
        return False
    return bool(infos) and all(is_public_ip(i[4][0]) for i in infos)


def is_safe_url(url: str) -> bool:
    p = urlparse(url)
    return p.scheme in ("http", "https") and is_public_host(p.hostname or "")
