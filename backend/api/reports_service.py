from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone

from postgrest.exceptions import APIError

from api.supabase_client import get_supabase

logger = logging.getLogger(__name__)

# CDMX no tiene horario de verano desde 2022: UTC−6 fijo, sin depender de tzdata en Windows.
BUSINESS_TZ = timezone(timedelta(hours=-6))
MAX_RANGE_DAYS = 366
PAYMENT_METHODS = ("tarjeta", "efectivo", "transferencia", "pendiente")
BRANCHES = ("Nereo Rdz.", "Sucursal móvil", "Centro")
AGING_BUCKETS = ((0, 7, "0–7 días"), (8, 15, "8–15 días"), (16, 30, "16–30 días"), (31, None, "Más de 30 días"))
_PAGE = 1000
_IN_CHUNK = 200

# ponytail: agregación en Python sobre filas crudas; si el volumen crece (decenas de miles
# de órdenes por periodo) mover a vistas/RPC SQL con GROUP BY.


def _fetch_all(build) -> list[dict]:
    rows: list[dict] = []
    start = 0
    while True:
        chunk = build().range(start, start + _PAGE - 1).execute().data or []
        rows.extend(chunk)
        if len(chunk) < _PAGE:
            return rows
        start += _PAGE


def _fetch_in(table: str, select: str, column: str, values: list) -> list[dict]:
    rows: list[dict] = []
    for i in range(0, len(values), _IN_CHUNK):
        part = values[i : i + _IN_CHUNK]
        rows.extend(_fetch_all(lambda part=part: get_supabase().table(table).select(select).in_(column, part)))
    return rows


def _ts(value: str) -> datetime:
    return datetime.fromisoformat(value).astimezone(BUSINESS_TZ)


def _day_start(d: date) -> datetime:
    return datetime.combine(d, time(), BUSINESS_TZ)


def _pieces(order: dict) -> int:
    return sum(int(l["qty"]) for l in order.get("order_lines") or [])


def _summary(orders: list[dict]) -> dict:
    n = len(orders)
    sales = sum(int(o["total_cents"]) for o in orders)
    express = sum(1 for o in orders if o["express"])
    return {
        "salesCents": sales,
        "orders": n,
        "avgTicketCents": round(sales / n) if n else 0,
        "pieces": sum(_pieces(o) for o in orders),
        "expressPct": round(100 * express / n, 1) if n else 0.0,
    }


def _daily(orders: list[dict], start: date, end: date) -> list[dict]:
    by_day: dict[date, list[int]] = defaultdict(lambda: [0, 0])
    for o in orders:
        bucket = by_day[_ts(o["created_at"]).date()]
        bucket[0] += int(o["total_cents"])
        bucket[1] += 1
    days = (end - start).days + 1
    out = []
    for i in range(days):
        d = start + timedelta(days=i)
        sales, count = by_day.get(d, (0, 0))
        out.append({"date": d.isoformat(), "salesCents": sales, "orders": count})
    return out


def _pending(open_orders: list[dict], names: dict[str, str], now: datetime) -> dict:
    receivable = [o for o in open_orders if o["payment_method"] == "pendiente"]
    ready = [o for o in open_orders if o["status"] == "listo"]

    def age_days(o: dict) -> int:
        return (now - _ts(o["status_updated_at"])).days

    aging = []
    for lo, hi, label in AGING_BUCKETS:
        bucket = [o for o in ready if age_days(o) >= lo and (hi is None or age_days(o) <= hi)]
        aging.append({"label": label, "orders": len(bucket), "pieces": sum(_pieces(o) for o in bucket)})

    oldest = sorted(ready, key=lambda o: o["status_updated_at"])[:10]
    return {
        "receivableCents": sum(int(o["total_cents"]) for o in receivable),
        "receivableOrders": len(receivable),
        "readyOrders": len(ready),
        "readyPieces": sum(_pieces(o) for o in ready),
        "aging": aging,
        "oldestReady": [
            {
                "folio": int(o["folio"]),
                "customerName": names.get(str(o["customer_id"]), "—"),
                "days": age_days(o),
                "totalCents": int(o["total_cents"]),
                "payment": o["payment_method"],
            }
            for o in oldest
        ],
    }


def _services(orders: list[dict], categories: dict[str, str]) -> tuple[list[dict], list[dict]]:
    by_service: dict[str, dict] = {}
    by_category: dict[str, dict] = defaultdict(lambda: {"qty": 0, "revenueCents": 0})
    for o in orders:
        for l in o.get("order_lines") or []:
            sid = str(l["service_id"])
            qty = int(l["qty"])
            revenue = int(l["unit_price_cents"]) * qty
            category = categories.get(sid, "Otros")
            row = by_service.setdefault(sid, {"serviceId": sid, "name": l["name"], "category": category, "qty": 0, "revenueCents": 0})
            row["qty"] += qty
            row["revenueCents"] += revenue
            by_category[category]["qty"] += qty
            by_category[category]["revenueCents"] += revenue
    services = sorted(by_service.values(), key=lambda r: r["revenueCents"], reverse=True)
    cats = sorted(({"category": c, **v} for c, v in by_category.items()), key=lambda r: r["revenueCents"], reverse=True)
    return services, cats


def _payments(orders: list[dict]) -> list[dict]:
    out = []
    for method in PAYMENT_METHODS:
        mine = [o for o in orders if o["payment_method"] == method]
        out.append({"method": method, "orders": len(mine), "salesCents": sum(int(o["total_cents"]) for o in mine)})
    return out


