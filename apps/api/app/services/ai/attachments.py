"""Chat attachments — images and documents the user drops into Aladin.

Images go to the model as vision input (Anthropic-style image blocks, translated per
provider); documents are turned into text here (PDF, Excel, CSV, JSON, Markdown, plain
text) and appended to the user's message. Nothing is stored as a file: the extracted text
(capped) is what ends up in the conversation history, so later turns can still refer to
"the sheet I sent".
"""

from __future__ import annotations

import base64
import csv
import io
import json
import re
import uuid
from typing import Any, Optional

from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.models.media import Media

MAX_ATTACHMENTS = 5
MAX_BYTES = 8 * 1024 * 1024
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_TEXT_CHARS = 24_000  # per document, what the model sees this turn
STORED_TEXT_CHARS = 4_000  # per document, what is kept in history

IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
TEXT_TYPES = {"text/plain", "text/markdown", "text/csv", "application/json", "text/tab-separated-values"}
EXCEL_TYPES = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
}
PDF_TYPES = {"application/pdf"}


class AttachmentIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    mime: str = Field(min_length=1, max_length=120)
    data: str = Field(min_length=1, description="base64 (no data: prefix)")
    size: Optional[int] = None


def _guess_mime(name: str, mime: str) -> str:
    m = (mime or "").split(";")[0].strip().lower()
    if m and m != "application/octet-stream":
        return m
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    return {
        "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "gif": "image/gif",
        "pdf": "application/pdf", "csv": "text/csv", "tsv": "text/tab-separated-values", "txt": "text/plain",
        "md": "text/markdown", "json": "application/json",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xls": "application/vnd.ms-excel",
    }.get(ext, m or "application/octet-stream")


def _decode(att: AttachmentIn) -> bytes:
    raw = att.data
    if raw.startswith("data:"):
        raw = raw.split(",", 1)[-1]
    try:
        data = base64.b64decode(raw, validate=False)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Attachment '{att.name}' is not valid base64") from exc
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"Attachment '{att.name}' is larger than {MAX_BYTES // (1024 * 1024)} MB")
    return data


