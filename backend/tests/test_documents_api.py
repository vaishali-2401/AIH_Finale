from tests.conftest import FakeAI, upload


def test_health_without_api_key(make_client):
    body = make_client().get("/api/health").json()
    assert body == {
        "status": "ok",
        "ai_enabled": False,
        "tts": "browser",
        "model": None,
        "documents": 0,
    }


def test_upload_indexes_documents_in_keyword_mode_without_ai(make_client, sample_pdfs):
    client = make_client()
    results = upload(client, sample_pdfs["travel"], sample_pdfs["food"])["results"]
    assert [r["error"] for r in results] == [None, None]

    docs = client.get("/api/documents").json()
    assert {d["title"] for d in docs} == {"Riviera Travel Guide", "Taste of Provence"}
    assert all(d["status"] == "ready" and d["search_mode"] == "keyword" for d in docs)
    assert all(d["page_count"] == 1 for d in docs)


def test_upload_with_ai_creates_semantic_index(make_client, sample_pdfs):
    client = make_client(ai=FakeAI())
    doc = upload(client, sample_pdfs["travel"])["results"][0]["document"]
    assert client.get(f"/api/documents/{doc['id']}").json()["search_mode"] == "semantic"


def test_embedding_failure_falls_back_to_keyword_search(make_client, sample_pdfs):
    client = make_client(ai=FakeAI(fail=True))
    doc_id = upload(client, sample_pdfs["travel"])["results"][0]["document"]["id"]
    doc = client.get(f"/api/documents/{doc_id}").json()
    assert doc["status"] == "ready"
    assert doc["search_mode"] == "keyword"
    assert "keyword search only" in doc["error"]


def test_duplicate_uploads_are_detected_by_content(make_client, sample_pdfs):
    client = make_client()
    first = upload(client, sample_pdfs["travel"])["results"][0]
    files = [("files", ("renamed.pdf", sample_pdfs["travel"].read_bytes(), "application/pdf"))]
    second = client.post("/api/documents", files=files).json()["results"][0]
    assert second["duplicate"] is True
    assert second["document"]["id"] == first["document"]["id"]
    assert len(client.get("/api/documents").json()) == 1


def test_rejects_non_pdf_and_path_traversal_names(make_client):
    client = make_client()
    files = [
        ("files", ("notes.txt", b"hello", "text/plain")),
        ("files", ("../../evil.pdf", b"also not a pdf", "application/pdf")),
    ]
    results = client.post("/api/documents", files=files).json()["results"]
    assert [r["error"] for r in results] == ["Not a PDF file", "Not a PDF file"]
    assert results[1]["filename"] == "evil.pdf"


def test_unreadable_pdf_is_marked_failed(make_client):
    client = make_client()
    files = [("files", ("broken.pdf", b"%PDF-1.7 garbage", "application/pdf"))]
    doc = client.post("/api/documents", files=files).json()["results"][0]["document"]
    detail = client.get(f"/api/documents/{doc['id']}").json()
    assert detail["status"] == "failed"
    assert detail["error"]


def test_get_file_outline_and_delete(make_client, sample_pdfs):
    client = make_client()
    doc_id = upload(client, sample_pdfs["food"])["results"][0]["document"]["id"]

    pdf = client.get(f"/api/documents/{doc_id}/file")
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content == sample_pdfs["food"].read_bytes()
    assert pdf.headers["content-disposition"].startswith("inline")

    outline = client.get(f"/api/documents/{doc_id}").json()["outline"]
    assert [o["title"] for o in outline] == ["Provencal Cuisine", "Wine Regions"]

    assert client.delete(f"/api/documents/{doc_id}").status_code == 204
    assert client.get(f"/api/documents/{doc_id}").status_code == 404
    assert client.get(f"/api/documents/{doc_id}/file").status_code == 404


def test_invalid_document_ids_are_rejected(make_client):
    client = make_client()
    assert client.get("/api/documents/not-a-valid-id").status_code == 422
    assert client.get("/api/documents/0123456789abcdef").status_code == 404


def test_keyword_documents_upgrade_when_ai_becomes_available(make_client, sample_pdfs, tmp_path):
    data_dir = tmp_path / "shared"
    client = make_client(data_dir=data_dir)
    doc_id = upload(client, sample_pdfs["travel"])["results"][0]["document"]["id"]
    assert client.get(f"/api/documents/{doc_id}").json()["search_mode"] == "keyword"

    # Restart with an API key: startup re-indexes keyword-only documents.
    client = make_client(ai=FakeAI(), data_dir=data_dir)
    assert client.get(f"/api/documents/{doc_id}").json()["search_mode"] == "semantic"
