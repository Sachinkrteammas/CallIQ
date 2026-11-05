"""Normalization of dialer recording URLs.

The dialers store recordings under their own host, e.g.

    http://192.168.10.5/RECORDINGS/MP3/DIALDESK_20261019-092750_...mp3

Those hosts are no longer reachable. All recordings are mirrored on the
central recording server under

    http://192.168.10.3/<host_with_underscores>/<YYYYMMDD>/<filename>

This module rewrites any private-IP recording URL into that layout while
leaving already-correct URLs, local file paths and public hosting URLs
(e.g. ccs.smartping.io) untouched.
"""

import re
from datetime import datetime
from typing import Optional
from urllib.parse import urlsplit

from app.core.config import get_settings

_IPV4_RE = re.compile(r"^\d{1,3}(?:\.\d{1,3}){3}$")
_DATE_IN_NAME_RE = re.compile(r"(20\d{6})")
_DATE_SEGMENT_RE = re.compile(r"^(20\d{6})$")


def _with_scheme(url: str) -> str:
    url = (url or "").strip()
    if url.startswith("//"):
        return f"http:{url}"
    if not url.startswith(("http://", "https://")):
        first = url.split("/")[0]
        if "." in first:
            # Stored as "host/path" without a scheme
            return f"http://{url}"
    return url


def _date_from_url(parts, filename: str) -> Optional[str]:
    match = _DATE_IN_NAME_RE.search(filename)
    if match:
        return match.group(1)
    for segment in parts.path.split("/"):
        match = _DATE_SEGMENT_RE.match(segment.strip())
        if match:
            return match.group(1)
    return None


def normalize_recording_url(
    url: str,
    call_time: Optional[datetime] = None,
) -> str:
    """Return the central-server URL for a recording.

    Args:
        url: Raw recording location from the dialer / database.
        call_time: Call start time, used for the ``YYYYMMDD`` folder when the
            filename does not already contain the date.

    Non-private hosts, local file paths and empty values are returned as-is.
    """
    raw = (url or "").strip()
    if not raw:
        return ""

    candidate = _with_scheme(raw)
    if not candidate.startswith(("http://", "https://")):
        return raw

    parts = urlsplit(candidate)
    host = (parts.hostname or "").strip()
    if not _IPV4_RE.match(host):
        # Public host / CDN recordings are reachable directly.
        return raw

    filename = parts.path.rstrip("/").split("/")[-1]
    if not filename:
        return raw

    base_url = (getattr(get_settings(), "recording_base_url", None) or "").strip().rstrip("/")
    if not base_url:
        return raw

    base_host = (urlsplit(base_url).hostname or "").strip()
    if host == base_host:
        # Already pointing at the recording mirror.
        return candidate

    host_folder = host.replace(".", "_")

    # Already in the mirrored layout.
    if parts.path.lstrip("/").startswith(f"{host_folder}/"):
        return candidate

    if call_time is not None:
        date_folder = call_time.strftime("%Y%m%d")
    else:
        date_folder = _date_from_url(parts, filename)
    if not date_folder:
        return raw

    return f"{base_url}/{host_folder}/{date_folder}/{filename}"