def _branches(orders: list[dict]) -> list[dict]:
    out = []
    for branch in BRANCHES:
        mine = [o for o in orders if o.get("branch") == branch]
        out.append({"branch": branch, "orders": len(mine), "salesCents": sum(int(o["total_cents"]) for o in mine)})
    unknown = [o for o in orders if not o.get("branch")]
    if unknown:
        out.append(
            {
                "branch": "Sin sucursal",
                "orders": len(unknown),
                "salesCents": sum(int(o["total_cents"]) for o in unknown),
            }
        )
    return out


def _customers(orders: list[dict], names: dict[str, str], start: date) -> dict:
    totals: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for o in orders:
        t = totals[str(o["customer_id"])]
        t[0] += 1
        t[1] += int(o["total_cents"])
    ids = list(totals)
    returning = {str(r["customer_id"]) for r in _fetch_orders_before(ids, start)} if ids else set()
    top = sorted(totals.items(), key=lambda kv: kv[1][1], reverse=True)[:10]
    return {
        "newCount": len(set(ids) - returning),
        "returningCount": len(set(ids) & returning),
        "top": [
            {"customerId": cid, "name": names.get(cid, "—"), "orders": t[0], "salesCents": t[1]}
            for cid, t in top
        ],
    }


def _fetch_orders_before(ids: list[str], start: date) -> list[dict]:
    """Órdenes previas al periodo de esos clientes: si existen, el cliente es recurrente."""
    rows: list[dict] = []
    cutoff = _day_start(start).isoformat()
    for i in range(0, len(ids), _IN_CHUNK):
        part = ids[i : i + _IN_CHUNK]
        rows.extend(
            _fetch_all(
                lambda part=part: get_supabase()
                .table("orders")
                .select("customer_id")
                .in_("customer_id", part)
                .lt("created_at", cutoff)
            )
        )
    return rows


def _peak(orders: list[dict]) -> list[dict]:
    counts: dict[tuple[int, int], int] = defaultdict(int)
    for o in orders:
        t = _ts(o["created_at"])
        counts[(t.weekday(), t.hour)] += 1
    return [{"weekday": wd, "hour": h, "orders": n} for (wd, h), n in sorted(counts.items())]


def _cycle(orders: list[dict]) -> dict:
    folios = [int(o["folio"]) for o in orders]
    try:
        events = _fetch_in("order_status_events", "order_folio, status, changed_at", "order_folio", folios) if folios else []
    except APIError:
        logger.warning("reports: tabla order_status_events no disponible; aplica supabase_schema.sql")
        return {"available": False, "measured": 0, "readyHoursAvg": None, "pickupHoursAvg": None, "onTimePct": None}

    first: dict[tuple[int, str], datetime] = {}
    for e in events:
        key = (int(e["order_folio"]), e["status"])
        t = _ts(e["changed_at"])
        if key not in first or t < first[key]:
            first[key] = t

    ready_hours: list[float] = []
    pickup_hours: list[float] = []
    on_time = 0
    for o in orders:
        folio = int(o["folio"])
        created = _ts(o["created_at"])
        ready = first.get((folio, "listo"))
        if not ready:
            continue
        ready_hours.append((ready - created).total_seconds() / 3600)
        if ready.astimezone(BUSINESS_TZ).date() <= date.fromisoformat(str(o["delivery_date"])):
            on_time += 1
        delivered = first.get((folio, "entregado"))
        if delivered and delivered >= ready:
            pickup_hours.append((delivered - ready).total_seconds() / 3600)

    def avg(values: list[float]) -> float | None:
        return round(sum(values) / len(values), 1) if values else None

    measured = len(ready_hours)
    return {
        "available": True,
        "measured": measured,
        "readyHoursAvg": avg(ready_hours),
        "pickupHoursAvg": avg(pickup_hours),
        "onTimePct": round(100 * on_time / measured, 1) if measured else None,
    }


def build_report(start: date, end: date) -> dict:
    sb = get_supabase()
    span = (end - start).days + 1
    prev_start = start - timedelta(days=span)
    select = (
        "folio, customer_id, express, delivery_date, payment_method, branch, status, total_cents, created_at, "
        "order_lines(service_id, name, qty, unit_price_cents)"
    )
    orders = _fetch_all(
        lambda: sb.table("orders")
        .select(select)
        .gte("created_at", _day_start(prev_start).isoformat())
        .lt("created_at", _day_start(end + timedelta(days=1)).isoformat())
        .order("folio")
    )
    current = [o for o in orders if _ts(o["created_at"]).date() >= start]
    previous = [o for o in orders if _ts(o["created_at"]).date() < start]

    open_orders = _fetch_all(
        lambda: sb.table("orders")
        .select("folio, customer_id, payment_method, status, total_cents, status_updated_at, order_lines(qty)")
        .neq("status", "entregado")
        .order("folio")
    )

    customer_ids = sorted({str(o["customer_id"]) for o in current + open_orders})
    names = {str(r["id"]): r["name"] for r in _fetch_in("customers", "id, name", "id", customer_ids)} if customer_ids else {}
    categories = {str(r["id"]): r["category"] for r in _fetch_all(lambda: sb.table("services").select("id, category").order("id"))}
    services, cats = _services(current, categories)

    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "summary": _summary(current),
        "previous": _summary(previous),
        "daily": _daily(current, start, end),
        "pending": _pending(open_orders, names, datetime.now(BUSINESS_TZ)),
        "services": services,
        "categories": cats,
        "payments": _payments(current),
        "branches": _branches(current),
        "customers": _customers(current, names, start),
        "peak": _peak(current),
        "cycle": _cycle(current),
    }
