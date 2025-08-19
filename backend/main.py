import os
import io
import json
from fastapi import FastAPI, File, UploadFile, HTTPException, Request , Form
from fastapi.middleware.cors import CORSMiddleware
from typing import List
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from fastapi.concurrency import run_in_threadpool
from PIL import Image
import google.generativeai as genai
import chromadb
from chromadb.config import Settings
from podcast import generate_podcast_script

# --- Import your actual, functional modules ---
from a1 import process_single_pdf
from adobe.main import process_and_embed
from adobe.llm import create_padded_text, search_documents, save_results_to_file, filter_and_validate_results
from bulb import generate_insights_from_file
# --- 1. Configuration ---
load_dotenv()

# File/DB paths
# --- PRO-LEVEL FIX (Use this) ---

# Get the directory where main.py is located
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Define paths relative to the script's location
UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", os.path.join(BASE_DIR, "uploads"))
CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", os.path.join(BASE_DIR, "chroma_db"))
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "document_chunks")
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "mydb")
# --- ADDED: Define paths for the result and insight files ---
RESULTS_FILE_PATH = os.path.join(os.path.dirname(__file__), "results.jsonl")
BULB_FILE_PATH = os.path.join(os.path.dirname(__file__), "bulb.jsonl")

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# --- 2. FastAPI App Initialization ---
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development; restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 3. Startup Event to Initialize Clients ---
@app.on_event("startup")
async def startup_event():
    # ... (Your existing startup logic)
    app.state.mongo_client = AsyncIOMotorClient(MONGO_URI)
    app.state.db = app.state.mongo_client[DB_NAME]
    
    genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
    app.state.vision_model = genai.GenerativeModel('gemini-1.5-flash-latest')
    app.state.pro_model = genai.GenerativeModel('gemini-1.5-flash-latest')
    
    chroma_client = chromadb.Client(Settings(is_persistent=True, persist_directory=CHROMA_DB_PATH))
    app.state.collection = chroma_client.get_or_create_collection(name=COLLECTION_NAME)
    print("All clients and models initialized successfully.")

# --- 4. API Endpoints ---
@app.post("/upload_pdfs")
async def upload_pdfs(request: Request, files: List[UploadFile] = File(...)):
    # ... (Your existing upload logic)
    db = request.app.state.db
    collection = request.app.state.collection
    saved_files = []
    for file in files:
        file_path = os.path.join(UPLOAD_FOLDER, file.filename)
        with open(file_path, "wb") as f:
            f.write(await file.read())

        data = await run_in_threadpool(process_single_pdf, file_path)
        await run_in_threadpool(process_and_embed, file_path, data, collection)
        
        await db["pdfs"].insert_one({
            "filename": file.filename,
            "path": file_path
        })
        saved_files.append(file.filename)
    return {"message": f"{len(saved_files)} PDFs uploaded.", "files": saved_files}

# In main.py
# In main.py

# In main.py

@app.get("/list_pdfs")
async def list_pdfs(request: Request):
    """
    Queries MongoDB and returns a list of all available PDF filenames.
    """
    db = request.app.state.db
    pdf_cursor = db["pdfs"].find({}, {"_id": 0, "filename": 1})
    pdf_list = await pdf_cursor.to_list(length=None)
    return {"pdfs": [pdf['filename'] for pdf in pdf_list]}


from fastapi.responses import FileResponse

# --- CORRECTED ENDPOINT to fetch a PDF ---
@app.get("/get_pdf/{filename}")
async def get_pdf(request: Request, filename: str):
    """
    Fetches a specific PDF file by looking up its path in MongoDB.
    """
    db = request.app.state.db
    
    # Find the document in MongoDB that matches the filename
    pdf_document = await db["pdfs"].find_one({"filename": filename})
    
    if not pdf_document:
        raise HTTPException(status_code=404, detail="File not found in database.")

    # Get the verified file path from the database record
    file_path = pdf_document.get("path")

    if not file_path or not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File path not found or file does not exist on server.")

    return FileResponse(path=file_path, media_type='application/pdf', filename=filename)

