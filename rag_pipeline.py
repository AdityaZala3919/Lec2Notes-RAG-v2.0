import os
import uuid
from dotenv import load_dotenv
from datetime import datetime

from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import SentenceTransformerEmbeddings
from langchain_core.documents import Document
from langchain_text_splitters import TokenTextSplitter

from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate

from database import documents_col, sessions_col, messages_col

load_dotenv(dotenv_path=".env")

FAISS_DIR = "faiss"
os.makedirs(FAISS_DIR, exist_ok=True)

embedding_model = SentenceTransformerEmbeddings(model_name="all-MiniLM-L12-v2")

def chunk_text(text, chunk_size=1000, chunk_overlap=200):
    splitter = TokenTextSplitter(chunk_size=chunk_size,chunk_overlap=chunk_overlap)
    return splitter.split_documents([Document(page_content=text)])

def get_vectorstore(docs):
    return FAISS.from_documents(docs, embedding=embedding_model)

def get_llm(temperature=0.7):
    return ChatGroq(
        groq_api_key=os.getenv("GROQ_API_KEY"),
        model="llama-3.3-70b-versatile",
        temperature=temperature
    )

def store_document(username, title, content_type, transcript_text,
                   chunk_size=1000, chunk_overlap=200):
    document_id = str(uuid.uuid4())
    faiss_path = f"{FAISS_DIR}/{username}_{document_id}"

    chunks = chunk_text(transcript_text, chunk_size, chunk_overlap)
    vectordb = FAISS.from_documents(chunks, embedding=embedding_model)
    vectordb.save_local(faiss_path)

    documents_col.insert_one({
        "_id": document_id,
        "username": username,
        "title": title,
        "content_type": content_type,
        "content": transcript_text,
        "faiss_path": faiss_path,
        "chunk_config": {
            "chunk_size": chunk_size,
            "chunk_overlap": chunk_overlap
        },
        "created_at": datetime.now()
    })

    return document_id

def load_retriever(username, document_id, k=5):
    doc = documents_col.find_one({
        "_id": document_id,
        "username": username
    })

    vectordb = FAISS.load_local(
        folder_path=doc["faiss_path"],
        embeddings=embedding_model,
        allow_dangerous_deserialization=True
    )

    return vectordb.as_retriever(search_kwargs={"k": k})

def generate_notes(document_id, username, prompt_template,
                   chunk_size=1000, chunk_overlap=200, retriever_k=5, llm_temperature=0.7):
    retriever = load_retriever(username=username, document_id=document_id, k=retriever_k)
    llm = get_llm(llm_temperature)

    docs = retriever.invoke("Generate structured lecture notes.")
    context = "\n\n".join(d.page_content for d in docs)

    prompt = prompt_template.format(context=context)
    response = llm.invoke(prompt).content

    return response

def chat_with_transcript(
    user_query: str,
    session_id: str,
    retriever,
    notes_context: str | None = None
):
    llm = get_llm()

    # -----------------------------
    # Load chat history
    # -----------------------------
    chat_docs = messages_col.find(
        {"session_id": session_id}
    ).sort("timestamp", 1)

    chat_history = []
    for msg in chat_docs:
        if msg["role"] == "human":
            chat_history.append(HumanMessage(content=msg["content"]))
        else:
            chat_history.append(SystemMessage(content=msg["content"]))

    # -----------------------------
    # Retrieve WITH SCORES ✅
    # -----------------------------
    docs_with_scores = retriever.vectorstore.similarity_search_with_score(
        user_query, k=3
    )

    top_score = docs_with_scores[0][1]
    SIMILARITY_THRESHOLD = 1.0

    is_out_of_context = top_score > SIMILARITY_THRESHOLD

    context = "\n\n".join(doc.page_content for doc, _ in docs_with_scores)

    # -----------------------------
    # If OUT OF CONTEXT → fallback FIRST
    # -----------------------------
    if is_out_of_context:
        general_messages = []

        if notes_context:
            general_messages.append(
                SystemMessage(content=f"Lecture notes context:\n{notes_context}")
            )

        general_messages.extend(chat_history)
        general_messages.append(HumanMessage(content=user_query))

        general_response = llm.invoke(general_messages).content

        general_final_response = (
            "\n⚠️ Note: This question is outside the scope of the uploaded document. "
            "The answer below is generated using general knowledge.\n\n"
            f"{general_response}\n"
        )

        messages_col.insert_many([
            {
                "_id": str(uuid.uuid4()),
                "session_id": session_id,
                "role": "human",
                "content": user_query,
                "timestamp": datetime.now()
            },
            {
                "_id": str(uuid.uuid4()),
                "session_id": session_id,
                "role": "assistant",
                "content": general_final_response,
                "timestamp": datetime.now()
            }
        ])

        return general_final_response

    # -----------------------------
    # Otherwise → RAG answer
    # -----------------------------
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", "Answer strictly using the provided context."),
            ("system", "Context:\n{context}"),
            *[(m.type, m.content) for m in chat_history],
            ("human", "{question}")
        ]
    )

    formatted_prompt = prompt.format_messages(
        context=context,
        question=user_query
    )

    response = llm.invoke(formatted_prompt).content

    messages_col.insert_many([
        {
            "_id": str(uuid.uuid4()),
            "session_id": session_id,
            "role": "human",
            "content": user_query,
            "timestamp": datetime.now()
        },
        {
            "_id": str(uuid.uuid4()),
            "session_id": session_id,
            "role": "assistant",
            "content": response,
            "timestamp": datetime.now()
        }
    ])

    return response

"""
Sample QA- True
1. What is Machine Learning?
2. What is Supervised Learning?
3. What is unsupervised learning?
4. What is regression and classification?
5. According to the lecture, why is handwritten digit recognition difficult
    to program by hand?
6. What is Tom Mitchell’s formal definition of a learning problem?
7. Does the lecture mention support vector machines?
8. Are neural networks discussed in Lecture 1?

"""

#MongoDB project: rag_app
#Cluster name: RAG