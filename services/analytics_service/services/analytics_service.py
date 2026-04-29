"""Analytics service — read-only aggregation queries.

No repository layer: these are one-off aggregations that don't fit the
CRUD-abstraction model.  The service queries AsyncSession directly using
SQLAlchemy ``func.count``, ``func.sum``, and ``case`` expressions.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.db.enums import (
    LeaseStatus,
    MaintenancePriority,
    MaintenanceStatus,
    PaymentStatus,
)
from shared.db.models import Lease, MaintenanceRequest, Payment, Property, Unit
from shared.schemas.analytics_schemas import (
    DashboardOverview,
    LeaseStats,
    MaintenanceStats,
    OccupancyStats,
    RevenueStats,
)


class AnalyticsService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ------------------------------------------------------------------
    # Occupancy
    # ------------------------------------------------------------------

    async def occupancy(self) -> list[OccupancyStats]:
        """Return per-property occupancy figures via a single GROUP BY query."""
        rows = (
            await self._db.execute(
                select(
                    Property.property_id,
                    Property.name,
                    func.count(Unit.unit_id).label("total"),
                    func.coalesce(
                        func.sum(case((Unit.is_occupied.is_(True), 1), else_=0)), 0
                    ).label("occupied"),
                )
                .join(Unit, Unit.property_id == Property.property_id, isouter=True)
                .group_by(Property.property_id, Property.name)
                .order_by(Property.name)
            )
        ).all()

        result: list[OccupancyStats] = []
        for row in rows:
            total = int(row.total)
            occupied = int(row.occupied)
            vacant = total - occupied
            rate = round(occupied / total, 4) if total else 0.0
            result.append(
                OccupancyStats(
                    property_id=row.property_id,
                    property_name=row.name,
                    total_units=total,
                    occupied_units=occupied,
                    vacant_units=vacant,
                    occupancy_rate=rate,
                )
            )
        return result

    # ------------------------------------------------------------------
    # Revenue
    # ------------------------------------------------------------------

    async def revenue(self) -> RevenueStats:
        """Return portfolio-wide payment aggregates in a single query."""
        row = (
            await self._db.execute(
                select(
                    func.coalesce(func.sum(Payment.amount), Decimal("0")).label(
                        "total_billed"
                    ),
                    func.coalesce(
                        func.sum(
                            case(
                                (Payment.status == PaymentStatus.PAID, Payment.amount),
                                else_=0,
                            )
                        ),
                        Decimal("0"),
                    ).label("collected"),
                    func.coalesce(
                        func.sum(
                            case(
                                (
                                    Payment.status == PaymentStatus.OVERDUE,
                                    Payment.amount + Payment.late_fee,
                                ),
                                else_=0,
                            )
                        ),
                        Decimal("0"),
                    ).label("overdue"),
                    func.coalesce(func.sum(Payment.late_fee), Decimal("0")).label(
                        "late_fees"
                    ),
                    func.coalesce(
                        func.sum(
                            case((Payment.status == PaymentStatus.PENDING, 1), else_=0)
                        ),
                        0,
                    ).label("n_pending"),
                    func.coalesce(
                        func.sum(
                            case((Payment.status == PaymentStatus.PAID, 1), else_=0)
                        ),
                        0,
                    ).label("n_paid"),
                    func.coalesce(
                        func.sum(
                            case((Payment.status == PaymentStatus.OVERDUE, 1), else_=0)
                        ),
                        0,
                    ).label("n_overdue"),
                    func.coalesce(
                        func.sum(
                            case((Payment.status == PaymentStatus.PARTIAL, 1), else_=0)
                        ),
                        0,
                    ).label("n_partial"),
                )
            )
        ).one()

        return RevenueStats(
            total_billed=Decimal(str(row.total_billed or "0")),
            total_collected=Decimal(str(row.collected or "0")),
            total_overdue=Decimal(str(row.overdue or "0")),
            total_late_fees=Decimal(str(row.late_fees or "0")),
            count_pending=int(row.n_pending or 0),
            count_paid=int(row.n_paid or 0),
            count_overdue=int(row.n_overdue or 0),
            count_partial=int(row.n_partial or 0),
        )

    # ------------------------------------------------------------------
    # Leases
    # ------------------------------------------------------------------

    async def leases(self) -> LeaseStats:
        """Return lease counts broken down by status plus expiring-soon count."""
        status_rows = (
            await self._db.execute(
                select(Lease.status, func.count().label("n")).group_by(Lease.status)
            )
        ).all()

        counts: dict[str, int] = {row.status.value: int(row.n) for row in status_rows}
        total = sum(counts.values())

        cutoff = date.today() + timedelta(days=30)
        expiring_soon = (
            await self._db.execute(
                select(func.count()).where(
                    Lease.status == LeaseStatus.ACTIVE,
                    Lease.end_date <= cutoff,
                )
            )
        ).scalar_one()

        return LeaseStats(
            total=total,
            active=counts.get(LeaseStatus.ACTIVE.value, 0),
            draft=counts.get(LeaseStatus.DRAFT.value, 0),
            expiring_soon=int(expiring_soon),
            terminated=counts.get(LeaseStatus.TERMINATED.value, 0),
            expired=counts.get(LeaseStatus.EXPIRED.value, 0),
        )

    # ------------------------------------------------------------------
    # Maintenance
    # ------------------------------------------------------------------

    async def maintenance(self) -> MaintenanceStats:
        """Return maintenance request counts by status and priority."""
        status_rows = (
            await self._db.execute(
                select(MaintenanceRequest.status, func.count().label("n")).group_by(
                    MaintenanceRequest.status
                )
            )
        ).all()

        priority_rows = (
            await self._db.execute(
                select(MaintenanceRequest.priority, func.count().label("n")).group_by(
                    MaintenanceRequest.priority
                )
            )
        ).all()

        escalated_count = (
            await self._db.execute(
                select(func.count()).where(MaintenanceRequest.escalated.is_(True))
            )
        ).scalar_one()

        by_status: dict[str, int] = {
            row.status.value: int(row.n) for row in status_rows
        }
        by_priority: dict[str, int] = {
            row.priority.value: int(row.n) for row in priority_rows
        }

        total = sum(by_status.values())
        open_statuses = {
            MaintenanceStatus.SUBMITTED.value,
            MaintenanceStatus.ASSIGNED.value,
            MaintenanceStatus.IN_PROGRESS.value,
        }
        open_count = sum(v for k, v in by_status.items() if k in open_statuses)

        return MaintenanceStats(
            total=total,
            open=open_count,
            completed=by_status.get(MaintenanceStatus.COMPLETED.value, 0),
            closed=by_status.get(MaintenanceStatus.CLOSED.value, 0),
            cancelled=by_status.get(MaintenanceStatus.CANCELLED.value, 0),
            escalated=int(escalated_count),
            by_status=by_status,
            by_priority=by_priority,
        )

    # ------------------------------------------------------------------
    # Dashboard overview
    # ------------------------------------------------------------------

    async def overview(self) -> DashboardOverview:
        """Aggregate all four metrics into a single dashboard payload."""
        occ_list = await self.occupancy()
        total_units = sum(o.total_units for o in occ_list)
        occupied = sum(o.occupied_units for o in occ_list)
        overall_rate = round(occupied / total_units, 4) if total_units else 0.0

        return DashboardOverview(
            total_properties=len(occ_list),
            total_units=total_units,
            overall_occupancy_rate=overall_rate,
            occupancy_by_property=occ_list,
            revenue=await self.revenue(),
            leases=await self.leases(),
            maintenance=await self.maintenance(),
        )
