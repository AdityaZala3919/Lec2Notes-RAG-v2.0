"""
Endpoints:
/documents/upload
/sessions/create
/formats
/generate-notes
/chat
/download/pdf
/download/markdown
/api/health
/api/formats
/api/documents
"""

import os
import uuid
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv
from enum import Enum
from markdown_pdf import MarkdownPdf, Section
from fastapi import FastAPI, UploadFile, File, Form, Query, Request
from fastapi.responses import RedirectResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from database import documents_col, sessions_col
from rag_pipeline import (
    generate_notes,
    store_document,
    load_retriever,
    chat_with_transcript
)
from transcript_loader import load_transcript
from prompts import get_prompt_template

class NotesFormat(str, Enum):
    type_1 = "Detailed Structured Study Notes"
    type_2 = "Conceptual Mind Map Style"
    type_3 = "Step-by-Step Explanation"
    type_4 = "Comparison Table"
    type_5 = "Key Terms and Definitions"
    type_6 = "Flashcard Style"
    type_7 = "Formula + Concept Sheet"
    type_8 = "Topic Clusters"
    type_9 = "Cause and Effect Notes"
    type_10 = "Exam-Ready Highlights"
    type_11 = "Practical Applications"
    type_12 = "Pros and Cons"
    type_13 = "Problem-Solution Format"
    type_14 = "Explainer with Analogies"
    type_15 = "Highlight + Expand"
    type_16 = "Quick Review Cheat Sheet"
    type_17 = "Custom Template"

load_dotenv()
app = FastAPI()

# Configure CORS to allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Path to frontend (supports both React build and static HTML)
FRONTEND_DIR = Path(__file__).parent / "frontend" / "dist"
FRONTEND_STATIC = Path(__file__).parent / "frontend"  # For static HTML/CSS/JS

uploaded_transcript_text: str = ""
selected_formats = {}
notes_download: str = ""


# ============ API ENDPOINTS ============

@app.get("/api/health")
def api_health():
    return {"ok": True}


@app.get("/api/formats")
def get_formats():
    """Return all available notes formats for the frontend to display."""
    return {
        "formats": [
            {"key": e.name, "label": e.value}
            for e in NotesFormat
        ]
    }


@app.get("/api/documents")
def list_documents(username: str = Query(...)):
    """List all documents uploaded by a user."""
    docs = list(documents_col.find({"username": username}))
    return {
        "documents": [
            {
                "document_id": str(doc["_id"]),
                "title": doc.get("title", "Untitled"),
                "content_type": doc.get("content_type", ""),
                "created_at": doc.get("created_at", "").isoformat() if doc.get("created_at") else None
            }
            for doc in docs
        ]
    }


@app.get("/health")
def test():
    return {"status": "Ok"}

@app.post("/documents/upload")
def upload_file(
    username: str = Form(...),
    file: UploadFile = File(...)
):
    text = load_transcript(file)

    document_id = store_document(
        username=username,
        title=file.filename,
        content_type=file.content_type,
        transcript_text=text
    )

    return {
        "document_id": document_id,
        "filename": file.filename,
        "content_type": file.content_type,
        "text": text,
        "text_length": len(text)
    }

@app.post("/sessions/create")
def create_session(
    username: str = Form(...),
    document_id: str = Form(...)
):
    session_id = str(uuid.uuid4())
    sessions_col.insert_one({
        "_id": session_id,
        "username": username,
        "document_id": document_id,
        "created_at": datetime.now()
    })

    return {
        "session_id": session_id,
        "document_id": document_id
    }

@app.post("/formats")
def select_formats(
    session_id: str = Form(...),
    notes_format: str = Form(...),  # Accept as string and convert manually
    custom_format: str | None = Form(None)
):
    # Convert string to enum
    try:
        format_enum = NotesFormat[notes_format] if notes_format in NotesFormat.__members__ else None
        if not format_enum:
            return {"error": f"Invalid format: {notes_format}"}
    except (KeyError, ValueError):
        return {"error": f"Invalid format: {notes_format}"}
    
    if format_enum == NotesFormat.type_17 and not custom_format:
        return {
            "error": "Custom format is required when using Custom Template"
        }

    if format_enum != NotesFormat.type_17:
        custom_format = None

    selected_formats[session_id] = {
        "notes_format": format_enum,
        "custom_prompt": custom_format
    }

    return {
        "message": "Format selected successfully",
        "notes_format": format_enum.value,
        "custom_format": custom_format
    }


