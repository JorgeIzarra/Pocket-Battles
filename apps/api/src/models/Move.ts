import mongoose from 'mongoose';

const MoveSchema = new mongoose.Schema({
  moveId: { type: String, required: true, unique: true },
  name: String,
  type: String,
  power: { type: Number, default: null },
  accuracy: { type: Number, default: null },
  priority: { type: Number, default: 0 },
  damageClass: String,
  appliesStatus: { type: String, default: null },
});

export const Move = mongoose.model('Move', MoveSchema);
