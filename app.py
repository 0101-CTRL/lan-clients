import os
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlencode, urlparse, urlunparse

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

APP_NAME = "APIv3 LAN Clients Console"
DEFAULT_BASE_URL = "https://api.cradlepointecm.com"
LAN_CLIENTS_PATH = "/api/v3/beta/lan_clients"

app = FastAPI(title=APP_NAME)


def _clean_base_url(raw: Optional[str]) -> str:
    """Accept either the NCM API host, an api/v3 URL, or the full lan_clients URL."""
    value = (raw or DEFAULT_BASE_URL).strip().rstrip("/")
    if not value.startswith(("http://", "https://")):
        value = "https://" + value

    parsed = urlparse(value)
    if not parsed.netloc:
        raise ValueError("Base URL must include a host.")

    # Keep only scheme + host. The endpoint path is enforced separately so the
    # local proxy cannot be redirected to arbitrary NCM API paths.
    return urlunparse((parsed.scheme, parsed.netloc, "", "", "", "")).rstrip("/")


def _endpoint_url(base_url: Optional[str]) -> str:
    return f"{_clean_base_url(base_url)}{LAN_CLIENTS_PATH}"


def _split_csv(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    parts = [p.strip() for p in str(value).split(",") if p.strip()]
    return ",".join(parts) if parts else None


def _build_params(payload: Dict[str, Any], *, for_check: bool = False) -> Dict[str, str]:
    params: Dict[str, str] = {}

    if for_check:
        params["page[limit]"] = "1"
        return params

    filters = payload.get("filters") or {}
    router = _split_csv(filters.get("router"))
    hostname = _split_csv(filters.get("hostname"))
    network_type = _split_csv(filters.get("network_type"))

    if router:
        params["filter[router]"] = router
    if hostname:
        params["filter[hostname]"] = hostname
    if network_type:
        params["filter[network_type]"] = network_type

    limit = payload.get("page_limit", 100)
    try:
        limit_int = max(1, min(int(limit), 500))
    except Exception:
        limit_int = 100
    params["page[limit]"] = str(limit_int)

    after = (payload.get("after") or "").strip()
    before = (payload.get("before") or "").strip()
    if after:
        params["page[after]"] = after
    if before:
        params["page[before]"] = before

    return params


def _auth_headers(token: str) -> Dict[str, str]:
    return {
        "Accept": "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "api-v3-lan-clients-console/0.1.0",
    }


def _safe_query(params: Dict[str, str]) -> str:
    return urlencode(params, doseq=False)


def _redacted_url(url: str, params: Dict[str, str]) -> str:
    query = _safe_query(params)
    return f"{url}?{query}" if query else url


async def _ecm_get(payload: Dict[str, Any], *, for_check: bool = False) -> Tuple[int, Dict[str, Any]]:
    token = (payload.get("token") or "").strip()
    if not token:
        return 400, {"ok": False, "error": "Bearer token is required."}

    try:
        url = _endpoint_url(payload.get("base_url"))
        params = _build_params(payload, for_check=for_check)
    except ValueError as exc:
        return 400, {"ok": False, "error": str(exc)}

    timeout = httpx.Timeout(connect=10.0, read=45.0, write=10.0, pool=10.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
        try:
            resp = await client.get(url, params=params, headers=_auth_headers(token))
        except httpx.TimeoutException:
            return 504, {"ok": False, "error": "Timed out calling NCM.", "requested_url": _redacted_url(url, params)}
        except httpx.RequestError as exc:
            return 502, {"ok": False, "error": f"Request failed: {exc}", "requested_url": _redacted_url(url, params)}

    content_type = resp.headers.get("content-type", "")
    parsed: Any
    try:
        parsed = resp.json()
    except Exception:
        parsed = {"raw_text": resp.text[:4000]}

    ok = resp.status_code in (200, 201)
    return resp.status_code, {
        "ok": ok,
        "status_code": resp.status_code,
        "content_type": content_type,
        "requested_url": _redacted_url(url, params),
        "data": parsed,
    }


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"ok": True, "app": APP_NAME, "endpoint": LAN_CLIENTS_PATH}


@app.post("/api/token/check")
async def token_check(req: Request) -> JSONResponse:
    payload = await req.json()
    status, body = await _ecm_get(payload, for_check=True)
    return JSONResponse(status_code=status if status >= 400 else 200, content=body)


@app.post("/api/lan-clients/list")
async def lan_clients_list(req: Request) -> JSONResponse:
    payload = await req.json()
    status, body = await _ecm_get(payload, for_check=False)
    return JSONResponse(status_code=status if status >= 400 else 200, content=body)


@app.get("/")
def index() -> FileResponse:
    return FileResponse(os.path.join(os.path.dirname(__file__), "static", "index.html"))


app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static")), name="static")
