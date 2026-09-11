# main.py
import os
from datetime import datetime, timedelta
from typing import List, Optional, Literal
import enum

from fastapi import FastAPI, Depends, HTTPException, status, APIRouter
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Enum
from sqlalchemy.orm import sessionmaker, relationship, Session
from pydantic import BaseModel, EmailStr

from passlib.context import CryptContext
from jose import JWTError, jwt

# CRITICAL RULE: Assume database.py exists and provides Base, engine, and get_db.
# DO NOT generate database.py.
# CRITICAL DATABASE URL RULE: DO NOT hardcode any database URL in main.py.
# database.py handles reading DATABASE_URL from environment variables.
from database import Base, engine, get_db

# --- Security Configuration ---
# In a real production application, these values MUST be loaded securely
# from environment variables or a secret management service.
SECRET_KEY = os.environ.get("SECRET_KEY", "your-super-secret-key-please-change-this-in-production-env")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

# --- FastAPI App Initialization ---
app = FastAPI(
    title="Todo App with Categories and Status Tracking Backend",
    description="A robust backend for a fullstack todo application, featuring user authentication, "
                "todo management with categories, and status tracking.",
    version="1.0.0",
)

# CRITICAL CORS RULE: Always add CORSMiddleware with allow_origins=["*"]

@app.get("/")
def root():
    return {"status": "running", "docs": "/docs", "health": "/health"}

@app.get("/health")
def health():
    return {"status": "healthy"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins, adjust in production for specific domains
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods (GET, POST, PUT, DELETE, etc.)
    allow_headers=["*"],  # Allows all headers (e.g., Authorization header for JWT)
)

# --- SQLAlchemy Models ---
# When defining SQLAlchemy models in Python, DO NOT use Pydantic types (like EmailStr)
# inside Column(). You MUST use SQLAlchemy types (like String, Integer).
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships to other models, cascading deletes children if the user is deleted
    categories = relationship("Category", back_populates="owner", cascade="all, delete-orphan")
    todos = relationship("Todo", back_populates="owner", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User(id={self.id}, email='{self.email}')>"

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    owner = relationship("User", back_populates="categories")
    todos = relationship("Todo", back_populates="category", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Category(id={self.id}, name='{self.name}', user_id={self.user_id})>"

class TodoStatus(str, enum.Enum):
    """Enum for tracking the status of a todo item."""
    PENDING = "pending"
    COMPLETED = "completed"
    IN_PROGRESS = "in_progress"
    DEFERRED = "deferred"
    CANCELLED = "cancelled" # Added a cancelled status

class Todo(Base):
    __tablename__ = "todos"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True, nullable=False)
    description = Column(String, default="", nullable=False)
    status = Column(Enum(TodoStatus), default=TodoStatus.PENDING, nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True) # Todos can optionally have a category
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    owner = relationship("User", back_populates="todos")
    category = relationship("Category", back_populates="todos")

    def __repr__(self):
        return f"<Todo(id={self.id}, title='{self.title}', status='{self.status}')>"

# Create all tables in the database.
# In a production environment, database migrations (e.g., Alembic) are preferred
# over `Base.metadata.create_all()`. This is included for quick setup/testing.
Base.metadata.create_all(bind=engine)

# --- Pydantic Models (for Request and Response Data Validation/Serialization) ---

# --- Auth Models ---
class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    """Pydantic model for user registration requests."""
    password: str

# CRITICAL AUTH RULE: Accept JSON via standard Pydantic models.
# DO NOT use OAuth2PasswordRequestForm (which requires form-data).
class UserLogin(UserBase):
    """Pydantic model for user login requests."""
    password: str

class UserResponse(UserBase):
    """Pydantic model for user response data."""
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True # Enables ORM mode for automatic mapping from SQLAlchemy models

class Token(BaseModel):
    """Pydantic model for JWT token response."""
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    """Pydantic model for data stored within the JWT token."""
    email: Optional[str] = None
    id: Optional[int] = None # Include user ID for easier lookup

# --- Category Models ---
class CategoryBase(BaseModel):
    name: str

class CategoryCreate(CategoryBase):
    """Pydantic model for creating a new category."""
    pass

class CategoryUpdate(CategoryBase):
    """Pydantic model for updating an existing category."""
    name: Optional[str] = None

class CategoryResponse(CategoryBase):
    """Pydantic model for category response data."""
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True

# --- Todo Models ---
class TodoBase(BaseModel):
    title: str
    description: Optional[str] = ""
    status: TodoStatus = TodoStatus.PENDING # Default status
    category_id: Optional[int] = None # Optional foreign key to a category

class TodoCreate(TodoBase):
    """Pydantic model for creating a new todo item."""
    pass

class TodoUpdate(TodoBase):
    """Pydantic model for updating an existing todo item."""
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TodoStatus] = None
    category_id: Optional[int] = None

class TodoResponse(TodoBase):
    """Pydantic model for todo item response data, including nested category."""
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
    category: Optional[CategoryResponse] = None # Nested category details

    class Config:
        orm_mode = True

# --- Utility Functions for Security ---

