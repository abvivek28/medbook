import warnings
warnings.filterwarnings("ignore", ".*error reading bcrypt version.*")

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.exceptions import RequestValidationError
from contextlib import asynccontextmanager
import uvicorn, os
from database import init_db
from routers import auth, doctors, appointments, patients

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="MedBook API", version="1.0.0", lifespan=lifespan)

# ── Global 422 handler — logs the exact field errors and returns them clearly ──
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    # Print to server terminal so you can see exactly what failed
    print("\n⚠️  422 Validation error on", request.url)
    for e in errors:
        print(f"   field={e.get('loc')}  msg={e.get('msg')}  input={e.get('input')}")
    # Return a flat, readable message to the browser
    messages = []
    for e in errors:
        field = e["loc"][-1] if e.get("loc") else "unknown"
        messages.append(f"{field}: {e['msg']}")
    return JSONResponse(
        status_code=422,
        content={"detail": " | ".join(messages)},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,         prefix="/api/auth",         tags=["auth"])
app.include_router(doctors.router,      prefix="/api/doctors",      tags=["doctors"])
app.include_router(appointments.router, prefix="/api/appointments", tags=["appointments"])
app.include_router(patients.router,     prefix="/api/patients",     tags=["patients"])

# Serve frontend
frontend_path = os.path.join(os.path.dirname(__file__), "../frontend")
app.mount("/static", StaticFiles(directory=os.path.join(frontend_path, "static")), name="static")

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    with open(os.path.join(frontend_path, "templates/index.html"), encoding="utf-8") as f:
        return f.read()

@app.get("/{path:path}", response_class=HTMLResponse)
async def serve_page(path: str):
    file_path = os.path.join(frontend_path, "templates", f"{path}.html")
    if os.path.exists(file_path):
        with open(file_path, encoding="utf-8") as f:
            return f.read()
    with open(os.path.join(frontend_path, "templates/index.html"), encoding="utf-8") as f:
        return f.read()

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)