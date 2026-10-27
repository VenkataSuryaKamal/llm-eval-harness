from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..datasets import DatasetError, parse_dataset, parse_pasted
from ..db import get_db
from ..models import Dataset, Run, TestCase
from ..schemas import DatasetDetail, DatasetOut

router = APIRouter(prefix="/datasets", tags=["datasets"])


def _save(db: Session, name: str, cases: list[dict]) -> Dataset:
    ds = Dataset(name=name.strip()[:200] or "Untitled dataset")
    ds.cases = [TestCase(position=i, **c) for i, c in enumerate(cases, start=1)]
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return ds


@router.post("", response_model=DatasetOut, status_code=201)
async def upload_dataset(
    name: str = Form(default=""),
    file: UploadFile | None = File(default=None),
    pasted: str = Form(default=""),
    db: Session = Depends(get_db),
):
    """Upload a .csv/.json/.jsonl file, or paste one input per line."""
    limit = get_settings().max_upload_bytes
    try:
        if file is not None and file.filename:
            content = await file.read(limit + 1)  # read at most limit+1 bytes
            cases = parse_dataset(file.filename, content)
            name = name or file.filename
        elif pasted.strip():
            if len(pasted.encode()) > limit:
                raise DatasetError("Pasted text is too large.")
            cases = parse_pasted(pasted)
        else:
            raise DatasetError("Upload a file or paste some inputs.")
    except DatasetError as e:
        raise HTTPException(422, str(e)) from e
    ds = _save(db, name, cases)
    return DatasetOut(id=ds.id, name=ds.name, created_at=ds.created_at, case_count=len(cases))


@router.get("", response_model=list[DatasetOut])
def list_datasets(db: Session = Depends(get_db)):
    rows = db.execute(
        select(Dataset, func.count(TestCase.id)).outerjoin(TestCase).group_by(Dataset.id).order_by(Dataset.id.desc())
    ).all()
    return [DatasetOut(id=d.id, name=d.name, created_at=d.created_at, case_count=n) for d, n in rows]


@router.get("/{dataset_id}", response_model=DatasetDetail)
def get_dataset(dataset_id: int, db: Session = Depends(get_db)):
    ds = db.get(Dataset, dataset_id)
    if ds is None:
        raise HTTPException(404, "Dataset not found.")
    return DatasetDetail(id=ds.id, name=ds.name, created_at=ds.created_at,
                         case_count=len(ds.cases), cases=ds.cases)


@router.delete("/{dataset_id}", status_code=204)
def delete_dataset(dataset_id: int, db: Session = Depends(get_db)):
    ds = db.get(Dataset, dataset_id)
    if ds is None:
        raise HTTPException(404, "Dataset not found.")
    busy = db.scalar(select(func.count(Run.id)).where(Run.dataset_id == ds.id, Run.status.in_(["queued", "running"])))
    if busy:
        raise HTTPException(409, "A run on this dataset is still in progress.")
    db.delete(ds)
    db.commit()
