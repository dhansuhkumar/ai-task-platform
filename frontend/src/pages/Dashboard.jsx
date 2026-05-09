import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getTasks, subscribeToTasks } from '../api/client';

const STATUS_STYLES = {
  pending: 'badge bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
  running: 'badge bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 animate-pulse',
  success: 'badge bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  failed: 'badge bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
};

export default function Dashboard({ dark, setDark }) {
  const [tasks, setTasks] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const params = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      const data = await getTasks(params);
      setTasks(data.tasks);
      setPages(data.pages);
    } catch {
      navigate('/login');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, navigate]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const unsubscribe = subscribeToTasks((update) => {
      setTasks(prev => prev.map(t => t._id === update._id ? update : t));
    });
    return unsubscribe;
  }, []);

  function handleLogout() {
    localStorage.removeItem('token');
    navigate('/login');
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-8">
        <motion.h1
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-3xl font-bold bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent"
        >
          AI Task Platform
        </motion.h1>
        <div className="flex gap-3 items-center">
          <button onClick={() => setDark(!dark)} className="btn-secondary p-2 text-lg" title="Toggle dark mode">
            {dark ? '☀️' : '🌙'}
          </button>
          <Link to="/create"><button className="btn-primary">+ New Task</button></Link>
          <button onClick={handleLogout} className="btn-secondary">Logout</button>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card mb-6"
      >
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">Filter:</label>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="input-field w-auto"
          >
            <option value="">All Tasks</option>
            <option value="pending">Pending</option>
            <option value="running">Running</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </motion.div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <>
          <div className="grid gap-4">
            <AnimatePresence mode="popLayout">
              {tasks.map((t, i) => (
                <motion.div
                  key={t._id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.03 }}
                  className="card hover:shadow-xl transition-shadow duration-200"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <Link to={`/tasks/${t._id}`} className="text-lg font-semibold hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                        {t.title}
                      </Link>
                      <div className="flex gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                        <span>{t.operation}</span>
                        <span>•</span>
                        <span>{new Date(t.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                    <span className={STATUS_STYLES[t.status]}>{t.status}</span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {tasks.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 text-gray-400">
                <p className="text-5xl mb-4">📋</p>
                <p className="text-lg">No tasks found</p>
                <Link to="/create" className="text-primary-500 hover:underline mt-2 inline-block">Create your first task</Link>
              </motion.div>
            )}
          </div>

          {pages > 1 && (
            <div className="flex justify-center items-center gap-4 mt-8">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="btn-secondary disabled:opacity-30"
              >
                ← Prev
              </button>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Page {page} of {pages}
              </span>
              <button
                disabled={page >= pages}
                onClick={() => setPage(p => p + 1)}
                className="btn-secondary disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
