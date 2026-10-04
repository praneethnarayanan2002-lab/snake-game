import logging
import re
from dataclasses import dataclass
from typing import BinaryIO

from pypdf import PdfReader
from pypdf.errors import PdfReadError

log = logging.getLogger(__name__)

# Enough for keyword search without bloating rows on 500-page textbooks.
MAX_TEXT_CHARS = 400_000


@dataclass
class PdfInfo:
    page_count: int
    text: str


class InvalidPdf(ValueError):
    pass


def extract_pdf(fileobj: BinaryIO) -> PdfInfo:
    fileobj.seek(0)
    if fileobj.read(5) != b"%PDF-":
        raise InvalidPdf("File is not a PDF")
    fileobj.seek(0)
    try:
        reader = PdfReader(fileobj)
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception as exc:  # noqa: BLE001
                raise InvalidPdf("Password-protected PDFs are not supported") from exc
        pages = len(reader.pages)
    except PdfReadError as exc:
        raise InvalidPdf("PDF appears to be corrupted") from exc

    chunks: list[str] = []
    total = 0
    for page in reader.pages:
        try:
            chunk = page.extract_text() or ""
        except Exception:  # noqa: BLE001 - a single bad page shouldn't fail the upload
            log.warning("Text extraction failed for a page", exc_info=True)
            continue
        chunks.append(chunk)
        total += len(chunk)
        if total >= MAX_TEXT_CHARS:
            break
    fileobj.seek(0)
    text = re.sub(r"[ \t\x00]+", " ", "\n".join(chunks))[:MAX_TEXT_CHARS]
    return PdfInfo(page_count=pages, text=text.strip())
