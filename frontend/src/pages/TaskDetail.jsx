import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getTask, subscribeToTasks } from '../api/client';

const STATUS_STYLES = {
  pending: 'badge bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
  running: 'badge bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 animate-pulse',
  success: 'badge bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  failed: 'badge bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
};

export default function TaskDetail() {
  const { id } = useParams();
  const [task, setTask] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await getTask(id);
      setTask(data);
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const unsubscribe = subscribeToTasks((update) => {
      if (update._id === id) setTask(update);
    });
    return unsubscribe;
  }, [id]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card text-center">
          <p className="text-red-500 text-lg mb-4">{error}</p>
          <Link to="/" className="btn-primary">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card mb-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">{task.title}</h1>
          <span className={STATUS_STYLES[task.status]}>{task.status}</span>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide">Operation</label>
            <p className="font-medium">{task.operation}</p>
          </div>
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide">Created</label>
            <p className="font-medium">{new Date(task.createdAt).toLocaleString()}</p>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-xs text-gray-400 uppercase tracking-wide">Input Text</label>
          <div className="mt-1 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-sm font-mono break-words">
            {task.inputText}
          </div>
        </div>

        {task.result && (
          <div className="mb-4">
            <label className="text-xs text-gray-400 uppercase tracking-wide">Result</label>
            <div className="mt-1 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-sm font-mono break-words">
              {task.result}
            </div>
          </div>
        )}

        {task.error && (
          <div className="mb-4">
            <label className="text-xs text-gray-400 uppercase tracking-wide">Error</label>
            <div className="mt-1 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm font-mono text-red-600 dark:text-red-400 break-words">
              {task.error}
            </div>
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card mb-6"
      >
        <h2 className="text-lg font-semibold mb-3">Logs</h2>
        <div className="bg-gray-900 dark:bg-black rounded-lg p-4 max-h-64 overflow-auto">
          <pre className="text-green-400 text-xs font-mono leading-relaxed">
            {task.logs.length === 0 ? (
              <span className="text-gray-500">No logs yet...</span>
            ) : (
              task.logs.map((log, i) => (
                <span key={i}>
                  <span className="text-gray-500">[{i + 1}]</span> {log}{'\n'}
                </span>
              ))
            )}
          </pre>
        </div>
      </motion.div>

      <div className="text-center">
        <Link to="/" className="btn-primary inline-block">← Back to Dashboard</Link>
      </div>
    </div>
  );
}
