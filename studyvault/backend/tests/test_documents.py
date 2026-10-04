import io

import pytest

from app.services.documents import InvalidDocument, extract_document
from scripts.sample_documents import cpu_scheduling_pptx, distributions_xlsx, sql_joins_docx, subnetting_md, tcp_udp_csv, tree_traversal_png
from tests.conftest import make_pdf, signup


def _post(client, headers, subject, filename, data, title="Uploaded document"):
    unit = subject.units[0]
    return client.post(
        "/api/resources",
        data={"title": title, "subject_id": subject.id, "unit_id": unit.id, "resource_type": "notes", "year": 2025, "description": "d", "tags": "x"},
        files={"file": (filename, data, "application/octet-stream")},
        headers=headers,
    )


@pytest.mark.parametrize(
    "filename, build, kind, needle, pages",
    [
        ("joins.docx", sql_joins_docx, "document", "LEFT OUTER JOIN", 0),
        ("sched.pptx", cpu_scheduling_pptx, "presentation", "Round Robin", 6),
        ("dist.xlsx", distributions_xlsx, "spreadsheet", "Poisson", 2),
        ("subnet.md", subnetting_md, "text", "/27", 0),
        ("tcp.csv", tcp_udp_csv, "spreadsheet", "Slow start", 0),
        ("tree.png", tree_traversal_png, "image", "", 0),
        ("notes.pdf", lambda: make_pdf("Paging and segmentation"), "pdf", "Paging", 1),
    ],
)
def test_extract_supported_formats(filename, build, kind, needle, pages):
    info = extract_document(io.BytesIO(build()), filename)
    assert info.kind == kind
    assert needle in info.text
    assert info.page_count == pages


@pytest.mark.parametrize(
    "filename, data",
    [
        ("virus.exe", b"MZ\x90\x00binary"),
        ("page.html", b"<script>alert(1)</script>"),
        ("logo.svg", b"<svg onload=alert(1)>"),
        ("renamed.docx", make_pdf("actually a pdf")),
        ("fake.png", b"not an image at all"),
        ("noext", b"hello"),
    ],
)
def test_rejects_unsupported_or_mismatched_files(filename, data):
    with pytest.raises(InvalidDocument):
        extract_document(io.BytesIO(data), filename)


def test_upload_word_and_search_by_its_text(client, subjects):
    h = signup(client, "nisha")
    res = _post(client, h, subjects["dbms"], "SQL Joins.docx", sql_joins_docx(), title="Joins cheat sheet")
    assert res.status_code == 201, res.text
    body = res.json()
    assert (body["file_type"], body["file_ext"]) == ("document", "docx")
    assert body["mime_type"].endswith("wordprocessingml.document")

    hits = client.get("/api/search", params={"q": "self join manager"}).json()["items"]
    assert hits and hits[0]["id"] == body["id"]

    f = client.get(f"/api/resources/{body['id']}/file")
    assert f.headers["content-type"].startswith("application/vnd.openxmlformats")
    assert f.content[:2] == b"PK"
    text = client.get(f"/api/resources/{body['id']}/text").json()
    assert "NATURAL JOIN" in text["text"] and text["truncated"] is False


def test_upload_image_and_reject_html(client, subjects):
    h = signup(client, "nisha")
    img = _post(client, h, subjects["dbms"], "diagram.png", tree_traversal_png())
    assert img.status_code == 201 and img.json()["file_type"] == "image"
    bad = _post(client, h, subjects["dbms"], "evil.html", b"<html><script>x</script></html>")
    assert bad.status_code == 422 and "Unsupported" in bad.json()["detail"]


def test_meta_lists_formats(client):
    formats = client.get("/api/meta").json()["formats"]
    assert formats["pptx"]["kind"] == "presentation" and "exe" not in formats
