from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db, User, PatientProfile
from auth_utils import require_patient

router = APIRouter()

class PatientProfileUpdate(BaseModel):
    name: str = None
    phone: str = None
    age: int = None
    gender: str = None
    blood_group: str = None
    allergies: str = None
    medical_history: str = None
    emergency_contact: str = None

@router.put("/profile")
def update_profile(update: PatientProfileUpdate, user: User = Depends(require_patient), db: Session = Depends(get_db)):
    if update.name: user.name = update.name
    if update.phone: user.phone = update.phone
    p = user.patient_profile
    if p:
        for field in ["age","gender","blood_group","allergies","medical_history","emergency_contact"]:
            val = getattr(update, field)
            if val is not None:
                setattr(p, field, val)
    db.commit()
    return {"message": "Profile updated"}