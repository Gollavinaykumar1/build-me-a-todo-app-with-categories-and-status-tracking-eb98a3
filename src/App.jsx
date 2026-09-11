import React, { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import { HashRouter, Routes, Route, useNavigate, Link, Navigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { Plus, Check, X, ClipboardList, Bell, Calendar, ListTodo, User, LogOut, Moon, Sun, Edit, Trash2, Home, Settings, Info, Hourglass, CheckCircle, GripVertical, Rocket, Users, Folder, Search, LayoutDashboard } from 'lucide-react';


import { format, parseISO } from 'date-fns';
import { useForm } from 'react-hook-form';
import clsx from 'clsx';

// --- Global Constants & API Simulation (CRITICAL for single file) ---
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// --- API Simulation: Replaces ./api.js for single-file constraint ---
const storageKey = 'todo_app_data';
const usersKey = 'todo_app_users';
const currentUserKey = 'todo_app_current_user';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getStoredData = () => {
  const data = localStorage.getItem(storageKey);
  return data ? JSON.parse(data) : [];
};

const setStoredData = (data) => {
  localStorage.setItem(storageKey, JSON.stringify(data));
};

const getStoredUsers = () => {
  const users = localStorage.getItem(usersKey);
  return users ? JSON.parse(users) : [{ username: 'testuser', password: 'password123', id: 'user1' }]; // Seed user
};

const setStoredUsers = (users) => {
  localStorage.setItem(usersKey, JSON.stringify(users));
};

const getCurrentUser = () => {
  const user = localStorage.getItem(currentUserKey);
  return user ? JSON.parse(user) : null;
};

const setCurrentUser = (user) => {
  if (user) {
    localStorage.setItem(currentUserKey, JSON.stringify(user));
  } else {
    localStorage.removeItem(currentUserKey);
  }
};

// Seed initial tasks if none exist
if (!localStorage.getItem(storageKey)) {
  const seedTasks = [
    { id: '1', title: 'Design initial UI mockups', priority: 'High', dueDate: '2023-11-20', notes: 'Focus on glassmorphism and dark mode aesthetics.', completed: false, category: 'Design', userId: 'user1' },
    { id: '2', title: 'Implement user authentication (frontend)', priority: 'High', dueDate: '2023-11-22', notes: 'Use react-hook-form and connect to simulated API.', completed: false, category: 'Development', userId: 'user1' },
    { id: '3', title: 'Set up Tailwind CSS configuration', priority: 'Medium', dueDate: '2023-11-18', notes: 'Include custom colors and fonts if necessary.', completed: true, category: 'Setup', userId: 'user1' },
    { id: '4', title: 'Research AI categorization techniques', priority: 'Low', dueDate: '2023-12-05', notes: 'Explore existing libraries and models for task suggestions.', completed: false, category: 'Research', userId: 'user1' },
    { id: '5', title: 'Prepare MVP presentation deck', priority: 'Medium', dueDate: '2023-12-01', notes: 'Highlight core features and future roadmap.', completed: false, category: 'Business', userId: 'user1' },
    { id: '6', title: 'Grocery Shopping', priority: 'Low', dueDate: '2023-11-19', notes: 'Milk, Eggs, Bread, Vegetables', completed: false, category: 'Personal', userId: 'user1' },
    { id: '7', title: 'Call John about project', priority: 'Medium', dueDate: '2023-11-20', notes: 'Discuss Q4 planning', completed: true, category: 'Work', userId: 'user1' },
  ];
  setStoredData(seedTasks);
}

// Simulated API functions (replace axios calls)
const apiLogin = async (username, password) => {
  await delay(500);
  const users = getStoredUsers();
  const user = users.find(u => u.username === username && u.password === password);
  if (user) {
    setCurrentUser(user);
    return { success: true, user };
  }
  throw new Error('Invalid credentials');
};

const apiRegister = async (username, password) => {
  await delay(500);
  const users = getStoredUsers();
  if (users.some(u => u.username === username)) {
    throw new Error('Username already taken');
  }
  const newUser = { id: `user${Date.now()}`, username, password };
  setStoredUsers([...users, newUser]);
  setCurrentUser(newUser); // Log in immediately after registering
  return { success: true, user: newUser };
};

const apiLogout = async () => {
  await delay(200);
  setCurrentUser(null);
  return { success: true };
};

const apiGetItems = async () => {
  await delay(300);
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const items = getStoredData().filter(item => item.userId === user.id);
  // CRITICAL DATA SAFETY: This is already an array, but mimicking the check
  const safeList = Array.isArray(items) ? items : (items?.items || []);
  return { data: safeList };
};

const apiCreateItem = async (item) => {
  await delay(500);
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const newItem = { ...item, id: Date.now().toString(), userId: user.id };
  setStoredData([...getStoredData(), newItem]);
  return { data: newItem };
};

const apiUpdateItem = async (id, updates) => {
  await delay(500);
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  let updatedItem = null;
  setStoredData(getStoredData().map(item => {
    if (item.id === id && item.userId === user.id) {
      updatedItem = { ...item, ...updates };
      return updatedItem;
    }
    return item;
  }));
  if (!updatedItem) throw new Error("Task not found or unauthorized");
  return { data: updatedItem };
};

const apiDeleteItem = async (id) => {
  await delay(500);
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const initialLength = getStoredData().length;
  setStoredData(getStoredData().filter(item => item.id !== id || item.userId !== user.id));
  if (getStoredData().length === initialLength) throw new Error("Task not found or unauthorized");
  return { data: { message: 'Item deleted' } };
};
// --- END API Simulation ---


// --- Contexts ---
const AuthContext = createContext(null);
const DarkModeContext = createContext(null);

// --- Auth Provider ---
function AuthProvider({ children }) {
  const [user, setUser] = useState(getCurrentUser());
  const navigate = useNavigate();

  const login = useCallback(async (username, password) => {
    try {
      const response = await apiLogin(username, password);
      setUser(response.user);
      toast.success('Logged in successfully!');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.message || 'Login failed.');
      throw error;
    }
  }, [navigate]);

  const register = useCallback(async (username, password) => {
    try {
      const response = await apiRegister(username, password);
      setUser(response.user);
      toast.success('Registered and logged in!');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.message || 'Registration failed.');
      throw error;
    }
  }, [navigate]);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
      setUser(null);
      toast.success('Logged out.');
      navigate('/login');
    } catch (error) {
      toast.error('Logout failed.');
    }
  }, [navigate]);

  const value = { user, login, register, logout };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// --- Dark Mode Provider ---
