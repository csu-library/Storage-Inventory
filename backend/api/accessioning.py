from fastapi import APIRouter, HTTPException, Depends, Query, Form, UploadFile, File
from fastapi.responses import PlainTextResponse, StreamingResponse, RedirectResponse, FileResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional, Dict
from datetime import datetime
import io
import os
import pandas as pd

from db.session import get_db
from db.models import Project, Category, EmptyShelf, AccessionedItem

router = APIRouter()

# ── Projects Page ────────
class CategoryCreate(BaseModel):
    name: str
    shelf_target: int
    default_items_per_shelf: int

class CategoryResponse(BaseModel):
    id: int
    name: str
    shelf_target: int
    default_items_per_shelf: int

    class Config:
        from_attributes = True

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    categories: List[CategoryCreate] = []

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    categories: Optional[List[CategoryCreate]] = None

class ProjectResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_at: datetime
    categories: List[CategoryResponse]

    class Config:
        from_attributes = True

@router.get("/projects", response_model=List[ProjectResponse])
def get_projects(db: Session = Depends(get_db)):
    """Get all projects"""
    projects = db.query(Project).options(joinedload(Project.categories)).all()
    return projects

@router.get("/projects/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_db)):
    """Get a specific project by ID"""
    project = db.query(Project).options(joinedload(Project.categories)).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.post("/projects", response_model=ProjectResponse)
def create_project(project: ProjectCreate, db: Session = Depends(get_db)):
    """Create a new project with categories"""
    existing = db.query(Project).filter(Project.name == project.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Project with this name already exists")

    db_project = Project(name=project.name, description=project.description)
    db.add(db_project)
    db.flush()

    for cat in project.categories:
        db_category = Category(
            project_id=db_project.id,
            name=cat.name,
            shelf_target=cat.shelf_target,
            default_items_per_shelf=cat.default_items_per_shelf
        )
        db.add(db_category)

    db.commit()
    db.refresh(db_project)
    return db_project

@router.put("/projects/{project_id}", response_model=ProjectResponse)
def update_project(project_id: int, project: ProjectUpdate, db: Session = Depends(get_db)):
    """Update a project and its categories"""
    db_project = db.query(Project).filter(Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.name is not None:
        existing = db.query(Project).filter(Project.name == project.name, Project.id != project_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Project with this name already exists")
        db_project.name = project.name

    if project.description is not None:
        db_project.description = project.description

    if project.categories is not None:
        db.query(Category).filter(Category.project_id == project_id).delete()

        for cat in project.categories:
            db_category = Category(
                project_id=project_id,
                name=cat.name,
                shelf_target=cat.shelf_target,
                default_items_per_shelf=cat.default_items_per_shelf
            )
            db.add(db_category)

    db.commit()
    db.refresh(db_project)
    return db_project

@router.delete("/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    """Delete a project and all its data"""
    db_project = db.query(Project).filter(Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")

    db.delete(db_project)
    db.commit()
    return {"message": "Project deleted successfully"}

@router.get("/projects/{project_id}/categories", response_model=List[CategoryResponse])
def get_categories(project_id: int, db: Session = Depends(get_db)):
    """Get all categories for a project"""
    categories = db.query(Category).filter(Category.project_id == project_id).all()
    return categories

@router.get("/projects/{project_id}/stats")
def get_project_stats(project_id: int, db: Session = Depends(get_db)):
    """Get statistics for a project"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    stats = []
    for category in project.categories:
        total_shelves = db.query(EmptyShelf).filter(
            EmptyShelf.project_id == project_id,
            EmptyShelf.category_id == category.id
        ).count()

        available_shelves = db.query(EmptyShelf).filter(
            EmptyShelf.project_id == project_id,
            EmptyShelf.category_id == category.id,
            EmptyShelf.status == "available"
        ).count()

        accessioned_shelves = db.query(EmptyShelf).filter(
            EmptyShelf.project_id == project_id,
            EmptyShelf.category_id == category.id,
            EmptyShelf.status == "accessioned"
        ).count()

        stats.append({
            "category_id": category.id,
            "category_name": category.name,
            "shelf_target": category.shelf_target,
            "default_items_per_shelf": category.default_items_per_shelf,
            "total_shelves": total_shelves,
            "available_shelves": available_shelves,
            "accessioned_shelves": accessioned_shelves,
            "remaining_needed": max(0, category.shelf_target - total_shelves)
        })

    return {
        "project_id": project_id,
        "project_name": project.name,
        "categories": stats
    }

# ── Empty Shelves Page ────────
class EmptyShelfCreate(BaseModel):
    project_id: int
    call_number: str
    category_id: int

class EmptyShelfUpdate(BaseModel):
    status: str

class EmptyShelfResponse(BaseModel):
    id: int
    project_id: int
    category_id: int
    call_number: str
    status: str
    category_name: Optional[str] = None

    class Config:
        from_attributes = True

@router.get("/shelves", response_model=List[EmptyShelfResponse])
def get_empty_shelves(
    project_id: int = Query(...),
    category_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all empty shelves for a project, optionally filtered by category and status"""
    query = db.query(EmptyShelf).filter(EmptyShelf.project_id == project_id)

    if category_id:
        query = query.filter(EmptyShelf.category_id == category_id)

    if status:
        query = query.filter(EmptyShelf.status == status)

    shelves = query.options(joinedload(EmptyShelf.category)).order_by(EmptyShelf.call_number).all()

    result = []
    for shelf in shelves:
        result.append({
            "id": shelf.id,
            "project_id": shelf.project_id,
            "category_id": shelf.category_id,
            "call_number": shelf.call_number,
            "status": shelf.status,
            "category_name": shelf.category.name if shelf.category else "Unknown"
        })

    return result

@router.post("/shelves", response_model=EmptyShelfResponse)
def create_empty_shelf(shelf: EmptyShelfCreate, db: Session = Depends(get_db)):
    """Add a new empty shelf to a project"""
    project = db.query(Project).filter(Project.id == shelf.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    category = db.query(Category).filter(
        Category.id == shelf.category_id,
        Category.project_id == shelf.project_id
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found or doesn't belong to this project")

    existing = db.query(EmptyShelf).filter(
        EmptyShelf.project_id == shelf.project_id,
        EmptyShelf.call_number == shelf.call_number
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="This shelf is already recorded for this project")

    db_shelf = EmptyShelf(
        project_id=shelf.project_id,
        category_id=shelf.category_id,
        call_number=shelf.call_number,
        status="available"
    )
    db.add(db_shelf)
    db.commit()
    db.refresh(db_shelf)

    return db_shelf

@router.patch("/shelves/{shelf_id}/status", response_model=EmptyShelfResponse)
def update_shelf_status(shelf_id: int, shelf: EmptyShelfUpdate, db: Session = Depends(get_db)):
    """Update shelf status (mark as accessioned or available)"""
    db_shelf = db.query(EmptyShelf).filter(EmptyShelf.id == shelf_id).first()

    if not db_shelf:
        raise HTTPException(status_code=404, detail="Shelf not found")

    if shelf.status not in ["available", "accessioned"]:
        raise HTTPException(status_code=400, detail="Status must be 'available' or 'accessioned'")

    db_shelf.status = shelf.status
    db.commit()
    db.refresh(db_shelf)

    return db_shelf

@router.delete("/shelves/{shelf_id}")
def delete_shelf(shelf_id: int, db: Session = Depends(get_db)):
    """Delete a shelf"""
    db_shelf = db.query(EmptyShelf).filter(EmptyShelf.id == shelf_id).first()

    if not db_shelf:
        raise HTTPException(status_code=404, detail="Shelf not found")

    db.delete(db_shelf)
    db.commit()
    return {"message": "Shelf deleted successfully"}

@router.get("/shelves/export")
def export_shelves(project_id: int = Query(...), status: Optional[str] = None, db: Session = Depends(get_db)):
    """Export shelves to Excel"""
    query = db.query(EmptyShelf).filter(EmptyShelf.project_id == project_id)

    if status:
        query = query.filter(EmptyShelf.status == status)

    shelves = query.options(joinedload(EmptyShelf.category)).order_by(EmptyShelf.call_number).all()

    data = []
    for shelf in shelves:
        data.append({
            "Call Number": shelf.call_number,
            "Category": shelf.category.name if shelf.category else "Unknown",
            "Status": shelf.status
        })

    df = pd.DataFrame(data)
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Empty Shelves")
    buffer.seek(0)

    headers = {
        "Content-Disposition": f"attachment; filename=project_{project_id}_shelves.xlsx"
    }

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers
    )

# ── Accessioning Page ────────
class AccessionRequest(BaseModel):
    project_id: int
    shelf_call_number: str
    item_count: int

class AccessionItem(BaseModel):
    barcode: str
    alternative_call_number: str


def generate_call_numbers(base_call_number: str, quantity: int) -> List[str]:
    """Generate alternative call numbers for a shelf"""
    call_numbers = []
    for i in range(1, quantity + 1):
        call_number = f"{base_call_number}-{i:03d}"
        call_numbers.append(call_number)
    return call_numbers

@router.post("/accession/generate-excel")
def generate_accession_excel(request: AccessionRequest, db: Session = Depends(get_db)):
    """Generate Excel preview data for accessioning"""
    shelf = db.query(EmptyShelf).filter(
        EmptyShelf.project_id == request.project_id,
        EmptyShelf.call_number == request.shelf_call_number
    ).first()

    if not shelf:
        raise HTTPException(status_code=404, detail="Shelf not found in this project")

    call_numbers = generate_call_numbers(request.shelf_call_number, request.item_count)

    rows = []
    for call_number in call_numbers:
        rows.append({
            "barcode": "",
            "alternative_call_number": call_number
        })

    return {"rows": rows}

@router.post("/accession/download-excel")
def download_accession_excel(request: AccessionRequest, db: Session = Depends(get_db)):
    """Download Excel file for accessioning with empty barcode column"""
    shelf = db.query(EmptyShelf).filter(
        EmptyShelf.project_id == request.project_id,
        EmptyShelf.call_number == request.shelf_call_number
    ).first()

    if not shelf:
        raise HTTPException(status_code=404, detail="Shelf not found in this project")

    call_numbers = generate_call_numbers(request.shelf_call_number, request.item_count)

    data = {
        "barcode": [""] * len(call_numbers),
        "alternative_call_number": call_numbers
    }
    df = pd.DataFrame(data)

    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Accession")
    buffer.seek(0)

    safe_call_number = request.shelf_call_number.replace("/", "-")
    headers = {
        "Content-Disposition": f"attachment; filename=accession_{safe_call_number}.xlsx"
    }

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers
    )

@router.post("/accession/generate-labels")
def generate_accession_labels(request: AccessionRequest, db: Session = Depends(get_db)):
    """Generate batch print format for stickers"""
    shelf = db.query(EmptyShelf).filter(
        EmptyShelf.project_id == request.project_id,
        EmptyShelf.call_number == request.shelf_call_number
    ).first()

    if not shelf:
        raise HTTPException(status_code=404, detail="Shelf not found in this project")

    call_numbers = generate_call_numbers(request.shelf_call_number, request.item_count)
    lines = []
    for call_number in call_numbers:
        lines.append(f"{call_number}\n\n\n===============")

    return {"labels": "\n".join(lines)}

class AdditionalLabelsRequest(BaseModel):
    project_id: int
    shelf_call_number: str
    current_item_count: int
    additional_count: int

@router.post("/accession/generate-additional-labels")
def generate_additional_labels(request: AdditionalLabelsRequest, db: Session = Depends(get_db)):
    """Generate additional stickers starting from a specific position"""
    shelf = db.query(EmptyShelf).filter(
        EmptyShelf.project_id == request.project_id,
        EmptyShelf.call_number == request.shelf_call_number
    ).first()

    if not shelf:
        raise HTTPException(status_code=404, detail="Shelf not found in this project")

    call_numbers = []
    for i in range(request.current_item_count + 1, request.current_item_count + request.additional_count + 1):
        call_number = f"{request.shelf_call_number}-{i:03d}"
        call_numbers.append(call_number)

    lines = []
    for call_number in call_numbers:
        lines.append(f"{call_number}\n\n\n===============")

    return {"labels": "\n".join(lines)}

# ── Batch Printing Page ────────
class ShelfConfig(BaseModel):
    shelf_id: int
    item_count: int

class BatchPrintRequest(BaseModel):
    project_id: int
    shelf_configs: List[ShelfConfig]


def generate_call_numbers_for_shelf(base_call_number: str, quantity: int) -> List[str]:
    """Generate alternative call numbers for a shelf"""
    call_numbers = []
    for i in range(1, quantity + 1):
        call_number = f"{base_call_number}-{i:03d}"
        call_numbers.append(call_number)
    return call_numbers

@router.post("/batch-print/generate")
def generate_batch_labels(request: BatchPrintRequest, db: Session = Depends(get_db)):
    """Generate batch print labels for multiple shelves"""
    all_labels = []

    for shelf_config in request.shelf_configs:
        shelf = db.query(EmptyShelf).filter(
            EmptyShelf.id == shelf_config.shelf_id,
            EmptyShelf.project_id == request.project_id
        ).first()

        if not shelf:
            raise HTTPException(status_code=404, detail=f"Shelf {shelf_config.shelf_id} not found")

        call_numbers = generate_call_numbers_for_shelf(shelf.call_number, shelf_config.item_count)

        for call_number in call_numbers:
            all_labels.append(f"{call_number}\n\n\n===============")

    all_labels.reverse()
    return {"labels": "\n".join(all_labels)}

@router.get("/batch-print/shelf-defaults/{shelf_id}")
def get_shelf_defaults(shelf_id: int, db: Session = Depends(get_db)):
    """Get default quantity for a shelf"""
    shelf = db.query(EmptyShelf).filter(EmptyShelf.id == shelf_id).first()

    if not shelf:
        raise HTTPException(status_code=404, detail="Shelf not found")

    category = db.query(Category).filter(Category.id == shelf.category_id).first()

    return {
        "shelf_id": shelf.id,
        "call_number": shelf.call_number,
        "category_name": category.name if category else "Unknown",
        "default_items_per_shelf": category.default_items_per_shelf if category else 25,
        "status": shelf.status
    }