def get_password_hash(password: str) -> str:
    """Hashes a plain-text password."""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain-text password against a hashed password."""
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Creates a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# --- Dependency to get current authenticated user ---
async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """
    Dependency that decodes the JWT token from the Authorization header,
    validates it, and fetches the corresponding user from the database.
    Raises HTTPException if token is invalid or user not found.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        user_id: int = payload.get("id") # Retrieve user ID from token
        if email is None or user_id is None:
            raise credentials_exception
        token_data = TokenData(email=email, id=user_id)
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.id == token_data.id).first()
    if user is None:
        raise credentials_exception
    return user

# --- FastAPI Routers ---
# Using APIRouter to organize endpoints for better modularity
auth_router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])
categories_router = APIRouter(prefix="/api/v1/categories", tags=["Categories"], dependencies=[Depends(get_current_user)])
todos_router = APIRouter(prefix="/api/v1/todos", tags=["Todos"], dependencies=[Depends(get_current_user)])

# --- CRITICAL ROOT ROUTE RULE ---
@app.get("/", summary="Root endpoint")
def root():
    """
    Root endpoint for the API.
    Returns a status message and a link to the API documentation.
    """
    return {"status": "running", "docs": "/docs", "message": "Welcome to the Todo App API!"}

# --- CRITICAL HEALTH ROUTE RULE ---
@app.get("/health", summary="Health check endpoint")
def health():
    """
    Health check endpoint to verify API's operational status.
    """
    return {"status": "healthy"}

# --- Auth Endpoints ---
@auth_router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED, summary="Register a new user")
def register_user(user_create: UserCreate, db: Session = Depends(get_db)):
    """
    Registers a new user with the provided email and password.
    Checks if an account with the given email already exists.
    """
    db_user = db.query(User).filter(User.email == user_create.email).first()
    if db_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    
    hashed_password = get_password_hash(user_create.password)
    new_user = User(email=user_create.email, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user) # Refresh to get auto-generated ID and timestamps
    return new_user

@auth_router.post("/login", response_model=Token, summary="Login and get an access token")
def login_for_access_token(user_login: UserLogin, db: Session = Depends(get_db)):
    """
    Authenticates a user with email and password.
    Returns a JWT access token upon successful login.
    """
    user = db.query(User).filter(User.email == user_login.email).first()
    if not user or not verify_password(user_login.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email, "id": user.id}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@auth_router.get("/me", response_model=UserResponse, summary="Get current user information")
def read_users_me(current_user: User = Depends(get_current_user)):
    """
    Retrieves the information of the currently authenticated user.
    This endpoint requires a valid JWT token in the Authorization header.
    """
    return current_user

