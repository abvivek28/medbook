from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from database import get_db, User, DoctorProfile, PatientProfile, Slot, Appointment, Review
from auth_utils import get_current_user, require_doctor
from datetime import datetime, timedelta

router = APIRouter()

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    specialization: Optional[str] = None
    qualification: Optional[str] = None
    experience_years: Optional[int] = None
    clinic_name: Optional[str] = None
    clinic_address: Optional[str] = None
    consultation_fee: Optional[float] = None
    bio: Optional[str] = None
    available_days: Optional[str] = None
    slot_duration_mins: Optional[int] = None

class SlotCreate(BaseModel):
    date: str
    start_time: str
    end_time: str

class BulkSlotCreate(BaseModel):
    dates: List[str]
    start_time: str
    end_time: str
    slot_duration_mins: int = 30

class WeeklySlotCreate(BaseModel):
    weekdays: List[int]
    num_weeks: int = 4
    start_time: str
    end_time: str
    slot_duration_mins: int = 30

class AppointmentUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    prescription: Optional[str] = None

# ── Public routes ─────────────────────────────────────────────────────────────

@router.get("/search")
def search_doctors(q: str="", specialization: str="",
                   min_fee: Optional[float]=None, max_fee: Optional[float]=None,
                   min_exp: Optional[int]=None, db: Session=Depends(get_db)):
    query = db.query(User, DoctorProfile).join(DoctorProfile, User.id==DoctorProfile.user_id)
    if q: query = query.filter(User.name.ilike(f"%{q}%"))
    if specialization: query = query.filter(DoctorProfile.specialization.ilike(f"%{specialization}%"))
    if min_fee is not None: query = query.filter(DoctorProfile.consultation_fee >= min_fee)
    if max_fee is not None: query = query.filter(DoctorProfile.consultation_fee <= max_fee)
    if min_exp is not None: query = query.filter(DoctorProfile.experience_years >= min_exp)
    results = []
    for user, profile in query.all():
        results.append({"id": user.id, "name": user.name, "specialization": profile.specialization,
            "qualification": profile.qualification, "experience_years": profile.experience_years,
            "clinic_name": profile.clinic_name, "clinic_address": profile.clinic_address,
            "consultation_fee": profile.consultation_fee, "bio": profile.bio,
            "rating": profile.rating, "total_reviews": profile.total_reviews})
    return results

@router.get("/specializations")
def get_specializations(db: Session=Depends(get_db)):
    specs = db.query(DoctorProfile.specialization).distinct().all()
    return sorted([s[0] for s in specs if s[0]])

# ── Authenticated doctor routes — MUST come before /{doctor_id} ───────────────

@router.get("/my/stats")
def my_stats(user: User=Depends(require_doctor), db: Session=Depends(get_db)):
    today = datetime.utcnow().date().isoformat()
    total = db.query(Appointment).filter(Appointment.doctor_id==user.id).count()
    today_count = (db.query(Appointment).join(Slot)
                   .filter(Appointment.doctor_id==user.id, Slot.date==today, Appointment.status=="confirmed").count())
    completed = db.query(Appointment).filter(Appointment.doctor_id==user.id, Appointment.status=="completed").count()
    available_slots = db.query(Slot).filter(Slot.doctor_id==user.id, Slot.date>=today, Slot.is_booked==False, Slot.is_blocked==False).count()
    pending = db.query(Appointment).filter(Appointment.doctor_id==user.id, Appointment.status=="confirmed").count()
    return {"total_appointments": total, "today_appointments": today_count,
            "completed": completed, "available_slots": available_slots, "pending": pending}

@router.get("/my/slots")
def my_slots(from_date: Optional[str]=None, user: User=Depends(require_doctor), db: Session=Depends(get_db)):
    start = from_date or datetime.utcnow().date().isoformat()
    slots = db.query(Slot).filter(Slot.doctor_id==user.id, Slot.date>=start).order_by(Slot.date, Slot.start_time).all()
    return [{"id": s.id, "date": s.date, "start_time": s.start_time, "end_time": s.end_time,
             "is_booked": s.is_booked, "is_blocked": s.is_blocked} for s in slots]

