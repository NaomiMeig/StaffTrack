
from app.db.session import Base, engine
from app.models import Employee

Base.metadata.create_all(bind=engine)
print("Tables créées avec succès.")
print(f"Tables disponibles : {list(Base.metadata.tables.keys())}")