# --- Category Endpoints ---
@categories_router.post("/", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED, summary="Create a new category")
def create_category(category_create: CategoryCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Creates a new category for the authenticated user.
    Ensures that a category with the same name doesn't already exist for this user.
    """
    db_category = db.query(Category).filter(
        Category.name == category_create.name,
        Category.user_id == current_user.id
    ).first()
    if db_category:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Category with this name already exists for this user")

    new_category = Category(**category_create.dict(), user_id=current_user.id)
    db.add(new_category)
    db.commit()
    db.refresh(new_category)
    return new_category

@categories_router.get("/", response_model=List[CategoryResponse], summary="Get all categories for the current user")
def read_categories(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Retrieves a list of all categories belonging to the authenticated user.
    """
    return db.query(Category).filter(Category.user_id == current_user.id).order_by(Category.name).all()

@categories_router.get("/{category_id}", response_model=CategoryResponse, summary="Get a specific category by ID")
def read_category(category_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Retrieves a specific category by its ID, ensuring it belongs to the authenticated user.
    """
    db_category = db.query(Category).filter(Category.id == category_id, Category.user_id == current_user.id).first()
    if db_category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found or you don't have permission")
    return db_category

@categories_router.put("/{category_id}", response_model=CategoryResponse, summary="Update an existing category")
def update_category(category_id: int, category_update: CategoryUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Updates an existing category identified by its ID, ensuring it belongs to the authenticated user.
    """
    db_category = db.query(Category).filter(Category.id == category_id, Category.user_id == current_user.id).first()
    if db_category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found or you don't have permission")
    
    # Check for name conflict if name is being updated
    if category_update.name and category_update.name != db_category.name:
        existing_category_with_name = db.query(Category).filter(
            Category.name == category_update.name,
            Category.user_id == current_user.id
        ).first()
        if existing_category_with_name:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Another category with this name already exists for this user")

    for key, value in category_update.dict(exclude_unset=True).items():
        setattr(db_category, key, value)
    
    # The `onupdate=datetime.utcnow` in the SQLAlchemy model handles `updated_at` automatically
    db.commit()
    db.refresh(db_category)
    return db_category

@categories_router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a category")
def delete_category(category_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Deletes a category identified by its ID, ensuring it belongs to the authenticated user.
    Associated todo items (if any) will also be deleted due to `cascade="all, delete-orphan"` defined in the models.
    """
    db_category = db.query(Category).filter(Category.id == category_id, Category.user_id == current_user.id).first()
    if db_category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found or you don't have permission")
    
    db.delete(db_category)
    db.commit()
    return # HTTP 204 No Content response for successful deletion

# --- Todo Endpoints ---
@todos_router.post("/", response_model=TodoResponse, status_code=status.HTTP_201_CREATED, summary="Create a new todo item")
def create_todo(todo_create: TodoCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Creates a new todo item for the authenticated user.
    Optionally associates it with an existing category owned by the same user.
    """
    if todo_create.category_id:
        db_category = db.query(Category).filter(
            Category.id == todo_create.category_id,
            Category.user_id == current_user.id
        ).first()
        if db_category is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found or you don't have permission to use it")

    new_todo = Todo(**todo_create.dict(), user_id=current_user.id)
    db.add(new_todo)
    db.commit()
    db.refresh(new_todo)

    # Attach category details for the response if a category_id was provided
    if new_todo.category_id:
        new_todo.category = db_category # Use the fetched category to avoid another DB query
    return new_todo

@todos_router.get("/", response_model=List[TodoResponse], summary="Get all todo items for the current user")
def read_todos(
    status_filter: Optional[TodoStatus] = None, # Renamed to avoid conflict with `status` field in TodoResponse
    category_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieves a list of all todo items belonging to the authenticated user.
    Can be filtered by status and/or category.
    """
    query = db.query(Todo).filter(Todo.user_id == current_user.id)

    if status_filter:
        query = query.filter(Todo.status == status_filter)
    
    if category_id:
        # Ensure the category belongs to the current user as well
        db_category = db.query(Category).filter(Category.id == category_id, Category.user_id == current_user.id).first()
        if db_category is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found or you don't have permission")
        query = query.filter(Todo.category_id == category_id)
    
    todos = query.order_by(Todo.created_at.desc()).all()
    
    # Manually populate category for each todo in the response
    for todo in todos:
        if todo.category_id:
            # Efficiently fetch category if not already loaded by relationship or from filter
            if not todo.category:
                todo.category = db.query(Category).filter(Category.id == todo.category_id).first()
    return todos

@todos_router.get("/{todo_id}", response_model=TodoResponse, summary="Get a specific todo item by ID")
def read_todo(todo_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Retrieves a specific todo item by its ID, ensuring it belongs to the authenticated user.
    """
    db_todo = db.query(Todo).filter(Todo.id == todo_id, Todo.user_id == current_user.id).first()
    if db_todo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found or you don't have permission")
    
    # Manually populate category for the response
    if db_todo.category_id and not db_todo.category:
        db_todo.category = db.query(Category).filter(Category.id == db_todo.category_id).first()
    return db_todo

@todos_router.put("/{todo_id}", response_model=TodoResponse, summary="Update an existing todo item")
def update_todo(todo_id: int, todo_update: TodoUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Updates an existing todo item identified by its ID, ensuring it belongs to the authenticated user.
    Validates if a new category_id belongs to the current user.
    """
    db_todo = db.query(Todo).filter(Todo.id == todo_id, Todo.user_id == current_user.id).first()
    if db_todo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found or you don't have permission")
    
    if todo_update.category_id is not None: # Check explicitly for None, not just falsy
        db_category = db.query(Category).filter(
            Category.id == todo_update.category_id,
            Category.user_id == current_user.id
        ).first()
        if db_category is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found or you don't have permission to use it")
    
    for key, value in todo_update.dict(exclude_unset=True).items():
        setattr(db_todo, key, value)
    
    # The `onupdate=datetime.utcnow` in the SQLAlchemy model handles `updated_at` automatically
    db.commit()
    db.refresh(db_todo)

    # Manually populate category for the response
    if db_todo.category_id and not db_todo.category:
        db_todo.category = db.query(Category).filter(Category.id == db_todo.category_id).first()
    return db_todo

@todos_router.patch("/{todo_id}/status", response_model=TodoResponse, summary="Update the status of a todo item")
def update_todo_status(todo_id: int, new_status: TodoStatus, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Updates only the status of a specific todo item.
    Accepts a single status value in the request body (e.g., `{"status": "completed"}`).
    """
    db_todo = db.query(Todo).filter(Todo.id == todo_id, Todo.user_id == current_user.id).first()
    if db_todo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found or you don't have permission")
    
    db_todo.status = new_status
    # The `onupdate=datetime.utcnow` in the SQLAlchemy model handles `updated_at` automatically
    db.commit()
    db.refresh(db_todo)

    # Manually populate category for the response
    if db_todo.category_id and not db_todo.category:
        db_todo.category = db.query(Category).filter(Category.id == db_todo.category_id).first()
    return db_todo

@todos_router.delete("/{todo_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a todo item")
def delete_todo(todo_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Deletes a todo item identified by its ID, ensuring it belongs to the authenticated user.
    """
    db_todo = db.query(Todo).filter(Todo.id == todo_id, Todo.user_id == current_user.id).first()
    if db_todo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found or you don't have permission")
    
    db.delete(db_todo)
    db.commit()
    return # HTTP 204 No Content response for successful deletion

# --- Include Routers in the main app ---
app.include_router(auth_router)
app.include_router(categories_router)
app.include_router(todos_router)