@app.post("/generate-notes")
def generate_notes_endpoint(
    session_id: str = Form(...)
):
    global notes_download
    if session_id not in selected_formats:
        return {"error": "Please select a notes format first using /formats"}
    
    data = selected_formats[session_id]
    notes_format = data["notes_format"]
    custom_format = data["custom_prompt"]

    session = sessions_col.find_one({"_id": session_id})
    if not session:
        return {"error": "Invalid session"}

    prompt_template = get_prompt_template(notes_format, custom_format)

    notes = generate_notes(document_id=session["document_id"],
                           username=session["username"],
                           prompt_template=prompt_template,
                           chunk_size=1000,
                           chunk_overlap=200,
                           retriever_k=5,
                           llm_temperature=0.7)
    
    notes_download = notes

    return {"notes": notes}

@app.post("/chat")
def chat(
    session_id: str = Form(...),
    question: str = Form(...)
):
    session = sessions_col.find_one({"_id": session_id})

    retriever = load_retriever(
        session["username"],
        session["document_id"]
    )

    answer = chat_with_transcript(
        user_query=question,
        session_id=session_id,
        retriever=retriever
    )

    return {"answer": answer}

@app.post("/download/pdf")
def download_pdf(
    pdfname: str = Form(...)
):
    global notes_download

    if not notes_download.strip():
        return {"error": "No notes available. Generate notes first"}

    out_path = f"{pdfname}.pdf"

    pdf = MarkdownPdf()
    pdf.add_section(Section(notes_download, toc=False))
    pdf.save(out_path)

    return FileResponse(path=out_path, media_type="application/pdf",
                        filename=os.path.basename(out_path))

@app.post("/download/markdown")
def download_markdown(
    mdname: str = Form(...)
):
    global notes_download

    if not notes_download.strip():
        return {"error": "No notes available. Generate notes first"}
    
    out_path = f"{mdname}.md"

    notes_download = notes_download.strip()

    with open(out_path, "w", encoding="utf-8") as buffer:
        buffer.write(notes_download)

    return FileResponse(path=out_path, media_type="text/markdown",
                        filename=os.path.basename(out_path))


# ============ FRONTEND SERVING ============

# Mount static assets from React build (if exists)
if FRONTEND_DIR.exists() and (FRONTEND_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")

# Mount static frontend files (CSS, JS) for plain HTML frontend
if FRONTEND_STATIC.exists():
    # Serve style.css and script.js
    @app.get("/style.css")
    def serve_css():
        css_file = FRONTEND_STATIC / "style.css"
        if css_file.exists():
            return FileResponse(path=css_file, media_type="text/css")
        return HTMLResponse(content="", status_code=404)
    
    @app.get("/script.js")
    def serve_js():
        js_file = FRONTEND_STATIC / "script.js"
        if js_file.exists():
            return FileResponse(path=js_file, media_type="application/javascript")
        return HTMLResponse(content="", status_code=404)


@app.get("/{full_path:path}")
def serve_spa(request: Request, full_path: str):
    """
    Catch-all route for SPA.
    Serves index.html for any path not matched by API routes.
    """
    # Try React build first
    react_index = FRONTEND_DIR / "index.html"
    if react_index.exists():
        return HTMLResponse(content=react_index.read_text(encoding="utf-8"))
    
    # Try static HTML frontend
    static_index = FRONTEND_STATIC / "index.html"
    if static_index.exists():
        return HTMLResponse(content=static_index.read_text(encoding="utf-8"))
    
    # Fallback to docs if no frontend
    return RedirectResponse(url="/docs")