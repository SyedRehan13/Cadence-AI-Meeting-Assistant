"""Private Supabase Storage helpers for meeting recordings."""

import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen


BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "meeting-audios")


def _config():
    base_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    # Accept the existing local .env name while preferring the documented name.
    service_key = (
        os.getenv("SUPABASE_SECRET_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("service_role", "")
    )
    if not base_url or not service_key:
        raise RuntimeError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for meeting recordings")
    return base_url, service_key


def _request(method, url, service_key, body=None, content_type=None):
    headers = {"Authorization": f"Bearer {service_key}", "apikey": service_key}
    if content_type:
        headers["Content-Type"] = content_type
    request = Request(url, data=body, headers=headers, method=method)
    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read() or b"{}")
    except (HTTPError, URLError) as error:
        detail = error.read().decode("utf-8", errors="ignore") if isinstance(error, HTTPError) else str(error)
        raise RuntimeError(f"Supabase Storage request failed: {detail}") from error


def upload_recording(path: str, file_bytes: bytes, mime_type: str):
    base_url, service_key = _config()
    url = f"{base_url}/storage/v1/object/{quote(BUCKET, safe='')}/{quote(path, safe='/')}"
    _request("POST", url, service_key, file_bytes, mime_type or "application/octet-stream")


def download_recording(path: str) -> bytes:
    """Fetch a private recording with service credentials for an authorized API download."""
    base_url, service_key = _config()
    url = f"{base_url}/storage/v1/object/{quote(BUCKET, safe='')}/{quote(path, safe='/')}"
    headers = {"Authorization": f"Bearer {service_key}", "apikey": service_key}
    try:
        with urlopen(Request(url, headers=headers), timeout=60) as response:
            return response.read()
    except (HTTPError, URLError) as error:
        detail = error.read().decode("utf-8", errors="ignore") if isinstance(error, HTTPError) else str(error)
        raise RuntimeError(f"Supabase Storage request failed: {detail}") from error


def delete_recording(path: str):
    base_url, service_key = _config()
    url = f"{base_url}/storage/v1/object/{quote(BUCKET, safe='')}"
    _request("DELETE", url, service_key, json.dumps({"prefixes": [path]}).encode(), "application/json")


def signed_recording_url(path: str, expires_in: int = 3600, download: bool = False) -> str:
    base_url, service_key = _config()
    url = f"{base_url}/storage/v1/object/sign/{quote(BUCKET, safe='')}/{quote(path, safe='/')}"
    payload = {"expiresIn": expires_in}
    if download:
        # Supabase responds with Content-Disposition: attachment, which makes
        # cross-origin browser links download instead of opening a new tab.
        payload["download"] = True
    result = _request("POST", url, service_key, json.dumps(payload).encode(), "application/json")
    signed_path = result.get("signedURL") or result.get("signedUrl")
    if not signed_path:
        raise RuntimeError("Supabase Storage did not return a signed URL")
    # Supabase may return an absolute URL or a path rooted at either the API
    # root or the Storage API root. Preserve its query string and token intact.
    if signed_path.startswith("http://") or signed_path.startswith("https://"):
        signed_url = signed_path
    elif signed_path.startswith("/storage/v1/"):
        signed_url = urljoin(f"{base_url}/", signed_path.lstrip("/"))
    elif signed_path.startswith("storage/v1/"):
        signed_url = urljoin(f"{base_url}/", signed_path)
    elif signed_path.startswith("/object/"):
        signed_url = urljoin(f"{base_url}/storage/v1/", signed_path.lstrip("/"))
    else:
        signed_url = urljoin(f"{base_url}/storage/v1/", signed_path.lstrip("/"))

    # Supabase can return the original object name unescaped in signedURL.
    # Media elements reject URLs containing spaces, so encode only the path;
    # the signed query token must remain byte-for-byte unchanged.
    parts = urlsplit(signed_url)
    return urlunsplit((parts.scheme, parts.netloc, quote(parts.path, safe="/%"), parts.query, parts.fragment))
