from __future__ import annotations

import asyncio
import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from api.deps import require_admin
from api.reports_service import MAX_RANGE_DAYS, build_report

logger = logging.getLogger(__name__)
reports_router = APIRouter()


class Summary(BaseModel):
    salesCents: int
    orders: int
    avgTicketCents: int
    pieces: int
    expressPct: float


class DailyPoint(BaseModel):
    date: str
    salesCents: int
    orders: int


class AgingBucket(BaseModel):
    label: str
    orders: int
    pieces: int


class ReadyOrder(BaseModel):
    folio: int
    customerName: str
    days: int
    totalCents: int
    payment: str


class Pending(BaseModel):
    receivableCents: int
    receivableOrders: int
    readyOrders: int
    readyPieces: int
    aging: list[AgingBucket]
    oldestReady: list[ReadyOrder]


class ServiceStat(BaseModel):
    serviceId: str
    name: str
    category: str
    qty: int
    revenueCents: int


class CategoryStat(BaseModel):
    category: str
    qty: int
    revenueCents: int


class PaymentStat(BaseModel):
    method: str
    orders: int
    salesCents: int


class BranchStat(BaseModel):
    branch: str
    orders: int
    salesCents: int


class TopCustomer(BaseModel):
    customerId: str
    name: str
    orders: int
    salesCents: int


class CustomersStat(BaseModel):
    newCount: int
    returningCount: int
    top: list[TopCustomer]


class PeakCell(BaseModel):
    weekday: int
    hour: int
    orders: int


class Cycle(BaseModel):
    available: bool
    measured: int
    readyHoursAvg: float | None
    pickupHoursAvg: float | None
    onTimePct: float | None


class ReportOut(BaseModel):
    start: str
    end: str
    summary: Summary
    previous: Summary
    daily: list[DailyPoint]
    pending: Pending
    services: list[ServiceStat]
    categories: list[CategoryStat]
    payments: list[PaymentStat]
    branches: list[BranchStat]
    customers: CustomersStat
    peak: list[PeakCell]
    cycle: Cycle


@reports_router.get("", response_model=ReportOut)
async def get_report(
    start: date = Query(alias="from"),
    end: date = Query(alias="to"),
    _admin: dict = Depends(require_admin),
):
    if end < start:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="La fecha final debe ser igual o posterior a la inicial.")
    if (end - start).days + 1 > MAX_RANGE_DAYS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=f"El periodo máximo es de {MAX_RANGE_DAYS} días.")
    try:
        return await asyncio.to_thread(build_report, start, end)
    except Exception:
        logger.exception("get_report falló from=%s to=%s", start, end)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo generar el reporte") from None
