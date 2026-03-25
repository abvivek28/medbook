from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db, Appointment, Slot, User, Review, DoctorProfile
from auth_utils import get_current_user, require_patient

router = APIRouter()

class BookAppointment(BaseModel):
    slot_id: int
    reason: str = ""

class SubmitReview(BaseModel):
    appointment_id: int
    rating: int
    comment: str = ""

@router.post("/book")
def book_appointment(req: BookAppointment, user: User = Depends(require_patient), db: Session = Depends(get_db)):
    slot = db.query(Slot).filter(Slot.id == req.slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    if slot.is_booked or slot.is_blocked:
        raise HTTPException(status_code=400, detail="Slot not available")
    # Check patient doesn't already have appointment with same doctor same day
    existing = db.query(Appointment).join(Slot).filter(
        Appointment.patient_id == user.id,
        Appointment.doctor_id == slot.doctor_id,
        Slot.date == slot.date,
        Appointment.status == "confirmed"
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="You already have an appointment with this doctor on this day")

    appt = Appointment(slot_id=slot.id, doctor_id=slot.doctor_id, patient_id=user.id, reason=req.reason)
    slot.is_booked = True
    db.add(appt)
    db.commit()
    db.refresh(appt)
    return {"id": appt.id, "status": appt.status, "message": "Appointment booked successfully"}

@router.get("/my")
def my_appointments(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role == "patient":
        appts = db.query(Appointment).filter(Appointment.patient_id == user.id).order_by(Appointment.created_at.desc()).all()
    else:
        appts = db.query(Appointment).filter(Appointment.doctor_id == user.id).order_by(Appointment.created_at.desc()).all()
    result = []
    for a in appts:
        reviewed = db.query(Review).filter(Review.appointment_id == a.id).first() is not None
        result.append({
            "id": a.id, "status": a.status, "reason": a.reason,
            "notes": a.notes, "prescription": a.prescription,
            "created_at": a.created_at.isoformat(), "reviewed": reviewed,
            "slot": {"date": a.slot.date, "start_time": a.slot.start_time, "end_time": a.slot.end_time} if a.slot else None,
            "doctor": {"id": a.doctor.id, "name": a.doctor.name} if a.doctor else None,
            "patient": {"id": a.patient.id, "name": a.patient.name} if a.patient else None,
        })
    return result

@router.put("/{appt_id}/cancel")
def cancel_appointment(appt_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role == "patient":
        appt = db.query(Appointment).filter(Appointment.id == appt_id, Appointment.patient_id == user.id).first()
    else:
        appt = db.query(Appointment).filter(Appointment.id == appt_id, Appointment.doctor_id == user.id).first()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if appt.status not in ("confirmed",):
        raise HTTPException(status_code=400, detail="Cannot cancel this appointment")
    appt.status = "cancelled"
    if appt.slot:
        appt.slot.is_booked = False
    db.commit()
    return {"message": "Cancelled"}

@router.post("/review")
def submit_review(req: SubmitReview, user: User = Depends(require_patient), db: Session = Depends(get_db)):
    if req.rating < 1 or req.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be 1-5")
    appt = db.query(Appointment).filter(Appointment.id == req.appointment_id, Appointment.patient_id == user.id).first()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if appt.status != "completed":
        raise HTTPException(status_code=400, detail="Can only review completed appointments")
    existing = db.query(Review).filter(Review.appointment_id == req.appointment_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already reviewed")
    review = Review(doctor_id=appt.doctor_id, patient_id=user.id, appointment_id=appt.id, rating=req.rating, comment=req.comment)
    db.add(review)
    # Update doctor rating
    dp = db.query(DoctorProfile).filter(DoctorProfile.user_id == appt.doctor_id).first()
    if dp:
        total_rating = dp.rating * dp.total_reviews + req.rating
        dp.total_reviews += 1
        dp.rating = round(total_rating / dp.total_reviews, 1)
    db.commit()
    return {"message": "Review submitted"}