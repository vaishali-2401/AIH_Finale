"""Document library endpoints: upload, list, fetch, delete, re-index."""

from __future__ import annotations

import hashlib
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Path, Response, UploadFile, status
from fastapi.responses import FileResponse

from app.db import DocumentRow
from app.deps import Services, get_services
from app.schemas import DocumentDetail, DocumentOut, UploadResponse, UploadResult

router = APIRouter(prefix="/api/documents", tags=["documents"])

DocId = Annotated[str, Path(pattern=r"^[0-9a-f]{16}$", description="Document id")]
Svc = Annotated[Services, Depends(get_services)]


def to_out(doc: DocumentRow) -> DocumentOut:
    return DocumentOut.model_validate(doc, from_attributes=True)


def _get_or_404(svc: Services, doc_id: str) -> DocumentRow:
    doc = svc.db.get_document(doc_id)
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return doc


@router.get("", response_model=list[DocumentOut], summary="List all documents")
def list_documents(svc: Svc) -> list[DocumentOut]:
    return [to_out(d) for d in svc.db.list_documents()]


@router.post("", response_model=UploadResponse, summary="Upload one or more PDFs")
def upload_documents(svc: Svc, files: Annotated[list[UploadFile], File()]) -> UploadResponse:
    """Stores each PDF and queues it for indexing.

    Files are identified by content hash, so re-uploading the same PDF (even
    under a different name) returns the existing document with
    ``duplicate=true`` instead of indexing it twice.
    """
    settings = svc.settings
    if len(files) > settings.max_files_per_upload:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Upload at most {settings.max_files_per_upload} files at a time",
        )
    max_bytes = settings.max_upload_mb * 1024 * 1024
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)

    results: list[UploadResult] = []
    for upload in files:
        name = (upload.filename or "document.pdf").replace("\\", "/").rsplit("/", 1)[-1]
        data = upload.file.read(max_bytes + 1)
        if len(data) > max_bytes:
            results.append(
                UploadResult(filename=name, error=f"File is larger than {settings.max_upload_mb} MB")
            )
            continue
        if b"%PDF-" not in data[:1024]:
            results.append(UploadResult(filename=name, error="Not a PDF file"))
            continue

        doc_id = hashlib.sha256(data).hexdigest()[:16]
        existing = svc.db.get_document(doc_id)
        if existing is not None:
            results.append(UploadResult(filename=name, document=to_out(existing), duplicate=True))
            continue

        svc.indexer.pdf_path(doc_id).write_bytes(data)
        doc = svc.db.insert_document(doc_id, name, len(data))
        svc.indexer.schedule(doc_id)
        results.append(UploadResult(filename=name, document=to_out(svc.db.get_document(doc_id) or doc)))
    return UploadResponse(results=results)


@router.get("/{doc_id}", response_model=DocumentDetail, summary="Document details and outline")
def get_document(svc: Svc, doc_id: DocId) -> DocumentDetail:
    return DocumentDetail.model_validate(_get_or_404(svc, doc_id), from_attributes=True)


@router.get(
    "/{doc_id}/file",
    response_class=FileResponse,
    summary="Download the PDF",
    responses={200: {"content": {"application/pdf": {}}}},
)
def get_document_file(svc: Svc, doc_id: DocId) -> FileResponse:
    doc = _get_or_404(svc, doc_id)
    path = svc.indexer.pdf_path(doc_id)
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "PDF file is missing on the server")
    return FileResponse(
        path, media_type="application/pdf", filename=doc.filename, content_disposition_type="inline"
    )


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a document")
def delete_document(svc: Svc, doc_id: DocId) -> Response:
    _get_or_404(svc, doc_id)
    svc.db.delete_document(doc_id)
    svc.indexer.pdf_path(doc_id).unlink(missing_ok=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{doc_id}/reindex",
    response_model=DocumentOut,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Process a document again",
)
def reindex_document(svc: Svc, doc_id: DocId) -> DocumentOut:
    _get_or_404(svc, doc_id)
    svc.indexer.schedule(doc_id)
    return to_out(_get_or_404(svc, doc_id))
