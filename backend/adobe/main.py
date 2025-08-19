import fitz  # PyMuPDF
import json
import re
import chromadb
import google.generativeai as genai
import os

# --- Helper functions are kept internal to this module ---

def _extract_blocks(pdf: fitz.Document) -> list:
    """Helper function to extract all text blocks from a PDF."""
    all_blocks = []
    for page_num, page in enumerate(pdf):
        for block in page.get_text("blocks"):
            all_blocks.append({
                "page_num": page_num,
                "bbox": [round(c, 2) for c in block[:4]],
                "text": block[4]
            })
    return all_blocks

def _create_chunks(pdf: fitz.Document, all_blocks: list, outline: list) -> list:
    """Helper function to create precisely chunked content based on H1 headings."""
    h1_items = [item for item in outline if item.get("level") in ["H1"]]
    
    # Fallback case: If no H1 headings, treat the whole document as one chunk.
    if not h1_items:
        full_text = " ".join([block['text'].strip() for block in all_blocks])
        all_bboxes = [block['bbox'] for block in all_blocks]
        return [{
            "section_title": "Full Document", 
            "content": full_text, 
            "page_range": [0, len(pdf) - 1], 
            "chunk_bboxes": all_bboxes
        }]

    # Find the precise location of each H1 heading
    h1_positions = []
    for h1 in h1_items:
        h1_text = h1['text'].strip()
        page_num_for_h1 = h1.get('page', 0)
        search_results = pdf[page_num_for_h1].search_for(h1_text)
        if not search_results: continue

        heading_rect = search_results[0]
        for i, block in enumerate(all_blocks):
            if block['page_num'] == page_num_for_h1 and fitz.Rect(block['bbox']).contains(heading_rect):
                h1_positions.append({
                    "text": h1_text, "page_num": page_num_for_h1,
                    "block_index": i, "block_text": block['text']
                })
                break
    
    h1_positions.sort(key=lambda x: x['block_index'])
    
    # Create chunks based on the space between H1 headings
    initial_chunks = []
    for i in range(len(h1_positions)):
        current_h1 = h1_positions[i]
        start_block_idx = current_h1['block_index']
        end_block_idx = h1_positions[i + 1]['block_index'] if i + 1 < len(h1_positions) else len(all_blocks)
        
        chunk_blocks = all_blocks[start_block_idx:end_block_idx]
        chunk_bboxes = [block['bbox'] for block in chunk_blocks]
        
        try:
            _, content_after_heading = current_h1['block_text'].split(current_h1['text'], 1)
            first_block_content = content_after_heading
        except ValueError:
            first_block_content = current_h1['block_text']

        remaining_blocks = all_blocks[start_block_idx + 1 : end_block_idx]
        remaining_content = " ".join([block['text'].strip() for block in remaining_blocks])
        
        full_content = re.sub(r'\s+', ' ', (first_block_content.strip() + " " + remaining_content).strip())
        
        start_page = current_h1['page_num']
        end_page = all_blocks[end_block_idx - 1]['page_num'] if end_block_idx > start_block_idx else start_page

        initial_chunks.append({
            "section_title": current_h1["text"], 
            "content": full_content,
            "page_range": [start_page, end_page], 
            "chunk_bboxes": chunk_bboxes
        })
    return initial_chunks


# --- Main public function ---

def process_and_embed(pdf_path: str, data_variable: dict, db_collection):
    """
    Processes a single PDF, embeds its chunks using the Gemini API,
    and stores them in the provided ChromaDB collection.
    
    Args:
        pdf_path: The file path to the PDF.
        data_variable: A dictionary containing metadata like the outline.
        db_collection: The initialized ChromaDB collection object from the main app.
    """
    if not db_collection:
        print("Error: ChromaDB collection was not provided.")
        return

    print(f"\n--- Processing file: {os.path.basename(pdf_path)} ---")
    pdf_filename = data_variable.get('filename', os.path.basename(pdf_path))
    outline = data_variable.get('outline', [])
    
    try:
        with fitz.open(pdf_path) as pdf:
            all_blocks = _extract_blocks(pdf)
            initial_chunks = _create_chunks(pdf, all_blocks, outline)
    except Exception as e:
        print(f"Error processing PDF file at {pdf_path}: {e}")
        return

    if not initial_chunks:
        print("No chunks were created. Nothing to add to the database.")
        return

    texts_to_embed = [chunk['content'] for chunk in initial_chunks]
    
    print(f"Embedding {len(texts_to_embed)} chunks with Gemini...")
    result = genai.embed_content(
        model="models/text-embedding-004",
        content=texts_to_embed,
        task_type="RETRIEVAL_DOCUMENT"
    )
    embeddings = result['embedding']
    
    metadatas = [{
        'document': pdf_filename, 
        'section_title': chunk['section_title'], 
        'page_range': str(chunk['page_range']),
        'chunk_bboxes': str(chunk['chunk_bboxes'])
    } for chunk in initial_chunks]
    ids = [f"{pdf_filename}_chunk_{i}" for i in range(len(initial_chunks))]

    db_collection.add(documents=texts_to_embed, metadatas=metadatas, ids=ids, embeddings=embeddings)
    
    print(f"✅ Successfully added {len(ids)} chunks for '{pdf_filename}'.")
    print(f"Database now contains {db_collection.count()} total chunks.")