function DarkModeProvider({ children }) {
  const [darkMode, setDarkMode] = useState(() => {
    const savedMode = localStorage.getItem('darkMode');
    return savedMode ? JSON.parse(savedMode) : true; // Default to dark mode
  });

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = useCallback(() => {
    setDarkMode(prevMode => !prevMode);
  }, []);

  const value = { darkMode, toggleDarkMode };
  return <DarkModeContext.Provider value={value}>{children}</DarkModeContext.Provider>;
}

// --- Protected Route Component ---
function ProtectedRoute({ children }) {
  const { user } = useContext(AuthContext);
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}


// --- Main App Component ---
function App() {
  return (
    <DarkModeProvider>
      <div className="app-wrapper">
        <AuthProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              className: 'dark:bg-gray-800 dark:text-gray-100',
              style: {
                background: 'rgba(55, 65, 81, 0.9)', // Tailwind gray-700 with opacity
                color: '#E5E7EB', // Tailwind gray-200
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                borderRadius: '0.75rem',
                border: '1px solid rgba(75, 85, 99, 0.5)',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              },
            }}
          />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/dashboard/*"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </div>
    </DarkModeProvider>
  );
}

// --- Layout & Page Components (nested in App.jsx) ---

// LoginPage Component
function LoginPage() {
  const { login } = useContext(AuthContext);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();
  const navigate = useNavigate();

  const onSubmit = async ({ username, password }) => {
    try {
      await login(username, password);
    } catch (error) {
      // toast handled in AuthProvider
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-indigo-900 text-gray-100 dark">
      <div className="relative p-8 rounded-2xl shadow-2xl bg-gradient-to-br from-indigo-800/30 to-purple-800/30 backdrop-blur-xl border border-indigo-700/50 transition-all duration-500 transform hover:scale-[1.01]">
        <h2 className="text-4xl font-extrabold text-center mb-6 text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-purple-400">
          Welcome Back
        </h2>
        <p className="text-center text-gray-300 mb-8">Sign in to manage your tasks.</p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 w-80">
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2" htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              {...register("username", { required: "Username is required" })}
              className="w-full p-3 rounded-lg bg-gray-700/50 border border-gray-600 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition duration-300 text-white"
              placeholder="Enter your username"
            />
            {errors.username && <p className="mt-1 text-red-400 text-sm">{errors.username.message}</p>}
          </div>
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2" htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              {...register("password", { required: "Password is required" })}
              className="w-full p-3 rounded-lg bg-gray-700/50 border border-gray-600 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition duration-300 text-white"
              placeholder="Enter your password"
            />
            {errors.password && <p className="mt-1 text-red-400 text-sm">{errors.password.message}</p>}
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full p-3 rounded-lg bg-gradient-to-r from-teal-500 to-purple-600 text-white font-semibold text-lg shadow-lg hover:from-teal-600 hover:to-purple-700 transition duration-300 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : 'Login'}
          </button>
        </form>
        <p className="mt-8 text-center text-gray-400">
          Don't have an account?{' '}
          <Link to="/register" className="text-teal-400 hover:underline font-medium">Register here</Link>
        </p>
        <p className="mt-4 text-center text-gray-500 text-sm">
          (Use `testuser` / `password123` to log in quickly)
        </p>
      </div>
    </div>
  );
}

// RegisterPage Component
function RegisterPage() {
  const { register: authRegister } = useContext(AuthContext);
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm();
  const navigate = useNavigate();
  const password = useRef({});
  password.current = watch("password", "");

  const onSubmit = async ({ username, password }) => {
    try {
      await authRegister(username, password);
    } catch (error) {
      // toast handled in AuthProvider
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-indigo-900 text-gray-100 dark">
      <div className="relative p-8 rounded-2xl shadow-2xl bg-gradient-to-br from-indigo-800/30 to-purple-800/30 backdrop-blur-xl border border-indigo-700/50 transition-all duration-500 transform hover:scale-[1.01]">
        <h2 className="text-4xl font-extrabold text-center mb-6 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">
          Join Us
        </h2>
        <p className="text-center text-gray-300 mb-8">Create your account to start organizing your life.</p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 w-80">
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2" htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              {...register("username", { required: "Username is required" })}
              className="w-full p-3 rounded-lg bg-gray-700/50 border border-gray-600 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition duration-300 text-white"
              placeholder="Choose a username"
            />
            {errors.username && <p className="mt-1 text-red-400 text-sm">{errors.username.message}</p>}
          </div>
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2" htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              {...register("password", {
                required: "Password is required",
                minLength: { value: 6, message: "Password must be at least 6 characters" }
              })}
              className="w-full p-3 rounded-lg bg-gray-700/50 border border-gray-600 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition duration-300 text-white"
              placeholder="Create a password"
            />
            {errors.password && <p className="mt-1 text-red-400 text-sm">{errors.password.message}</p>}
          </div>
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2" htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              {...register("confirmPassword", {
                validate: value =>
                  value === password.current || "Passwords do not match"
              })}
              className="w-full p-3 rounded-lg bg-gray-700/50 border border-gray-600 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition duration-300 text-white"
              placeholder="Confirm your password"
            />
            {errors.confirmPassword && <p className="mt-1 text-red-400 text-sm">{errors.confirmPassword.message}</p>}
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full p-3 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-600 text-white font-semibold text-lg shadow-lg hover:from-cyan-600 hover:to-emerald-700 transition duration-300 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : 'Register'}
          </button>
        </form>
        <p className="mt-8 text-center text-gray-400">
          Already have an account?{' '}
          <Link to="/login" className="text-cyan-400 hover:underline font-medium">Login here</Link>
        </p>
      </div>
    </div>
  );
}

// DashboardLayout Component
function DashboardLayout() {
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('All'); // All, Active, Completed
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const { user, logout } = useContext(AuthContext);
  const { darkMode, toggleDarkMode } = useContext(DarkModeContext);
  const navigate = useNavigate();

  const fetchTasks = useCallback(async () => {
    try {
      const response = await apiGetItems();
      // CRITICAL DATA SAFETY: Ensure response.data is an array
      const safeList = Array.isArray(response.data) ? response.data : (response.data?.items || []);
      setTasks(safeList);
    } catch (error) {
      toast.error('Failed to load tasks. Please log in again.');
      logout();
    }
  }, [logout]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleAddTask = async (taskData) => {
    try {
      const response = await apiCreateItem(taskData);
      setTasks(prev => [...prev, response.data]);
      toast.success('Task added successfully!');
    } catch (error) {
      toast.error('Failed to add task.');
    } finally {
      setIsModalOpen(false);
    }
  };

  const handleUpdateTask = async (id, taskData) => {
    try {
      const response = await apiUpdateItem(id, taskData);
      setTasks(prev => prev.map(task => (task.id === id ? response.data : task)));
      toast.success('Task updated successfully!');
    } catch (error) {
      toast.error('Failed to update task.');
    } finally {
      setIsModalOpen(false);
      setEditingTask(null);
    }
  };

  const handleDeleteTask = async (id) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    try {
      await apiDeleteItem(id);
      setTasks(prev => prev.filter(task => task.id !== id));
      toast.success('Task deleted!');
    } catch (error) {
      toast.error('Failed to delete task.');
    }
  };

  const handleToggleComplete = async (id, completed) => {
    try {
      const response = await apiUpdateItem(id, { completed });
      setTasks(prev => prev.map(task => (task.id === id ? response.data : task)));
      toast.success(completed ? 'Task completed!' : 'Task marked active!');
    } catch (error) {
      toast.error('Failed to update task status.');
    }
  };

  const openAddModal = () => {
    setEditingTask(null);
    setIsModalOpen(true);
  };

  const openEditModal = (task) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const filteredTasks = tasks.filter(task => {
    if (filter === 'Active') return !task.completed;
    if (filter === 'Completed') return task.completed;
    return true;
  });

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(task => task.completed).length;
  const pendingTasks = totalTasks - completedTasks;

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-950 to-indigo-950 text-gray-100 dark">
      {/* Sidebar */}
      <aside className="w-64 p-6 bg-gray-900/50 backdrop-blur-xl border-r border-gray-800 shadow-xl flex flex-col justify-between transition-all duration-300 ease-in-out">
        <div>
          <div className="flex items-center space-x-3 mb-10 mt-2">
            <Rocket className="w-9 h-9 text-purple-400" />
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-purple-400">
              NexusTask
            </h1>
          </div>
          <nav className="space-y-4">
            <Link to="/dashboard" className="flex items-center space-x-3 p-3 rounded-lg text-gray-300 hover:bg-indigo-700/30 hover:text-white transition-all duration-200">
              <LayoutDashboard className="w-5 h-5" />
              <span className="text-lg">Dashboard</span>
            </Link>
            <Link to="#" className="flex items-center space-x-3 p-3 rounded-lg text-gray-300 hover:bg-indigo-700/30 hover:text-white transition-all duration-200">
              <Folder className="w-5 h-5" />
              <span className="text-lg">Categories</span>
            </Link>
            <Link to="#" className="flex items-center space-x-3 p-3 rounded-lg text-gray-300 hover:bg-indigo-700/30 hover:text-white transition-all duration-200">
              <Users className="w-5 h-5" />
              <span className="text-lg">Team (soon)</span>
            </Link>
            <Link to="#" className="flex items-center space-x-3 p-3 rounded-lg text-gray-300 hover:bg-indigo-700/30 hover:text-white transition-all duration-200">
              <Settings className="w-5 h-5" />
              <span className="text-lg">Settings</span>
            </Link>
          </nav>
        </div>
        <div className="space-y-4">
          <button
            onClick={toggleDarkMode}
            className="flex items-center justify-center w-full space-x-3 p-3 rounded-lg text-gray-300 bg-gray-800/50 hover:bg-indigo-700/30 hover:text-white transition-all duration-200"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            <span className="text-lg">{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
          <button
            onClick={logout}
            className="flex items-center justify-center w-full space-x-3 p-3 rounded-lg text-gray-300 bg-red-800/30 hover:bg-red-700/50 hover:text-white transition-all duration-200"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-lg">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        {/* Header/Hero Section */}
        <div className="mb-10">
          <h2 className="text-5xl font-extrabold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-indigo-400">
            Hello, {user?.username || 'User'}!
          </h2>
          <p className="text-gray-400 text-lg">Your productivity dashboard at a glance.</p>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <MetricCard title="Total Tasks" count={totalTasks} icon={<ClipboardList className="text-teal-400" />} />
          <MetricCard title="Completed" count={completedTasks} icon={<CheckCircle className="text-emerald-400" />} />
          <MetricCard title="Pending" count={pendingTasks} icon={<Hourglass className="text-amber-400" />} />
        </div>

        {/* Task Management Section */}
        <div className="bg-gray-800/30 backdrop-blur-lg rounded-xl p-6 shadow-2xl border border-gray-700/50 transition-all duration-300 hover:shadow-inner-xl hover:border-gray-600/50">
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-700">
            <h3 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-300">
              My Tasks
            </h3>
            <button
              onClick={openAddModal}
              className="flex items-center space-x-2 px-5 py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-lg shadow-md hover:from-teal-600 hover:to-cyan-700 transition duration-300 ease-in-out transform hover:scale-105"
            >
              <Plus className="w-5 h-5" />
              <span className="text-lg font-medium">Add New Task</span>
            </button>
          </div>

          {/* Filter Tabs */}
          <div className="flex space-x-4 mb-8">
            {['All', 'Active', 'Completed'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={clsx(
                  "px-6 py-2 rounded-full font-semibold text-lg transition-all duration-300",
                  filter === f
                    ? "bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-lg transform scale-105"
                    : "bg-gray-700/50 text-gray-300 hover:bg-gray-600/70 hover:text-white"
                )}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Task List */}
          <div className="space-y-4">
            {filteredTasks.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-xl italic bg-gray-700/30 rounded-lg border border-dashed border-gray-600">
                <p>No tasks found for this filter. Time to add some productivity!</p>
                <button
                  onClick={openAddModal}
                  className="mt-6 inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg hover:from-purple-600 hover:to-indigo-700 transition duration-300 transform hover:scale-105"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add First Task</span>
                </button>
              </div>
            ) : (
              filteredTasks.map(task => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onToggleComplete={handleToggleComplete}
                  onEdit={openEditModal}
                  onDelete={handleDeleteTask}
                />
              ))
            )}
          </div>
        </div>
      </main>

      {isModalOpen && (
        <AddEditTaskModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSubmit={editingTask ? handleUpdateTask : handleAddTask}
          initialData={editingTask}
        />
      )}
    </div>
  );
}

