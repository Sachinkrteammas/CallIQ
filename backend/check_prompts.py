from app.db.session import SessionLocal
from sqlalchemy import text

db = SessionLocal()
rows = db.execute(text("SELECT client_id, name, status FROM ai_prompts WHERE status='Active'")).fetchall()
print('Active prompts:', rows if rows else 'NONE')

all_prompts = db.execute(text("SELECT client_id, name, status FROM ai_prompts")).fetchall()
print('All prompts:', all_prompts if all_prompts else 'NONE')

pending = db.execute(text("SELECT client_id, COUNT(*) FROM call_logs WHERE transcript IS NOT NULL AND voice_mail = FALSE GROUP BY client_id")).fetchall()
print('Pending calls by client:', pending if pending else 'NONE')

db.close()
