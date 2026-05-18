import mongoose from 'mongoose';

const playerSchema = new mongoose.Schema({
  playerId: String,
  name: String,
  ready: { type: Boolean, default: false },
  pendingTeam: { type: mongoose.Schema.Types.Mixed, default: null },
});

const RoomSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  status: {
    type: String,
    enum: ['waiting', 'ready', 'in_battle', 'closed'],
    default: 'waiting',
  },
  players: [playerSchema],
  createdAt: { type: Date, default: Date.now },
});

export const Room = mongoose.model('Room', RoomSchema);