def _pdf_text(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:  # pragma: no cover
        return "(PDF text extraction is not available on this server)"
    reader = PdfReader(io.BytesIO(data))
    parts: list[str] = []
    total = 0
    for i, page in enumerate(reader.pages[:40], start=1):
        try:
            t = page.extract_text() or ""
        except Exception:  # noqa: BLE001
            t = ""
        t = re.sub(r"[ \t]+", " ", t).strip()
        if t:
            parts.append(f"--- page {i} ---\n{t}")
            total += len(t)
        if total > MAX_TEXT_CHARS:
            break
    return "\n".join(parts) if parts else "(no extractable text — the PDF may be scanned; send it as an image instead)"


def _excel_text(data: bytes) -> str:
    try:
        from openpyxl import load_workbook
    except ImportError:  # pragma: no cover
        return "(Excel extraction is not available on this server)"
    wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    parts: list[str] = []
    total = 0
    for ws in wb.worksheets[:6]:
        parts.append(f"--- sheet: {ws.title} ---")
        for r_i, row in enumerate(ws.iter_rows(values_only=True), start=1):
            if r_i > 500:
                parts.append("… (more rows)")
                break
            cells = ["" if v is None else str(v) for v in row]
            if any(c.strip() for c in cells):
                line = " | ".join(cells).rstrip(" |")
                parts.append(line)
                total += len(line)
            if total > MAX_TEXT_CHARS:
                parts.append("… (truncated)")
                break
        if total > MAX_TEXT_CHARS:
            break
    return "\n".join(parts)


def _plain_text(data: bytes, mime: str) -> str:
    text = data.decode("utf-8", errors="replace")
    if mime == "text/csv":
        rows = list(csv.reader(io.StringIO(text)))
        return "\n".join(" | ".join(r) for r in rows[:800])
    if mime == "application/json":
        try:
            return json.dumps(json.loads(text), ensure_ascii=False, indent=1)
        except json.JSONDecodeError:
            return text
    return text


def build_user_content(
    message: str,
    attachments: list[AttachmentIn],
    *,
    db: Optional[Session] = None,
    company_id: Optional[str] = None,
    uploaded_by: str = "chat",
) -> tuple[Any, str, list[dict]]:
    """→ (content for the model, text to store in history, attachment summaries).

    The model content is a plain string when there are no attachments (unchanged behaviour),
    otherwise an Anthropic-style block list: one text block (message + extracted document
    text) followed by image blocks.

    When `db`/`company_id` are given, every attached image is also saved to the media library
    (folder "Chat Uploads") and its media_id is included in the text the model sees — so a
    follow-up like "change the background of this image" can be answered with
    edit_product_image(source_media_id=<that id>) instead of the model having no way to name
    an image it was only shown, never given an id for.
    """
    if not attachments:
        return message, message, []
    if len(attachments) > MAX_ATTACHMENTS:
        raise HTTPException(status_code=400, detail=f"At most {MAX_ATTACHMENTS} attachments per message")

    doc_texts: list[str] = []
    image_notes: list[str] = []
    stored_notes: list[str] = []
    image_blocks: list[dict] = []
    summaries: list[dict] = []
    for att in attachments:
        mime = _guess_mime(att.name, att.mime)
        data = _decode(att)
        size = len(data)
        if mime in IMAGE_TYPES:
            if size > MAX_IMAGE_BYTES:
                raise HTTPException(status_code=413, detail=f"Image '{att.name}' is larger than {MAX_IMAGE_BYTES // (1024 * 1024)} MB")
            image_blocks.append({"type": "image", "source": {"type": "base64", "media_type": mime, "data": base64.b64encode(data).decode("ascii")}})
            media_id = _save_chat_image(db, company_id=company_id, name=att.name, mime=mime, data=data, uploaded_by=uploaded_by)
            note = f"[Image attached: {att.name}" + (
                f" — media_id: {media_id} (use this exact id as source_media_id if asked to edit this image)]" if media_id else "]"
            )
            image_notes.append(note)
            stored_notes.append(note)
            summaries.append({"name": att.name, "kind": "image", "mime": mime, "size": size, "media_id": media_id})
            continue
        if mime in PDF_TYPES:
            text = _pdf_text(data)
        elif mime in EXCEL_TYPES:
            text = _excel_text(data)
        elif mime in TEXT_TYPES or mime.startswith("text/"):
            text = _plain_text(data, mime)
        else:
            raise HTTPException(status_code=415, detail=f"'{att.name}' ({mime}) is not supported. Send images, PDF, Excel, CSV, JSON, Markdown or text files.")
        text = text.strip()
        if len(text) > MAX_TEXT_CHARS:
            text = text[:MAX_TEXT_CHARS] + "\n… (truncated)"
        doc_texts.append(f"===== Attached file: {att.name} ({mime}, {size:,} bytes) =====\n{text}\n===== end of {att.name} =====")
        stored_notes.append(f"[File attached: {att.name}]\n{text[:STORED_TEXT_CHARS]}{'…' if len(text) > STORED_TEXT_CHARS else ''}")
        summaries.append({"name": att.name, "kind": "document", "mime": mime, "size": size, "chars": len(text)})

    model_text = message.strip() or ("Please look at the attached " + ("image(s)." if image_blocks and not doc_texts else "file(s)."))
    if image_notes:
        model_text = model_text + "\n\n" + "\n".join(image_notes)
    if doc_texts:
        model_text = model_text + "\n\n" + "\n\n".join(doc_texts)
    if db is not None:
        db.flush()
    content: list[dict] = [{"type": "text", "text": model_text}] + image_blocks
    stored = (message.strip() + "\n\n" if message.strip() else "") + "\n".join(stored_notes)
    return content, stored, summaries


def _save_chat_image(db: Optional[Session], *, company_id: Optional[str], name: str, mime: str, data: bytes, uploaded_by: str) -> Optional[str]:
    """Best-effort: an attached image that cannot be saved to the media library still reaches
    the model as vision input — it just cannot later be named as an edit source by id."""
    if db is None or not company_id:
        return None
    try:
        from app.services.media_storage import save_media_bytes  # local import: avoids a cycle at module load

        media_id = str(uuid.uuid4())
        stored_name = f"{media_id}_{re.sub(r'[^a-zA-Z0-9._-]', '_', name) or 'upload'}"
        public_url, local_path, provider = save_media_bytes(db, stored_name, data, mime)
        row = Media(
            id=media_id,
            company_id=company_id,
            name=name,
            title=name.rsplit(".", 1)[0][:255],
            folder="Chat Uploads",
            url=public_url,
            media_type="image",
            mime_type=mime,
            size_kb=max(1, len(data) // 1024),
            alt=name,
            local_path=local_path,
            imported_by="chat",
            provider=provider,
            uploaded_by=uploaded_by,
            title_linked_to_name=True,
            alt_linked_to_name=True,
        )
        db.add(row)
        return media_id
    except Exception:  # noqa: BLE001 — never let a media-library hiccup break the chat turn
        return None
