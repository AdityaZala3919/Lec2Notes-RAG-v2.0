import re
from typing import IO

import pdfplumber
from fastapi import UploadFile, HTTPException


def load_txt(file: IO) -> str:
    """
    Load plain text files (.txt)
    """
    try:
        return file.read().decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail="Unable to decode TXT file. Ensure it is UTF-8 encoded."
        )


def load_pdf(file: IO) -> str:
    """
    Load PDF files using pdfplumber
    """
    text = ""

    try:
        with pdfplumber.open(file) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Failed to read PDF file."
        )

    if not text.strip():
        raise HTTPException(
            status_code=400,
            detail="No readable text found in PDF."
        )

    return text.strip()


def load_srt(file: IO) -> str:
    """
    Load and clean SRT subtitle files
    """
    try:
        content = file.read().decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail="Unable to decode SRT file. Ensure it is UTF-8 encoded."
        )

    # Remove subtitle index + timestamps
    content = re.sub(
        r"\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s-->\s\d{2}:\d{2}:\d{2},\d{3}",
        "",
        content
    )

    # Remove extra blank lines
    content = re.sub(r"\n{2,}", "\n", content)

    cleaned_text = content.strip()

    if not cleaned_text:
        raise HTTPException(
            status_code=400,
            detail="No readable text found in SRT file."
        )

    return cleaned_text


def load_transcript(file: UploadFile) -> str:
    """
    Detect file type and load transcript text safely
    """
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file has no filename."
        )

    filename = file.filename.lower()

    # Reset stream pointer (IMPORTANT)
    file.file.seek(0)

    if filename.endswith(".txt"):
        return load_txt(file.file)

    elif filename.endswith(".pdf"):
        return load_pdf(file.file)

    elif filename.endswith(".srt"):
        return load_srt(file.file)

    else:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file format. Allowed formats: .txt, .pdf, .srt"
        )