@app.post("/extract_and_search/")
async def extract_and_search(
    request: Request, 
    image: UploadFile = File(...),
    text: str = Form(...)  # <-- ADDED: Accept text from the frontend
):
    vision_model = request.app.state.vision_model
    pro_model = request.app.state.pro_model
    collection = request.app.state.collection

    if not all([vision_model, pro_model, collection]):
        raise HTTPException(status_code=503, detail="Backend services unavailable.")

    if not image.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File is not an image.")

    try:
        contents = await image.read()
        image_part = {"mime_type": image.content_type, "data": contents}
        
        # Check if this is a mock screenshot (very small image) or real screenshot
        if len(contents) < 1000:  # Mock screenshot is very small
            print("📋 Mock screenshot detected, using text-based analysis")
            # For mock screenshots, just use the provided text directly
            extracted_text = text.strip()
        else:
            # Smart prompt that adapts to different use cases for real screenshots
            if "current page" in text.lower() or "analyze this page" in text.lower() or "generate insights" in text.lower():
                # Page analysis mode
                extraction_prompt = f"""
                Analyze the provided document page image and extract the key information.
                Focus on:
                1. Main topics and themes discussed
                2. Important facts, figures, or concepts
                3. Any headings or section titles
                4. Key sentences that summarize the content
                
                Return a comprehensive summary of the page content that captures the main ideas and important details.
                Do not add explanations or formatting, just the extracted content.

                Context: {text}
                """
            else:
                # Selected text analysis mode
                extraction_prompt = f"""
                Analyze the provided image and the accompanying text.
                The text represents content selected from the document in the image.
                Your task is to return a single, combined block of text that includes:
                1. The full text block immediately before the provided text in the image if it makes the sentence complete.
                2. The provided text itself.
                3. The full text block immediately after the provided text in the image if it makes the sentence complete.
                Do not add any extra explanations, introductory phrases, or formatting.

                Provided Text: "{text}"
                """
            
            # Send the new prompt and the image to the model
            response = vision_model.generate_content([extraction_prompt, image_part])
            extracted_text = response.text.strip()

        # The rest of the workflow remains the same
        padded_text = await run_in_threadpool(create_padded_text, extracted_text, pro_model)
        search_results = await run_in_threadpool(search_documents, padded_text, collection)

        if not search_results:
            raise HTTPException(status_code=404, detail="No relevant documents found.")

        # Filter and get the best 3 relevant results
        filtered_results = await run_in_threadpool(filter_and_validate_results, extracted_text, search_results, pro_model)
        
        if not filtered_results:
            raise HTTPException(status_code=404, detail="No relevant filtered documents found.")

        # Convert filtered results to the format expected by frontend
        documents = [filtered_results[key]["document"] for key in filtered_results.keys()]
        metadatas = [filtered_results[key]["metadata"] for key in filtered_results.keys()]
        ids = list(filtered_results.keys())
        # Generate meaningful distances based on order (lower is better)
        distances = [0.1 + (i * 0.1) for i in range(len(documents))]
        
        final_results = {
            "documents": [documents],
            "metadatas": [metadatas],
            "ids": [ids],
            "distances": [distances]
        }

        # Save results and the original user-provided text to the file
        await run_in_threadpool(save_results_to_file, text, final_results, RESULTS_FILE_PATH)

        return {"search_results": final_results}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
# --- NEW ENDPOINT for generating insights ---
@app.get("/generate_insights")
async def generate_insights(request: Request):
    """
    Generates insights from available context or provides default insights.
    """
    pro_model = request.app.state.pro_model

    try:
        if os.path.exists(RESULTS_FILE_PATH):
            # Generate insights from search results if available
            insight_text = await run_in_threadpool(
                generate_insights_from_file, 
                RESULTS_FILE_PATH, 
                pro_model
            )
        else:
            # Generate default insights if no search results available
            default_prompt = """
            Generate helpful insights about document analysis and text search. 
            Provide practical tips on how to effectively analyze documents and find relevant information.
            Keep it concise and actionable.
            """
            response = pro_model.generate_content(default_prompt)
            insight_text = response.text.strip()

        if not insight_text:
            # Fallback insight
            insight_text = "Document analysis helps you connect related information across different sections. Try selecting text to find relevant connections and gain deeper insights."

        # Save the generated insight to bulb.jsonl
        with open(BULB_FILE_PATH, 'w') as f:
            json.dump({"insight": insight_text}, f)

        # Return the insight directly in the API response
        return {"insight": insight_text}

    except Exception as e:
        # Return a fallback insight if anything fails
        fallback_insight = "Document analysis helps you connect related information across different sections. Try selecting text to find relevant connections and gain deeper insights."
        return {"insight": fallback_insight}
    
    # --- NEW ENDPOINT for generating the podcast script ---
@app.get("/generate_podcast")
async def generate_podcast(request: Request):
    """
    Reads the results and bulb files, generates a podcast script,
    and returns it to the frontend.
    """
    pro_model = request.app.state.pro_model

    # Check if the necessary files exist
    if not os.path.exists(RESULTS_FILE_PATH) or not os.path.exists(BULB_FILE_PATH):
        raise HTTPException(status_code=404, detail="Required result and insight files not found. Please complete the previous steps first.")

    try:
        # Generate the podcast script in a thread pool
        podcast_script = await run_in_threadpool(
            generate_podcast_script,
            RESULTS_FILE_PATH,
            BULB_FILE_PATH,
            pro_model
        )

        if not podcast_script:
            raise HTTPException(status_code=500, detail="LLM failed to generate a valid podcast script.")

        # Return the generated script
        return {"podcast_script": podcast_script}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate podcast script: {str(e)}")






