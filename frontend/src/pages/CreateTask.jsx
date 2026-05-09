import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { createTask } from '../api/client';

const OPERATIONS = ['uppercase', 'lowercase', 'reverse', 'word_count'];

const OP_DESCRIPTIONS = {
  uppercase: 'Convert all text to uppercase',
  lowercase: 'Convert all text to lowercase',
  reverse: 'Reverse the entire string',
  word_count: 'Count the number of words',
};

export default function CreateTask() {
  const [title, setTitle] = useState('');
  const [inputText, setInputText] = useState('');
  const [operation, setOperation] = useState('uppercase');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const task = await createTask(title, inputText, operation);
      navigate(`/tasks/${task._id}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-primary-50 dark:from-gray-900 dark:to-gray-950 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="card w-full max-w-lg"
      >
        <h1 className="text-2xl font-bold mb-6">Create Task</h1>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="input-field"
              placeholder="My task name"
              required
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Input Text</label>
            <textarea
              rows={4}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              className="input-field resize-y"
              placeholder="Enter the text to process..."
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium mb-1">Operation</label>
            <select
              value={operation}
              onChange={e => setOperation(e.target.value)}
              className="input-field"
            >
              {OPERATIONS.map(op => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">{OP_DESCRIPTIONS[operation]}</p>
          </div>
          {error && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-500 text-sm mb-4">{error}</motion.p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                Processing...
              </span>
            ) : 'Run Task'}
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-4">
          <Link to="/" className="text-primary-600 hover:underline">← Back to Dashboard</Link>
        </p>
      </motion.div>
    </div>
  );
}
