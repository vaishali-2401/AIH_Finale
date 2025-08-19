import chromadb
from chromadb.config import Settings
import google.generativeai as genai
import os
from thefuzz import fuzz # You'll need to install this library: pip install thefuzz
import json



# --- Function to create "padded" text ---
def create_padded_text(original_text: str, model) -> str:
    """
    Takes a string of text and enriches it by adding 2-3 sentences of context.
    """
    prompt = f"""
    Act as a subject matter expert. Take the following text and expand upon it by adding two or three sentences of relevant context.
    The goal is to enrich the text with related concepts, examples, or keywords to improve its connection to other content. Do not summarize it.

    Original Text: "{original_text}"
    
    Expanded Text:
    """
    try:
        response = model.generate_content(prompt)
        contextual_sentences = response.text.strip()
        enriched_text = f"{original_text.strip()} {contextual_sentences}"
        return enriched_text
    except Exception as e:
        print(f"An error occurred during padding: {e}")
        return original_text

# --- Function to perform the initial search ---
def search_documents(query_text: str, collection, n_results: int = 100, model_name: str = 'models/text-embedding-004'):
    """
    Embeds a query and searches a ChromaDB collection for an initial set of candidates.
    """
    try:
        embedding_response = genai.embed_content(
            model=model_name,
            content=query_text,
            task_type="RETRIEVAL_QUERY"
        )
        query_embedding = embedding_response['embedding']
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results
        )
        return results
    except Exception as e:
        print(f"An error occurred during the search: {e}")
        return None

# --- Function to filter and validate results ---
def filter_and_validate_results(input_text: str, search_results, model):
    """
    Filters ChromaDB results based on similarity and LLM validation.
    """
    relevant_chunks = {}
    if not search_results or not search_results.get('documents'):
        return relevant_chunks

    for i, doc in enumerate(search_results['documents'][0]):
        # 1. Similarity Filter
        similarity_score = fuzz.ratio(input_text, doc)
        if similarity_score > 80:
            print(f"Skipping doc {i+1} (similarity: {similarity_score}%) - Too similar.")
            continue

        # 2. LLM Relevance Filter
        prompt = f"""
        Original Text: "{input_text}"
        Candidate Chunk: "{doc}"

        Question: Does the 'Candidate Chunk' provide new, helpful information or a different perspective that deepens the understanding of the 'Original Text'? 
        Answer only with "yes" or "no".
        """
        try:
            response = model.generate_content(prompt)
            answer = response.text.strip().lower()
            if "yes" in answer:
                print(f"Adding doc {i+1} - LLM validated as helpful.")
                metadata = search_results['metadatas'][0][i] if search_results.get('metadatas') else {}
                relevant_chunks[f"doc_{i+1}"] = {"document":doc, "metadata": metadata}
            else:
                print(f"Skipping doc {i+1} - LLM flagged as not helpful.")
        except Exception as e:
            print(f"An error during LLM validation for doc {i+1}: {e}")

        # 3. Check if we have enough results
        if len(relevant_chunks) >= 5:
            print("\nFound 5 relevant chunks. Breaking loop.")
            break
           
    return relevant_chunks



import os
import json

def save_results_to_file(extracted_text: str, search_results: dict, filename: str = 'results.jsonl'):
    """
    Saves the original query and ChromaDB search results to a JSONL file,
    overwriting the file if it exists.

    The first line will contain the extracted_text, and subsequent lines
    will contain each search result.

    Args:
        extracted_text: The original text extracted from the image.
        search_results: The dictionary returned by a ChromaDB query.
        filename: The name of the file to save.
    """
    # 1. Check if the file exists and delete it to ensure a fresh start
    if os.path.exists(filename):
        os.remove(filename)
        print(f"Deleted existing file: {filename}")

    # 2. Write the new file
    with open(filename, 'w') as f:
        # --- THIS IS THE NEW LOGIC ---
        # First, write the extracted_text as the first line
        header_record = {"original_query": extracted_text}
        json.dump(header_record, f)
        f.write('\n') # Add a newline to separate it from the results

        # Next, write each search result on a new line
        if search_results and search_results.get('documents'):
            num_docs = len(search_results['documents'][0])
            for i in range(num_docs):
                record = {
                    "document": search_results['documents'][0][i],
                    "distance": search_results['distances'][0][i],
                    "metadata": search_results['metadatas'][0][i] if search_results.get('metadatas') else {}
                }
                json.dump(record, f)
                f.write('\n') # Add a newline for the next object
        # --- END OF NEW LOGIC ---

    print(f"✅ Successfully saved query and results to {filename}")

# --- Example Usage ---
if __name__ == "__main__":
    # Mock data for demonstration
    mock_extracted_text = "The South of France is a paradise for food lovers."
    mock_search_results = {
        "ids": [['doc1', 'doc2']],
        "documents": [['This is the first result.', 'This is the second result.']],
        "distances": [[0.123, 0.456]],
        "metadatas": [[{'source': 'file1.pdf'}, {'source': 'file2.pdf'}]]
    }

    save_results_to_file(mock_extracted_text, mock_search_results, 'results.jsonl')

    # You can verify the content of 'results.jsonl'
    # It should look like this:
    # {"original_query": "The South of France is a paradise for food lovers."}
    # {"document": "This is the first result.", "distance": 0.123, "metadata": {"source": "file1.pdf"}}
    # {"document": "This is the second result.", "distance": 0.456, "metadata": {"source": "file2.pdf"}}




# --- Main execution block ---
if __name__ == "__main__":
    # --- 1. Global Setup ---
    CHROMA_DB_PATH = r"C:\Users\jayan\OneDrive\Desktop\pdf\backend\chroma_db"
    COLLECTION_NAME = "document_chunks"

    # --- 2. Configure APIs and Connect to DB ---
    try:
        genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
        gemini_pro_model = genai.GenerativeModel('gemini-pro')
        
        client = chromadb.Client(Settings(is_persistent=True, persist_directory=CHROMA_DB_PATH))
        collection = client.get_collection(name=COLLECTION_NAME)
        
        print(f"Successfully connected to collection: '{COLLECTION_NAME}'")
        print(f"Total documents in collection: {collection.count()}")

    except Exception as e:
        print(f"Setup Error: {e}")
        print("Please ensure your API key, DB path, and collection name are correct.")
        exit()

    # --- 3. Define Input and Run the Full Workflow ---
    input_text = "The South of France, known for its stunning landscapes and charming villages, is also a paradise for food lovers."
    
    print("\n--- Step 1: Padding original text ---")
    padded_text = create_padded_text(input_text, gemini_pro_model)
    print("Enriched Query:", padded_text)
    
    print("\n--- Step 2: Searching with padded text to get initial candidates ---")
    initial_results = search_documents(padded_text, collection, n_results=15)

    print("\n--- Step 3: Filtering and validating results ---")
    final_chunks = filter_and_validate_results(input_text, initial_results, gemini_pro_model)

    # --- 4. Display the Final, Validated Results ---
    print("\n--- Final Validated Results ---")
    if final_chunks:
        for i, (key, value) in enumerate(final_chunks.items()):
            print(f"\n{i+1}. Document: {value['document']}")
            if value['metadata']:
                print(f"   Metadata: {value['metadata']}")
    else:
        print("No sufficiently relevant chunks were found after filtering.")


