from pymongo import MongoClient
import os
from dotenv import load_dotenv

load_dotenv()

client = MongoClient(os.getenv("MONGODB_URI"))
db = client[os.getenv("DB_NAME")]

documents_col = db["documents"]
sessions_col = db["sessions"]
messages_col = db["messages"]