// MetricCard Component
function MetricCard({ title, count, icon }) {
  return (
    <div className="relative p-6 rounded-xl shadow-xl bg-gray-800/30 backdrop-blur-lg border border-gray-700/50 flex items-center justify-between transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-800/10 to-purple-800/10 rounded-xl -z-10"></div>
      <div>
        <h4 className="text-lg font-medium text-gray-400 mb-1">{title}</h4>
        <p className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-teal-400">
          {count}
        </p>
      </div>
      <div className="p-3 bg-gray-700/50 rounded-full text-white text-3xl shadow-inner border border-gray-600/50">
        {icon}
      </div>
    </div>
  );
}

// TaskItem Component
function TaskItem({ task, onToggleComplete, onEdit, onDelete }) {
  const getPriorityClasses = (priority) => {
    switch (priority) {
      case 'High':
        return 'bg-red-600/80 text-white border-red-500';
      case 'Medium':
        return 'bg-amber-600/80 text-white border-amber-500';
      case 'Low':
        return 'bg-green-600/80 text-white border-green-500';
      default:
        return 'bg-gray-500/80 text-white border-gray-400';
    }
  };

  return (
    <div className={clsx(
      "relative p-5 rounded-xl shadow-lg flex items-center justify-between transition-all duration-300 ease-in-out",
      task.completed
        ? "bg-gray-700/30 border border-gray-600/50 opacity-70 hover:opacity-100 hover:shadow-xl"
        : "bg-gray-800/50 border border-gray-700/50 hover:scale-[1.005] hover:shadow-xl"
    )}>
      <div className="flex items-center flex-grow">
        <input
          type="checkbox"
          checked={task.completed}
          onChange={() => onToggleComplete(task.id, !task.completed)}
          className="form-checkbox h-6 w-6 text-indigo-500 bg-gray-600 border-gray-500 rounded focus:ring-indigo-400 transition duration-200 cursor-pointer"
        />
        <div className="ml-4 flex-grow">
          <h4 className={clsx(
            "text-xl font-semibold transition-all duration-300",
            task.completed ? "line-through text-gray-400" : "text-gray-100"
          )}>
            {task.title}
          </h4>
          {task.notes && (
            <p className={clsx(
              "text-sm mt-1 text-gray-400 transition-all duration-300",
              task.completed && "line-through"
            )}>
              {task.notes}
            </p>
          )}
          <div className="flex items-center space-x-3 mt-2 text-sm text-gray-300">
            <span className={clsx(
              "px-3 py-1 rounded-full font-medium text-xs border",
              getPriorityClasses(task.priority)
            )}>
              {task.priority}
            </span>
            {task.dueDate && (
              <span className="flex items-center space-x-1">
                <Calendar className="w-4 h-4 text-purple-400" />
                <span>{format(parseISO(task.dueDate), 'MMM d, yyyy')}</span>
              </span>
            )}
            {task.category && (
              <span className="flex items-center space-x-1">
                <Folder className="w-4 h-4 text-emerald-400" />
                <span>{task.category}</span>
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex space-x-2 ml-4">
        <button
          onClick={() => onEdit(task)}
          className="p-2 rounded-full bg-indigo-600/50 text-white hover:bg-indigo-500 transition-all duration-200 transform hover:scale-110"
          aria-label="Edit Task"
        >
          <Edit className="w-5 h-5" />
        </button>
        <button
          onClick={() => onDelete(task.id)}
          className="p-2 rounded-full bg-red-600/50 text-white hover:bg-red-500 transition-all duration-200 transform hover:scale-110"
          aria-label="Delete Task"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// AddEditTaskModal Component
function AddEditTaskModal({ isOpen, onClose, onSubmit, initialData }) {
  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      title: '',
      priority: 'Medium',
      dueDate: '',
      notes: '',
      category: 'General',
    }
  });

  useEffect(() => {
    if (initialData) {
      // Set form values for editing
      setValue('title', initialData.title);
      setValue('priority', initialData.priority);
      setValue('dueDate', initialData.dueDate); // dueDate is already a string 'YYYY-MM-DD'
      setValue('notes', initialData.notes);
      setValue('category', initialData.category);
    } else {
      reset(); // Clear form for adding
    }
  }, [initialData, reset, setValue]);

  const handleFormSubmit = async (data) => {
    try {
      await onSubmit(initialData ? initialData.id : null, { ...data, completed: initialData?.completed || false });
    } catch (error) {
      // toast handled by parent component's onSubmit handler
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm dark">
      <div className="relative w-full max-w-lg p-8 rounded-2xl shadow-3xl bg-gray-900/70 border border-gray-700/50 backdrop-blur-xl transition-all duration-300 transform scale-100 opacity-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-gray-700/50 text-gray-300 hover:bg-gray-600/70 hover:text-white transition duration-200"
          aria-label="Close modal"
        >
          <X className="w-6 h-6" />
        </button>
        <h3 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-sky-400 mb-6">
          {initialData ? 'Edit Task' : 'Add New Task'}
        </h3>
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">
          <div>
            <label htmlFor="title" className="block text-gray-300 text-sm font-medium mb-2">Task Title</label>
            <input
              type="text"
              id="title"
              {...register("title", { required: "Title is required" })}
              className="w-full p-3 rounded-lg bg-gray-700/50 border border-gray-600 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none transition duration-300 text-white"
              placeholder="e.g., Finish project report"
            />
            {errors.title && <p className="mt-1 text-red-400 text-sm">{errors.title.message}</p>}
          </div>
          <div>
            <label htmlFor="priority" className="block text-gray-300 text-sm font-medium mb-2">Priority</label>
            <select
              id="priority"
              {...register("priority")}
              className="w-full p-3 rounded-lg bg-gray-700/50 border border-gray-600 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none transition duration-300 text-white appearance-none pr-8"
            >
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            {errors.priority && <p className="mt-1 text-red-400 text-sm">{errors.priority.message}</p>}
          </div>
          <div>
            <label htmlFor="dueDate" className="block text-gray-300 text-sm font-medium mb-2">Due Date</label>
            <input
              type="date"
              id="dueDate"
              {...register("dueDate")}
              className="w-full p-3 rounded-lg bg-gray-700/50 border border-gray-600 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none transition duration-300 text-white"
            />
            {errors.dueDate && <p className="mt-1 text-red-400 text-sm">{errors.dueDate.message}</p>}
          </div>
          <div>
            <label htmlFor="notes" className="block text-gray-300 text-sm font-medium mb-2">Notes (Optional)</label>
            <textarea
              id="notes"
              {...register("notes")}
              rows="3"
              className="w-full p-3 rounded-lg bg-gray-700/50 border border-gray-600 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none transition duration-300 text-white"
              placeholder="Add any additional details or context"
            ></textarea>
          </div>
          <div>
            <label htmlFor="category" className="block text-gray-300 text-sm font-medium mb-2">Category</label>
            <input
              type="text"
              id="category"
              {...register("category")}
              className="w-full p-3 rounded-lg bg-gray-700/50 border border-gray-600 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none transition duration-300 text-white"
              placeholder="e.g., Work, Personal, Shopping"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full p-4 rounded-lg bg-gradient-to-r from-emerald-500 to-sky-600 text-white font-semibold text-lg shadow-lg hover:from-emerald-600 hover:to-sky-700 transition duration-300 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : initialData ? 'Save Changes' : 'Add Task'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;