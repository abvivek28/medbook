from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db, User, DoctorProfile, PatientProfile
from auth_utils import hash_password, verify_password, create_token, get_current_user

router = APIRouter()

class RegisterRequest(BaseModel):
    name: str
    email: str
    phone: str = ""
    password: str
    role: str
    # doctor fields
    specialization: str = ""
    qualification: str = ""
    experience_years: Optional[int] = 0
    clinic_name: str = ""
    clinic_address: str = ""
    consultation_fee: Optional[float] = 0
    # patient fields
    age: Optional[int] = None
    gender: str = ""
    blood_group: str = ""

class LoginRequest(BaseModel):
    email: str
    password: str

@router.post("/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if req.role not in ("doctor", "patient"):
        raise HTTPException(status_code=400, detail="Role must be doctor or patient")

    user = User(
        name=req.name, email=req.email, phone=req.phone,
        password_hash=hash_password(req.password), role=req.role
    )
    db.add(user)
    db.flush()

    if req.role == "doctor":
        db.add(DoctorProfile(
            user_id=user.id,
            specialization=req.specialization or "",
            qualification=req.qualification,
            experience_years=req.experience_years or 0,
            clinic_name=req.clinic_name,
            clinic_address=req.clinic_address,
            consultation_fee=req.consultation_fee or 0,
        ))
    else:
        db.add(PatientProfile(
            user_id=user.id,
            age=req.age,
            gender=req.gender,
            blood_group=req.blood_group,
        ))

    db.commit()
    return {
        "token": create_token(user.id, user.role),
        "role": user.role,
        "name": user.name,
        "id": user.id,
    }

@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {
        "token": create_token(user.id, user.role),
        "role": user.role,
        "name": user.name,
        "id": user.id,
    }

@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    data = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "role": user.role,
    }
    if user.role == "doctor" and user.doctor_profile:
        p = user.doctor_profile
        data["profile"] = {
            "specialization":    p.specialization,
            "qualification":     p.qualification,
            "experience_years":  p.experience_years,
            "clinic_name":       p.clinic_name,
            "clinic_address":    p.clinic_address,
            "consultation_fee":  p.consultation_fee,
            "bio":               p.bio,
            "available_days":    p.available_days,
            "slot_duration_mins":p.slot_duration_mins,
            "rating":            p.rating,
            "total_reviews":     p.total_reviews,
        }
    elif user.role == "patient" and user.patient_profile:
        p = user.patient_profile
        data["profile"] = {
            "age":               p.age,
            "gender":            p.gender,
            "blood_group":       p.blood_group,
            "allergies":         p.allergies,
            "medical_history":   p.medical_history,
            "emergency_contact": p.emergency_contact,
        }
    return data