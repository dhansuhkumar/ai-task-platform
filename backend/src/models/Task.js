import mongoose from 'mongoose';

const OPERATIONS = ['uppercase', 'lowercase', 'reverse', 'word_count'];
const STATUSES = ['pending', 'running', 'success', 'failed'];

const taskSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true },
  inputText: { type: String, required: true },
  operation: { type: String, required: true, enum: OPERATIONS },
  status: { type: String, default: 'pending', enum: STATUSES, index: true },
  result: { type: String, default: '' },
  error: { type: String, default: '' },
  logs: [{ type: String }],
}, { timestamps: true });

taskSchema.index({ status: 1, createdAt: -1 });
taskSchema.index({ userId: 1, createdAt: -1 });

export const Task = mongoose.model('Task', taskSchema);
export { OPERATIONS, STATUSES };
