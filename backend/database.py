from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, Text, ForeignKey, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime

DATABASE_URL = "sqlite:///./medbook.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id            = Column(Integer, primary_key=True, index=True)
    name          = Column(String, nullable=False)
    email         = Column(String, unique=True, index=True, nullable=False)
    phone         = Column(String)
    password_hash = Column(String, nullable=False)
    role          = Column(String, nullable=False)   # "doctor" or "patient"
    profile_pic   = Column(String, default="")
    created_at    = Column(DateTime, default=datetime.utcnow)

    # uselist=False makes these scalar (single object), not a list
    doctor_profile  = relationship("DoctorProfile",  back_populates="user", uselist=False)
    patient_profile = relationship("PatientProfile", back_populates="user", uselist=False)


class DoctorProfile(Base):
    __tablename__    = "doctor_profiles"
    id               = Column(Integer, primary_key=True, index=True)
    user_id          = Column(Integer, ForeignKey("users.id"), unique=True)
    specialization   = Column(String, nullable=False)
    qualification    = Column(String)
    experience_years = Column(Integer, default=0)
    clinic_name      = Column(String)
    clinic_address   = Column(String)
    consultation_fee = Column(Float, default=0)
    bio              = Column(Text, default="")
    available_days   = Column(String, default="Mon,Tue,Wed,Thu,Fri")
    slot_duration_mins = Column(Integer, default=30)
    rating           = Column(Float, default=0)
    total_reviews    = Column(Integer, default=0)

    user = relationship("User", back_populates="doctor_profile")


class PatientProfile(Base):
    __tablename__     = "patient_profiles"
    id                = Column(Integer, primary_key=True, index=True)
    user_id           = Column(Integer, ForeignKey("users.id"), unique=True)
    age               = Column(Integer)
    gender            = Column(String)
    blood_group       = Column(String)
    allergies         = Column(Text, default="")
    medical_history   = Column(Text, default="")
    emergency_contact = Column(String)

    user = relationship("User", back_populates="patient_profile")


class Slot(Base):
    __tablename__ = "slots"
    id         = Column(Integer, primary_key=True, index=True)
    doctor_id  = Column(Integer, ForeignKey("users.id"))
    date       = Column(String, nullable=False)   # YYYY-MM-DD
    start_time = Column(String, nullable=False)   # HH:MM
    end_time   = Column(String, nullable=False)
    is_booked  = Column(Boolean, default=False)
    is_blocked = Column(Boolean, default=False)

    doctor = relationship("User", foreign_keys=[doctor_id])


class Appointment(Base):
    __tablename__ = "appointments"
    id          = Column(Integer, primary_key=True, index=True)
    slot_id     = Column(Integer, ForeignKey("slots.id"))
    doctor_id   = Column(Integer, ForeignKey("users.id"))
    patient_id  = Column(Integer, ForeignKey("users.id"))
    status      = Column(String, default="confirmed")  # confirmed/completed/cancelled/no_show
    notes       = Column(Text, default="")
    reason      = Column(Text, default="")
    prescription= Column(Text, default="")
    created_at  = Column(DateTime, default=datetime.utcnow)

    slot    = relationship("Slot")
    doctor  = relationship("User", foreign_keys=[doctor_id])
    patient = relationship("User", foreign_keys=[patient_id])


class Review(Base):
    __tablename__   = "reviews"
    id              = Column(Integer, primary_key=True, index=True)
    doctor_id       = Column(Integer, ForeignKey("users.id"))
    patient_id      = Column(Integer, ForeignKey("users.id"))
    appointment_id  = Column(Integer, ForeignKey("appointments.id"))
    rating          = Column(Integer)   # 1–5
    comment         = Column(Text, default="")
    created_at      = Column(DateTime, default=datetime.utcnow)


def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()