@router.get("/my/today")
def my_today(user: User=Depends(require_doctor), db: Session=Depends(get_db)):
    today = datetime.utcnow().date().isoformat()
    appts = (db.query(Appointment).join(Slot)
             .filter(Appointment.doctor_id==user.id, Slot.date==today)
             .order_by(Slot.start_time).all())
    result = []
    for a in appts:
        pp = db.query(PatientProfile).filter(PatientProfile.user_id==a.patient_id).first()
        result.append({"id": a.id, "status": a.status, "reason": a.reason,
            "notes": a.notes, "prescription": a.prescription,
            "slot": {"date": a.slot.date, "start_time": a.slot.start_time, "end_time": a.slot.end_time},
            "patient": {"id": a.patient.id, "name": a.patient.name,
                "email": a.patient.email, "phone": a.patient.phone,
                "age": pp.age if pp else None, "gender": pp.gender if pp else None,
                "blood_group": pp.blood_group if pp else None,
                "allergies": pp.allergies if pp else "",
                "medical_history": pp.medical_history if pp else ""} if a.patient else None})
    return result

@router.get("/my/appointments")
def my_appointments(status: Optional[str]=None, user: User=Depends(require_doctor), db: Session=Depends(get_db)):
    query = db.query(Appointment).filter(Appointment.doctor_id==user.id)
    if status: query = query.filter(Appointment.status==status)
    appts = query.order_by(Appointment.created_at.desc()).all()
    result = []
    for a in appts:
        pp = db.query(PatientProfile).filter(PatientProfile.user_id==a.patient_id).first()
        result.append({"id": a.id, "status": a.status, "reason": a.reason,
            "notes": a.notes, "prescription": a.prescription,
            "created_at": a.created_at.isoformat(),
            "slot": {"date": a.slot.date, "start_time": a.slot.start_time, "end_time": a.slot.end_time} if a.slot else None,
            "patient": {"id": a.patient.id, "name": a.patient.name,
                "email": a.patient.email, "phone": a.patient.phone,
                "age": pp.age if pp else None, "gender": pp.gender if pp else None,
                "blood_group": pp.blood_group if pp else None,
                "allergies": pp.allergies if pp else ""} if a.patient else None})
    return result

@router.put("/profile")
def update_profile(update: ProfileUpdate, user: User=Depends(require_doctor), db: Session=Depends(get_db)):
    if update.name: user.name = update.name
    if update.phone: user.phone = update.phone
    p = user.doctor_profile
    if p:
        for field in ["specialization","qualification","experience_years","clinic_name",
                      "clinic_address","consultation_fee","bio","available_days","slot_duration_mins"]:
            val = getattr(update, field)
            if val is not None: setattr(p, field, val)
    db.commit()
    return {"message": "Profile updated"}

@router.post("/slots")
def create_slot(slot: SlotCreate, user: User=Depends(require_doctor), db: Session=Depends(get_db)):
    existing = db.query(Slot).filter(Slot.doctor_id==user.id, Slot.date==slot.date, Slot.start_time==slot.start_time).first()
    if existing: raise HTTPException(status_code=400, detail="Slot already exists at this time")
    s = Slot(doctor_id=user.id, date=slot.date, start_time=slot.start_time, end_time=slot.end_time)
    db.add(s); db.commit(); db.refresh(s)
    return {"id": s.id, "date": s.date, "start_time": s.start_time, "end_time": s.end_time}

@router.post("/slots/bulk")
def create_bulk_slots(req: BulkSlotCreate, user: User=Depends(require_doctor), db: Session=Depends(get_db)):
    created = 0
    for day in req.dates:
        start = datetime.strptime(f"{day} {req.start_time}", "%Y-%m-%d %H:%M")
        end   = datetime.strptime(f"{day} {req.end_time}",   "%Y-%m-%d %H:%M")
        cur = start
        while cur + timedelta(minutes=req.slot_duration_mins) <= end:
            slot_end = cur + timedelta(minutes=req.slot_duration_mins)
            if not db.query(Slot).filter(Slot.doctor_id==user.id, Slot.date==day,
                                         Slot.start_time==cur.strftime("%H:%M")).first():
                db.add(Slot(doctor_id=user.id, date=day,
                            start_time=cur.strftime("%H:%M"), end_time=slot_end.strftime("%H:%M")))
                created += 1
            cur = slot_end
    db.commit()
    return {"created": created}

