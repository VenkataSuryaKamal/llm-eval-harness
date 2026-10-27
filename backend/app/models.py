"""ORM tables.

Dataset 1--* TestCase
Dataset 1--* Run 1--* Result *--1 TestCase

A Run = one prompt version executed against one dataset on N models.
Comparing two Runs on the same dataset gives the regression report.
"""
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    cases: Mapped[list["TestCase"]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan", order_by="TestCase.position"
    )
    runs: Mapped[list["Run"]] = relationship(back_populates="dataset", cascade="all, delete-orphan")


class TestCase(Base):
    __tablename__ = "test_cases"

    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    input: Mapped[str] = mapped_column(Text)
    expected: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Extra CSV/JSON columns, usable in the prompt as {{column_name}}.
    variables: Mapped[dict] = mapped_column(JSON, default=dict)

    dataset: Mapped[Dataset] = relationship(back_populates="cases")


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(200), default="")
    prompt_template: Mapped[str] = mapped_column(Text)
    system_prompt: Mapped[str] = mapped_column(Text, default="")
    models: Mapped[list] = mapped_column(JSON)
    judge_model: Mapped[str] = mapped_column(String(100))
    judge_criteria: Mapped[str] = mapped_column(Text, default="")
    pass_threshold: Mapped[int] = mapped_column(Integer, default=7)
    status: Mapped[str] = mapped_column(String(20), default="queued")  # queued|running|completed|failed
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_calls: Mapped[int] = mapped_column(Integer, default=0)
    completed_calls: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    dataset: Mapped[Dataset] = relationship(back_populates="runs")
    results: Mapped[list["Result"]] = relationship(back_populates="run", cascade="all, delete-orphan")


class Result(Base):
    __tablename__ = "results"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), index=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("test_cases.id", ondelete="CASCADE"), index=True)
    model: Mapped[str] = mapped_column(String(100))
    output: Mapped[str] = mapped_column(Text, default="")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1..10 from the judge
    passed: Mapped[bool] = mapped_column(Boolean, default=False)
    judge_reasoning: Mapped[str] = mapped_column(Text, default="")
    judge_cost_usd: Mapped[float] = mapped_column(Float, default=0.0)

    run: Mapped[Run] = relationship(back_populates="results")
    case: Mapped[TestCase] = relationship()
