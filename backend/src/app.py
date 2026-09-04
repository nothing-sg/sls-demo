from fastapi import FastAPI
from mangum import Mangum

from audit.api import router as audit_router
from patients.api import router as patients_router
from scheduling.api import router as scheduling_router
from shared.config import get_settings
from shared.logging import configure_logging

configure_logging(get_settings().log_level)

app = FastAPI(
    title="sls-best-practice API",
    version="0.1.0",
    description="Serverless modular monolith — see AGENTS.md for module boundaries.",
)

app.include_router(patients_router)
app.include_router(scheduling_router)
app.include_router(audit_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# Lambda entrypoint (see infra/modules/api.yaml — Handler: app.handler)
handler = Mangum(app)