@router.post("/slots/weekly")
def create_weekly_slots(req: WeeklySlotCreate, user: User=Depends(require_doctor), db: Session=Depends(get_db)):
    today = datetime.utcnow().date()
    created = 0
    for week in range(req.num_weeks):
        for wd in req.weekdays:
            days_ahead = (wd - today.weekday()) % 7 + week * 7
            target = today + timedelta(days=days_ahead)
            day_str = target.isoformat()
            start = datetime.strptime(f"{day_str} {req.start_time}", "%Y-%m-%d %H:%M")
            end   = datetime.strptime(f"{day_str} {req.end_time}",   "%Y-%m-%d %H:%M")
            cur = start
            while cur + timedelta(minutes=req.slot_duration_mins) <= end:
                slot_end = cur + timedelta(minutes=req.slot_duration_mins)
                if not db.query(Slot).filter(Slot.doctor_id==user.id, Slot.date==day_str,
                                             Slot.start_time==cur.strftime("%H:%M")).first():
                    db.add(Slot(doctor_id=user.id, date=day_str,
                                start_time=cur.strftime("%H:%M"), end_time=slot_end.strftime("%H:%M")))
                    created += 1
                cur = slot_end
    db.commit()
    return {"created": created}

@router.delete("/slots/bulk-delete")
def bulk_delete_slots(date: str, user: User=Depends(require_doctor), db: Session=Depends(get_db)):
    slots = db.query(Slot).filter(Slot.doctor_id==user.id, Slot.date==date, Slot.is_booked==False).all()
    count = len(slots)
    for s in slots: db.delete(s)
    db.commit()
    return {"deleted": count}

@router.delete("/slots/{slot_id}")
def delete_slot(slot_id: int, user: User=Depends(require_doctor), db: Session=Depends(get_db)):
    slot = db.query(Slot).filter(Slot.id==slot_id, Slot.doctor_id==user.id).first()
    if not slot: raise HTTPException(status_code=404, detail="Slot not found")
    if slot.is_booked: raise HTTPException(status_code=400, detail="Cannot delete a booked slot. Cancel the appointment first.")
    db.delete(slot); db.commit()
    return {"message": "Slot deleted"}

@router.put("/appointments/{appt_id}")
def update_appointment(appt_id: int, data: AppointmentUpdate,
                       user: User=Depends(require_doctor), db: Session=Depends(get_db)):
    appt = db.query(Appointment).filter(Appointment.id==appt_id, Appointment.doctor_id==user.id).first()
    if not appt: raise HTTPException(status_code=404, detail="Appointment not found")
    if data.status is not None:
        if data.status not in {"confirmed","completed","cancelled","no_show"}:
            raise HTTPException(status_code=400, detail="Invalid status")
        if data.status in ("cancelled","no_show") and appt.slot:
            appt.slot.is_booked = False
        appt.status = data.status
    if data.notes is not None: appt.notes = data.notes
    if data.prescription is not None: appt.prescription = data.prescription
    db.commit()
    return {"message": "Updated", "status": appt.status}

# ── Public doctor profile — MUST be last ──────────────────────────────────────

@router.get("/{doctor_id}")
def get_doctor(doctor_id: int, db: Session=Depends(get_db)):
    user = db.query(User).filter(User.id==doctor_id, User.role=="doctor").first()
    if not user: raise HTTPException(status_code=404, detail="Doctor not found")
    p = user.doctor_profile
    reviews = db.query(Review).filter(Review.doctor_id==doctor_id).order_by(Review.created_at.desc()).limit(10).all()
    review_list = []
    for r in reviews:
        patient = db.query(User).filter(User.id==r.patient_id).first()
        review_list.append({"rating": r.rating, "comment": r.comment,
            "patient_name": patient.name if patient else "Anonymous",
            "created_at": r.created_at.isoformat()})
    return {"id": user.id, "name": user.name, "email": user.email, "phone": user.phone,
        "profile": {"specialization": p.specialization if p else "",
            "qualification": p.qualification if p else "",
            "experience_years": p.experience_years if p else 0,
            "clinic_name": p.clinic_name if p else "",
            "clinic_address": p.clinic_address if p else "",
            "consultation_fee": p.consultation_fee if p else 0,
            "bio": p.bio if p else "",
            "available_days": p.available_days if p else "",
            "slot_duration_mins": p.slot_duration_mins if p else 30,
            "rating": p.rating if p else 0,
            "total_reviews": p.total_reviews if p else 0},
        "reviews": review_list}

@router.get("/{doctor_id}/slots")
def get_available_slots(doctor_id: int, date: Optional[str]=None, db: Session=Depends(get_db)):
    query = db.query(Slot).filter(Slot.doctor_id==doctor_id, Slot.is_blocked==False)
    if date: query = query.filter(Slot.date==date)
    else:
        today = datetime.utcnow().date().isoformat()
        query = query.filter(Slot.date>=today)
    slots = query.order_by(Slot.date, Slot.start_time).all()
    return [{"id": s.id, "date": s.date, "start_time": s.start_time,
             "end_time": s.end_time, "is_booked": s.is_booked} for s in slots]