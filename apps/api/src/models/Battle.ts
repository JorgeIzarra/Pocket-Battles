import mongoose from 'mongoose';

const BattleSchema = new mongoose.Schema({
  roomCode: { type: String, required: true, unique: true },
  turn: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'finished'], default: 'active' },
  players: { type: mongoose.Schema.Types.Mixed },
  pendingActions: { type: mongoose.Schema.Types.Mixed, default: [] },
  typeChart: { type: mongoose.Schema.Types.Mixed },
  battleLog: { type: mongoose.Schema.Types.Mixed, default: [] },
  winnerPlayerId: { type: String, default: null },
});

export const Battle = mongoose.model('Battle', BattleSchema);
